---
requirements: [SPEC-014-R7]
produces: [src/handler.ts, test/export.acceptance.test.ts]
---
Implement SPEC-014-R7 in src/handler.ts. An export request whose `columns` array holds the same string more than once gets status 400 and no CSV body, even when it also has more than 10,000 rows. Compare the decoded column names exactly: no change of letter case, white space or Unicode form.

Put the check in `parse`, next to the SPEC-014-R5 checks on `columns`, so that the body of `handler` does not change. Write it as one expression with no branch that the tests cannot tell apart: the candidate run's mutation check fails below a score of 95, and you cannot run it.

test/export.acceptance.test.ts already holds the approver's tests for SPEC-014-R7. The ones written with `it.fails.each` describe R7's behaviour and fail today, because nothing implements it. Once your change makes their assertions pass, change `it.fails.each` to `it.each`, delete the two comment lines above it, and change nothing else in those tests. Do not change any other existing test. You may add tests to test/export.acceptance.test.ts; each title names SPEC-014-R7.

Add `@requirement SPEC-014-R7` to the doc comment of `handler` in src/handler.ts. Change no other line of src/handler.ts beyond what SPEC-014-R7 needs.
