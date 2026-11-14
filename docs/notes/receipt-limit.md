# The receipt check fails once a zip has more than 100 attestations (backlog r1k)

Status: staged in `proposals/receipt-limit/`, not landed. Until it lands, every pipeline run fails its receipt job, so `land.sh` can land nothing and the deploy job cannot run.

## What happened

From run 218 on 2026-11-14, every receipt job failed with `Error: verifying with issuer "sigstore.dev"` and `CHECK receipt FAILED: missing https://slsa.dev/provenance/v1`, for unrelated commits on two branches. Sigstore's status page said all services were online, and re-running the job failed the same way.

The Lambda zip is reproducible: `src/` has not changed since 2026-11-08 (`9f959a3`), so every run builds the same bytes, `sha256:722ac671…`, and attests that one digest. `gh attestation verify` asks GitHub for that digest's attestations of one type.

| Run | Time (UTC) | SLSA attestations for the digest when it verified | Receipt |
|---|---|---|---|
| 217, `main` at `fc97f75` | 15:21 | 100 | passed |
| 218, `candidate/practices-carousel` | 15:33 | 101 | failed |
| 219, `candidate/progress-badge-2026-11-14`, twice | 15:34, 15:35 | 102 | failed |
| 220 and 221 | 15:52 onwards | 103, 104 | failed |

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

The window is the newest 100 attestations of one type, as the store lists them; GitHub's documentation states no order. A receipt job verifies seconds after its run attests, so its own attestation is among them. The deploy job verifies only after the `sandbox` approval: if more than 99 newer runs build the same zip before then, about five days at today's rate, its SPEC-001-R17 check fails closed as `CHECK attestation FAILED: dist/function.zip`. A change to `src/` changes the digest and starts a new pile.

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

## Independent review, 2026-11-14

A subagent got the batch, the backlog item and the failing runs, not this note. It checked the root cause from primary sources: `gh`'s source at v2.103.3 and trunk, the zip rebuilt with the build job's steps, both predicate types' listings with their cursors, run 218's own attestations against every pin, and `gh`'s loop replayed on Go 1.24.7 and go1.27.3. It ruled out a Sigstore trust-root change: the passing and failing bundles share one Rekor log ID, one Fulcio intermediate, bundle v0.3 and dsse 0.0.1. It also ruled out rate limits, which fail at fetch rather than verification, and the branch name. It found nothing blocking; one medium finding and six low. All are fixed in the next commit except where the table says otherwise.

| Severity | Finding | Done |
|---|---|---|
| Medium | "Always among the newest 100" overclaimed: the deploy job verifies only after the `sandbox` approval, and a re-run verifies late, so more than 99 newer runs building the same zip in between would fail it closed | R50, the backlog item and this note now state the condition and what fails |
| Low | `RECEIPT_LIMIT` sat between `pinArgs` and its doc comment, which still said "1000 is gh's largest window" | Moved above it; the comment now says gh reads one page |
| Low | R50 stated "newest first" as fact; GitHub's documentation states no order | R50 says "as observed" and quotes the documentation in `docs/verification.md` |
| Low | Conditions under which `gh` would still read a second page were unrecorded: a first page short after the `initiator` filter, a different page size, and the runner's unpinned `gh` | Recorded in `docs/verification.md` |
| Low | SPEC-001-R17 names no limit; decision 0002 still said `--limit 1000` | R17 left as is: it uses R50's `pinArgs`. Decision 0002's row 9 and draft R50 carry dated amendments |
| Low | This note and the backlog item said `src/` last changed on 2026-11-12; it was 2026-11-08 (`9f959a3`) | Corrected, saying so |
| Low | The owner steps here lacked the CLAUDE.md format | The steps given in the session carry it; this note lists them only |

A later batch could remove the dependence on listing, paging and order by verifying the run's own bundle with `gh attestation verify --bundle`, from the attest step's `bundle-path`. That changes `pipeline.yml`, so it is protected; not filed yet.
