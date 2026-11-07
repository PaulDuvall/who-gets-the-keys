# Tracer 2: landing producer deliveries by the owner's push

Status: staged in `proposals/t3-delivery-landing/`, 2026-11-07. Not landed.

## Decision

The owner chose option (a) of backlog item `who-gets-the-keys-nlq` on 2026-11-07, with SPEC-001-R209 withdrawn. A runner producer delivery lands like any other commit: the owner pushes it to a candidate branch, whose `push` run reports the checks `main` counts, then pushes it to `main`.

Why R209 could not work: GitHub counts checks from a workflow job only when its run was started by `push`, `pull_request`, `pull_request_review`, `pull_request_target`, `deployment` or `deployment_status`. Checks from a `workflow_dispatch` run "do not satisfy a required status check in a branch ruleset", whoever starts the run. The quote and the observed refusal of `8147bc5` are in `docs/verification.md`, "Tracer 2: checks from a dispatched run".

| Option | Why not chosen |
|---|---|
| (b) The owner dispatches `pipeline.yml` | Still a `workflow_dispatch` run, so its checks do not count |
| (c) A GitHub App token for the publish job | Adds a key holder and a stored secret, against SPEC-001-R85's "no secret" |
| (d) The promote App, decision 0004 Phase B | Not built |
| (e) A pull request, with the owner's "Approve workflows to run" click | No new key holder, but `pipeline.yml` would need a `pull_request` trigger that checks out the head commit, and it is untested. Kept in `nlq` as a later experiment |

Tradeoff accepted: without the dispatch job there is no early run on the producer's branch. The agent job has already run lint, typecheck, trace and test inside the runner.

## What the batch changes

| File | Change |
|---|---|
| `specs/SPEC-001-delivery-pipeline.md` | R209 removed, its ID reserved. R40 also requires push-only triggers and no condition that can skip `checks`, which R209 used to hold. R208's publish job prints the landing command. New R210 for `land.sh --delivery`. The Runner producer intro says how a delivery lands |
| `.github/workflows/pipeline.yml` | No `workflow_dispatch` trigger and no dispatch guard step |
| `.github/workflows/producer.yml` | No dispatch job, so no job holds `actions: write`. The publish job prints `scripts/bootstrap/land.sh --delivery candidate/<task>` |
| `scripts/bootstrap/land.sh` | New `--delivery candidate/<task>` mode. Branch deletion moves into `delete_if_at`, unchanged in behaviour |
| `test/land-delivery.test.ts` | New: R210, against a local bare origin and a stub `gh`; no key is made |
| `test/checks-before-main.test.ts` | The R209 test becomes an R40 test of the triggers and of what a condition can skip |
| `test/producer.test.ts` | No dispatch job in R83 and R41; R208 checks the printed landing command; the R209 test is removed |
| `traceability.md` | R209 out, R210 in |

## What `land.sh --delivery` does

1. Refuses, before any push: a branch that is not `candidate/TASK-<ID>` with the producer's task pattern, a branch not on origin, a tip that `main` already holds or that does not descend from `main`, a tip whose `Task` trailer is not the task, and a `candidate/<task>-owner` branch that holds another commit.
2. Shows the commit message and the changed files, and offers the full diff in a pager.
3. Asks "Push <sha> to candidate/<task>-owner, so its checks count for main, and then move main to it?" Anything but yes pushes nothing.
4. Pushes the same commit to `candidate/<task>-owner`, waits for that run, and pushes the commit to `main`, as `--to-main` does.
5. Deletes `candidate/<task>` as soon as `main` holds the commit, then `candidate/<task>-owner` after `main`'s run. Each is deleted only while it still holds the commit.

## Checked in this session

| Check | Result |
|---|---|
| `bash -n` on the staged `land.sh`; no `mapfile`, `readarray`, `declare -A` or case-changing expansion | Passed |
| zizmor offline on the staged workflows with the other three | No findings, the same 9 suppressed as on `main` |
| An ad hoc bash harness, not committed, covering the same cases as `test/land-delivery.test.ts`: 28 checks of `--delivery` against a local bare origin and a stub `gh`, under bash 5 on Linux. Happy path, answer no, 11 refusals, a rerun with the owner branch already in place, a failed owner-branch run, and a failed `main` run | All passed, 2.4 s |
| LAND.txt: plain ASCII, each `requires` string present on `main`, each `move` source present | Passed |

Not run: `tsc`, ESLint and vitest, because this session may not install dependencies, and `test/land.test.ts` needs `ssh-keygen`, which this container lacks. Nor under macOS's bash 3.2. The preflight below runs all of them. The PostToolUse ESLint hook reported a false failure on the staged test: ESLint is not installed (`ENOENT`).

## Owner steps

Run these in a terminal on your Mac, in your clone of the repository, one at a time.

1. Once the staging commit is on `main`, run the preflight. If `node --version` prints a version below v24.11, run `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` first. Success is the last line `preflight exit 0`. On anything else, paste the output.

```bash
git fetch -q origin main && wt="$(mktemp -d)/t3-landing-preflight" && git worktree add -q --detach "$wt" origin/main && (cd "$wt" && grep '^move: ' proposals/t3-delivery-landing/LAND.txt | while read -r _ src dest; do mkdir -p "$(dirname "$dest")" && git mv -f "proposals/t3-delivery-landing/$src" "$dest" || exit 1; done && npm ci --ignore-scripts --no-audit --no-fund && npx tsc --noEmit -p . && npx eslint test/land-delivery.test.ts test/land.test.ts test/producer.test.ts test/checks-before-main.test.ts && npx vitest run test/land-delivery.test.ts test/land.test.ts test/producer.test.ts test/checks-before-main.test.ts); rc=$?; git worktree remove --force "$wt"; echo "preflight exit ${rc}"
```

2. Land the batch. It should print no "Changed since by" warning; if it does, answer no and paste the output. Answer the pager question as you like, answer yes to "Sign and land?", and tap your security key. When `main`'s deploy waits, approve it: it plans no Lambda change. Success is `Landed <sha> on main.`

```bash
scripts/bootstrap/land.sh proposals/t3-delivery-landing
```

3. The next producer delivery lands with the command its publish job prints. Success is `Landed <sha> on main.`

```bash
scripts/bootstrap/land.sh --delivery candidate/<task>
```
