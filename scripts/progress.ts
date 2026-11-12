// How far the repository has got against what its specs and decisions describe (SPEC-001-R226 to R229). One source
// for the README's progress visual and badges, and for the factory video's claim statuses (factory-video/verify.mjs
// imports claimStatus and ledgerProblems). It reads only committed files and writes no commit SHA or time, so the
// same tree always gives the same bytes, and the test check can tell when the committed copy is stale.
//
//   node scripts/progress.ts            writes docs/progress.json and docs/progress.svg
//
// The claim functions use no package, because verify.mjs --only claims runs with no node_modules.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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

// The markdown files git tracks under dir, so an untracked or ignored file never counts (committed files only). The
// paths are sorted by code unit, which no locale changes.
function markdownUnder(root: string, dir: string): string[] {
  const listed = execFileSync("git", ["-C", root, "ls-files", "-z", "--", dir], { encoding: "utf8" });
  return listed.split("\0").filter((f) => f.endsWith(".md")).sort().map((f) => join(root, f));
}

/** Approved requirements: rows in specs/. Drafted: rows in docs/decisions/ and in staged spec copies under proposals/. */
export function requirementSets(root: string): { approved: Set<string>; drafted: Set<string> } {
  const approved = new Set(markdownUnder(root, "specs").flatMap((f) => requirementRows(readFileSync(f, "utf8"))));
  const draftFiles = [...markdownUnder(root, "docs/decisions"), ...markdownUnder(root, "proposals").filter((f) => /\/SPEC-[^/]*\.md$/.test(f))];
  const drafted = new Set(draftFiles.flatMap((f) => requirementRows(readFileSync(f, "utf8"))).filter((id) => !approved.has(id)));
  return { approved, drafted };
}

export interface BacklogItem { id: string; status: string }
export const BACKLOG_STATUSES = ["open", "closed"] as const;
/** The backlog's items. A status other than open or closed throws, so no item is counted in the wrong bar. */
export function backlogItems(root: string): BacklogItem[] {
  const file = join(root, ".tasks", "backlog.jsonl");
  if (!existsSync(file)) return [];
  const items = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as BacklogItem);
  const odd = items.find((b) => !(BACKLOG_STATUSES as readonly string[]).includes(b.status));
  if (odd) throw new Error(`.tasks/backlog.jsonl: ${odd.id} has status "${odd.status}", not open or closed`);
  return items;
}

/** Counts each value under its key, and throws on a value outside keys, so the bars always add up to the total. */
function countKnown<T extends string>(what: string, keys: readonly T[], values: readonly string[]): Record<T, number> {
  const odd = values.find((v) => !(keys as readonly string[]).includes(v));
  if (odd !== undefined) throw new Error(`${what}: "${odd}" is not one of ${keys.join(", ")}`);
  return count(keys, values);
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
  const p = { ...countKnown("practices.yaml coverage", COVERAGE, practices.map((x) => x.coverage)), total: practices.length };
  const s = { ...countKnown("scenarios/scenarios.yaml requires", SCENARIO_KINDS, kinds), total: scenarios.length };
  const counted = c.built + c["partly built"] + c.planned + c.open;
  return {
    about: "Generated by npm run progress from specs/, docs/decisions/, proposals/, factory-video/claims.json, practices.yaml, scenarios/scenarios.yaml and .tasks/backlog.jsonl. Do not edit.",
    requirements: { approved: approved.size, drafted: drafted.size, approvedBySpec },
    claims: c,
    practices: p,
    scenarios: s,
    backlog: { open: backlog.filter((b) => b.status === "open").length, closed: backlog.filter((b) => b.status === "closed").length },
    badges: {
      requirements: `${approved.size} approved, ${drafted.size} drafted`,
      claims: `${c.built} of ${counted} built, ${c["partly built"]} partly`,
      practices: `${p["good+bad"] + p["good-only"]} of ${p.total} shown`,
      scenarios: `${s.total} stopped, ${s.local} local`,
    },
  };
}

const escapeXml = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Colours chosen for 3:1 or more against both GitHub themes, and for distinct hues, not shades of one: green is built,
// blue partly built or shown with a good case only, amber planned or partial, red open, grey not shown or not started.
const COLOURS = { done: "#1a7f37", part: "#0969da", plan: "#bf8700", open: "#cf222e", none: "#6e7781" } as const;

/** One bar per measure, segments in proportion, and under it a legend with a swatch, count and name per segment. */
export function progressSvg(p: Progress): string {
  const W = 760, X = 200, BAR = 520, H = 18;
  const rows: { title: string; parts: [string, number, string][] }[] = [
    { title: "Requirements", parts: [["approved in specs/", p.requirements.approved, COLOURS.done], ["drafted, not approved", p.requirements.drafted, COLOURS.plan]] },
    { title: "Factory video claims", parts: [["built", p.claims.built, COLOURS.done], ["partly built", p.claims["partly built"], COLOURS.part], ["planned", p.claims.planned, COLOURS.plan], ["open", p.claims.open, COLOURS.open]] },
    { title: "Deck practices", parts: [["shown good and bad", p.practices["good+bad"], COLOURS.done], ["good only", p.practices["good-only"], COLOURS.part], ["partial", p.practices.partial, COLOURS.plan], ["not shown", p.practices["not-shown"], COLOURS.none]] },
    { title: "Bad changes stopped", parts: [["on every push", p.scenarios.local, COLOURS.done], ["on GitHub Actions only", p.scenarios["github-actions"], COLOURS.part], ["in the sandbox only", p.scenarios["sandbox-account"], COLOURS.plan]] },
    { title: "Backlog", parts: [["closed", p.backlog.closed, COLOURS.done], ["open", p.backlog.open, COLOURS.none]] },
  ];
  const out: string[] = [];
  const summary: string[] = [];
  let y = 34;
  for (const row of rows) {
    const total = row.parts.reduce((n, [, v]) => n + v, 0) || 1;
    out.push(`<text x="16" y="${y + 13}" class="t">${escapeXml(row.title)}</text>`);
    let x = X;
    for (const [, v, colour] of row.parts) {
      const w = Math.round((BAR * v) / total);
      if (w > 0) out.push(`<rect x="${x}" y="${y}" width="${w}" height="${H}" fill="${colour}"/>`);
      x += w;
    }
    let lx = X;
    for (const [name, v, colour] of row.parts) {
      const label = `${v} ${name}`;
      out.push(`<rect x="${lx}" y="${y + H + 7}" width="10" height="10" fill="${colour}"/>`, `<text x="${lx + 14}" y="${y + H + 16}" class="l">${escapeXml(label)}</text>`);
      lx += 14 + Math.ceil(label.length * 6.4) + 14;
    }
    summary.push(`${row.title}: ${row.parts.map(([name, v]) => `${v} ${name}`).join(", ")}`);
    y += 58;
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}" role="img" aria-labelledby="title">`,
    `<title id="title">${escapeXml(`Built against the specs. ${summary.join(". ")}.`)}</title>`,
    `<style>text{fill:#57606a;font-family:sans-serif}.h{font-size:15px;font-weight:600}.t{font-size:13px;font-weight:600}.l{font-size:12px}` +
      `@media (prefers-color-scheme:dark){text{fill:#9198a1}}</style>`,
    `<text x="16" y="20" class="h">Built against the specs, from npm run progress</text>`,
    ...out,
    `</svg>`,
    "",
  ].join("\n");
}

export interface VideoData {
  claims: Progress["claims"];
  requirements: { approved: number; drafted: number };
  /** Each claim not yet fully built, with its on-screen labels in ledger order. The end card outlines every one. */
  unbuilt: { id: string; status: ClaimStatus; labels: string[] }[];
}

/**
 * What the factory video's end card shows: the counts, and each claim not yet fully built (SPEC-001-R229). It uses no
 * package, because the video's build job installs none at the repository root, and it counts as progress() does.
 */
export function videoData(root = "."): VideoData {
  const { approved, drafted } = requirementSets(root);
  const { claims } = JSON.parse(readFileSync(join(root, "factory-video", "claims.json"), "utf8")) as { claims: (Claim & { labels?: string[] })[] };
  const problems = ledgerProblems(root, claims);
  if (problems.length) throw new Error(`factory-video/claims.json no longer matches the repository:\n${problems.join("\n")}`);
  const statuses = claims.map(claimStatus);
  const unbuilt = claims
    .map((c, i) => ({ id: c.id, status: statuses[i] ?? claimStatus(c), labels: c.labels ?? [] }))
    .filter((c) => c.status === "planned" || c.status === "open" || c.status === "partly built");
  return { claims: { ...count(CLAIM_STATUSES, statuses), total: claims.length }, requirements: { approved: approved.size, drafted: drafted.size }, unbuilt };
}

/** The two files npm run progress writes, by path. */
export async function progressFiles(root = "."): Promise<Record<string, string>> {
  const p = await progress(root);
  return { "docs/progress.json": `${JSON.stringify(p, null, 2)}\n`, "docs/progress.svg": progressSvg(p) };
}

// pathToFileURL encodes a path with a space or a percent sign as import.meta.url does.
//   node scripts/progress.ts --video-data <file>   writes the end card's data as a script, for factory-video/build.sh
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [flag, out] = process.argv.slice(2);
  if (flag === "--video-data" && out) writeFileSync(out, `window.PROGRESS = ${JSON.stringify(videoData("."), null, 2)};\n`);
  else if (flag === undefined) for (const [path, text] of Object.entries(await progressFiles("."))) writeFileSync(path, text);
  else throw new Error("usage: node scripts/progress.ts [--video-data <file>]");
}
