import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { toCsv } from "../src/export.ts";

// Test-only RFC 4180 reader: records end in CRLF; quoted fields may hold commas, quotes, CR and LF.
function parseCsv(csv: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (quoted && ch === '"' && csv[i + 1] === '"') {
      value += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted && ch === ",") {
      record.push(value);
      value = "";
    } else if (!quoted && ch === "\r" && csv[i + 1] === "\n") {
      record.push(value);
      records.push(record);
      record = [];
      value = "";
      i++;
    } else {
      value += ch;
    }
  }
  return records;
}

const text = fc.string({ unit: fc.constantFrom("a", "b", ",", '"', "\r", "\n", " ", "é") });
const columns = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 5 });
const table = columns.chain((cols) =>
  fc.tuple(fc.constant(cols), fc.array(fc.record(Object.fromEntries(cols.map((c) => [c, text]))), { maxLength: 20 })),
);

describe("SPEC-014 properties", () => {
  it("SPEC-014-R1 preserves row count and order and loses no value", () => {
    fc.assert(
      fc.property(table, ([cols, rows]) => {
        const records = parseCsv(toCsv(cols, rows));
        expect(records).toEqual([cols, ...rows.map((row) => cols.map((c) => row[c]))]);
      }),
    );
  });

  it("SPEC-014-R2 quotes exactly the fields that contain a delimiter, quote or line break", () => {
    fc.assert(
      fc.property(text, (value) => {
        const line = toCsv(["v"], [{ v: value }]).slice("v\r\n".length, -2);
        const needs = /[",\r\n]/.test(value);
        expect(line).toBe(needs ? `"${value.replaceAll('"', '""')}"` : value);
      }),
    );
  });
});
