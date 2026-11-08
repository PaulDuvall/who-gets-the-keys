import { describe, expect, it } from "vitest";
import { toCsv } from "../src/export.ts";
import { handler } from "../src/handler.ts";

const request = (body: unknown, isBase64Encoded = false) => ({
  body: isBase64Encoded ? Buffer.from(JSON.stringify(body)).toString("base64") : JSON.stringify(body),
  isBase64Encoded,
});

describe("SPEC-014 export service", () => {
  it("SPEC-014-R1 writes a header record and one CRLF record per row, in order", () => {
    const csv = toCsv(["id", "name"], [{ id: 2, name: "b" }, { id: 1, name: "a" }]);
    expect(csv).toBe("id,name\r\n2,b\r\n1,a\r\n");
  });

  it("SPEC-014-R1 writes only the header for zero rows", () => {
    expect(toCsv(["id"], [])).toBe("id\r\n");
  });

  it("SPEC-014-R2 quotes fields with a comma, quote, CR or LF and doubles quotes", () => {
    const csv = toCsv(["v"], [{ v: "a,b" }, { v: 'say "hi"' }, { v: "line1\nline2" }, { v: "cr\rhere" }, { v: "plain" }]);
    expect(csv).toBe('v\r\n"a,b"\r\n"say ""hi"""\r\n"line1\nline2"\r\n"cr\rhere"\r\nplain\r\n');
  });

  it("SPEC-014-R2 quotes header names that need it", () => {
    expect(toCsv(["a,b"], [])).toBe('"a,b"\r\n');
  });

  it("SPEC-014-R3 writes an empty field for a missing or null value", () => {
    const csv = toCsv(["a", "b", "c"], [{ a: "1", c: "3" }, { a: null, b: "2", c: undefined }]);
    expect(csv).toBe("a,b,c\r\n1,,3\r\n,2,\r\n");
  });

  it("SPEC-014-R4 returns 413 with an empty body above 10,000 rows", async () => {
    const rows = Array.from({ length: 10_001 }, (_, i) => ({ id: i }));
    expect(await handler(request({ columns: ["id"], rows }))).toEqual({ statusCode: 413, headers: {}, body: "" });
  });

  it("SPEC-014-R4 accepts exactly 10,000 rows", async () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => ({ id: i }));
    const response = await handler(request({ columns: ["id"], rows }));
    expect(response.statusCode).toBe(200);
    expect(response.body.split("\r\n")).toHaveLength(10_002);
  });

  it.each([
    ["invalid JSON", { body: "{not json" }],
    ["no body", {}],
    ["JSON null", { body: "null" }],
    ["missing columns", request({ rows: [] })],
    ["empty columns", request({ columns: [], rows: [] })],
    ["non-string column", request({ columns: ["a", 1], rows: [] })],
    ["JSON number", { body: "1" }],
    ["missing rows", request({ columns: ["a"] })],
    ["non-object row", request({ columns: ["a"], rows: [{}, 1] })],
    ["null row", request({ columns: ["a"], rows: [null] })],
  ])("SPEC-014-R5 returns 400 with an empty body for %s", async (_label, event) => {
    expect(await handler(event)).toEqual({ statusCode: 400, headers: {}, body: "" });
  });

  it("SPEC-014-R5 returns 200 with CSV for a valid request, plain or base64", async () => {
    const body = { columns: ["a"], rows: [{ a: "x" }] };
    const expected = { statusCode: 200, headers: { "content-type": "text/csv; charset=utf-8" }, body: "a\r\nx\r\n" };
    expect(await handler(request(body))).toEqual(expected);
    expect(await handler(request(body, true))).toEqual(expected);
  });

  // Written before SPEC-014-R7 is implemented: it.fails passes while the assertion fails. The delivery that implements
  // R7 changes it.fails.each to it.each and nothing else here.
  it.fails.each([
    ["the same column twice", { columns: ["a", "a"], rows: [] }],
    ["a repeat that is not next to its first use", { columns: ["a", "b", "a"], rows: [{ a: 1, b: 2 }] }],
    ["a repeat in a request over 10,000 rows", { columns: ["id", "id"], rows: Array.from({ length: 10_001 }, (_, i) => ({ id: i })) }],
  ])("SPEC-014-R7 returns 400 with an empty body for %s", async (_label, body) => {
    expect(await handler(request(body))).toEqual({ statusCode: 400, headers: {}, body: "" });
  });

  it("SPEC-014-R7 compares column names exactly, so names that differ only in letter case are different columns", async () => {
    const response = await handler(request({ columns: ["id", "ID"], rows: [{ id: 1, ID: 2 }] }));
    expect(response).toEqual({ statusCode: 200, headers: { "content-type": "text/csv; charset=utf-8" }, body: "id,ID\r\n1,2\r\n" });
  });
});
