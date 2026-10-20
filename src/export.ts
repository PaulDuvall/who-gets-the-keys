const NEEDS_QUOTES = /[",\r\n]/;

function field(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Serializes rows to RFC 4180 CSV: a header record, then one CRLF-terminated record per row, in order.
 * @requirement SPEC-014-R1
 * @requirement SPEC-014-R2
 * @requirement SPEC-014-R3
 * @requirement SPEC-014-R6
 */
export function toCsv(columns: readonly string[], rows: readonly Readonly<Record<string, unknown>>[]): string {
  const lines = [columns.map(field).join(",")];
  for (const row of rows) lines.push(columns.map((column) => field(row[column])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
