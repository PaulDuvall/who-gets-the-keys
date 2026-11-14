# The receipt check fails once a zip has more than 100 attestations (backlog r1k)

Status: staged in `proposals/receipt-limit/`, not landed. Until it lands, every pipeline run fails its receipt job, so `land.sh` can land nothing and the deploy job cannot run.

## What happened

From run 218 on 2026-11-14, every receipt job failed with `Error: verifying with issuer "sigstore.dev"` and `CHECK receipt FAILED: missing https://slsa.dev/provenance/v1`, for unrelated commits on two branches. Sigstore's status page said all services were online, and re-running the job failed the same way.

The Lambda zip is reproducible: `src/` has not changed since 2026-11-12, so every run builds the same bytes, `sha256:722ac671…`, and attests that one digest. `gh attestation verify` asks GitHub for that digest's attestations of one type.

| Run | Time (UTC) | SLSA attestations for the digest when it verified | Receipt |
|---|---|---|---|
| 217, `main` at `fc97f75` | 15:21 | 100 | passed |
| 218, `candidate/practices-carousel` | 15:33 | 101 | failed |
| 219, `candidate/progress-badge-2026-11-14`, twice | 15:34, 15:35 | 102 | failed |

## Why

`gh` v2.103.3 fetches attestations 100 to a page and decodes every page into the same `AttestationsResponse` (`pkg/cmd/attestation/api/client.go`, line 146; `gh`'s trunk declares it in the same place). Go's `encoding/json` reuses a slice's existing elements when it decodes into it, so the second page overwrites the first page's newest entries with the oldest. The run's own attestation is the newest, so it is lost, and no remaining attestation matches the run's commit.

Evidence, 2026-11-14:

| Test | Result |
|---|---|
| A Go 1.24 program with `gh`'s loop and two pages, three entries then one | printed `oldest` in the newest entry's place |
| The same loop against this repository's real attestations, `--limit 1000` | 102 fetched; first four commits `9f959a3 9f959a3 fc97f75 fc97f75`; run 219's `2ee945e` absent |
| The same loop, `--limit 100` | 100 fetched; first four `2ee945e 71d354e fc97f75 fc97f75`; `2ee945e` present |
| The API's order, read without `gh` | newest first, as `docs/verification.md` recorded on 2026-11-05 |

## The fix

`scripts/checks.ts` passes `--limit 100`, through a new constant `RECEIPT_LIMIT`, so `gh` reads one page and never decodes a second. Both users of `pinArgs` get it: the receipt check (SPEC-001-R50) and the deploy job's attestation check (SPEC-001-R17), which had the same latent failure. SPEC-001-R50 now says `--limit 100` and why. `docs/verification.md` records the observation.

The window is the newest 100 attestations of one type. A run verifies seconds after it attests, so its own is among them unless more than 99 newer ones for the same zip appear in between.

## Preflight, 2026-11-14

In a scratch worktree at `b6594c1` with the moves applied, a hard-linked `node_modules`, `GIT_LITERAL_PATHSPECS` unset:

| Step | Result |
|---|---|
| `tsc --noEmit` | pass |
| ESLint on the staged `scripts/checks.ts` and `test/checks.test.ts`, read as their landed paths | pass |
| `node scripts/checks.ts`, the ordered fifteen, then task and scope | all pass |
| Vitest | 23 files, 361 tests, pass |
| `npm run progress` on the landed tree | the staged copies: 111 approved, 164 drafted, 10 backlog items closed |
| `git apply --check` on all 19 scenario patches | all apply |
| `RECEIPT_LIMIT` set back to 1000 | `test/checks.test.ts` fails |
| The owner's Mac, simulated | every Vitest test passes |

The receipt job itself cannot run outside a pipeline run: its proof is the signed commit's candidate run.

## Owner steps, in order

1. Push this chain's tip to `main` by hand. `land.sh --to-main` refuses, because the candidate run fails its receipt job like every run until the fix lands. The ruleset counts only the `checks` job, which passes, and CLAUDE.md's convention is to push the exact commit the checks passed on. main's run will fail its receipt job too; nothing deploys.
2. `land.sh proposals/receipt-limit`, which signs one commit. Its candidate run uses the fixed `scripts/checks.ts`, so its receipt job passes, and `land.sh` moves `main` to it.

## Independent review

Pending.
