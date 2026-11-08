#!/usr/bin/env bash
# Lands one staged batch of protected files as one approver-signed commit, through a candidate branch (SPEC-001-R41),
# or one runner producer delivery, unsigned, through the owner's own push (SPEC-001-R210). Before it asks to sign, it
# tests the moved tree as the candidate run will, and it says where to approve the deploy (SPEC-001-R213).
# Runs on macOS's bash 3.2 and on Linux: no mapfile, no associative arrays, no case-changing expansions, and every
# array is either known to be non-empty or read by index under a counter.
set -euo pipefail

usage() {
  echo "usage: scripts/bootstrap/land.sh <batch dir> [--stop-before-main]"
  echo "       scripts/bootstrap/land.sh --to-main <sha> <candidate branch>"
  echo "       scripts/bootstrap/land.sh --delivery candidate/<task>"
  echo "  Lands one staged batch, for example proposals/phase-1, as one signed commit. It reads <batch dir>/LAND.txt,"
  echo "  moves each file into place, tests the moved tree in a temporary worktree (Node.js version, npm ci, tsc, ESLint"
  echo "  on the moved code, every test, the trace check and the scenario patches that touch a moved file), shows the"
  echo "  diff and asks before signing. Then it pushes that commit to"
  echo "  candidate/land-<batch name>, waits for its pipeline run, pushes the same commit to main and deletes the"
  echo "  candidate branch. main only moves to a commit whose checks passed (SPEC-001-R41)."
  echo "  --stop-before-main  stop once the candidate run passes, and print the --to-main command that finishes"
  echo "  --to-main           finish a stopped landing: check the candidate run, push that commit to main, watch"
  echo "                      main's run, then delete the candidate branch"
  echo "  --delivery          land a runner producer delivery: show it, and on a yes push the same commit to"
  echo "                      candidate/<task>-owner, whose push run reports the checks main counts, then finish as"
  echo "                      --to-main does. The producer's own push starts no run (SPEC-001-R210)"
  echo "  LAND.txt is plain ASCII data, one \"key: value\" per line. Blank lines and lines that start with # are skipped."
  echo "  message: <commit subject>              exactly one"
  echo "  spec: <requirement ID>                 one or more; each becomes a Spec: trailer"
  echo "  requires: <file> <fixed string>        optional; the file must contain the string before anything moves"
  echo "  move: <source in the batch> <path>     one per file; the batch must hold no other tracked file"
  echo "  Nothing in the batch or the manifest is ever run."
}

say() { printf '%s\n' "$@"; }
fail() { printf '%s\n' "$@" >&2; exit 1; }
usage_error() { usage >&2; exit 2; }

# shown: copies its input with control characters made visible (^[ for an escape), for text from git that a commit can
# set, such as commit subjects and file lines, so none of it can redraw the screen.
shown() { cat -v; }

# ask "<question>": prints the question, reads one line, and succeeds only on a yes. End of input counts as no.
ask() {
  local answer=""
  printf '%s [y/N] ' "$1"
  IFS= read -r answer || answer=""
  [ -t 0 ] || printf '\n'
  case "$answer" in
    y|Y|yes|Yes|YES) return 0 ;;
  esac
  return 1
}

# plain_path <path>: a relative path of letters, digits, dot, underscore, hyphen and slash, with no empty, "." or ".."
# part and no leading hyphen. Listing the characters avoids locale-dependent ranges.
safe_chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._/-"
plain_path() {
  case "$1" in
    ""|/*|*/|-*|*//*|*[!$safe_chars]*) return 1 ;;
  esac
  case "/$1/" in
    */./*|*/../*) return 1 ;;
  esac
  return 0
}

lowercase() { printf '%s' "$1" | tr 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' 'abcdefghijklmnopqrstuvwxyz'; }

# trim <text>: drops leading and trailing spaces and tabs.
trim() {
  local text="$1"
  text="${text#"${text%%[![:space:]]*}"}"
  text="${text%"${text##*[![:space:]]}"}"
  printf '%s' "$text"
}

# file_mode <path>: prints the index mode of <path> when exactly that one file is tracked, and nothing otherwise.
file_mode() {
  local entry tab
  tab="$(printf '\t')"
  entry="$(git ls-files -s -- "$1")"
  case "$entry" in
    *"$tab$1") ;;
    *) return 0 ;;
  esac
  [ "$(printf '%s\n' "$entry" | wc -l | tr -d ' ')" = "1" ] || return 0
  printf '%s' "${entry%% *}"
}

# drop_commands [<candidate branch>]: the commands that drop an abandoned landing, so its batch can land again.
drop_commands() {
  printf '%s\n' "git fetch origin" "git reset --hard origin/main"
  [ -z "${1:-}" ] || printf '%s\n' "git push origin --delete $1"
}

# find_run <branch> <sha>: prints the ID of the pipeline.yml run for that branch and commit, waiting up to 5 minutes.
# If none appears, it prints gh's last error, if there was one, to standard error.
find_run() {
  local attempt run
  : > "$work/gh-error"
  for attempt in $(seq 60); do
    run="$(gh run list --workflow pipeline.yml --branch "$1" --commit "$2" --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>"$work/gh-error" || true)"
    case "$run" in
      ""|*[!0123456789]*) ;;
      *) printf '%s\n' "$run"; return 0 ;;
    esac
    [ "$attempt" = 60 ] || sleep 5
  done
  if [ -s "$work/gh-error" ]; then
    { say "gh run list said:"; tail -n 5 "$work/gh-error" | shown; } >&2
  fi
  return 1
}

# delete_if_at <branch> <sha>: deletes the branch on origin only while it still holds that commit, so a commit pushed to
# it meanwhile is kept, and says what happened.
delete_if_at() {
  local branch="$1" sha="$2" tip
  tip="$(git ls-remote origin "refs/heads/${branch}" 2>/dev/null | cut -f1 || true)"
  if [ "$tip" = "$sha" ] && git push -q origin --delete "$branch"; then
    say "Deleted ${branch}."
  elif [ -n "$tip" ] && [ "$tip" != "$sha" ]; then
    say "Kept ${branch}: it now holds ${tip:0:12}, not $(git rev-parse --short "$sha"), so a commit was pushed to it since." \
      "Check that commit, then delete the branch with:" "git push origin --delete ${branch}"
  else
    say "Could not delete ${branch}. If it is still there, delete it with:" "git push origin --delete ${branch}"
  fi
}

# finish_main <sha> <candidate branch> [<other branch>]: moves main to that exact commit, deletes <other branch> if
# given, watches main's run, then deletes the candidate branch.
finish_main() {
  local sha="$1" branch="$2" other="${3:-}" short run="" status=0 url="" deploy_wait=""
  short="$(git rev-parse --short "$sha")"
  if ! git push origin "${sha}:refs/heads/main"; then
    if [ -n "$other" ]; then
      fail "main refused ${short}, so nothing changed on main, in this clone or on ${branch} and ${other}." \
        "If main has moved since the producer made ${short}, delete both branches, then dispatch the task again:" \
        "git push origin --delete ${branch} ${other}"
    fi
    fail "main refused ${short}, so nothing changed on main and ${branch} is still there." \
      "If main has moved since this commit was made, land the batch again from the new main. First drop this attempt:" \
      "$(drop_commands "$branch")"
  fi
  [ -z "$other" ] || delete_if_at "$other" "$sha"
  say "" "main is at ${short}." \
    "The deploy to the sandbox now waits for your approval in GitHub: approve the sandbox deployment in main's run."
  if run="$(find_run main "$sha")"; then
    url="$(run_url "$run")"
    say "Pipeline run ${run} on main. To open it in a browser:" "gh run view ${run} --web" \
      "Watching it until the deploy finishes. If you stop watching, delete the candidate branch afterwards:" \
      "git push origin --delete ${branch}"
    if [ -n "$url" ]; then
      say "Waiting until its deploy job, ${deploy_job}, waits for your approval."
      deploy_wait="$(wait_for_deploy "$run")"
      if [ "$deploy_wait" = waiting ]; then
        say "" "Approve the sandbox deployment in main's run ${run}: ${url}" \
          "This waits until you approve or reject it, then watches the deploy." ""
        wait_for_approval "$run"
      fi
    fi
    gh run watch "$run" --exit-status || status=1
    [ -z "$url" ] || say "" "main's run ${run}: ${url}"
  else
    say "No pipeline run on main for ${short} after 5 minutes. To look for it:" \
      "gh run list --workflow pipeline.yml --branch main"
    status=2
  fi
  delete_if_at "$branch" "$sha"
  case "$status" in
    1)
      if explain_failure "$run" "$short"; then
        exit 1
      fi
      say "main's run did not pass. The commit is on main, so fix the problem in a new commit on top." \
        "Never amend a pushed commit. To see why it failed:" "gh run view ${run} --log-failed"
      exit 1
      ;;
    2) exit 1 ;;
  esac
  say "Landed ${short} on main."
}

# watch_candidate <branch> <sha>: waits for the candidate run and watches it; on failure says how to go on and exits.
# In delivery mode (delivery_branch set) the way on is the same --delivery command, or a new dispatch, never a commit
# on top: the delivery is the producer's patch.
watch_candidate() {
  local branch="$1" sha="$2" short run
  short="$(git rev-parse --short "$sha")"
  say "Waiting for the pipeline run on ${branch} for ${short}."
  if [ -n "$delivery_branch" ]; then
    if ! run="$(find_run "$branch" "$sha")"; then
      fail "No pipeline run on ${branch} for ${short} after 5 minutes. main has not moved." \
        "To wait for it again, run the same command:" "scripts/bootstrap/land.sh --delivery ${delivery_branch}"
    fi
    say "Pipeline run ${run} on ${branch}. If you stop watching, finish later with the same command:" \
      "scripts/bootstrap/land.sh --delivery ${delivery_branch}"
    if ! gh run watch "$run" --exit-status; then
      fail "" "The pipeline run ${run} on ${branch} failed, so main has not moved." \
        "The delivery is the producer's patch, so do not fix it with a commit on top. To see why it failed:" \
        "gh run view ${run} --log-failed" \
        "Then delete both branches and dispatch the task again with a corrected prompt:" \
        "git push origin --delete ${branch} ${delivery_branch}"
    fi
    candidate_run="$run"
    return 0
  fi
  if ! run="$(find_run "$branch" "$sha")"; then
    fail "No pipeline run on ${branch} for ${short} after 5 minutes. main has not moved." \
      "When the run has passed, finish with:" "scripts/bootstrap/land.sh --to-main ${sha} ${branch}"
  fi
  say "Pipeline run ${run} on ${branch}. If you stop watching, finish later with:" \
    "scripts/bootstrap/land.sh --to-main ${sha} ${branch}"
  if ! gh run watch "$run" --exit-status; then
    fail "" "The pipeline run ${run} on ${branch} failed, so main has not moved." \
      "Fix the problem in a new commit on top of ${short} and push it to ${branch}." \
      "Never amend: a pushed commit stays, and the branch refuses force pushes." \
      "To see why it failed:" "gh run view ${run} --log-failed" \
      "When the new commit on top has passed, finish with:" \
      "scripts/bootstrap/land.sh --to-main \"\$(git rev-parse HEAD)\" ${branch}"
  fi
  candidate_run="$run"
}

# remove_tree: removes the preflight's temporary worktree, if there is one, and any stale record in .git/worktrees.
remove_tree() {
  [ -n "${work:-}" ] || return 0
  if [ -d "$work/tree" ]; then
    git worktree remove --force "$work/tree" >/dev/null 2>&1 || rm -rf "$work/tree"
  fi
  git worktree prune >/dev/null 2>&1 || true
}

# version_at_least <version> <minimum>: both "X.Y.Z"; succeeds when <version> is not below <minimum>.
version_at_least() {
  local a1 a2 a3 b1 b2 b3
  IFS=. read -r a1 a2 a3 <<< "$1"
  IFS=. read -r b1 b2 b3 <<< "$2"
  [ "$a1" -gt "$b1" ] && return 0
  [ "$a1" -lt "$b1" ] && return 1
  [ "$a2" -gt "$b2" ] && return 0
  [ "$a2" -lt "$b2" ] && return 1
  [ "$a3" -ge "$b3" ]
}

# preflight_step <name> <command...>: runs one preflight step in the temporary worktree, from an empty environment
# with a throwaway HOME: no SSH agent, no AWS or gh credentials, no git settings but the repository's own, and none of
# this script's own variables, such as GIT_LITERAL_PATHSPECS, which would change what the checks see. On failure it
# prints the failing tests and the end of the output, keeps the whole output in a file it names, and refuses, so
# nothing is signed and the cleanup puts the working tree and index back.
preflight_step() {
  local name="$1" kept
  shift
  if (cd "$work/tree" && env -i PATH="$PATH" HOME="$work/home" TMPDIR="$work/tmp" LANG="${LANG:-C.UTF-8}" TERM=dumb \
      NO_COLOR=1 CI=1 npm_config_cache="$npm_cache" GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null \
      GIT_AUTHOR_NAME=preflight GIT_AUTHOR_EMAIL=preflight@example.invalid \
      GIT_COMMITTER_NAME=preflight GIT_COMMITTER_EMAIL=preflight@example.invalid "$@") > "$work/step.log" 2>&1; then
    say "  passed: ${name}"
    return 0
  fi
  kept="$(mktemp "${TMPDIR:-/tmp}/land-preflight.XXXXXX")"
  tr -d '\000-\010\013-\037\177' < "$work/step.log" > "$kept"
  say "  FAILED: ${name}" ""
  if grep -q ' FAIL ' "$kept"; then
    say "Failing tests:"
    grep ' FAIL ' "$kept" | sort -u | head -n 20 || true
  fi
  say "Its last lines:"
  tail -n 20 "$kept"
  fail "" "Preflight failed: ${name}. Nothing was signed. The whole output is in ${kept}." \
    "Fix the batch in a new commit on main, then run this again."
}

# preflight: tests the moved tree after the review and before the signature (SPEC-001-R213), as the candidate run will,
# so a batch that fails is never signed. The worktree holds exactly the index as the moves left it.
preflight() {
  local engines min max version tree_id n lint_count lint patch path touched check
  say "" "Preflight: testing the moved tree in a temporary worktree, as the candidate run will, before you sign." \
    "It runs the batch's own code, its tests included, without your SSH agent or cloud credentials. Your security key" \
    "must not blink until it asks you to sign. If it blinks, do not touch it: press Ctrl-C."
  engines="$(sed -n 's/^[[:space:]]*"node":[[:space:]]*">=\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\) <\([0-9][0-9]*\)",\{0,1\}[[:space:]]*$/\1 \2/p' package.json | head -n 1)"
  [ -n "$engines" ] || fail "Preflight failed: package.json's engines.node is not of the form \">=X.Y.Z <N\". Nothing was signed."
  read -r min max <<< "$engines"
  version="$(node --version 2>/dev/null || true)"
  version="${version#v}"
  case "$version" in
    *[!0123456789.]*) fail "Preflight failed: Node.js ${version} is a pre-release or not a version. package.json needs >=${min} <${max}. Nothing was signed." ;;
    [0-9]*.[0-9]*.[0-9]*) ;;
    *) fail "Preflight failed: no Node.js on PATH. package.json needs >=${min} <${max}. Nothing was signed." ;;
  esac
  if ! version_at_least "$version" "$min" || [ "${version%%.*}" -ge "$max" ]; then
    fail "Preflight failed: Node.js ${version} is outside package.json's engines range, >=${min} <${max}." \
      "Put a Node.js in that range first on PATH, then run this again. Nothing was signed."
  fi
  say "  passed: Node.js ${version} is in >=${min} <${max}"
  # npm's own cache, so npm ci need not download everything again. Not read with npm: the moved tree's .npmrc could set it.
  npm_cache="${npm_config_cache:-${HOME}/.npm}"
  mkdir -p "$work/home" "$work/tmp"
  tree_id="$(git write-tree)"
  git worktree add -q --detach "$work/tree" HEAD >/dev/null 2>&1 || fail "Preflight failed: git worktree add. Nothing was signed."
  git -C "$work/tree" read-tree -u --reset "$tree_id" || fail "Preflight failed: git read-tree. Nothing was signed."
  preflight_step "npm ci --ignore-scripts" npm ci --ignore-scripts --no-audit --no-fund
  preflight_step "tsc --noEmit" npx --no-install tsc --noEmit -p .
  lint=()
  lint_count=0
  n=0
  while [ "$n" -lt "$move_count" ]; do
    case "${move_dests[$n]}" in
      *.ts|*.mts|*.js|*.mjs) lint[$lint_count]="${move_dests[$n]}"; lint_count=$((lint_count + 1)) ;;
    esac
    n=$((n + 1))
  done
  if [ "$lint_count" -gt 0 ]; then
    preflight_step "ESLint on the moved code" npx --no-install eslint -- "${lint[@]}"
  fi
  preflight_step "every test (vitest run)" npx --no-install vitest run
  preflight_step "the trace check" node scripts/checks.ts trace
  # Each scenario patch the batch moves, or that touches a file the batch moves, must still apply (lesson L20). A patch
  # git cannot read is checked too, so it fails as a step, not as this script.
  for patch in "$work"/tree/scenarios/*.patch; do
    [ -f "$patch" ] || continue
    path="scenarios/${patch##*/}"
    touched="$(git -C "$work/tree" apply --numstat -- "$path" 2>/dev/null | cut -f3 || true)"
    check=0
    [ -n "$touched" ] || check=1
    n=0
    while [ "$n" -lt "$move_count" ] && [ "$check" = 0 ]; do
      if [ "${move_dests[$n]}" = "$path" ] || printf '%s\n' "$touched" | grep -qxF -- "${move_dests[$n]}"; then
        check=1
      fi
      n=$((n + 1))
    done
    [ "$check" = 0 ] || preflight_step "git apply --check ${path}" git apply --check -- "$path"
  done
  remove_tree
  say "Preflight passed."
}

# run_url <run>: prints the run's URL, or nothing when gh cannot read it.
run_url() { gh run view "$1" --json url --jq .url 2>/dev/null | head -n 1 || true; }

# deploy_state <run>: prints "<run status> <deploy job status>", or fails when gh cannot read the run.
deploy_state() {
  gh run view "$1" --json status,jobs --jq ".status + \" \" + ([.jobs[] | select(.name == \"${deploy_job}\") | .status] | first // \"none\")" 2>/dev/null
}

# wait_for_deploy <run>: waits, up to 60 polls (10 minutes), until main's run's deploy job, or the run, waits for approval,
# or the run ends. Prints "waiting" only in the first case. Stops early, printing nothing, when gh cannot read the run.
wait_for_deploy() {
  local attempt state
  for attempt in $(seq "${LAND_WAIT_TRIES:-60}"); do
    state="$(deploy_state "$1")" || return 0
    case "$state" in
      waiting*|*" waiting") echo waiting; return 0 ;;
      completed*) return 0 ;;
    esac
    [ "$attempt" = "${LAND_WAIT_TRIES:-60}" ] || sleep "${LAND_POLL_SECONDS:-10}"
  done
}

# wait_for_approval <run>: while the deploy waits for approval, up to 360 polls (an hour), keeps polling instead of
# watching: gh run watch takes over the screen, which would hide the approval line just printed (lesson L13).
wait_for_approval() {
  local attempt state
  for attempt in $(seq "${LAND_APPROVE_TRIES:-360}"); do
    state="$(deploy_state "$1")" || return 0
    case "$state" in
      waiting*|*" waiting") ;;
      *) return 0 ;;
    esac
    [ "$attempt" = "${LAND_APPROVE_TRIES:-360}" ] || sleep "${LAND_POLL_SECONDS:-10}"
  done
}

# explain_failure <run> <short SHA>: when every job but the deploy passed, names the deploy job and what happened to it,
# and says nothing needs fixing (lesson L13). Succeeds only then.
explain_failure() {
  local jobs other deploy steps
  jobs="$(gh run view "$1" --json jobs --jq '.jobs[] | [.name, (.conclusion // ""), (.steps | length | tostring)] | join("\t")' 2>/dev/null)" || return 1
  other="$(printf '%s\n' "$jobs" | awk -F '\t' -v d="$deploy_job" 'NF && $1 != d && $2 != "success" && $2 != "skipped"' | head -n 1)"
  deploy="$(printf '%s\n' "$jobs" | awk -F '\t' -v d="$deploy_job" '$1 == d { print $2 "\t" $3 }' | head -n 1)"
  [ -z "$other" ] && [ -n "$deploy" ] || return 1
  steps="${deploy#*	}"
  case "${deploy%%	*}:${steps}" in
    cancelled:0)
      say "main's run $1 passed every check, and only its deploy job, ${deploy_job}, was cancelled before it ran a step," \
        "most likely by a newer push to main. $2 is on main and nothing needs fixing. The next push to main deploys it." ;;
    failure:0)
      say "main's run $1 passed every check, and its deploy job, ${deploy_job}, failed without running a step:" \
        "the sandbox deployment was rejected, or the job could not start." \
        "If you rejected it, $2 is on main and nothing needs fixing. Otherwise, see why:" "gh run view $1 --log-failed" ;;
    *) return 1 ;;
  esac
}

need_tools() {
  local version major minor
  command -v gh >/dev/null 2>&1 || fail "This needs the GitHub CLI, gh. Install it, sign in with gh auth login, then run this again."
  gh auth status >/dev/null 2>&1 || fail "gh is not signed in. Run gh auth login, then run this again."
  version="$(git --version | sed -n 's/^git version \([0-9]*\)\.\([0-9]*\).*/\1 \2/p')"
  read -r major minor <<< "${version:-0 0}"
  if [ "$major" -lt 2 ] || { [ "$major" -eq 2 ] && [ "$minor" -lt 34 ]; }; then
    fail "This needs git 2.34 or later, for SSH signatures and commit trailers. This git is ${major}.${minor}."
  fi
}

top="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "Run this inside the repository."
cd "$top"
export GIT_LITERAL_PATHSPECS=1

mode=""
batch=""
stop=0
case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  --to-main)
    [ $# -eq 3 ] || usage_error
    mode=to-main
    sha="$2"
    branch="$3"
    ;;
  --delivery)
    [ $# -eq 2 ] || usage_error
    mode=delivery
    branch="$2"
    ;;
  ""|-*) usage_error ;;
  *)
    mode=land
    batch="$1"
    case "$#:${2:-}" in
      1:) ;;
      2:--stop-before-main) stop=1 ;;
      *) usage_error ;;
    esac
    ;;
esac

need_tools
candidate_run=""
deploy_job="deploy to sandbox"
npm_cache=""
delivery_branch=""

work="$(mktemp -d "${TMPDIR:-/tmp}/land.XXXXXX")"
moved=0
start=""
cleanup() {
  local status=$?
  remove_tree
  if [ "$moved" = 1 ]; then
    git reset -q --hard "$start" || true
    remove_empty_dirs dest
    say "Nothing was landed. The working tree and index are back as they were."
  fi
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [ "$mode" = to-main ]; then
  case "$sha" in
    *[!0123456789abcdef]*) fail "${sha} is not a full commit SHA." ;;
  esac
  [ "${#sha}" = 40 ] || [ "${#sha}" = 64 ] || fail "${sha} is not a full commit SHA."
  case "$branch" in
    candidate/?*) ;;
    *) fail "${branch} is not a candidate branch: it must start with candidate/." ;;
  esac
  plain_path "$branch" && git check-ref-format "refs/heads/${branch}" || fail "${branch} is not a valid branch name."
  git fetch -q origin
  tip="$(git ls-remote origin "refs/heads/${branch}" | cut -f1)"
  [ "$tip" = "$sha" ] || fail "${branch} on origin is at ${tip:-nothing}, not ${sha}. Pass the SHA the candidate branch holds."
  git cat-file -e "${sha}^{commit}" 2>/dev/null || fail "This clone does not have ${sha}. Run git fetch origin, then try again."
  [ "$(git rev-parse refs/remotes/origin/main)" != "$sha" ] || fail "main is already at ${sha}. Delete the candidate branch with:" \
    "git push origin --delete ${branch}"
  if ! git merge-base --is-ancestor refs/remotes/origin/main "$sha"; then
    fail "main has moved since ${sha} was made, so main cannot move to it." \
      "Land the batch again from the new main. First drop this attempt:" "$(drop_commands "$branch")"
  fi
  watch_candidate "$branch" "$sha"
  finish_main "$sha" "$branch"
  exit 0
fi

# Delivery mode: the publish job pushed candidate/<task> with the GITHUB_TOKEN, which starts no run, and checks from a
# workflow_dispatch run do not count for main's ruleset. The owner's push of the same commit starts a push run that
# does (SPEC-001-R210). Everything is checked before anything is pushed.
if [ "$mode" = delivery ]; then
  task="${branch#candidate/}"
  id="${task#TASK-}"
  case "$branch:$id" in
    candidate/TASK-*:*[!ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-]*) bad=1 ;;
    candidate/TASK-?*:?*) bad=0 ;;
    *) bad=1 ;;
  esac
  [ "$bad" = 0 ] && [ "${#id}" -le 32 ] || fail "${branch} is not a producer branch: it must be candidate/TASK- then 1 to 32 of A-Z, 0-9 and -."
  owner_branch="${branch}-owner"
  git fetch -q origin
  sha="$(git ls-remote origin "refs/heads/${branch}" | cut -f1)"
  [ -n "$sha" ] || fail "${branch} is not on origin. The producer's publish job prints the branch it pushed."
  git cat-file -e "${sha}^{commit}" 2>/dev/null || fail "This clone does not have ${sha}. Run git fetch origin, then try again."
  short="$(git rev-parse --short "$sha")"
  [ "$(git rev-parse refs/remotes/origin/main)" != "$sha" ] || fail "main is already at ${short}. Delete the producer branch with:" \
    "git push origin --delete ${branch}"
  if ! git merge-base --is-ancestor refs/remotes/origin/main "$sha"; then
    fail "main has moved since the producer made ${short}, so main cannot move to it." \
      "Dispatch the task again from the new main. First delete this delivery:" "git push origin --delete ${branch}"
  fi
  tasks="$(git log -1 --format='%(trailers:key=Task,valueonly,separator=%x2C)' "$sha")"
  [ "$tasks" = "$task" ] || fail "${short} has the Task trailer \"${tasks}\", not \"${task}\", so it is not this task's delivery. Nothing was pushed."
  held="$(git ls-remote origin "refs/heads/${owner_branch}" | cut -f1)"
  if [ -n "$held" ] && [ "$held" != "$sha" ]; then
    fail "${owner_branch} already holds ${held:0:12}, not ${short}. Check it, then delete it with:" \
      "git push origin --delete ${owner_branch}"
  fi
  say "Producer delivery ${short} on ${branch}:" ""
  git --no-pager log -1 --format='%B' "$sha" | shown
  git --no-pager show --stat --no-renames --format= "$sha" | shown
  say ""
  if ask "Show the full diff in a pager?"; then
    git show --no-renames --format= "$sha" || true
  fi
  ask "Push ${short} to ${owner_branch}, so its checks count for main, and then move main to it?" || fail "You chose not to land it. Nothing was pushed."
  if [ -z "$held" ] && ! git push -q origin "${sha}:refs/heads/${owner_branch}"; then
    fail "The push to ${owner_branch} failed, so nothing changed. Run the same command again."
  fi
  delivery_branch="$branch"
  watch_candidate "$owner_branch" "$sha"
  finish_main "$sha" "$owner_branch" "$branch"
  exit 0
fi

# Land mode. First check everything that needs no change, so a refusal leaves the repository as it was.
batch="${batch#./}"
batch="${batch%/}"
plain_path "$batch" || fail "${batch} is not a plain relative path."
case "$batch" in
  proposals/?*) ;;
  *) fail "The batch must be a directory under proposals/, for example proposals/phase-1." ;;
esac
name="${batch##*/}"
branch="candidate/land-${name}"
git check-ref-format "refs/heads/${branch}" || fail "${name} cannot name a branch. Rename the batch directory."

[ "$(git config --get gpg.format || true)" = ssh ] && [ -n "$(git config --get user.signingkey || true)" ] || {
  fail "git is not set up to sign with your approver key in this repository." \
    "Set gpg.format to ssh and user.signingkey to your approver key, as step 2 of scripts/bootstrap/rotate-approver-key.sh prints."
}

# not_on_main <what happened> <what to do>: refuses to start from this HEAD. Commits that are not on origin/main are
# most likely an earlier landing that was given up, so it lists them and says how to drop them.
not_on_main() {
  local ahead delete=""
  ahead="$(git log --format='  %h %s' refs/remotes/origin/main..HEAD 2>/dev/null | head -n 5 | shown || true)"
  if [ -n "$ahead" ]; then
    git ls-remote --exit-code origin "refs/heads/${branch}" >/dev/null 2>&1 && delete="$branch"
    fail "$1 This branch has commits that are not on origin/main:" "$ahead" \
      "If they are an earlier landing you gave up on, drop them, then run this again:" "$(drop_commands "$delete")"
  fi
  fail "$1 $2"
}

dirty="$(git status --porcelain)"
[ -z "$dirty" ] || fail "The working tree or index is not clean. Commit, stash or remove these first:" "$dirty"
git pull -q --ff-only origin main ||
  not_on_main "git pull --ff-only origin main failed." "Check that origin is reachable and that this branch is main."
start="$(git rev-parse HEAD)"
[ "$start" = "$(git rev-parse refs/remotes/origin/main)" ] ||
  not_on_main "HEAD is not origin/main after git pull." "Check out main, then run this again."

manifest="${batch}/LAND.txt"
case "$(file_mode "$manifest")" in
  100644|100755) ;;
  *) fail "${manifest} is not a tracked file." ;;
esac
manifest_text="$(git show "HEAD:${manifest}")"
case "$manifest_text" in
  *"$(printf '\r')"*) fail "${manifest} has Windows line endings. Save it with LF line endings." ;;
esac
# Every byte must be printable ASCII or a tab, so no value land.sh prints can carry a terminal control sequence.
tab="$(printf '\t')"
bad_line="$(git show "HEAD:${manifest}" | LC_ALL=C grep -a -n -v -m 1 "^[[:print:]${tab}]*\$" | cut -d: -f1 || true)"
[ -z "$bad_line" ] || fail "${manifest} line ${bad_line} holds a control character or a byte outside printable ASCII." \
  "LAND.txt must be plain ASCII text."

# Parse the manifest. Values are only compared and passed as arguments, never evaluated.
message=""
spec_count=0
specs=()
require_count=0
require_files=()
require_strings=()
move_count=0
move_srcs=()
move_dests=()
line_no=0
while IFS= read -r line || [ -n "$line" ]; do
  line_no=$((line_no + 1))
  case "$line" in
    ""|"#"*) continue ;;
    *": "*) ;;
    *) fail "${manifest} line ${line_no} is not \"key: value\": ${line}" ;;
  esac
  key="${line%%: *}"
  value="$(trim "${line#*: }")"
  case "$key" in
    message)
      [ -z "$message" ] || fail "${manifest} line ${line_no}: there must be exactly one message line."
      [ -n "$value" ] || fail "${manifest} line ${line_no}: the message is empty."
      message="$value"
      ;;
    spec)
      printf '%s\n' "$value" | grep -Eq '^SPEC-[0-9]{3}-R[0-9]+$' || fail "${manifest} line ${line_no}: ${value} is not a requirement ID."
      specs[$spec_count]="$value"
      spec_count=$((spec_count + 1))
      ;;
    requires)
      file="${value%% *}"
      text="$(trim "${value#"$file"}")"
      plain_path "$file" || fail "${manifest} line ${line_no}: ${file} is not a plain relative path."
      [ -n "$text" ] || fail "${manifest} line ${line_no}: requires needs a file and the text it must contain."
      require_files[$require_count]="$file"
      require_strings[$require_count]="$text"
      require_count=$((require_count + 1))
      ;;
    move)
      src="${value%% *}"
      dest="$(trim "${value#"$src"}")"
      [ -n "$dest" ] || fail "${manifest} line ${line_no}: move needs a source and a destination."
      plain_path "$src" || fail "${manifest} line ${line_no}: ${src} is not a plain relative path inside the batch."
      plain_path "$dest" || fail "${manifest} line ${line_no}: ${dest} is not a plain relative path."
      case "/$(lowercase "$dest")/" in
        /proposals/*) fail "${manifest} line ${line_no}: ${dest} is under proposals/. A move must take the file out of proposals/." ;;
        */.git/*) fail "${manifest} line ${line_no}: ${dest} is under .git/." ;;
      esac
      [ "$src" != LAND.txt ] || fail "${manifest} line ${line_no}: LAND.txt cannot be moved."
      case "$(file_mode "${batch}/${src}")" in
        100644|100755) ;;
        120000) fail "${manifest} line ${line_no}: ${batch}/${src} is a symbolic link." ;;
        *) fail "${manifest} line ${line_no}: ${batch}/${src} is not a tracked file." ;;
      esac
      i=0
      while [ "$i" -lt "$move_count" ]; do
        [ "${move_srcs[$i]}" != "$src" ] || fail "${manifest} line ${line_no}: ${src} is moved twice."
        [ "$(lowercase "${move_dests[$i]}")" != "$(lowercase "$dest")" ] || fail "${manifest} line ${line_no}: two moves go to ${dest}."
        i=$((i + 1))
      done
      # Every existing part of the destination's path must be a real directory, and the destination not a directory.
      part="${dest%/*}"
      [ "$part" != "$dest" ] || part=""
      while [ -n "$part" ]; do
        if [ -L "$part" ] || { [ -e "$part" ] && [ ! -d "$part" ]; }; then
          fail "${manifest} line ${line_no}: ${part} is not a plain directory, so ${dest} cannot go there."
        fi
        case "$part" in
          */*) part="${part%/*}" ;;
          *) part="" ;;
        esac
      done
      if [ -d "$dest" ] && [ ! -L "$dest" ]; then
        fail "${manifest} line ${line_no}: ${dest} is a directory. Give the destination's full file path."
      fi
      move_srcs[$move_count]="$src"
      move_dests[$move_count]="$dest"
      move_count=$((move_count + 1))
      ;;
    *) fail "${manifest} line ${line_no} has the unknown key \"${key}\". The keys are message, spec, requires and move." ;;
  esac
done <<EOF
$manifest_text
EOF
[ -n "$message" ] || fail "${manifest} has no message line."
[ "$spec_count" -gt 0 ] || fail "${manifest} has no spec line."
[ "$move_count" -gt 0 ] || fail "${manifest} has no move line."

others=""
while IFS= read -r tracked_file; do
  [ -n "$tracked_file" ] && [ "$tracked_file" != "$manifest" ] || continue
  listed=0
  i=0
  while [ "$i" -lt "$move_count" ]; do
    [ "${batch}/${move_srcs[$i]}" != "$tracked_file" ] || listed=1
    i=$((i + 1))
  done
  [ "$listed" = 1 ] || others="${others}  ${tracked_file}
"
done <<EOF
$(git ls-files -- "${batch}/")
EOF
[ -z "$others" ] || fail "${batch} holds tracked files that ${manifest} does not move:" "${others%?}" \
  "Add a move line for each, or remove them from the batch in a commit of their own."

if git ls-remote --exit-code origin "refs/heads/${branch}" >/dev/null 2>&1; then
  fail "${branch} already exists on origin. If it holds an earlier attempt, delete it first:" "git push origin --delete ${branch}"
fi

i=0
while [ "$i" -lt "$require_count" ]; do
  file="${require_files[$i]}"
  text="${require_strings[$i]}"
  case "$(file_mode "$file")" in
    100644|100755) ;;
    *) fail "Precondition failed: ${file} is not a tracked file on main, so the batch is not ready to land." ;;
  esac
  grep -qF -- "$text" "$file" || fail "Precondition failed: ${file} does not contain \"${text}\", so the batch is not ready to land."
  say "Precondition met: ${file} contains \"${text}\"."
  i=$((i + 1))
done

# remove_empty_dirs src|dest: removes the directories the moves emptied, or the ones they created, if empty.
remove_empty_dirs() {
  local path n=0
  while [ "$n" -lt "$move_count" ]; do
    if [ "$1" = src ]; then path="${batch}/${move_srcs[$n]}"; else path="${move_dests[$n]}"; fi
    case "$path" in
      */*) rmdir -p "${path%/*}" 2>/dev/null || true ;;
    esac
    n=$((n + 1))
  done
}

# A staged copy drafted before newer work reached its destination on main would undo that work. The commit that added
# the copy to the batch marks the main it was drafted on; a later edit to the copy does not make it any newer.
stale=0
i=0
while [ "$i" -lt "$move_count" ]; do
  src="${batch}/${move_srcs[$i]}"
  dest="${move_dests[$i]}"
  base="$(git log --diff-filter=A -1 --format=%H -- "$src")"
  [ -n "$base" ] || fail "Cannot find the commit that added ${src}. If this clone is shallow, run git fetch --unshallow origin."
  newer="$(git log --format='%h %s' "${base}..${start}" -- "$dest" | shown)"
  if [ -n "$newer" ]; then
    stale=1
    say "" "Warning: ${dest} changed on origin/main after ${src} was staged in $(git log -1 --format='%h %s' "$base" | shown)." \
      "  Changed since by:"
    printf '%s\n' "$newer" | sed -n '1,5s/^/    /p'
    count="$(printf '%s\n' "$newer" | wc -l | tr -d ' ')"
    [ "$count" -le 5 ] || say "    and $((count - 5)) more"
    if git cat-file -e "${start}:${dest}" 2>/dev/null; then
      git show "${base}:${dest}" > "$work/base" 2>/dev/null || : > "$work/base"
      git show "${start}:${dest}" > "$work/current"
      git show "${start}:${src}" > "$work/staged"
      { diff "$work/base" "$work/current" || true; } | sed -n 's/^> \{0,1\}//p' > "$work/added"
      awk -v staged="$work/staged" 'BEGIN { while ((getline line < staged) > 0) have[line] = 1 } !($0 in have)' \
        "$work/added" > "$work/lacking"
      added="$(wc -l < "$work/added" | tr -d ' ')"
      lacking="$(wc -l < "$work/lacking" | tr -d ' ')"
      if [ "$added" = 0 ]; then
        say "  Those commits added no lines. Check that the staged copy does not bring back lines they removed."
      elif [ "$lacking" = 0 ]; then
        say "  The staged copy keeps every line those commits added."
      else
        say "  The staged copy lacks lines those commits added (${lacking} of ${added}). Landing it removes them:"
        sed -n '1,5p' "$work/lacking" | cut -c1-100 | shown | sed 's/^/    /'
      fi
    else
      say "  It was deleted on origin/main since, so landing the staged copy brings it back."
    fi
  fi
  i=$((i + 1))
done
if [ "$stale" = 1 ]; then
  say "" "A staged copy older than its destination can undo newer work." \
    "If it was drafted on top of those commits, the lines it lacks are its own edits. Check them in the diff."
  ask "Continue anyway?" || fail "Nothing changed."
fi

moved=1
i=0
while [ "$i" -lt "$move_count" ]; do
  dest="${move_dests[$i]}"
  case "$dest" in
    */*) mkdir -p "${dest%/*}" ;;
  esac
  git mv -f -- "${batch}/${move_srcs[$i]}" "$dest"
  i=$((i + 1))
done
git rm -q -- "$manifest"
left="$(git ls-files -- "${batch}/")"
[ -z "$left" ] || fail "${batch} still holds tracked files after the moves:" "$left"

i=0
while [ "$i" -lt "$spec_count" ]; do
  grep -q -- "^| ${specs[$i]} |" specs/*.md 2>/dev/null || fail "${specs[$i]} is not defined in specs/ after the moves, so the trace check would fail."
  i=$((i + 1))
done

# The index must hold only the destinations and the batch leaving proposals/.
: > "$work/order"
i=0
while [ "$i" -lt "$move_count" ]; do
  printf '%s\n' "${move_dests[$i]}" >> "$work/order"
  i=$((i + 1))
done
while IFS= read -r staged_path; do
  [ -n "$staged_path" ] || continue
  case "$staged_path" in
    "$batch"/*) continue ;;
  esac
  grep -qxF -- "$staged_path" "$work/order" || fail "The index holds a change to ${staged_path}, which ${manifest} does not move."
done <<EOF
$(git diff --cached --name-only --no-renames)
EOF

# The review. --no-renames shows a new file's whole content, not a rename with no lines. The message comes first and
# the diff stat last, so the stat sits just above the question.
say "" "Staged for one signed commit on top of main at ${start:0:12}:" "Message: ${message}"
i=0
while [ "$i" -lt "$spec_count" ]; do
  say "Spec: ${specs[$i]}"
  i=$((i + 1))
done
say "Moves:"
i=0
while [ "$i" -lt "$move_count" ]; do
  say "  ${batch}/${move_srcs[$i]} -> ${move_dests[$i]}"
  i=$((i + 1))
done
i=0
while [ "$i" -lt "$move_count" ]; do
  case "$(lowercase "${move_dests[$i]}")" in
    approvers.txt) say "Warning: this changes approvers.txt, the keys that may sign approver commits." ;;
    specs/protected-paths.txt) say "Warning: this changes specs/protected-paths.txt, the paths that need an approver's signature." ;;
  esac
  i=$((i + 1))
done
git --no-pager diff --cached --stat --no-renames
say "Lines under ${batch}/ are the staged copies leaving the batch. The full diff shows the destinations first." ""
if ask "Show the full diff in a pager?"; then
  # Quitting the pager before the end is a finished review, not a failure.
  git diff --cached --no-renames -O"$work/order" || true
fi
preflight
ask "Sign and land?" || fail "You chose not to sign."

trailers=()
i=0
while [ "$i" -lt "$spec_count" ]; do
  trailers[$((i * 2))]="--trailer"
  trailers[$((i * 2 + 1))]="Spec: ${specs[$i]}"
  i=$((i + 1))
done
say "Tap your security key when it blinks."
if ! git commit -q -S -m "$message" "${trailers[@]}"; then
  fail "Signing failed, so nothing was committed." "Run the same command again, and tap your security key when it blinks."
fi
sha="$(git rev-parse HEAD)"
short="$(git rev-parse --short HEAD)"

# The signatures check reads approvers.txt as of the parent. A commit that fails it cannot be fixed on top, so check
# the signature before anything is pushed.
if git cat-file -e "${start}:approvers.txt" 2>/dev/null; then
  git show "${start}:approvers.txt" > "$work/allowed_signers"
  if ! git -c gpg.ssh.allowedSignersFile="$work/allowed_signers" verify-commit "$sha" >/dev/null 2>&1; then
    fail "The signature on ${short} does not verify against approvers.txt, so the signatures check would refuse it." \
      "Check that user.signingkey is the approver key that approvers.txt lists."
  fi
fi
moved=0
remove_empty_dirs src
say "Signed ${short}: ${message}"

if ! git push origin "${sha}:refs/heads/${branch}"; then
  fail "The push to ${branch} failed. The signed commit ${short} is on your local branch. To try again:" \
    "git push origin ${sha}:refs/heads/${branch}" "scripts/bootstrap/land.sh --to-main ${sha} ${branch}"
fi
watch_candidate "$branch" "$sha"

if [ "$stop" = 1 ]; then
  say "" "Stopped before main, as asked. Run ${candidate_run} passed on ${branch} for ${short}." \
    "When you are ready, move main to this commit with:" "scripts/bootstrap/land.sh --to-main ${sha} ${branch}"
  exit 0
fi
finish_main "$sha" "$branch"
