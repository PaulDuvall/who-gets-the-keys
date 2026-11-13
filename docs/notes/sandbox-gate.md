# Sandbox-gate batch (backlog who-gets-the-keys-g4e): held

Staged in `proposals/sandbox-gate/` on 2026-11-13, on the branch `candidate/sandbox-gate` at `644bdd1`, on top of `main` at `0587958`. Not landed. It adds SPEC-001-R231, `github.sh` removing the `sandbox` environment's required reviewer, and amends R213, R221 and the "gate" term.

## Why it is held

The independent review found that removing the reviewer now would leave one unsigned commit a path to AWS with no human in it:

| Fact | Where |
|---|---|
| On a push, GitHub runs the workflow file from the pushed commit | `pipeline.yml` is the commit's own file |
| Every deploy-time check runs `node scripts/checks.ts` from the commit being deployed: deploy-tip, attestation, receipt, irreversible | `.github/workflows/pipeline.yml`, deploy job |
| `main`'s ruleset requires only a passing `checks` status from the GitHub Actions app, which any workflow in the commit can report | SPEC-001, "Checks before main" |
| SPEC-001 accepts that gap until the checks of record run from code the commit cannot change | SPEC-001-R109 and decision 0002 Phase 3, both drafts |

So one unsigned commit could rewrite `scripts/checks.ts` so that the signatures and irreversible checks pass, change `infra/sandbox`, and be applied by the deploy role. The `sandbox` reviewer is the one human step in that path. Slide 10 of the source of record says "The pipeline earns the keys only if it is the most protected thing in the system", and `docs/slide-reconciliation.md` row R28 counts the reviewer in practice P26's coverage.

Running R109 inside this repository would not close the gap either: the candidate commit defines the workflow that would run it. Decision 0004 runs R109 in a separate signer repository and lets only a promote GitHub App move `main`. The owner chose on 2026-11-13 to build that first (`who-gets-the-keys-s3p`), and meanwhile to skip the deploy when nothing deployable changed (`who-gets-the-keys-nh9`), so the reviewer is asked only when it guards something.

## Review findings

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Amended R221 had the owner run an owner-apply script before `main` moves, but `aws-setup.sh` refuses unless the checkout is at `origin/main` | high | Drop the change when the batch is rebuilt: the deploy fails, the owner runs the script, then reruns the failed job, as `aws-setup.sh` already says |
| 2 | With no reviewer, the gap above reaches AWS with no human | high | Held behind `who-gets-the-keys-s3p` |
| 3 | `github.sh` exits inside the environment loop when the read-back still shows a reviewer, skipping the later settings | medium | Fix when rebuilt: record the failure and exit 1 at the end |
| 4 | The README's Status row still says each deploy waits for the reviewer | medium | Fix when rebuilt |
| 5 | With no reviewer, `land.sh` polls silently for up to 10 minutes | low | Fix when rebuilt: stop waiting once the deploy job is in progress |
| 6 | A "no" to the owner-apply prompt in `--delivery` mode names a resume command that never deletes `candidate/<task>` | low | Goes away with finding 1 |
| 7 | An unsigned commit's `Owner-Apply` trailer now blocks the owner on a prompt | low | Goes away with finding 1 |
| 8 | A stale comment in `owner_apply_path` | trivial | Fix when rebuilt |
| 9 | Sending `"reviewers": null` on a private repository is untested | low | Note when rebuilt; the repository is public |

The batch also changes `scripts/bootstrap/land.sh`, as `who-gets-the-keys-nh9` does, so it must be rebuilt on top of whatever lands first.

## Preflight before the review

In a scratch worktree on `0587958` with the moves applied, with a BSD-like `seq` and a Homebrew-style `node@24`: 22 test files and 343 tests passed, and `tsc`, ESLint and the trace, slides and secrets checks passed. The first run failed in `test/aws-setup.test.ts`, whose `gh` stand-in reported a `sandbox` reviewer to the new read-back; the stand-in was fixed.
