# sca exception for GHSA-mf5v-w3w3-f6cg, 2026-11-13

## What happened

The owner moved `main` to `79f0f06` (step H-1 of `docs/notes/owner-queue-handoff-2026-11-13.md`). The candidate run 43467083032 had passed sca at about 16:53 UTC. `main`'s run 43489523864, at 19:10 UTC, failed with `CHECK sca FAILED: GHSA-mf5v-w3w3-f6cg`. Nothing deployed and nothing waited for approval.

| Fact | Source |
|---|---|
| Package: `opentelemetry-api` 1.37.0, in `scripts/ci/requirements.txt`. Fixed in 1.45.2 | OSV record `https://api.osv.dev/v1/vulns/GHSA-mf5v-w3w3-f6cg`, read 2026-11-13 |
| GitHub published and reviewed it at 2026-11-13T16:43:18Z; OSV modified it at 17:00:03Z | Same record |
| semgrep 1.185.0, the latest on PyPI (2026-11-10), still requires `opentelemetry-api~=1.37.0` | `https://pypi.org/pypi/semgrep/json`, read 2026-11-13 |
| An OSV-Scanner run over `main` at `79f0f06` without the exceptions file reported 8 advisory groups. Seven have exceptions; this is the only new one | Run in this session |

This is lesson L32 again, with a Python package. `land.sh --lockfile` updates npm packages only, and no semgrep release admits the fix.

## Why semgrep's use is not exposed

semgrep 1.181.0 calls `propagate.extract` only in `Telemetry.extract()` (`semgrep/telemetry.py`). That runs only from `Telemetry.configure()` when tracing is enabled. It builds the `traceparent` from the environment variables `SEMGREP_TRACE_PARENT_TRACE_ID` and `SEMGREP_TRACE_PARENT_SPAN_ID`. `semgrep scan` defaults to `--no-trace`, and the sast check (`scripts/checks.ts`) runs `semgrep scan --config p/default --error --metrics=off --json --quiet`. So no scanned file reaches the vulnerable regex. The impact would be CPU only, on a CI runner, where a slow check fails closed.

## Why the owner signs it by hand

`land.sh` starts only from `HEAD` equal to `origin/main` and reads the batch from there. A staging commit reaches `main` only through a candidate run, and every run fails sca until the exception lands. The owner therefore made one signed commit on top of `main` that changes only `specs/sca-exceptions.toml`, as for `d750b3e` on 2026-11-11, and finished with `land.sh --to-main`. The agent staged the copy as `proposals/sca-mf5v/sca-exceptions.toml` on its session branch only, never on `main`, and the owner copied it with `git show`. It is `main`'s file with one entry added, expiring with the others on 2026-12-08 so that backlog item s7e renews all of them together.

## Outcome

`a6de08a` landed on `main`. The candidate run 43491797109 and `main`'s run 43492225174 passed, the sca check included, and the deploy reported `No changes.` The `scenarios` run 90 on `main` passed.

## Verification, on `79f0f06` with the staged copy in place

| Step | Result |
|---|---|
| `node scripts/checks.ts sca`, OSV-Scanner 2.7.0 | pass |
| `node scripts/checks.ts secrets` | pass |
| `node scripts/progress.ts` | no change to `docs/progress.json` or `docs/progress.svg` |
| `vitest run test/progress.test.ts` | 9 passed |
| TOML parse | 8 entries, IDs unique |

## For the backlog

| Gap | Suggested fix |
|---|---|
| A run-time advisory in a package no lockfile update can fix deadlocks the batch route; only a hand-signed commit gets out | A `land.sh --sca-exception <advisory>` mode beside `--lockfile`: fetch the OSV record, show it, append a drafted entry for the owner to edit, sign and land |
| The owner's hand-signed commit `a6de08a` gave no cue to touch the key. The agent's step said OpenSSH would print `Confirm user presence for key`; nothing appeared, and the owner touched only because the key blinked. Inference: git runs `ssh-keygen -Y sign` with its standard error captured, so the prompt never reaches the terminal. That is why SPEC-001-R223 puts the cue in `land.sh` | Never give the owner a bare `git commit -S`. The `--sca-exception` mode above carries R223's cue; until it exists, a step that signs by hand says to touch when the key blinks, not on a printed line |
| After main's run failed, `land.sh`'s summary still said `next: approve the sandbox deploy` | `finish_main` should clear `summary_next` when main's run did not pass (SPEC-001-R225) |
| This cloud session ran on the "Coding" environment, not the one made for this repository, so it had Node.js 22, no `node_modules` and no `ssh-keygen`; 10 land and signature tests failed until `openssh-client` was installed | Start sessions for this repository on its own environment, and add `openssh-client` to `scripts/bootstrap/cloud-session-setup.sh` (SPEC-001-R211) |
