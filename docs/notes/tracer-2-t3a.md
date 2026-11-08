# Tracer 2, slice T3a: a signed task file, and the task and scope checks

Status: staged in `proposals/t3-task-file/`, 2026-11-08, on top of `main` at `9f887da`. Not landed.

T2's producer takes a free-text `prompt` input "until slice T3". T3a replaces it with an approver-signed task file, `tasks/<ID>.task.md`, and adds two checks that hold a candidate's commits to that file. It is the first half of the T3 row in `docs/notes/tracer-2.md`: "a signed task file under a protected `tasks/` path, a thin scope check". The receipt lines INTENT, TASK, AUTHOR and MODEL (decision 0004's R69 to R71) and `scripts/bootstrap/cloud-session-setup.sh` are not in this batch.

## The task file

```markdown
---
requirements: [SPEC-014-R7]
produces: [src/export.ts, test/export.acceptance.test.ts]
---
Reject an export request whose columns name the same column twice with a 400, per SPEC-014-R7.
```

Exactly two keys, each a YAML flow list on one line of 1 to 16 entries. `requirements` holds requirement IDs that a file under `specs/` defines at the base commit. `produces` holds the paths the delivery may add, change or delete; an entry ending in `/` covers everything under it, as in `specs/protected-paths.txt`, and no entry may cover or lie under `specs/`, `tasks/`, `approvers.txt` or a protected path. The rest of the file is the instruction. `scripts/checks.ts` parses it with a small strict parser, `parseTask`, and no YAML package: anything that is not one of these two lines fails.

## What the batch changes

| File | Change |
|---|---|
| `specs/SPEC-001-delivery-pipeline.md` | New section "Task files": SPEC-001-R64 to R68 and R107, decision 0004's drafts thinned for the tracer. Scenario rows R72 (B23) and R73 (B24), and a sentence on task modes in the Scenarios preamble. R83, R87 and R208 amended: the producer reads the task file instead of the `spec` and `prompt` inputs. The Runner producer intro says so |
| `specs/protected-paths.txt` | Adds `tasks/`, so a task file needs an approver's signature, and `scripts/receipt.ts`, which writes the receipt predicate and was unprotected |
| `scripts/checks.ts` | `task` and `scope` checks outside `ORDER`, and the helpers `parseTask`, `readTask`, `rangeBase`, `rangeCommits`, `pathEntries` and `scopeFailure`. `ORDER` and the fifteen checks are unchanged |
| `.github/workflows/pipeline.yml` | The checks job runs `node scripts/checks.ts task` and then `node scripts/checks.ts scope` after `npm run checks`. Triggers and job conditions unchanged |
| `.github/workflows/producer.yml` | Inputs `task`, `subject` and `egress_probe` only. The install job checks the task file at `github.sha` before `npm ci`, except for a probe. The prompt step reads the task; the publish step no longer passes `SPEC` |
| `scripts/ci/producer.ts` | New `task` command. `prompt`, `scope` and `message` read the task file at HEAD with `readTask`: the body is the prompt, `produces` bounds the patch (`outside task <path>`), and each requirement becomes a `Spec:` trailer |
| `scenarios/run.ts` | A `task:` fixture is committed as `tasks/<ID>.task.md` before the patch and is the base; `run: task-verify` and `run: scope-verify` run only the task check, or the task and scope checks. The per-scenario steps move into an exported `runIn` so tests can drive them |
| `scenarios/scenarios.yaml`, `scenarios/B23-change-outside-task-scope.patch`, `scenarios/fixtures/tasks/TASK-B23.task.md`, `TASK-B24.task.md` | B23 (scope) and B24 (task) |
| `practices.yaml`, `docs/practices.md` | B24 and `check:task` under P02, B23 and `check:scope` under P24, as decision 0004 maps them. `docs/practices.md` regenerated with the same output as `npm run practices` |
| `video/kit.ts`, `video/build.ts`, `video/explanations.yaml` | A task-mode scenario's step shows its task file, the command the checks job runs and "Stopped before the change can reach main", not the deploy-job wording. Plain words for `task`, `scope`, B23 and B24, which the video tests require for every scenario |
| `test/task-scope.test.ts` | New: R64 to R68 on parsed text and on a temporary repository with real commits |
| `test/producer.test.ts` | R83, R87 and R208 tests follow the amendments, including the install step, the prompt and the message read from a task file at HEAD, not the working tree |
| `test/scenarios.test.ts` | Rows R72 and R73, R107, and B23 and B24 run through `runIn` on a copy of `main` |
| `test/video.test.ts` | One more SPEC-002-R5 test, for task-mode steps |
| `traceability.md` | Rows R64 to R68, R72, R73 and R107 |
| `CLAUDE.md`, `README.md` | 21 bad changes, not 19; 18 patches; the `tasks/` path; the task and scope checks after the fifteen |

Requirement IDs: only decision 0004's draft IDs are used, R64 to R68, R72, R73 and R107, so no new ID is allocated. The highest ID on every remote branch on 2026-11-08 was R210.

### Failure lines

| ID | Lines |
|---|---|
| R64 | `CHECK task FAILED: invalid task id`, `<ID> not found`, `<ID> unknown key`, `<ID> invalid requirements`, `<ID> invalid produces`, `<ID> empty body` |
| R65 | `CHECK task FAILED: <ID> cites unapproved <requirement ID>` |
| R66 | `CHECK scope FAILED: mixed Task trailers`, `Spec <requirement ID> not in <task ID>`, or the task check's line |
| R67 | `CHECK scope FAILED: <path>`, `<path> mode 120000`, `<path> mode 160000` |
| R68 | `CHECK task FAILED: no merge base`, `CHECK scope FAILED: no merge base` |
| R72, R73 | `CHECK scope FAILED: src/handler.ts`; `CHECK task FAILED: TASK-B24 cites unapproved SPEC-014-R99` |
| R83 | `CHECK producer FAILED: input task`, `input subject`, then the task check's line |
| R208 | adds `CHECK producer FAILED: outside task <path>`; drops `missing spec` |

## Checked in this session

| Check | Result |
|---|---|
| The real scenario harness, `node scenarios/run.ts B23` and `B24`, in a scratch worktree with the moves applied and committed | `CHECK scope FAILED: src/handler.ts` and `CHECK task FAILED: TASK-B24 cites unapproved SPEC-014-R99`, both `pass`. These are the `expect` values in `scenarios.yaml` |
| `node scripts/checks.ts task` and `scope` on that scratch commit, whose range from `origin/main` carries no `Task:` trailer | Both pass, silently |
| `test/task-scope.test.ts`, `test/producer.test.ts`, `test/scenarios.test.ts`, `test/video.test.ts` under a stand-in for `vitest` and `yaml` written for this check, not the real ones | 13, 24, 26 and 23 passed. `checks.test.ts`, `checks-before-main.test.ts`, `receipt.test.ts`, `export.acceptance.test.ts` and `aws-setup.test.ts` give the same results as on `main` under the same stand-in |
| 17 deliberate defects, one at a time: sort order, duplicate entries, ref preference, mixed trailers, R65, reserved paths, link modes, stray Spec, reading the working tree, empty body, the tasked-commit filter, `outside task`, the producer's task source, one Spec trailer only, the harness's stop after a failing task check, the Task trailer, the video's task file | Each made at least one of those tests fail |
| `tsc --noEmit` with TypeScript 6.0.2 from `/opt/node-tools`, `@types/node` 26 and type stubs for `vitest`, `yaml` and the ESLint packages | No error in any changed file; the same stub-caused errors in seven unchanged test files as on `main`. `--noUnusedLocals` finds nothing new |
| A trace check simulation: (a) Spec trailers against the moved specs, (b) every requirement ID against every test name the stand-in lists, (c) `@requirement` tags | (b) all 87 IDs named. (a) flags only the shallow clone's boundary commit, as on `main`. (c) clean |
| A full tour built by `buildTour` from the moved `practices.yaml`, `scenarios.yaml` and `explanations.yaml` | 29 steps; B24 under P02, B23 under P24 |
| `secrets`, `allowlist`, `workflows`, `slides` and `ratchet` from the moved `scripts/checks.ts` | Pass |
| zizmor 1.31.1 offline over the moved workflows | No findings, the same 9 suppressed as on `main` |
| Semgrep `p/default` on the five changed source files | No findings |
| `bash -n` on every `run:` step of both staged workflows; no `mapfile`, `readarray`, `declare -A` or case-changing expansion | Passed |
| LAND.txt: plain ASCII, one move per staged file, each `requires` string present on `main` | Passed |

Not run: the real `vitest`, `tsc` with the lockfile's `@types/node` 24, and ESLint with the project's config, because this session may not run `npm ci`; nor under macOS's bash 3.2. The preflight below runs all of them. The PostToolUse ESLint hook reported a false failure on each staged test file: ESLint is not installed here (`ENOENT`).

## Decisions for the owner

| Decision | Options | Staged |
|---|---|---|
| Thin or full scope rule (0004's R66) | (a) Thin: the scope check judges only commits that carry a `Task:` trailer. (b) Full: every commit that is neither approver-signed nor touching only `docs/` and `proposals/` must carry exactly one `Task:` trailer, else `missing Task trailer` | (a). Under (a) a commit escapes scope by omitting the trailer; the producer always adds one, and the signatures check still guards protected paths. (b) also ends unsigned code commits from cloud sessions, 0004's "drafting only" recommendation, so it belongs with that decision. Revisit after T4 |
| Task file keys | (a) `requirements` and `produces` only. (b) Also 0004's `budget`, `verify` and `needs` | (a). `budget` and `verify` mean nothing until the driver loop (0004's R90) runs checks between attempts. Adding a key later is a signed amendment to R64 |
| The range's base | (a) Merge base with `main` as the checkout fetched it. (b) A commit named in a signed policy | (a), with `no merge base` failing closed. On a push to `main` the range is empty, so both checks pass there |
| Task trailers that differ | The task check checks each task named; the scope check fails `mixed Task trailers` | As staged. A candidate carries one task |
| `scripts/receipt.ts` protected | Protect it now, or with the receipt slice | Now: it writes the predicate the attest job signs. Any later receipt slice is staged, as `scripts/checks.ts` changes are |

## Also

- `proposals/video-alignment/` stages its own copies of `specs/SPEC-001-delivery-pipeline.md` and `traceability.md`, and requires R64, R68 and R107 to be signed. Once this batch lands, those copies are older than their destinations; its LAND.txt already says to rebuild them on `main` first.
- The scenarios workflow runs B23 and B24 on `main` after landing, and the video workflow rebuilds the walkthrough, because `scenarios/**` changes.
- Landing changes no AWS resource. `main`'s deploy plans no Lambda change.

## Owner steps

Run these in a terminal on your Mac, in your clone of the repository, one at a time.

1. Once the staging commit is on `main`, run the preflight. If `node --version` prints a version below v24.11, run `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` first. Success is the last line `preflight exit 0`. On anything else, paste the output.

```bash
git fetch -q origin main && wt="$(mktemp -d)/t3a-preflight" && git worktree add -q --detach "$wt" origin/main && (cd "$wt" && grep '^move: ' proposals/t3-task-file/LAND.txt | while read -r _ src dest; do mkdir -p "$(dirname "$dest")" && git mv -f "proposals/t3-task-file/$src" "$dest" || exit 1; done && npm ci --ignore-scripts --no-audit --no-fund && npx tsc --noEmit -p . && npx eslint scripts/checks.ts scripts/ci/producer.ts scenarios/run.ts video/kit.ts video/build.ts test/task-scope.test.ts test/producer.test.ts test/scenarios.test.ts test/video.test.ts && npx vitest run test/task-scope.test.ts test/producer.test.ts test/scenarios.test.ts test/video.test.ts test/checks.test.ts test/checks-before-main.test.ts && node scripts/checks.ts slides && node scripts/checks.ts trace); rc=$?; git worktree remove --force "$wt"; echo "preflight exit ${rc}"
```

2. Land the batch. It should print no "Changed since by" warning; if it does, answer no and paste the output. Answer yes to "Sign and land?" and tap your security key. When `main`'s deploy waits, approve it: it plans no Lambda change. Success is `Landed <sha> on main.`

```bash
scripts/bootstrap/land.sh proposals/t3-task-file
```

3. After landing, the producer needs a signed task file for each run. For T4, sign SPEC-014-R7 and its task file together, as one batch the agent can stage on request, then dispatch with the task ID and a subject only:

```bash
gh workflow run producer.yml --repo PaulDuvall/who-gets-the-keys --ref main -f task=TASK-T4-DUP-COLUMNS -f subject="Reject duplicate column names (SPEC-014-R7)"
```
