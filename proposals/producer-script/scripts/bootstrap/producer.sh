#!/usr/bin/env bash
# Dispatches the runner producer, finds the run that dispatch started, watches it and prints only its result lines
# (SPEC-001-R212). Runs on macOS's bash 3.2 and on Linux, so it uses no bash 4 feature; its test lists them.
set -euo pipefail

usage() {
  echo "usage: scripts/bootstrap/producer.sh probe"
  echo "       scripts/bootstrap/producer.sh task <task ID> --subject <commit subject>"
  echo "  probe  dispatches producer.yml with egress_probe=true, which needs no task file, and expects two lines:"
  echo "         BOUNDARY HELD: unlisted command denied, and BOUNDARY HELD: egress to example.com"
  echo "  task   dispatches producer.yml for the signed tasks/<task ID>.task.md, with <commit subject> as the"
  echo "         delivery's subject, and ends with the land.sh --delivery command that lands it (SPEC-001-R210)"
  echo "  Either way it refuses unless your main is origin/main, dispatches on main, finds the new run by its"
  echo "  creation time and commit, watches it, prints only its Permission mode, BOUNDARY, RUN ENDED and CHECK lines"
  echo "  and the publish job's push and land lines, and exits 1 if the run failed or a line says BROKEN, INVALID or"
  echo "  FAILED."
}

say() { printf '%s\n' "$@"; }
fail() { printf '%s\n' "$@" >&2; exit 1; }
usage_error() { usage >&2; exit 2; }

repo="${REPO:-PaulDuvall/who-gets-the-keys}"
poll="${PRODUCER_POLL_SECONDS:-5}"
tries="${PRODUCER_POLL_TRIES:-60}"
task_pattern='^TASK-[A-Z0-9-]{1,32}$'
subject_pattern="^[A-Za-z0-9][A-Za-z0-9 ,.:;'()/_-]{0,71}\$"

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
# A run is this dispatch's only if it was not listed before, is on the dispatched commit, and was created after the
# dispatch time less 30 s for clock skew. Never the newest run alone: a run made just before can be listed first.
since=$(( $(date -u +%s) - 30 ))
say "Dispatching producer.yml on main at ${sha} (task ${task}, egress_probe ${probe})."
gh workflow run producer.yml --repo "$repo" --ref main -f task="$task" -f subject="$subject" -f egress_probe="$probe" ||
  fail "gh workflow run failed, so nothing was dispatched."

run=""
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
status=0
gh run watch "$run" --repo "$repo" --exit-status > "$work/watch" 2>&1 || status=1

# The result lines only. GitHub prints each step's script and env inside ##[group]Run ... ##[endgroup], and the script
# holds the same words, so lines inside a group are skipped. gh run view --log puts "<job>\t<step>\t" in front.
gh run view "$run" --repo "$repo" --log > "$work/log" 2>/dev/null || : > "$work/log"
cut -f3- "$work/log" | sed 's/^[0-9][0-9TZ:.-]* //' | awk '
  /^##\[group\]/ { inside = 1; next }
  /^##\[endgroup\]/ { inside = 0; next }
  inside { next }
  /^(Permission mode: |BOUNDARY |RUN ENDED: |CHECK |Pushed [0-9a-f]+ to candidate\/|scripts\/bootstrap\/land\.sh --delivery )/ { print }
' > "$work/results"
cat -v "$work/results"

grep -Eq '^(BOUNDARY BROKEN|BOUNDARY CHECK INVALID|CHECK .* FAILED)' "$work/results" && status=1
if [ "$status" != 0 ]; then
  fail "" "Producer run ${run} did not pass. Its failed steps:" "gh run view ${run} --repo ${repo} --log-failed"
fi
if [ "$mode" = probe ]; then
  [ "$(grep -c '^BOUNDARY HELD: ' "$work/results" || true)" = 2 ] ||
    fail "" "The probe run passed but did not print both BOUNDARY HELD lines. Read its log:" "gh run view ${run} --repo ${repo} --log"
  say "" "Both boundaries held."
else
  grep -qx "scripts/bootstrap/land.sh --delivery candidate/${task}" "$work/results" ||
    fail "" "The run passed but printed no land command for candidate/${task}. Read its log:" "gh run view ${run} --repo ${repo} --log"
  say "" "Delivery on candidate/${task}. Check it, then land it with the command above."
fi
