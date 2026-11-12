// How far the repository has got against what its specs and decisions describe (SPEC-001-R226 to R228). One source
// for the README's progress visual and badges, and for the factory video's claim statuses (factory-video/verify.mjs
// imports claimStatus and ledgerProblems). It reads only committed files and writes no commit SHA or time, so the
// same tree always gives the same bytes, and the test check can tell when the committed copy is stale.
//
//   node scripts/progress.ts            writes docs/progress.json and docs/progress.svg
//
// The claim functions use no package, because verify.mjs --only claims runs with no node_modules.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Evidence = string | { file: string; contains: string };
export interface Claim { id: string; claim: string; illustrative?: boolean; built?: Evidence[]; planned?: string[]; open?: string[] }
export type ClaimStatus = "built" | "partly built" | "planned" | "open" | "illustrative";
export const CLAIM_STATUSES: readonly ClaimStatus[] = ["built", "partly built", "planned", "open", "illustrative"];

/** A claim is built when it cites only evidence, partly built when it also cites a plan or a backlog item. */
export function claimStatus(c: Claim): ClaimStatus {
  const built = (c.built ?? []).length > 0;
  const rest = (c.planned ?? []).length > 0 || (c.open ?? []).length > 0;
  if (c.illustrative) return "illustrative";
  if (built && rest) return "partly built";
  if (built) return "built";
  return (c.planned ?? []).length > 0 ? "planned" : "open";
}

/** The requirement IDs a markdown file defines, as table rows that start with the ID. */
export function requirementRows(text: string): string[] {
  return [...text.matchAll(/^\| (SPEC-\d{3}-R\d+) \|/gm)].map((m) => m[1] ?? "");
}

function markdownUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.endsWith(".md")).map((f) => join(dir, f)).sort();
}

/** Approved requirements: rows in specs/. Drafted: rows in docs/decisions/ and in staged spec copies under proposals/. */
export function requirementSets(root: string): { approved: Set<string>; drafted: Set<string> } {
  const approved = new Set(markdownUnder(join(root, "specs")).flatMap((f) => requirementRows(readFileSync(f, "utf8"))));
  const draftFiles = [...markdownUnder(join(root, "docs", "decisions")), ...markdownUnder(join(root, "proposals")).filter((f) => /\/SPEC-[^/]*\.md$/.test(f))];
  const drafted = new Set(draftFiles.flatMap((f) => requirementRows(readFileSync(f, "utf8"))).filter((id) => !approved.has(id)));
  return { approved, drafted };
}

export interface BacklogItem { id: string; status: string }
export function backlogItems(root: string): BacklogItem[] {
  const file = join(root, ".tasks", "backlog.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as BacklogItem);
}

/** What makes a claim's status untrue at this tree. Empty when every citation holds. */
export function ledgerProblems(root: string, claims: readonly Claim[]): string[] {
  const { approved, drafted } = requirementSets(root);
  const backlog = new Map(backlogItems(root).map((b) => [b.id, b.status]));
  const bad: string[] = [];
  for (const c of claims) {
    for (const e of c.built ?? []) {
      if (typeof e === "string") {
        if (!approved.has(e)) bad.push(`${c.id}: ${e} not in specs/`);
      } else {
        const f = join(root, e.file);
        if (!existsSync(f) || !readFileSync(f, "utf8").includes(e.contains)) bad.push(`${c.id}: ${e.file} lacks "${e.contains}"`);
      }
    }
    for (const id of c.planned ?? []) {
      if (approved.has(id)) bad.push(`${c.id}: ${id} is in specs/ now; move it to built`);
      else if (!drafted.has(id)) bad.push(`${c.id}: ${id} not drafted in docs/decisions/ or proposals/`);
    }
    for (const id of c.open ?? []) {
      const status = backlog.get(id);
      if (status === undefined) bad.push(`${c.id}: ${id} not in .tasks/backlog.jsonl`);
      else if (status !== "open") bad.push(`${c.id}: ${id} is ${status}; cite what built it, or drop it`);
    }
    if (!c.illustrative && !(c.built ?? []).length && !(c.planned ?? []).length && !(c.open ?? []).length) {
      bad.push(`${c.id}: no evidence, plan or backlog item`);
    }
  }
  return bad;
}

const count = <T extends string>(keys: readonly T[], values: readonly string[]): Record<T, number> =>
  Object.fromEntries(keys.map((k) => [k, values.filter((v) => v === k).length])) as Record<T, number>;

export const COVERAGE = ["good+bad", "good-only", "partial", "not-shown"] as const;
export const SCENARIO_KINDS = ["local", "github-actions", "sandbox-account"] as const;

export interface Progress {
  about: string;
  requirements: { approved: number; drafted: number; approvedBySpec: Record<string, number> };
  claims: Record<ClaimStatus, number> & { total: number };
  practices: Record<(typeof COVERAGE)[number], number> & { total: number };
  scenarios: Record<(typeof SCENARIO_KINDS)[number], number> & { total: number };
  backlog: { open: number; closed: number };
  badges: Record<"requirements" | "claims" | "practices" | "scenarios", string>;
}

/** The progress record of the tree at root. Claims whose citations do not hold make it throw. */
export async function progress(root = "."): Promise<Progress> {
  const { parse } = await import("yaml");
  const { approved, drafted } = requirementSets(root);
  const approvedBySpec: Record<string, number> = {};
  for (const id of [...approved].sort()) {
    const spec = id.slice(0, 8);
    approvedBySpec[spec] = (approvedBySpec[spec] ?? 0) + 1;
  }
  const { claims } = JSON.parse(readFileSync(join(root, "factory-video", "claims.json"), "utf8")) as { claims: Claim[] };
  const problems = ledgerProblems(root, claims);
  if (problems.length) throw new Error(`factory-video/claims.json no longer matches the repository:\n${problems.join("\n")}`);
  const statuses = claims.map(claimStatus);
  const practices = (parse(readFileSync(join(root, "practices.yaml"), "utf8")) as { practices: { coverage: string }[] }).practices;
  const scenarios = (parse(readFileSync(join(root, "scenarios", "scenarios.yaml"), "utf8")) as { scenarios: { requires?: string }[] }).scenarios;
  const kinds = scenarios.map((s) => s.requires ?? "local");
  const backlog = backlogItems(root);
  const c = { ...count(CLAIM_STATUSES, statuses), total: claims.length };
  const p = { ...count(COVERAGE, practices.map((x) => x.coverage)), total: practices.length };
  const s = { ...count(SCENARIO_KINDS, kinds), total: scenarios.length };
  const counted = c.built + c["partly built"] + c.planned + c.open;
  return {
    about: "Generated by npm run progress from specs/, docs/decisions/, proposals/, factory-video/claims.json, practices.yaml, scenarios/scenarios.yaml and .tasks/backlog.jsonl. Do not edit.",
    requirements: { approved: approved.size, drafted: drafted.size, approvedBySpec },
    claims: c,
    practices: p,
    scenarios: s,
    backlog: { open: backlog.filter((b) => b.status === "open").length, closed: backlog.filter((b) => b.status !== "open").length },
    badges: {
      requirements: `${approved.size} approved, ${drafted.size} drafted`,
      claims: `${c.built} of ${counted} built, ${c["partly built"]} partly`,
      practices: `${p["good+bad"] + p["good-only"]} of ${p.total} shown`,
      scenarios: `${s.total} stopped, ${s.local} local`,
    },
  };
}

const escapeXml = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One bar per measure, segments in proportion, each segment's count and name in the legend under it. */
export function progressSvg(p: Progress): string {
  const W = 760, X = 200, BAR = 520, H = 18;
  const rows: { title: string; parts: [string, number, string][] }[] = [
    { title: "Requirements", parts: [["approved in specs/", p.requirements.approved, "#2da44e"], ["drafted, not approved", p.requirements.drafted, "#d4a72c"]] },
    { title: "Factory video claims", parts: [["built", p.claims.built, "#2da44e"], ["partly built", p.claims["partly built"], "#7fc58a"], ["planned", p.claims.planned, "#d4a72c"], ["open", p.claims.open, "#cf222e"]] },
    { title: "Deck practices", parts: [["shown good and bad", p.practices["good+bad"], "#2da44e"], ["good only", p.practices["good-only"], "#7fc58a"], ["partial", p.practices.partial, "#d4a72c"], ["not shown", p.practices["not-shown"], "#8c959f"]] },
    { title: "Bad changes stopped", parts: [["run locally", p.scenarios.local, "#2da44e"], ["need GitHub Actions", p.scenarios["github-actions"], "#7fc58a"], ["need the sandbox", p.scenarios["sandbox-account"], "#d4a72c"]] },
    { title: "Backlog", parts: [["closed", p.backlog.closed, "#2da44e"], ["open", p.backlog.open, "#8c959f"]] },
  ];
  const out: string[] = [];
  let y = 34;
  for (const row of rows) {
    const total = row.parts.reduce((n, [, v]) => n + v, 0) || 1;
    out.push(`<text x="16" y="${y + 13}" class="t">${escapeXml(row.title)}</text>`);
    let x = X;
    for (const [, v, color] of row.parts) {
      const w = Math.round((BAR * v) / total);
      if (w > 0) out.push(`<rect x="${x}" y="${y}" width="${w}" height="${H}" fill="${color}"/>`);
      x += w;
    }
    const legend = row.parts.map(([name, v]) => `${v} ${name}`).join(" · ");
    out.push(`<text x="${X}" y="${y + H + 16}" class="l">${escapeXml(legend)}</text>`);
    y += 58;
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}" role="img" aria-label="Progress against the specs">`,
    `<style>.h{font:600 15px sans-serif;fill:#6e7781}.t{font:600 13px sans-serif;fill:#6e7781}.l{font:12px sans-serif;fill:#6e7781}</style>`,
    `<text x="16" y="20" class="h">Built against the specs, from npm run progress</text>`,
    ...out,
    `</svg>`,
    "",
  ].join("\n");
}

/** The two files npm run progress writes, by path. */
export async function progressFiles(root = "."): Promise<Record<string, string>> {
  const p = await progress(root);
  return { "docs/progress.json": `${JSON.stringify(p, null, 2)}\n`, "docs/progress.svg": progressSvg(p) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [path, text] of Object.entries(await progressFiles("."))) writeFileSync(path, text);
}
