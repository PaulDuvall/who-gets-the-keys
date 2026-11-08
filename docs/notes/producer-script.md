# producer.sh (Tracer 2 T3b, backlog j4e)

Status: staged in `proposals/producer-script/`, not landed. Drafted 2026-11-08. Lands after `proposals/cloud-session-setup/`, whose copies it builds on.

## Why

Lesson L14 (`docs/notes/tracer-2-lessons.md`): dispatching the producer and finding its run took two commands, `sleep 5 && gh run list --limit 1` twice picked up the previous run, and reading a result meant `gh run view --log` and a `grep` that also matched the steps' script text.

## What

| Use | Command |
|---|---|
| Egress probe | `scripts/bootstrap/producer.sh probe` |
| A signed task | `scripts/bootstrap/producer.sh task TASK-<ID> --subject "<commit subject>"` |

Each one checks its inputs against SPEC-001-R83's patterns, refuses unless the owner's `main` is `origin/main` (the run uses `origin/main`'s workflow and task file), dispatches `producer.yml` on `main`, and finds its run: one that `gh run list` did not show before the dispatch, on the dispatched commit, created no more than 30 s before the dispatch. It prints the URL, watches the run, and prints only the result lines from outside the steps' `##[group]` blocks, where GitHub echoes the script. It exits 1 on a failed run, a `BROKEN` or `INVALID` boundary, a `CHECK ... FAILED` line, a probe without both `BOUNDARY HELD` lines, or a task without its land command.

Changes from the backlog item, which predates T3a: the task form takes `--subject` only. `--spec` and `--prompt` went with the free-text prompt in T3a, when the producer started reading `tasks/<task>.task.md` (SPEC-001-R83). There is no candidate-branch `pipeline.yml` run to report, because the publish job's push starts none (SPEC-001-R209); the script ends on the publish job's `land.sh --delivery` line instead. The probe dispatches with task `TASK-PROBE` and subject `Egress probe`: the install job checks both inputs even for a probe.

## Tests

`test/producer-script.test.ts`, 13 tests naming SPEC-001-R212, against a temporary clone with a bare origin and a stub `gh`: bash 3.2 compatibility; bad inputs refused before any `gh` call; a `main` behind or ahead of `origin/main` refused; a missing task file refused; the run picked from a list whose first entries are a newer run on another commit and an older run on the same commit; only result lines printed from a log whose `##[group]` block holds a `BOUNDARY BROKEN` line; exit 1 on each failure kind; the task's own land command, not one from script text; and no watch when no run appears.

## Not verified

- The `gh run view --log` line format, `<job>\t<step>\t<timestamp> <text>`, against a live run: the fixture follows the raw job log of run 42499336951 (read on 2026-11-08 through the GitHub API) with the job and step prefix `gh` adds. The script also handles lines without the prefix.
- `fromdateiso8601` in `gh`'s `--jq`. gh uses gojq, which documents it; not run here against live data.
