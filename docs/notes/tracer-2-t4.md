# Tracer 2, slice T4: SPEC-014-R7 and its task file

Status: landed 2026-11-08. The signed batch is `c7c6b4d` (candidate run 111, `main` run 112, deploy with no Lambda change). Producer run [42499336951](https://github.com/PaulDuvall/who-gets-the-keys/actions/runs/42499336951) made delivery `9f959a3` in about 2 minutes, and the owner landed it with `land.sh --delivery`: `candidate/TASK-T4-DUP-COLUMNS-owner` run 113, then `main` run 114, whose deploy updated `aws_lambda_function.export` in place (0 added, 1 changed, 0 destroyed). It was the first `land.sh --delivery` landing, which closes backlog item `who-gets-the-keys-nlq`.

## The requirement

```markdown
| SPEC-014-R7 | IF an export request's `columns` array holds the same string more than once, THEN THE export service SHALL respond with status 400 and no CSV body, in place of SPEC-014-R4's 413 when the request also has more than 10,000 rows. Strings are compared exactly once JSON has decoded them, so `"a"` and `"a"` are the same column, and `id`, `ID` and `id ` are three different ones. |
```

Changes from the 2026-11-07 draft ("names the same column more than once"):

| Change | Why |
|---|---|
| "holds the same string more than once" | A column is a key into each row object (R1, R3). `row["id"]` and `row["ID"]` are different values, so only an exact repeat is ambiguous |
| "in place of SPEC-014-R4's 413" | Without it, a request with a repeat and 10,001 rows meets both R4 (413) and R7 (400), and both say SHALL. The handler already checks the body (R5) before the row count (R4), so 400 first matches it. R4 and R5 have the same overlap, unchanged here |
| "compared exactly once JSON has decoded them", with three examples | Makes the comparison testable: an escape is the same column; letter case, white space and Unicode form are not changed |

## The task file

`tasks/TASK-T4-DUP-COLUMNS.task.md`, 1,298 bytes:

```markdown
---
requirements: [SPEC-014-R7]
produces: [src/handler.ts, test/export.acceptance.test.ts]
---
Implement SPEC-014-R7 in src/handler.ts. ...
```

The body tells the agent to put the check in `parse`, next to the R5 checks on `columns`, so the body of `handler` does not change. It asks for one expression with no branch the tests cannot tell apart, because the agent cannot run the mutation check. It says to flip the signed tests and change nothing else in them, to add any test to the same file, and to tag `handler` with `@requirement SPEC-014-R7`. `produces` names `src/handler.ts`, not `src/export.ts` as the T3a note's example did: the request checks live in the handler's `parse`, and the serializer never sees a request.

## Why the batch carries tests

The trace check fails any requirement in `specs/` that no listed test names (SPEC-001-R11 (b)). A batch that signs R7 alone fails its own candidate run with `CHECK trace FAILED: SPEC-014-R7 has no test`, as scenario B15 shows. Checked in this session with vitest 4.1.12: `vitest list --json`, which the trace check reads, lists `it.fails` and `it.fails.each` tests but not `it.todo` or `it.skip`.

So the batch signs R7 with its acceptance tests:

| Tests | Cases | Today | After the delivery |
|---|---|---|---|
| `it.fails.each`: 400 and no body | a repeat; a repeat not next to its first use; a repeat written as `"a"`; a repeat with 10,001 rows | Expected failures, which the test check counts as passes | The delivery changes `it.fails.each` to `it.each`. Left unchanged, they fail the test check, because their assertions now pass |
| `it.each`: 200 with both columns | `id` and `ID`; `id` and `id `; `é` precomposed and decomposed | Pass | Must still pass |

## What the batch changes

| File | Change |
|---|---|
| `specs/SPEC-014-export-latency.md` | R7, after R6 |
| `tasks/TASK-T4-DUP-COLUMNS.task.md` | New: the signed task |
| `test/export.acceptance.test.ts` | The seven R7 cases above, after the R5 tests |
| `traceability.md` | Row SPEC-014-R7: `test/export.acceptance.test.ts`, test and mutation |
| `scenarios/B15-requirement-without-test.patch`, `scenarios/scenarios.yaml` | B15's untested requirement was SPEC-014-R7, a byte order mark. With a real R7 that a test names, B15 would pass trace. It now adds SPEC-014-R98, a reserved high ID, so the next real SPEC-014 requirement does not break it again. Its `expect` is `CHECK trace FAILED: SPEC-014-R98 has no test`. B24 keeps SPEC-014-R99 undefined, as SPEC-001-R73 needs |

Trailers: `Spec: SPEC-014-R7` and `Spec: SPEC-001-R34`, B15's scenario row, whose recorded line changes. `src/` is unchanged, so `main`'s deploy after landing plans no Lambda change.

Outside the batch, in agent commits: B23's patch is regenerated with one line of context, so an edit above `handler`'s return no longer stops it applying, and decision 0004's B24 row no longer names B15's ID.

## Review, 2026-11-08

An independent review found nothing critical, one high, one medium and eight low. Each is fixed or recorded here.

| Severity | Finding | Done |
|---|---|---|
| High | A delivery can skip, delete or weaken the signed tests and still pass every check: the 200 cases name R7, so the trace check does not need the 400 cases. Shown with `it.skip.each`: lint, trace, tests, mutation (97.44%) and scope all passed | Known limit, below. Step 4 checks the delivery's diff of the test file mechanically. LAND.txt's comment no longer implies a check protects the tests |
| Medium | A delivery that puts the check in `handler`, between the 400 and 413 lines, stops B23's patch applying, and `main`'s scenarios run turns red | The body puts the check in `parse`. B23 regenerated with one line of context; it now applies after that delivery too |
| Low | The agent cannot run mutation; extra branches can push the score below 95 | The body asks for one expression and says why |
| Low | "You may add tests" did not say where; a new test file is refused as `outside task` | The body names the file |
| Low | R4 and R7 both say SHALL for a repeat over 10,000 rows | R7 says "in place of SPEC-014-R4's 413" |
| Low | "Exactly" was pinned only for letter case; `.trim()` or `.normalize()` would pass | 200 cases for a trailing space and Unicode form; a 400 case for a JSON escape; the text says "once JSON has decoded them" |
| Low | B15 on R8 would break again at the next real requirement | R98 |
| Low | Decision 0004's B24 row said B15 uses R7 | Reworded without the ID |
| Low | LAND.txt's `tasks/` precondition matched a comment | `requires: specs/protected-paths.txt tasks/` |
| Low | The staging commits' `Agent:` line sat in its own paragraph, so git did not read it as a trailer | Commits from `25da0cc` on keep every trailer in one block. Only the tip reaches the receipt |

## Checked in this session

On a scratch worktree of the staging commit with every `move:` applied and committed unsigned, as `land.sh` does:

| Check | Result |
|---|---|
| Every `requires:` line; LAND.txt plain ASCII | Met on `main` at `5b64d43`; 0 bytes outside printable ASCII |
| `npx tsc --noEmit -p .`; `npx eslint test/export.acceptance.test.ts` | Exit 0; exit 0 |
| `npx vitest run`, all files | 209 passed, 4 expected fail, 18 skipped; 1 failed in each of `land.test.ts`, `signatures.test.ts` and `checks.test.ts`, the same 3 as on `main` in this container: `spawnSync ssh-keygen ENOENT` |
| `node scripts/checks.ts trace` and `slides` | Exit 0 |
| `git apply --check`, all 18 scenario patches | All apply |
| `producer.ts task` with `TASK=TASK-T4-DUP-COLUMNS` | `Task TASK-T4-DUP-COLUMNS checked` |
| `node scenarios/run.ts` B15, B23, B24 and B1 (real harness) | All `pass`: `CHECK trace FAILED: SPEC-014-R98 has no test` (after secrets to sca passed), `CHECK scope FAILED: src/handler.ts`, `CHECK task FAILED: TASK-B24 cites unapproved SPEC-014-R99`, `CHECK lint FAILED: vitest/expect-expect` |
| B2 and B4 through the harness | Not judged here: the signatures check fails first, because no SSH signature verifies without `ssh-keygen`. B4's patch applies, and its line depends on the signatures check only |
| B2's patch applied, then `node scripts/checks.ts mutation` | `CHECK mutation FAILED: below break threshold`: 70 of 75 mutants killed (93.3%), against 95 |

Two dry runs of the delivery, on top of that commit and never pushed. A follows the task body: one line in `parse`, `if (new Set(columns).size !== columns.length) return undefined;`. B puts the check in `handler` between the 400 and 413 lines, as the review's medium finding did. Both add the `@requirement` tag and flip the tests.

| Check | A | B |
|---|---|---|
| `node scripts/checks.ts task <landing>` and `scope <landing>` | Pass | Pass |
| lint, typecheck, trace | Pass | Pass |
| Acceptance and property tests | 27 passed | 27 passed |
| `git apply --check`, all 18 scenario patches | All apply | All apply |
| Diff of the test file, `-U0` | Removes the two comment lines and `it.fails.each([`; adds `it.each([` | Same |
| `node scripts/checks.ts mutation` | Pass: `src/handler.ts` 57 killed, 1 survived (98.28%); `src/export.ts` 20 killed | Not run |
| `node scenarios/run.ts` B23 and B24 | Not run | Both `pass`, with their recorded lines |
| B2's patch applied, then the mutation check | `CHECK mutation FAILED: below break threshold`: 72 of 78 killed (92.3%). R7's tests do not rescue B2's weakened R5 assertion | Not run |

## Decisions for the owner

| Decision | Options | Staged |
|---|---|---|
| Letter case and white space | (a) Exact after JSON decoding. (b) Case-insensitive or trimmed repeats are also a 400 | (a). Rows are keyed by exact name, so (b) would refuse requests whose columns carry different data |
| R7 against R4 | (a) 400 in place of 413. (b) 413 first when over 10,000 rows | (a), as the handler orders R5 before R4 |
| How R7 lands before its code | (a) Signed with `it.fails.each` acceptance tests. (b) Amend SPEC-001-R11 (b) to exempt a requirement that a signed, undelivered task cites: a signed `scripts/checks.ts` change, and the exemption needs an end. (c) Sign R7 with its implementation, which removes the producer from T4 | (a). `it.todo` and `it.skip` do not satisfy the trace check, so they are not options |
| Lint against skipped tests | (a) Leave `vitest/no-disabled-tests` as it is. (b) Make it an error in this batch (`eslint.config.js` is protected) | (a). It would not stop a deleted or weakened test, which step 4's diff check covers, and the 18 tests skipped today need checking first |
| `produces` | (a) `src/handler.ts` and the acceptance test file. (b) Also `traceability.md` | (a). The batch adds the traceability row |
| B15's renumbering | (a) In this signed batch. (b) An earlier agent commit | (a): one landing. Neither file is protected |

## Known limits

| Limit | Effect |
|---|---|
| The producer may edit the signed tests | It must, to flip them, and no check tells a flip from a skip, a deletion or a weakened assertion. Step 4 checks it: `git diff -U0 <landing> <delivery> -- test/export.acceptance.test.ts` must remove exactly the two comment lines and `it.fails.each([`, add `it.each([`, and otherwise only add lines |
| R7 is signed before it is deployed | Between this landing and the delivery's deploy, `main` holds a signed requirement that the sandbox Lambda does not meet: a repeat gets a 200 |
| `it.fails` passes on any failure | A broken test would also pass while expected to fail. Both dry runs' flips show every assertion passes against a real implementation |
| Copies on other branches | `claude/hopeful-sagan-ae220j` stages `scenarios/scenarios.yaml` and `traceability.md`; `claude/epic-dijkstra-7xi2um` stages `traceability.md`. After this lands, both are older than their destinations, and `land.sh` warns "Changed since by" |

## Owner steps

One at a time; the agent reads each result before giving the next.

1. Move `main` to the staging commit with `land.sh --to-main`, after the agent confirms no deploy waits. Approve the deploy; it changes no Lambda.
2. Sign and land the batch: `scripts/bootstrap/land.sh proposals/t4-dup-columns`. Approve the deploy; it changes no Lambda.
3. Dispatch the producer:

```bash
gh workflow run producer.yml --repo PaulDuvall/who-gets-the-keys --ref main -f task=TASK-T4-DUP-COLUMNS -f subject="Reject duplicate column names (SPEC-014-R7)"
```

4. The agent checks the delivery on `candidate/TASK-T4-DUP-COLUMNS`: the test-file diff above, and `git apply --check` of every scenario patch on it (L20).
5. Land it: `scripts/bootstrap/land.sh --delivery candidate/TASK-T4-DUP-COLUMNS`. Approve the deploy; this one changes the Lambda. Then `main`'s run summary should trace SPEC-014-R7, the task and the run.

## Landed, 2026-11-08

The delivery, `9f959a3`, did what the task file asked and nothing else. Its test-file diff removes the two comment lines and `it.fails.each([` and adds `it.each([`. Its `src/handler.ts` diff adds one check in `parse`, `new Set(columns as string[]).size !== (columns as string[]).length`, and the `@requirement SPEC-014-R7` tag.

| Check on `9f959a3` before landing | Result |
|---|---|
| task and scope from `c7c6b4d`; lint, typecheck, trace, slides, secrets | Pass |
| `npx vitest run` | 213 passed, no expected failures left; the same 3 `ssh-keygen` failures as on `main` in the agent's container |
| `node scripts/checks.ts mutation` | Pass: `src/handler.ts` 57 of 58 killed (98.28%), `src/export.ts` 20 of 20 |
| `git apply --check`, all 18 scenario patches; B23 and B24 in the real harness; B2's patch with the mutation check | All apply; both `pass`; `below break threshold` (92.3%) |
| Scenarios run 58 on `c7c6b4d` | Success: B15 on SPEC-014-R98 holds in CI |

`main` run 114's receipt:

```text
COMMIT   9f959a350e54
FILES    dist/function.zip sha256:722ac6715a0d
AGENT    Claude Code (as reported by the commit)
MODEL    not recorded
SPEC     SPEC-014-R7
SIGNED   pipeline.yml@refs/heads/main (editable by the agent)
VERIFIED 2/2 predicate types
```

Against T4's done criterion in `docs/notes/tracer-2.md`: R7 signed, the runner dispatched, the checks passed, the delivery on `main` and the deploy succeeded. The receipt traces SPEC-014-R7 but not yet the task, the producer run, the model or R7's signature: those are T3b's lines (INTENT, TASK, AUTHOR, MODEL), and T3b comes next. Not verified: a live request to the deployed Lambda, because the agent may run no `aws` command.
