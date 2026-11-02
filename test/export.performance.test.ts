import { describe, expect, it } from "vitest";
import { toCsv } from "../src/export.ts";

// Wall-clock check, kept in its own file so the mutation gate can leave it out: Stryker's instrumentation and
// parallel test runners slow the serializer by an amount that depends on the machine, not on the code.
describe("SPEC-014 export service performance", () => {
  it("SPEC-014-R6 serializes 10,000 rows by 10 columns within 500 ms", () => {
    const columns = Array.from({ length: 10 }, (_, i) => `c${i}`);
    const rows = Array.from({ length: 10_000 }, (_, r) => Object.fromEntries(columns.map((c) => [c, `${c}-${r},"x"`])));
    const started = performance.now();
    const csv = toCsv(columns, rows);
    expect(performance.now() - started).toBeLessThan(500);
    expect(csv.split("\r\n")).toHaveLength(10_002);
  });
});
