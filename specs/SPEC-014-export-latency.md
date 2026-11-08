# SPEC-014: Export service

Customer intent: a customer exports up to 10,000 rows of a table as a CSV file that opens correctly in a spreadsheet, within half a second.

Status: approved by signed commit.

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
| SPEC-014-R4 | IF an export request has more than 10,000 rows, THEN THE export service SHALL respond with status 413 and no CSV body. |
| SPEC-014-R5 | IF an export request body is not valid JSON, or has no non-empty `columns` array of strings, or has no `rows` array of objects, THEN THE export service SHALL respond with status 400 and no CSV body. |
| SPEC-014-R6 | WHEN an export request of 10,000 rows by 10 columns is serialized, THE export service SHALL finish serializing within 500 ms, measured in-process on the test runner. |
| SPEC-014-R7 | IF an export request's `columns` array holds the same string more than once, THEN THE export service SHALL respond with status 400 and no CSV body, in place of SPEC-014-R4's 413 when the request also has more than 10,000 rows. Strings are compared exactly once JSON has decoded them, so `"a"` and `"\u0061"` are the same column, and `id`, `ID` and `id ` are three different ones. |
