#!/usr/bin/env bash
# Dispatches the runner producer, finds the run that dispatch started, watches it and reports its result (SPEC-001-R212).
# Pass or fail comes from GitHub's record of the run and its steps, never from log text: the agent's tool output is in
# the log too, so a line in it proves nothing. Runs on macOS's bash 3.2 and on Linux, so it uses no bash 4 feature; its
# test lists them.
set -euo pipefail

usage() {
  echo "usage: scripts/bootstrap/producer.sh probe"
  echo "       scripts/bootstrap/producer.sh task <task ID> --subject <commit subject>"
  echo "  probe  dispatches producer.yml with egress_probe=true, which needs no task file. It passes only when the run"
  echo "         passed and both probe checks passed: the unlisted command was denied and egress was blocked"
  echo "  task   dispatches producer.yml for the signed tasks/<task ID>.task.md, with <commit subject> as the"
  echo "         delivery's subject. It passes only when the run and its publish step passed and candidate/<task ID>"
  echo "         is on origin, and then prints the land.sh --delivery command that lands it (SPEC-001-R210)"
  echo "  Either way it refuses unless your main is origin/main, dispatches on main, takes the run whose URL the"
  echo "  dispatch prints, or else the new run on that commit, watches it, prints the result lines of the producer's"
  echo "  own check steps, and exits 1 unless the run passed."
}

say() { printf '%s\n' "$@"; }
fail() { printf '%s\n' "$@" >&2; exit 1; }
usage_error() { usage >&2; exit 2; }

repo="${REPO:-PaulDuvall/who-gets-the-keys}"
poll="${PRODUCER_POLL_SECONDS:-5}"
tries="${PRODUCER_POLL_TRIES:-60}"
task_pattern='^TASK-[A-Z0-9-]{1,32}$'
subject_pattern="^[A-Za-z0-9][A-Za-z0-9 ,.:;'()/_-]{0,71}\$"
# Step names in producer.yml that decide the result or print it. The test checks that each still exists there.
transcript_step="Show the agent's tool calls and what they returned"
unlisted_step="Check that the probe's unlisted command was denied (SPEC-001-R88)"
egress_step="Check that the sandbox blocked the probe (SPEC-001-R87)"
publish_step="Check the patch against the task, commit it unsigned and push candidate/<task> without force (SPEC-001-R208)"
jobs_pattern='^(install the dependencies|produce a patch with Claude Code|publish the candidate branch)$'

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  probe)
    [ $# -eq 1 ] || usage_error
    mode=probe; task=TASK-PROBE; subject="Egress probe"; probe=true
    ;;
  task)
    [ $# -eq 4 ] && [ "$3" = --subject ] || usage_error
    mode=task; task="$2"; subject="$4"; probe=false
    ;;
  *) usage_error ;;
esac
export LC_ALL=C
[[ "$task" =~ $task_pattern ]] || fail "${task} is not a task ID: TASK- then 1 to 32 of A-Z, 0-9 and -."
[[ "$subject" =~ $subject_pattern ]] ||
  fail "The subject must start with a letter or digit and hold at most 72 of letters, digits, space and , . : ; ' ( ) / _ -"

command -v gh >/dev/null 2>&1 || fail "This needs the GitHub CLI, gh. Install it, sign in with gh auth login, then run this again."
gh auth status >/dev/null 2>&1 || fail "gh is not signed in. Run gh auth login, then run this again."
top="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "Run this inside the repository."
cd "$top"

# The run uses origin/main's producer.yml and task file, so the owner's main must be that commit: what they read is
# what runs.
git fetch -q origin main || fail "git fetch origin main failed. Check that origin is reachable, then run this again."
local_main="$(git rev-parse -q --verify refs/heads/main || true)"
sha="$(git rev-parse -q --verify refs/remotes/origin/main || true)"
[ -n "$sha" ] || fail "There is no origin/main after git fetch."
if [ "$local_main" != "$sha" ]; then
  fail "Your main is at ${local_main:-nothing}, origin/main at ${sha}. The run uses origin/main's workflow and task file." \
    "Bring your main to origin/main first, then run this again:" "git checkout main" "git pull --ff-only origin main"
fi
if [ "$mode" = task ] && ! git cat-file -e "${sha}:tasks/${task}.task.md" 2>/dev/null; then
  fail "tasks/${task}.task.md is not on origin/main at ${sha:0:12}. Land the signed task file first. Nothing was dispatched."
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/producer.XXXXXX")"
trap 'rm -rf "$work"' EXIT

# runs: one line per producer.yml workflow_dispatch run on main, "<ID> <created, epoch seconds> <head SHA>".
runs() {
  gh run list --repo "$repo" --workflow producer.yml --branch main --event workflow_dispatch --limit 20 \
    --json databaseId,createdAt,headSha --jq '.[] | "\(.databaseId) \(.createdAt | fromdateiso8601) \(.headSha)"'
}
runs > "$work/before" || fail "gh run list failed, so nothing was dispatched."
since=$(( $(date -u +%s) - 30 ))
say "Dispatching producer.yml on main at ${sha} (task ${task}, egress_probe ${probe})."
gh workflow run producer.yml --repo "$repo" --ref main -f task="$task" -f subject="$subject" -f egress_probe="$probe" \
  > "$work/dispatch" 2>&1 || { cat "$work/dispatch" >&2; fail "gh workflow run failed, so nothing was dispatched."; }

# gh prints the new run's URL when GitHub returns it. Otherwise the run is one that was not listed before the
# dispatch, is on the dispatched commit, and was created after the dispatch time less 30 s for clock skew: never the
# newest run alone, which can be one made just before.
run="$(sed -n "s|^.*https://github\.com/${repo}/actions/runs/\([0-9][0-9]*\).*\$|\1|p" "$work/dispatch" | head -n 1)"
attempt=0
while [ -z "$run" ] && [ "$attempt" -lt "$tries" ]; do
  attempt=$((attempt + 1))
  [ "$attempt" = 1 ] || sleep "$poll"
  runs > "$work/after" 2>/dev/null || continue
  while read -r id created head; do
    case "$id:$created" in
      *[!0123456789:]*|:*|*:) continue ;;
    esac
    grep -qx "${id} .*" "$work/before" && continue
    [ "$head" = "$sha" ] && [ "$created" -ge "$since" ] || continue
    run="$id"
    break
  done < "$work/after"
done
[ -n "$run" ] || fail "No new producer run on main for ${sha:0:12} after $((tries * poll)) s. To look for it:" \
  "gh run list --repo ${repo} --workflow producer.yml --branch main"

url="https://github.com/${repo}/actions/runs/${run}"
say "Producer run ${run}: ${url}" "Watching it until it ends."
gh run watch "$run" --repo "$repo" --interval 10 || true

# read_run <file> <gh run view arguments...>: retries, because a run's record and log can lag its end briefly.
read_run() {
  local file="$1" attempt
  shift
  for attempt in 1 2 3 4 5 6; do
    if gh run view "$run" --repo "$repo" "$@" > "$file" 2>/dev/null && [ -s "$file" ]; then return 0; fi
    [ "$attempt" = 6 ] || sleep "$poll"
  done
  fail "" "Could not read producer run ${run} from GitHub, so its result is unknown. Open it:" "$url"
}
read_run "$work/conclusion" --json status,conclusion --jq '.status + " " + (.conclusion // "")'
read_run "$work/steps" --json jobs --jq '.jobs[] | .name as $job | .steps[] | [$job, .name, (.conclusion // "")] | join("\t")'
read_run "$work/log" --log
step_passed() { awk -F '\t' -v s="$1" '$2 == s && $3 == "success" { found = 1 } END { exit found ? 0 : 1 }' "$work/steps"; }

# The result lines, from the producer's own steps only. gh prints "<job>\t<step>\t<timestamp> <text>". The transcript
# step prints the agent's tool output, which can hold any text, so from it only its last RUN ENDED line is kept.
bom="$(printf '\357\273\277')"
awk -F '\t' -v jobs="$jobs_pattern" -v transcript="$transcript_step" -v bom="$bom" '
  $1 !~ jobs { next }
  {
    text = $0
    sub(/^[^\t]*\t[^\t]*\t/, "", text)
    if (index(text, bom) == 1) text = substr(text, length(bom) + 1)
    sub(/^[0-9][0-9TZ:.-]* /, "", text)
  }
  $2 == transcript { if (text ~ /^RUN ENDED: /) ended = text; next }
  text ~ /^##\[group\]/ { inside = 1; next }
  text ~ /^##\[endgroup\]/ { inside = 0; next }
  inside { next }
  text ~ /^(Permission mode: |BOUNDARY |CHECK |Pushed [0-9a-f]+ to candidate\/)/ { lines[++n] = text }
  END { if (ended != "") print ended; for (i = 1; i <= n; i++) print lines[i] }
' "$work/log" | cat -v

read -r status conclusion < "$work/conclusion" || true
if [ "$status" != completed ] || [ "$conclusion" != success ]; then
  fail "" "Producer run ${run} did not pass: ${status:-unknown} ${conclusion:-}. Its failed steps:" \
    "gh run view ${run} --repo ${repo} --log-failed"
fi
if [ "$mode" = probe ]; then
  step_passed "$unlisted_step" && step_passed "$egress_step" ||
    fail "" "Producer run ${run} passed, but its two probe checks did not both pass. Read its log:" "gh run view ${run} --repo ${repo} --log"
  say "" "Both boundaries held: the unlisted command was denied, and egress to example.com was blocked."
else
  delivered="$(git ls-remote origin "refs/heads/candidate/${task}" | cut -f1)"
  step_passed "$publish_step" && [ -n "$delivered" ] ||
    fail "" "Producer run ${run} passed, but candidate/${task} is not on origin. Read its log:" "gh run view ${run} --repo ${repo} --log"
  say "" "Delivery ${delivered:0:12} is on candidate/${task}. Check it, then land it with:" \
    "scripts/bootstrap/land.sh --delivery candidate/${task}"
fi
