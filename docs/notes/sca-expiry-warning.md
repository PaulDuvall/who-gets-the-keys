# sca exceptions: a warning before each expires, and a check that each keeps its evidence (backlog w8x)

Status: staged in `proposals/sca-expiry-warning/`, not landed. Nothing is urgent: the 8 exceptions expire on 2027-01-13. Land it well before 2026-12-30, when the warning would start.

## Why

On 2026-11-13 a newly published advisory made the sca check (SPEC-001-R10) fail on `main`. While every run failed it, no staged batch could reach `main`, and only a commit the owner signed by hand cleared it (`docs/notes/sca-mf5v.md`). An exception that expires does the same. On 2026-11-14 the owner renewed all 8 exceptions to 2027-01-13, each with a labelled reason and an evidence section in `specs/sca-exceptions.md` (`4e7c522`). The owner then chose a warning before an expiry, as this separate batch.

## What the batch changes

| File | Change |
|---|---|
| `specs/SPEC-001-delivery-pipeline.md` | Two rows after SPEC-001-R10: R233, the warning, and R234, the shape check |
| `scripts/checks.ts` | `scaExceptions` reads and checks the exceptions file and the evidence log. `expiryWarnings` lists entries that expire within 14 days or have expired. The sca check runs both before OSV-Scanner |
| `test/sca-exceptions.test.ts` | New: 9 tests, 7 of the two functions and 2 that run `node scripts/checks.ts sca` with an `osv-scanner` stand-in that leaves a marker, so a test can tell whether the check reached it |
| `traceability.md` | Rows for R233 and R234 |
| `specs/sca-exceptions.md` | Two sentences: what the check enforces, that it does not read the sections' content, and the 14-day warning |
| `.tasks/backlog.jsonl` | w8x closed, with what landed and which open questions stay open |
| `docs/progress.json`, `docs/progress.svg` | The record for the landed tree: 111 approved, 164 drafted, 9 backlog items closed |

No workflow, lockfile or deployable path changes, so main's deploy is skipped (SPEC-001-R232).

## Choices, and why

| Choice | Why |
|---|---|
| Warnings go to standard error, not standard output | SPEC-001-R1's failure line is "exactly one line on standard output". A warning on standard output would sit next to a later check's failure line |
| The run summary gets the warnings through `GITHUB_STEP_SUMMARY` from `scripts/checks.ts` | The checks job's step already has the variable, so `pipeline.yml` needs no change, as the receipt check does today |
| An expired entry warns too, as `expired <date>` | An expired entry whose advisory OSV no longer reports passes silently, and is dead weight |
| The shape check runs before OSV-Scanner | It is deterministic and needs no network, so a malformed file fails the same way on every run |
| The file is read as a strict subset of TOML, not with a TOML package | The agent may not add a dependency. Every form the subset allows means the same to OSV-Scanner; anything else fails as `exceptions file line <n>`. CRLF line ends are accepted, as OSV-Scanner accepts them; control characters other than tab, and a one-line `reason`, which could never hold five labelled lines, are not |
| An unreadable file is a failure line, `<path> unreadable`; a run summary that cannot be written is a note on standard error | SPEC-001-R1: a check that fails prints one failure line, and a summary is not worth failing the checks for |
| No upper limit on how far ahead `ignoreUntil` may be | A limit measured from the run's date would fail the same tree on one day and pass it on another, against SPEC-001-R1's stable identifier. Open question below |
| 14 days | The backlog item asked for it. Two weeks covers a renewal's two owner steps with time to spare |

## Preflight, 2026-11-14

First at `f68f52d`, then again at `70348a4` after the review's fixes; the results are the second run's. In a scratch worktree, with every move and the `LAND.txt` removal applied as `land.sh` does them, a hard-linked `node_modules`, and `GIT_LITERAL_PATHSPECS` unset:

| Step | Result |
|---|---|
| `tsc --noEmit` | pass |
| ESLint on the staged `scripts/checks.ts` and test, read as their landed paths | pass |
| `node scripts/checks.ts`, the ordered fifteen | all pass, in 86 s. No warning today: the nearest expiry is 60 days away |
| `node scripts/checks.ts task`, then `scope` | pass |
| Vitest, every test | 23 files, 360 tests, pass. 9 are new |
| `npm run progress` on the landed tree | equals the staged copies |
| `git apply --check` on all 19 scenario patches | all apply |
| B13's patch on the landed tree, then the sca check | `CHECK sca FAILED: GHSA-r5fr-rjxr-66jc`, as `scenarios/scenarios.yaml` records |
| 19 hand mutations of the new code, each run against the new tests | all 19 caught, among them the 14-day boundary, `expired` at the instant, warnings on standard output, no run summary, OSV-Scanner run before the shape check, a label dropped from the code, no CRLF handling, control characters, an unreadable file and a summary write that throws. Four of them survived the first version of the tests (see the review). Stryker mutates only `src/`, so it does not cover `scripts/` |
| land.sh simulation | all three `requires:` met, no unlisted file, no "Changed since by" warning, `candidate/land-sca-expiry-warning` absent |
| The owner's Mac, simulated | BSD-style `seq` first on PATH, Homebrew's keg-only `node@24` found by `doctor.sh` with no Node.js on PATH, every Vitest test passing |

One more result: every sca run's log now carries each exception's full labelled reason, because OSV-Scanner prints the reason of each advisory it filters out.

## Independent review, 2026-11-14

A subagent got the batch, the spec rows, SPEC-001-R1, R10, R11, R15 and R227, the backlog item and the conventions, not this note. It built the landed tree, ran all fifteen checks with the real OSV-Scanner, tried inputs on both the check and OSV-Scanner, and mutated the code by hand. It found nothing critical or high, three medium findings and nine low. All are fixed in `70348a4` except where the table says otherwise.

| Severity | Finding | Done |
|---|---|---|
| Medium | R234 said a section "starts `## <advisory ID>`", so `## GHSA-ab` counted for `GHSA-a`; the code and test said the opposite | R234 now requires the ID to end the line or be followed by a space, a tab or a colon |
| Medium | R234 did not state the exact line form the code enforces: one space each side of `=`, no indentation, nothing after the value, the ID's characters | R234 now states each line form exactly |
| Medium | The test titled "before OSV-Scanner runs" passed with OSV-Scanner run first | The stand-in leaves a marker; the test asserts it is absent after a shape failure and present after a pass |
| Low | Lines of non-ASCII white space and control characters passed the check, then failed as `osv-scanner error` | Blank and comment lines are spaces and tabs only, and a control character other than tab fails as `exceptions file line <n>` |
| Low | A CRLF file failed at line 1, though OSV-Scanner reads it | One carriage return at the end of each line is ignored |
| Low | A one-line `reason` could never pass | Dropped from R234; the code refuses it as a line error |
| Low | Several identifiers' order and prefixes were unspecified | R234 now names the order: lines first, then entries in file order, each judged lacks, sets twice, listed twice, reason, sections |
| Low | R233 was unconditional, though the warnings follow R234's pass; "once the time has passed" was unclear at the instant | R233 applies once R234 passes, and says `expired` at or before the moment |
| Low | Test gaps: no test for a missing `Evidence:`, labels imported from the code, no test of a triple quote inside a reason, the check itself tested only at 3 and 30 days | Labels written out; each missing label tested; a triple quote, and 13, 15 and -1 days through the check itself |
| Low | Each scenario that reaches sca appends the same warning block to the `scenarios.yml` and `video.yml` run summaries, about 10 copies, during the 14 days | Not changed: the copies are harmless and `scenarios/run.ts` is protected. The heading now says "or have expired" |
| Low | An unreadable file or summary path crashed with no failure line | `<path> unreadable` is a failure line; a failed summary write is a note on standard error |
| Low | `LAND.txt` said `892c366` is on `main`; the evidence log's sentence overstated what the check reads | Both corrected |
| Info | Nothing checks that an entry's `Expires:` date equals its `ignoreUntil` | Not added: the spec does not ask for it. Worth a row in a later amendment |

## Owner steps, in order

1. `land.sh --to-main` for the candidate branch that holds this batch. Docs and proposals only, so main's deploy is skipped.
2. `land.sh proposals/sca-expiry-warning`, which signs one commit. `specs/`, `scripts/checks.ts` and `test/` are not deployable paths, so main's deploy is skipped again.

## Open, for the owner

| Question | Recommendation |
|---|---|
| Should the reach probes in `specs/sca-exceptions.md` become a committed script? A renewal re-runs them every 60 days | Yes, before the next renewal. They change `scripts/`, so a signed batch |
| Should the sca check refuse an OSV-Scanner upgrade until the expiry test passes again? The configuration page names the key `effectiveUntil`; 2.7.0 refuses that key | No new check: an upgrade that drops `ignoreUntil` makes OSV-Scanner refuse the file (exit 127), so the sca check fails closed. Re-run the evidence log's expiry row in the upgrade's batch |
| Should `land.sh` print the warning in its summary block? | Later, with `who-gets-the-keys-o1p`, which changes `land.sh` anyway |
| An upper limit on `ignoreUntil` | Not as a check, for the R1 reason above. The evidence log records each renewal's length and who chose it |

## Found on the way

The `expect-expect` PostToolUse hook (`.claude/hooks/hook.mjs`) reports every write to a test file under `proposals/` as "a test with no assertion". It runs ESLint with `--rule '{"vitest/expect-expect":"error"}'`, but `eslint.config.js` loads the vitest plugin only for `test/**`, so ESLint stops with "could not find plugin vitest". The staged test was linted instead as `test/sca-exceptions.test.ts` through `--stdin-filename`, and passed. A fix maps `proposals/<batch>/test/` to `test/` the same way; `.claude/` is protected, so it is a signed batch.
