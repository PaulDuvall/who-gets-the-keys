# Deploy-paths batch (backlog who-gets-the-keys-nh9)

Staged in `proposals/deploy-paths/` on 2026-11-13, on top of `main` at `0587958`. It adds SPEC-001-R232 and amends R40 and R213: on `main`, a `changes` job compares the push with the newest deployment to `sandbox`, and the deploy job runs only when that deployment succeeded and nothing deployable changed since it. `pipeline.yml`, `scripts/bootstrap/` and `specs/` are protected, so the owner lands it with `land.sh` and signs it.

## Why

From 2026-11-11 to 2026-11-13 the owner approved 11 `sandbox` deploys whose plans said `No changes.` The reviewer stays until `who-gets-the-keys-s3p` lets `who-gets-the-keys-g4e` remove it (`docs/notes/sandbox-gate.md`). Meanwhile the reviewer is asked only when the deploy can change something.

## What counts as deployable

| Path | Why |
|---|---|
| `src` | The build job packs `dist/src/*.js` |
| `tsconfig.json`, `package.json`, `package-lock.json` | The compiler settings, the Node.js version from `engines`, and the compiler itself |
| `infra/sandbox` | What the deploy job plans and applies, its `.terraform.lock.hcl` included |
| `.github/workflows/pipeline.yml` | Holds the build and deploy jobs, the Terraform version and the backend |

The review checked this list against what the jobs read: Terraform reads no file outside `infra/sandbox`, and `scripts/checks.ts` and `scripts/receipt.ts` do not change what gets applied.

## Decisions

| Decision | Why |
|---|---|
| Compare only with the newest deployment, and only when it succeeded | A newer deployment that waits, runs, fails partway or was rejected may have changed the sandbox. Comparing with an older success missed a revert of such a change (review finding 1) |
| Any doubt deploys | An API error, a commit not in the checkout, or one that is not an ancestor all set `deploy=true` (finding 2) |
| The path list lives in `pipeline.yml` and in R232's text | Both are protected, so changing it needs a signature. This answers nh9's open question |
| Checks, build, attest and receipt still run on every push | Every commit on `main` keeps its receipt. Skipping the deploy does not touch the receipt or the deploy-tip check (R190); a skipped deploy reads neither |

## Not done, and why

- A drift that does not come from git, a change made in the console or a data source that changes over time, is no longer corrected on every push. It is corrected on the next deployable push. Practice P31 is already `not-shown`; P34 is helped, since nothing redeploys over the sandbox.
- If the `changes` job itself fails, main's run fails and the deploy does not run (finding 5). Deploying anyway would need a status function in a job condition, which SPEC-001-R40's test forbids. The red run is the signal.
- The job trusts any deployment record in environment `sandbox` (finding 3). A token with `deployments: write` could post a `success` and withhold one deploy. No workflow grants that write, and the effect is a withheld deploy, not a path to AWS.
- `land.sh` still prints that it watches until the deploy finishes before it knows the deploy was skipped. The line it prints after the watch says so.

## Preflight

In a scratch worktree on `0587958` with the moves applied, Node.js 24.22.2, with a BSD-like `seq` and a Homebrew-style `node@24`: every test passed, and `tsc`, ESLint on the changed tests, and the trace, slides, secrets and workflows checks passed; zizmor reports no findings. The progress record was current. The first run found scenario B10's patch no longer applied to the staged `pipeline.yml`; it was rebuilt, and B10 passes with `CHECK attestation FAILED: dist/function.zip`. B8a and B8b pass. B18 fails in the simulation only because the simulation's stand-in for the signed commit is unsigned and touches `specs/`; on the branch it passes.

## Review

An independent subagent reviewed the staged files against R232, R40 and R213, ran the suite, read GitHub's deployments documentation and the live public API read-only, and reproduced two findings with a stub `gh`.

| # | Finding | Severity | Done |
|---|---|---|---|
| 1 | Compared with the newest deployment that ever succeeded, past newer ones that were running or failed, so a revert could skip a needed deploy | medium | Fixed: only the newest deployment, and only when it succeeded. Tested |
| 2 | A failed statuses call moved on to an older deployment instead of deploying | medium | Fixed: a failed call deploys. Tested, and a failed list call too |
| 3 | Any deployment record in `sandbox` is trusted | low | Not fixed; see above |
| 4 | No decision note, though the backlog item asked for one | low | This file |
| 5 | A failed `changes` job skips the deploy | low | Not fixed; see above |
| 6 | `land.sh` said "this push" where R232 compares with the last successful deploy | low | Fixed |
| 7 | No tests for API failures or the revert shape | low | Added |
| 8 | The `changes` job had no concurrency group | trivial | Added |

GitHub documents that a job referencing an environment creates a deployment and statuses that follow the job (https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment, read 2026-11-13 by the reviewer). The list's newest-first order and each deployment's `sha` being the run's commit are not documented; the reviewer saw both in the live API.
