# SPEC-014: Export service

<!-- PAUL: one-line description of the customer intent behind this spec -->

Status: proposal. Values marked **(proposed)** need owner approval at the Phase 1 checkpoint.

| Term | Meaning |
|---|---|
| export request | JSON body `{"columns": string[], "rows": object[]}` sent to the export Lambda |
| record | one CSV line after the header, terminated by CRLF |

## Requirements

| ID | Requirement |
|---|---|
| SPEC-014-R1 | WHEN the export service receives an export request with N rows, THE export service SHALL return a CSV document with one header record followed by exactly N records, in the order the rows were given. |
| SPEC-014-R2 | WHEN a field value contains a comma, a double quote, a carriage return or a line feed, THE export service SHALL enclose that field in double quotes and SHALL write each double quote in it as two double quotes (RFC 4180, section 2). |
| SPEC-014-R3 | WHEN a row has no value for a column, THE export service SHALL write an empty field for that column. |
| SPEC-014-R4 | IF an export request has more than **10,000 (proposed)** rows, THEN THE export service SHALL respond with status 413 and no CSV body. |
| SPEC-014-R5 | IF an export request body is not valid JSON, or has no non-empty `columns` array of strings, or has no `rows` array, THEN THE export service SHALL respond with status 400 and no CSV body. |
| SPEC-014-R6 | WHEN an export request of **10,000 (proposed)** rows by **10 (proposed)** columns is serialized, THE export service SHALL finish serializing within **500 ms (proposed)**, measured in-process on the test runner. |

## Acceptance criteria

| ID | Requirement | Criterion |
|---|---|---|
| SPEC-014-AC1 | SPEC-014-R1 | For any generated list of rows, the number of records after the header equals the number of rows, and parsing the CSV returns every input value unchanged. |
| SPEC-014-AC2 | SPEC-014-R2 | `a,b`, `say "hi"`, `line1\nline2` serialize to `"a,b"`, `"say ""hi"""`, `"line1\nline2"`. |
| SPEC-014-AC3 | SPEC-014-R3 | A row missing one of three columns produces a record with exactly two commas and an empty field in that position. |
| SPEC-014-AC4 | SPEC-014-R4 | A request with 10,001 rows returns status 413 with an empty body. |
| SPEC-014-AC5 | SPEC-014-R5 | Invalid JSON, a missing `columns`, an empty `columns` and a missing `rows` each return status 400 with an empty body. |
| SPEC-014-AC6 | SPEC-014-R6 | Serializing 10,000 rows by 10 columns completes in under 500 ms. |
