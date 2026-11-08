import { toCsv } from "./export.ts";

const MAX_ROWS = 10_000;

interface ExportEvent {
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
}

interface ExportResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

type Row = Readonly<Record<string, unknown>>;

const empty = (statusCode: number): ExportResponse => ({ statusCode, headers: {}, body: "" });

function readJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parse(event: ExportEvent): { columns: string[]; rows: Row[] } | undefined {
  const body = String(event.body);
  const request = readJson(event.isBase64Encoded === true ? Buffer.from(body, "base64").toString("utf8") : body);
  const { columns, rows } = (request ?? {}) as { columns?: unknown; rows?: unknown };
  if (!Array.isArray(columns) || columns.length === 0 || !columns.every((c) => typeof c === "string")) return undefined;
  if (new Set(columns as string[]).size !== (columns as string[]).length) return undefined;
  if (!Array.isArray(rows) || !rows.every((r) => typeof r === "object" && r !== null)) return undefined;
  return { columns: columns as string[], rows: rows as Row[] };
}

/**
 * Lambda handler for export requests: 400 on a malformed request, 413 over the row limit, else 200 with CSV.
 * @requirement SPEC-014-R4
 * @requirement SPEC-014-R5
 * @requirement SPEC-014-R7
 */
export async function handler(event: ExportEvent): Promise<ExportResponse> {
  const request = parse(event);
  if (request === undefined) return empty(400);
  if (request.rows.length > MAX_ROWS) return empty(413);
  return { statusCode: 200, headers: { "content-type": "text/csv; charset=utf-8" }, body: toCsv(request.columns, request.rows) };
}
