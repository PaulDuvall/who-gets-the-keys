# producer.sh (Tracer 2 T3b, backlog j4e)

Status: staged in `proposals/producer-script/`, not landed. Drafted 2026-11-08. Lands after `proposals/cloud-session-setup/`, whose copies it builds on.

## Why

Lesson L14 (`docs/notes/tracer-2-lessons.md`): dispatching the producer and finding its run took two commands, `sleep 5 && gh run list --limit 1` twice picked up the previous run, and reading a result meant `gh run view --log` and a `grep` that also matched the steps' script text.

## What

| Use | Command |
|---|---|
| Egress probe | `scripts/bootstrap/producer.sh probe` |
| A signed task | `scripts/bootstrap/producer.sh task TASK-<ID> --subject "<commit subject>"` |

Each one checks its inputs against SPEC-001-R83's patterns, refuses unless the owner's `main` is `origin/main` (the run uses `origin/main`'s workflow and task file), and dispatches `producer.yml` on `main`. It takes the run whose URL `gh workflow run` prints; when it prints none, a run that `gh run list` did not show before the dispatch, on the dispatched commit, created no more than 30 s before the dispatch. It watches the run in the terminal, then judges it from GitHub's record of the run and its steps, not from log text: the log also holds the agent's tool output, which can say anything. A probe passes when the run's conclusion is `success` and both probe-check steps succeeded; a task, when the run and its publish step succeeded and `candidate/<task>` is on origin. It prints the producer's own result lines, from its steps other than the one that shows the agent's tool calls, of which only the last `RUN ENDED` line is kept, and for a passed task the land command.

Changes from the backlog item, which predates T3a: the task form takes `--subject` only. `--spec` and `--prompt` went with the free-text prompt in T3a, when the producer started reading `tasks/<task>.task.md` (SPEC-001-R83). There is no candidate-branch `pipeline.yml` run to report, because the publish job's push starts none (SPEC-001-R209); the script ends on the publish job's `land.sh --delivery` line instead. The probe dispatches with task `TASK-PROBE` and subject `Egress probe`: the install job checks both inputs even for a probe.

## Tests

`test/producer-script.test.ts`, 15 tests naming SPEC-001-R212, against a temporary clone with a bare origin and a stub `gh`: bash 3.2 compatibility, and every step and job name the script relies on still in `producer.yml`; bad inputs refused before any `gh` call; a `main` ahead of and a `main` behind `origin/main` refused; a missing task file refused; the run taken from the dispatch's URL; without one, the run picked from a list whose first entries are a newer run on another commit and an older run on the same commit; result lines from a log modelled on run 42499336951, whose transcript step holds agent output that looks like `CHECK lint FAILED` and `BOUNDARY HELD` lines and a forged `RUN ENDED` line, and whose check step's group holds script text; a good run passing despite that output; exit 1 on a failed or cancelled run and on a failed or skipped probe check; a task's delivery reported from origin, and refused when the branch is missing; and no watch when no run appears, or no verdict when the run cannot be read.

## Not verified

- The `gh run view --log` line format, `<job>\t<step>\t<timestamp> <text>`, against a live run: the fixture follows the raw job log of run 42499336951 (read on 2026-11-08 through the GitHub API) with the job and step prefix `gh` adds. Only the printed lines depend on it; the verdict does not.
- That `gh workflow run` prints the new run's URL: gh 2.89.0's help says it returns it "if available". The list rule covers the case where it does not.
- The four `--jq` expressions under gh's gojq. They were run under jq 1.7 with sample data on 2026-11-08 and gave the expected output.

## Review, 2026-11-08

An independent review found nothing critical, one high, two medium and six low.

| Severity | Finding | Done |
|---|---|---|
| High | The transcript step prints the agent's tool output outside any `##[group]`, so a `CHECK lint FAILED` line from a check the agent ran mid-session made a good run fail, and the agent could forge `BOUNDARY HELD`, `Pushed` or land lines. Reproduced by the reviewer | The verdict now comes from the run's conclusion, the named steps' conclusions and `candidate/<task>` on origin. Printed lines come only from the producer's own steps, by `gh`'s step column, and from the transcript step only its last `RUN ENDED` line. The land command is the script's own. R212 amended to say so |
| Medium | A failed `gh run view --log` became an empty log and a wrong verdict | Each read of the run retries six times, then fails with "its result is unknown" |
| Medium | Finding the run: a run dispatched seconds earlier and not yet listed could be taken; a fast local clock could miss the run | The run's URL from `gh workflow run` comes first; the list rule is the fallback |
| Low | The stub ignores `--jq` | The expressions were run under jq 1.7 (above) |
| Low | Only a `main` ahead of `origin/main` was tested | A `main` behind is tested too |
| Low | The fixture was synthetic | It now follows run 42499336951's log, transcript step included |
| Low | The watch's output went to a file, so the owner saw nothing for up to the job's 60 minutes | The watch prints to the terminal |
| Low | A byte order mark before the timestamp would defeat the `##[group]` match | Stripped; the fixture has one |
| Low | The README paragraph left out the `Pushed` line | Added |
