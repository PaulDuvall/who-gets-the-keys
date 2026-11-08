# Tracer 2, slice T4: SPEC-014-R7 and its task file

Status: staged 2026-11-08 in `proposals/t4-dup-columns/` for the owner to sign. Nothing is landed. T4's row in `docs/notes/tracer-2.md`: the owner signs R7, dispatches the runner producer, the checks pass, the owner lands the delivery with `land.sh --delivery`, and the deploy succeeds. The delivery is the first `land.sh --delivery` landing, which closes backlog item `who-gets-the-keys-nlq`.

## The requirement

```markdown
| SPEC-014-R7 | IF an export request's `columns` array holds the same string more than once, THEN THE export service SHALL respond with status 400 and no CSV body, whatever the number of rows. Strings are compared exactly, so `id` and `ID` are different columns. |
```

Changes from the 2026-11-07 draft ("names the same column more than once"):

| Change | Why |
|---|---|
| "holds the same string more than once" | A column is a key into each row object (R1, R3). `row["id"]` and `row["ID"]` are different values, so only an exact repeat is ambiguous |
| "whatever the number of rows" | Without it, a request with a repeat and 10,001 rows meets both R4 (413) and R7 (400). The handler already checks the body (R5) before the row count (R4), so 400 first matches it. R4 and R5 have the same overlap, unchanged here |
| "compared exactly, so `id` and `ID` are different columns" | Makes the comparison testable. JSON escapes are decoded first, so `"a"` and `"a"` are the same string; letter case, white space and Unicode form are not changed |

## The task file

`tasks/TASK-T4-DUP-COLUMNS.task.md`, 972 bytes:

```markdown
---
requirements: [SPEC-014-R7]
produces: [src/handler.ts, test/export.acceptance.test.ts]
---
Implement SPEC-014-R7 in src/handler.ts. ...
```

The body tells the agent where the 400 goes, that the repeat check comes before the row limit, to flip the signed tests and nothing else in them, and to tag `handler` with `@requirement SPEC-014-R7`. `produces` names `src/handler.ts`, not `src/export.ts` as the T3a note's example did: the request checks live in the handler's `parse`, and the serializer never sees a request.

## Why the batch carries tests

The trace check fails any requirement in `specs/` that no listed test names (SPEC-001-R11 (b)). A batch that signs R7 alone fails its own candidate run with `CHECK trace FAILED: SPEC-014-R7 has no test`, as scenario B15 shows. Checked in this session with vitest 4.1.12: `vitest list --json`, which the trace check reads, lists `it.fails` and `it.fails.each` tests but not `it.todo` or `it.skip`.

So the batch signs R7 with its acceptance tests, written with `it.fails.each`. Vitest counts a test that fails as expected as a pass, so the test check passes while nothing implements R7. A fourth test, that `id` and `ID` are two columns, passes today and must keep passing. The delivery changes `it.fails.each` to `it.each` and deletes the two comment lines above it. Once R7 is implemented, an unchanged `it.fails.each` fails the test check, because its assertions now pass.

## What the batch changes

| File | Change |
|---|---|
| `specs/SPEC-014-export-latency.md` | R7, after R6 |
| `tasks/TASK-T4-DUP-COLUMNS.task.md` | New: the signed task |
| `test/export.acceptance.test.ts` | Three `it.fails.each` cases for R7 (a repeat, a repeat not next to its first use, a repeat with 10,001 rows) and one `it` for letter case, after the R5 tests |
| `traceability.md` | Row SPEC-014-R7: `test/export.acceptance.test.ts`, test and mutation |
| `scenarios/B15-requirement-without-test.patch`, `scenarios/scenarios.yaml` | B15's untested requirement was SPEC-014-R7, a byte order mark. With a real R7 that a test names, B15 would pass trace. It now adds SPEC-014-R8 after R7, and its `expect` is `CHECK trace FAILED: SPEC-014-R8 has no test`. B24's SPEC-014-R99 is unaffected |

Trailers: `Spec: SPEC-014-R7` and `Spec: SPEC-001-R34`, B15's scenario row, whose recorded line changes. `src/` is unchanged, so `main`'s deploy after landing plans no Lambda change.

## Checked in this session

On a scratch worktree of the staging commit with every `move:` applied and committed unsigned, as `land.sh` does:

| Check | Result |
|---|---|
| Every `requires:` line | Met on `main` at `5b64d43` |
| `npx tsc --noEmit -p .` | Exit 0 |
| `npx eslint test/export.acceptance.test.ts` | Exit 0 |
| `npx vitest run`, all files | 207 passed, 3 expected fail, 18 skipped; 1 failed in each of `land.test.ts`, `signatures.test.ts` and `checks.test.ts`, the same 3 as on `main` in this container: `spawnSync ssh-keygen ENOENT` |
| `node scripts/checks.ts trace` and `slides` | Exit 0 |
| `git apply --check`, all 18 scenario patches | All apply |
| `node scenarios/run.ts B15` (real harness) | `pass`: `CHECK trace FAILED: SPEC-014-R8 has no test`, after secrets, allowlist, workflows, install, lint, typecheck, iac, sast and sca passed |
| `node scenarios/run.ts B1` | `pass`: `CHECK lint FAILED: vitest/expect-expect` |
| B2 and B4 through the harness | Not judged here: the signatures check fails first on `specs/source-of-record/slides.txt`, because no SSH signature verifies without `ssh-keygen`. B4's patch applies, and its line depends on the signatures check only |
| B2's patch applied, then `node scripts/checks.ts mutation` | `CHECK mutation FAILED: below break threshold`: 70 of 75 mutants killed (93.3%), against 95 |
| `producer.ts task`, `prompt` and `message` with `TASK=TASK-T4-DUP-COLUMNS` | Task checked; the prompt carries the task body; the message carries `Task: TASK-T4-DUP-COLUMNS` and `Spec: SPEC-014-R7` |

A dry run of the delivery, on top of that commit and never pushed: a two-line change to `src/handler.ts` (`if (new Set(columns).size !== columns.length) return undefined;` in `parse`, and the `@requirement` tag) and the flip in the test file, committed with the publish job's trailers.

| Check | Result |
|---|---|
| `node scripts/checks.ts task <landing>` and `scope <landing>` | Both pass |
| `producer.ts scope` on the patch, as the publish job runs it | `scope ok` |
| lint, typecheck, trace | Pass |
| Acceptance and property tests | 24 passed |
| `node scripts/checks.ts mutation` | Pass. `src/handler.ts` 57 killed, 1 survived (98.28%); `src/export.ts` 20 killed |
| `git apply --check`, all 18 scenario patches | All apply |
| B2's patch applied, then the mutation check | `CHECK mutation FAILED: below break threshold`: 72 of 78 killed (92.3%). R7's tests do not rescue B2's weakened R5 assertion |

## Decisions for the owner

| Decision | Options | Staged |
|---|---|---|
| Letter case | (a) Exact: `id` and `ID` are two columns. (b) Case-insensitive repeats are also a 400 | (a). Rows are keyed by exact name, so (b) would refuse requests whose columns carry different data |
| R7 against R4 | (a) 400 whatever the number of rows. (b) 413 first when over 10,000 rows | (a), as the handler orders R5 before R4 |
| How R7 lands before its code | (a) Signed with `it.fails.each` acceptance tests. (b) Amend SPEC-001-R11 (b) to exempt a requirement that a signed, undelivered task cites: a signed `scripts/checks.ts` change, and the exemption needs an end. (c) Sign R7 with its implementation, which removes the producer from T4 | (a). `it.todo` and `it.skip` do not satisfy the trace check, so they are not options |
| `produces` | (a) `src/handler.ts` and the acceptance test file. (b) Also `traceability.md` | (a). The batch adds the traceability row, so the producer has no reason to touch it |
| B15's renumbering | (a) In this signed batch. (b) An earlier agent commit | (a): one landing. Neither file is protected |

## Known limits

| Limit | Effect |
|---|---|
| The producer may edit the signed tests | It must, to flip them. The scope check cannot tell a flip from a weakened assertion. Before landing, the owner reads the delivery's diff of `test/export.acceptance.test.ts`: the only change to the signed R7 tests is `it.fails.each` to `it.each` and the two deleted comment lines. Added tests are fine |
| R7 is signed before it is deployed | Between this landing and the delivery's deploy, `main` holds a signed requirement that the sandbox Lambda does not meet: a repeat gets a 200 |
| `it.fails` passes on any failure | A broken test would also pass while expected to fail. The dry run's flip shows all three assertions pass against a real implementation |
| Copies on other branches | `claude/hopeful-sagan-ae220j` stages `scenarios/scenarios.yaml` and `traceability.md`; `claude/epic-dijkstra-7xi2um` stages `traceability.md`. After this lands, both are older than their destinations, and `land.sh` warns "Changed since by" |

## Owner steps

One at a time; the agent reads each result before giving the next.

1. Move `main` to the staging commit with `land.sh --to-main`, after the agent confirms no deploy waits. Approve the deploy; it changes no Lambda.
2. Sign and land the batch: `scripts/bootstrap/land.sh proposals/t4-dup-columns`. Approve the deploy; it changes no Lambda.
3. Dispatch the producer:

```bash
gh workflow run producer.yml --repo PaulDuvall/who-gets-the-keys --ref main -f task=TASK-T4-DUP-COLUMNS -f subject="Reject duplicate column names (SPEC-014-R7)"
```

4. The agent checks the delivery on `candidate/TASK-T4-DUP-COLUMNS`: the test diff above, and `git apply --check` of every scenario patch on it (L20).
5. Land it: `scripts/bootstrap/land.sh --delivery candidate/TASK-T4-DUP-COLUMNS`. Approve the deploy; this one changes the Lambda. Then `main`'s run summary should trace SPEC-014-R7, the task and the run.
