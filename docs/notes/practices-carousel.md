# Batch notes: practices-carousel (decision 0009)

The kit, `practices-carousel/`, is unprotected and lands by `land.sh --to-main`. The batch `proposals/practices-carousel/` moves the workflow and the protected-paths copy, and needs an approver's signature. Decision 0009 holds the why; these notes hold the evidence.

## Preflight, 2026-11-14

A scratch worktree outside the checkout at `71d354e`, with the batch's two moves applied and committed as `land.sh` would, `node_modules` linked from the checkout. The owner's Mac was simulated as CLAUDE.md asks: a Homebrew-style `node@24` under `/opt/homebrew/opt/`, and a `seq` first on `PATH` that prints `1` and `0` for `seq 0`.

| Step | Result |
|---|---|
| `tsc --noEmit` | Passed |
| ESLint on `practices-carousel/` | Passed. The workflow and `protected-paths.txt` are not linted files |
| Vitest, every test | 313 passed, 28 skipped, 10 failed. The same 10 fail on unchanged `main` at `0e2acac` in the same container: `test/checks.test.ts` R12's signing test (`spawnSync ssh-keygen ENOENT`, as the container has no OpenSSH) and 9 tests in `test/land-presign.test.ts`, which stop at the doctor's signer check for the same reason. The batch changes neither file nor anything they read. The candidate run's test check covers them on a runner that has OpenSSH |
| `node scripts/checks.ts trace`, `slides`, `secrets`, `workflows` | Passed |
| zizmor 1.31.1 offline over `.github/workflows/` with the new file | No findings (11 suppressed, as on `main`) |
| `git apply --check` on scenario patches that touch a changed file | None touches one. All 19 apply |
| `npm run progress` | No change: neither the decision nor the batch changes an input it counts |
| Semgrep `p/default` on `practices-carousel/` | No findings |

The kit's own checks, `practices-carousel/build.sh` from an empty font cache: 10 of 10 passed. Each check was then made to fail once on purpose; decision 0009, "The checks", lists how.

## Independent review

Pending.

## Not fixed

Pending the review.
