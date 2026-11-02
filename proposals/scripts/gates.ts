// Gate dispatcher (SPEC-001-R1 to R18). Usage: node scripts/gates.ts [gate | practices-md]
// No gate imports a package before the install gate has run, so the first three need only Node.js built-ins.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const ORDER = [
  "secrets", "allowlist", "workflows", "install", "lint", "typecheck", "iac",
  "sast", "sca", "trace", "signatures", "slides", "ratchet", "test", "mutation",
] as const;

export class GateFailure extends Error {
  readonly gate: string;
  readonly id: string;
  constructor(gate: string, id: string) {
    super(`GATE ${gate} FAILED: ${id}`);
    this.gate = gate;
    this.id = id;
  }
}

interface Result { status: number; stdout: string; stderr: string }

function tool(argv: readonly string[], cwd = "."): Result {
  const [file, ...rest] = argv;
  const r = spawnSync(file ?? "", rest, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.error) return { status: 127, stdout: "", stderr: String(r.error) };
  return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
}

function check(gate: string, result: Result, id: string): void {
  if (result.status === 0) return;
  process.stderr.write(`${(result.stdout + result.stderr).slice(-4000)}\n`);
  throw new GateFailure(gate, id);
}

const git = (...args: string[]): string => tool(["git", ...args]).stdout;
const tracked = (...patterns: string[]): string[] => git("ls-files", "-z", "--", ...patterns).split("\0").filter(Boolean);

// Every committed lockfile for the sca gate: npm lockfiles and the hash-pinned Python requirements.
export const lockfilePaths = (): string[] => tracked("package-lock.json", "**/package-lock.json", "requirements.txt", "**/requirements.txt");
const first = (ids: readonly string[]): string | undefined => [...ids].sort()[0];

// ---------- pure helpers, unit-tested in test/gates.test.ts ----------

export function dependencyNames(pkg: Record<string, unknown>): string[] {
  const keys = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  return keys.flatMap((k) => Object.keys((pkg[k] ?? {}) as Record<string, unknown>));
}

export function allowedNames(text: string): Set<string> {
  return new Set(text.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#")));
}

// Lines of a job's `key:` block in a workflow file, found by indentation (no YAML parser before install).
export function jobBlock(workflow: string, job: string, key: string): string[] {
  const lines = workflow.split("\n");
  const jobAt = lines.findIndex((l) => l === `  ${job}:`);
  if (jobAt < 0) return [];
  const end = lines.findIndex((l, i) => i > jobAt && /^ {0,2}\S/.test(l));
  const body = lines.slice(jobAt + 1, end < 0 ? undefined : end);
  const keyAt = body.findIndex((l) => l.startsWith(`    ${key}:`));
  if (keyAt < 0) return [];
  const head = body[keyAt] ?? "";
  const rest = body.slice(keyAt + 1);
  const stop = rest.findIndex((l) => l.trim() !== "" && !l.startsWith("      "));
  return [head, ...rest.slice(0, stop < 0 ? undefined : stop)].map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
}

// GitHub enforces cache-mode; zizmor's cache-poisoning audit only sees release-shaped workflows (D12).
export function pipelineCacheFinding(pipeline: string): boolean {
  return !/^cache-mode: none$/m.test(pipeline)
    || /uses:\s*actions\/cache[@/]/.test(pipeline)
    || /^\s+cache-mode:\s*(?!none\b)/m.test(pipeline)
    || /^\s+(?:cache|enable-cache|package-manager-cache):\s*(?!false\b)\S/m.test(pipeline);
}

export function requirementIds(specText: string): string[] {
  return [...specText.matchAll(/^\| (SPEC-\d{3}-R\d+) \|/gm)].map((m) => m[1] ?? "");
}

export function names(text: string, id: string): boolean {
  for (let at = text.indexOf(id); at >= 0; at = text.indexOf(id, at + 1)) {
    if (!/\d/.test(text.charAt(at + id.length))) return true;
  }
  return false;
}

export interface ExportInfo { name: string; tags: string[] }

export function exportsOf(source: string): ExportInfo[] {
  const lines = source.split("\n");
  const out: ExportInfo[] = [];
  lines.forEach((line, i) => {
    const m = /^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (!m) return;
    let j = i - 1;
    const doc: string[] = [];
    if ((lines[j] ?? "").trim().endsWith("*/")) {
      while (j >= 0 && !(lines[j] ?? "").includes("/**")) doc.unshift(lines[j--] ?? "");
      doc.unshift(lines[j] ?? "");
    }
    const tags = [...doc.join("\n").matchAll(/@requirement\s+(SPEC-\d{3}-R\d+)/g)].map((t) => t[1] ?? "");
    out.push({ name: m[1] ?? "", tags });
  });
  return out;
}

export function slideNumbers(snapshotBody: string): Set<string> {
  const found = new Set<string>();
  let next = 1;
  for (const line of snapshotBody.split("\n")) {
    if (line === String(next)) found.add(String(next++));
  }
  let q = 1;
  for (const line of snapshotBody.split("\n")) {
    if (/^Likely questions(, part \d)?$/.test(line)) found.add(`Q${q++}`);
  }
  return found;
}

export function snapshotBody(snapshot: string): string {
  const at = snapshot.indexOf("\n---\n");
  return at < 0 ? "" : snapshot.slice(at + 5);
}

export const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

// Paths listed in specs/protected-paths.txt need an approver's signature too (SPEC-001-R12).
// A listed path ending in "/" covers everything under it; any other entry is one file.
export const PROTECTED = "specs/protected-paths.txt";

export function protectedPaths(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#"));
}

export const guardedBy = (file: string, paths: readonly string[]): string | undefined =>
  paths.find((p) => (p.endsWith("/") ? file.startsWith(p) : file === p));

export function signatureId(files: readonly string[], paths: readonly string[] = []): string {
  if (files.includes("specs/source-of-record/slides.txt")) return "unsigned change to specs/source-of-record/slides.txt";
  if (files.some((f) => f.startsWith("specs/"))) return "unsigned change to specs/";
  if (files.includes("approvers.txt")) return "unsigned change to approvers.txt";
  const guard = files.map((f) => guardedBy(f, paths)).find((p) => p !== undefined);
  return `unsigned change to ${guard ?? "approvers.txt"}`;
}

export const COMMANDS = {
  secrets: ["gitleaks", "dir", ".", "--config", ".gitleaks.toml", "--no-banner", "--redact", "--report-format", "json"],
  workflows: ["zizmor", "--offline", "--format", "json", "--no-progress", ".github/workflows"],
  install: ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
  sast: ["semgrep", "scan", "--config", "p/default", "--error", "--metrics=off", "--json", "--quiet"],
  sca: ["osv-scanner", "scan", "source", "--format", "json"],
} as const;

export interface AdvisoryGroup { ids: string[]; max_severity?: string }

export function topAdvisory(groups: readonly AdvisoryGroup[]): string | undefined {
  const sorted = [...groups].sort((a, b) => Number(b.max_severity ?? 0) - Number(a.max_severity ?? 0) || (a.ids[0] ?? "").localeCompare(b.ids[0] ?? ""));
  const ids = sorted[0]?.ids ?? [];
  return ids.find((id) => id.startsWith("GHSA-")) ?? first(ids);
}

export const lowered = (current: number, parent: number): boolean => current < parent;

export function failedTestFiles(results: readonly { name: string; status: string }[], cwd: string): string[] {
  return results.filter((t) => t.status !== "passed").map((t) => t.name.replace(`${cwd}/`, ""));
}

export const mutationId = (output: string): string => (/under breaking threshold/.test(output) ? "below break threshold" : "stryker error");

export const STATEFUL = ["aws_dynamodb_table", "aws_s3_bucket", "aws_db_instance", "aws_kms_key"];

export function destructiveChanges(plan: { resource_changes?: { address: string; type: string; change: { actions: string[] } }[] }): string[] {
  return (plan.resource_changes ?? [])
    .filter((r) => STATEFUL.includes(r.type) && r.change.actions.includes("delete"))
    .map((r) => r.address);
}

// ---------- gates ----------

export function verifySigned(commit: string, approvers: string, cwd = "."): boolean {
  const dir = mkdtempSync(join(tmpdir(), "signers-"));
  try {
    const file = join(dir, "allowed_signers");
    writeFileSync(file, approvers);
    const r = tool(["git", "-c", "gpg.format=ssh", "-c", "gpg.ssh.program=ssh-keygen", "-c", `gpg.ssh.allowedSignersFile=${file}`, "verify-commit", commit], cwd);
    return r.status === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Files a commit changes against its first parent, or against nothing for a root commit (SPEC-001-R12).
// Renames count as a delete plus an add, so moving a protected file away touches its protected path; -z keeps
// names unquoted; a merge commit is compared with its first parent, so everything it brings in counts.
export function changedFiles(commit: string, parent: string | undefined, cwd = "."): string[] {
  const range = parent ? [parent, commit] : ["--root", commit];
  const r = tool(["git", "diff-tree", "-r", "--no-commit-id", "--name-only", "--no-renames", "-z", ...range], cwd);
  return r.stdout.split("\0").filter(Boolean);
}

// The allowed signers that judge a commit: approvers.txt as of its first parent. Only the commit that first adds
// approvers.txt, when no earlier commit had one, is judged by its own copy (SPEC-001-R12).
export function approversFor(parentCopy: string | undefined, ownCopy: string | undefined, seenBefore: boolean): string {
  if (parentCopy !== undefined) return parentCopy;
  return seenBefore ? "" : ownCopy ?? "";
}

// gh attestation verify, pinned to pipeline.yml on main, a GitHub-hosted runner and, in CI, this commit (SPEC-001-R17).
export function attestationArgs(artifact: string, repo: string, sha: string | undefined): string[] {
  return [
    "gh", "attestation", "verify", artifact, "--repo", repo,
    "--signer-workflow", `${repo}/.github/workflows/pipeline.yml`, "--source-ref", "refs/heads/main",
    "--deny-self-hosted-runners", ...(sha ? ["--source-digest", sha] : []),
  ];
}

const show = (rev: string, path: string): string | undefined => {
  const r = tool(["git", "show", `${rev}:${path}`]);
  return r.status === 0 ? r.stdout : undefined;
};

const gates: Record<string, (args: string[]) => void | Promise<void>> = {
  secrets() {
    const dir = mkdtempSync(join(tmpdir(), "gitleaks-"));
    const report = join(dir, "report.json");
    try {
      const r = tool([...COMMANDS.secrets, "--report-path", report]);
      if (r.status === 0) return;
      const findings = existsSync(report) ? (JSON.parse(readFileSync(report, "utf8")) as { RuleID: string }[]) : [];
      check("secrets", r, first(findings.map((f) => f.RuleID)) ?? "gitleaks error");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },

  allowlist() {
    const allowed = allowedNames(readFileSync("allowed-deps.txt", "utf8"));
    const missing = tracked("package.json", "**/package.json").flatMap((p) =>
      dependencyNames(JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>).filter((n) => !allowed.has(n)),
    );
    const name = first(missing);
    if (name !== undefined) throw new GateFailure("allowlist", name);
  },

  workflows() {
    const r = tool(COMMANDS.workflows);
    if (r.status !== 0) {
      const findings = (r.stdout.trim().startsWith("[") ? JSON.parse(r.stdout) : []) as { ident: string }[];
      check("workflows", r, first(findings.map((f) => f.ident)) ?? "zizmor error");
    }
    if (pipelineCacheFinding(readFileSync(".github/workflows/pipeline.yml", "utf8"))) throw new GateFailure("workflows", "deploy-cache");
    const triage = readFileSync(".github/workflows/issue-triage.yml", "utf8");
    const replay = readFileSync(".github/workflows/scenarios.yml", "utf8");
    for (const key of ["permissions", "env"]) {
      const a = jobBlock(triage, "triage", key);
      const b = jobBlock(replay, "b9-replay", key);
      if (a.length === 0 || a.join("\n") !== b.join("\n")) throw new GateFailure("workflows", "replay-parity");
    }
  },

  install() {
    check("install", tool(COMMANDS.install), "package-lock.json");
  },

  lint() {
    const r = tool(["node_modules/.bin/eslint", ".", "--format", "json"]);
    if (r.status === 0) return;
    const files = (JSON.parse(r.stdout || "[]") as { filePath: string; messages: { ruleId: string | null; severity: number }[] }[]);
    const ids = files.flatMap((f) => f.messages.filter((m) => m.severity === 2).map((m) => m.ruleId ?? "parse-error"));
    check("lint", r, first(ids) ?? "eslint error");
  },

  typecheck() {
    const r = tool(["node_modules/.bin/tsc", "--noEmit", "-p", "."]);
    check("typecheck", r, /^([^\s(]+)\(\d+,\d+\): error/m.exec(r.stdout)?.[1] ?? "tsc error");
  },

  iac() {
    for (const dir of ["infra/sandbox", "infra/org"]) {
      check("iac", tool(["terraform", "fmt", "-check", "-recursive"], dir), dir);
      check("iac", tool(["terraform", "init", "-backend=false", "-input=false", "-no-color"], dir), dir);
      check("iac", tool(["terraform", "validate", "-no-color"], dir), dir);
      const config = join(process.cwd(), ".tflint.hcl");
      check("iac", tool(["tflint", "--init", "--config", config], dir), dir);
      check("iac", tool(["tflint", "--no-color", "--config", config], dir), dir);
    }
  },

  sast() {
    const r = tool(COMMANDS.sast);
    if (r.status === 0) return;
    const results = (JSON.parse(r.stdout || "{}") as { results?: { check_id: string }[] }).results ?? [];
    check("sast", r, first(results.map((x) => x.check_id)) ?? "semgrep error");
  },

  sca() {
    const lockfiles = lockfilePaths().flatMap((l) => ["-L", l]);
    const exceptions = existsSync("specs/sca-exceptions.toml") ? ["--config", "specs/sca-exceptions.toml"] : [];
    const r = tool([...COMMANDS.sca, ...exceptions, ...lockfiles]);
    if (r.status === 0) return;
    const parsed = JSON.parse(r.stdout || "{}") as { results?: { packages?: { groups?: AdvisoryGroup[] }[] }[] };
    const groups = (parsed.results ?? []).flatMap((x) => (x.packages ?? []).flatMap((p) => p.groups ?? []));
    check("sca", r, topAdvisory(groups) ?? "osv-scanner error");
  },

  trace() {
    const ids = new Set(tracked("specs/*.md").flatMap((f) => requirementIds(readFileSync(f, "utf8"))));
    const log = git("log", "--format=%H%x1f%(trailers:key=Spec,valueonly,separator=%x2C)%x1e", "--", "src", "test");
    for (const entry of log.split("\x1e").map((e) => e.trim()).filter(Boolean)) {
      const values = (entry.split("\x1f")[1] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
      if (values.length === 0 || !values.every((v) => ids.has(v))) throw new GateFailure("trace", "missing Spec trailer");
    }
    const listed = tool(["node_modules/.bin/vitest", "list", "--json"]);
    if (listed.status !== 0) check("trace", listed, "vitest list error");
    const tests = (JSON.parse(listed.stdout) as { name: string }[]).map((t) => t.name).join("\n");
    const untested = [...ids].find((id) => !names(tests, id));
    if (untested !== undefined) throw new GateFailure("trace", `${untested} has no test`);
    for (const file of tracked("src/*.ts", "src/**/*.ts")) {
      const bad = exportsOf(readFileSync(file, "utf8")).find((e) => e.tags.length === 0 || !e.tags.every((t) => ids.has(t)));
      if (bad) throw new GateFailure("trace", `export ${bad.name} has no requirement`);
    }
  },

  signatures() {
    const log = git("log", "--reverse", "--topo-order", "--format=%H %P");
    let seen = false;
    for (const line of log.split("\n").filter(Boolean)) {
      const [commit = "", parent] = line.split(" ");
      const files = changedFiles(commit, parent);
      const paths = protectedPaths((parent ? show(parent, PROTECTED) : undefined) ?? "");
      const parentCopy = parent ? show(parent, "approvers.txt") : undefined;
      if (files.some((f) => f.startsWith("specs/") || f === "approvers.txt" || guardedBy(f, paths) !== undefined)) {
        const approvers = approversFor(parentCopy, show(commit, "approvers.txt"), seen);
        if (approvers === "" || !verifySigned(commit, approvers)) throw new GateFailure("signatures", signatureId(files, paths));
      }
      if (parentCopy !== undefined || files.includes("approvers.txt")) seen = true;
    }
  },

  async slides() {
    const { parse } = await import("yaml");
    const practices = parse(readFileSync("practices.yaml", "utf8")) as {
      source: { snapshot: string; sha256: string };
      practices: { id: string; slides: (number | string)[]; enforced_by: string[]; files: string[] }[];
    };
    const body = snapshotBody(readFileSync(practices.source.snapshot, "utf8"));
    if (sha256(body) !== practices.source.sha256) throw new GateFailure("slides", "snapshot hash");
    const slides = slideNumbers(body);
    for (const p of practices.practices) {
      const missing = p.slides.find((s) => !slides.has(String(s)));
      if (missing !== undefined) throw new GateFailure("slides", `${p.id} slide ${missing}`);
    }
    const scenarios = (parse(readFileSync("scenarios/scenarios.yaml", "utf8")) as { scenarios: { id: string }[] }).scenarios;
    const enforced = new Set(practices.practices.flatMap((p) => p.enforced_by));
    const orphan = scenarios.find((s) => !enforced.has(s.id));
    if (orphan) throw new GateFailure("slides", `${orphan.id} has no practice`);
    const absent = practices.practices.flatMap((p) => p.files).find((f) => !existsSync(f));
    if (absent !== undefined) throw new GateFailure("slides", absent);
  },

  ratchet() {
    const breakOf = (text: string | undefined): number => (JSON.parse(text ?? "{}") as { thresholds?: { break?: number } }).thresholds?.break ?? 0;
    const history = git("log", "--format=%H", "--", "stryker.config.json").split("\n").filter(Boolean);
    const highest = Math.max(0, ...history.map((c) => breakOf(show(c, "stryker.config.json"))));
    if (lowered(breakOf(readFileSync("stryker.config.json", "utf8")), highest)) {
      throw new GateFailure("ratchet", "break threshold lowered");
    }
  },

  test() {
    const dir = mkdtempSync(join(tmpdir(), "vitest-"));
    const out = join(dir, "results.json");
    try {
      const r = tool(["node_modules/.bin/vitest", "run", "--reporter=json", `--outputFile=${out}`]);
      if (r.status === 0) return;
      const results = existsSync(out) ? (JSON.parse(readFileSync(out, "utf8")) as { testResults: { name: string; status: string }[] }).testResults : [];
      check("test", r, first(failedTestFiles(results, process.cwd())) ?? "vitest error");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },

  mutation() {
    const r = tool(["node_modules/.bin/stryker", "run"]);
    check("mutation", r, mutationId(r.stdout + r.stderr));
  },

  attestation([artifact = "dist/function.zip"]) {
    const repo = process.env.GITHUB_REPOSITORY ?? "PaulDuvall/who-gets-the-keys";
    check("attestation", tool(attestationArgs(artifact, repo, process.env.GITHUB_SHA)), artifact);
  },

  irreversible([planJson = "plan.json"]) {
    const plan = JSON.parse(readFileSync(planJson, "utf8")) as Parameters<typeof destructiveChanges>[0];
    const address = first(destructiveChanges(plan));
    if (address === undefined) return;
    const approvers = existsSync("approvers.txt") ? readFileSync("approvers.txt", "utf8") : "";
    if (approvers === "" || !verifySigned("HEAD", approvers)) throw new GateFailure("irreversible", address);
  },

  async "practices-md"() {
    const { parse } = await import("yaml");
    const doc = parse(readFileSync("practices.yaml", "utf8")) as {
      practices: { id: string; practice: string; area: string; slides: unknown[]; coverage: string; enforced_by: string[]; reason?: string }[];
    };
    const rows = doc.practices.map((p) =>
      `| ${p.id} | ${p.practice} | ${p.area} | ${p.slides.join(", ")} | ${p.coverage} | ${p.enforced_by.join(", ") || "—"} | ${p.reason ?? ""} |`,
    );
    const header = ["# Practices", "", "Generated by `npm run practices` from `practices.yaml`. Do not edit.", "",
      "| ID | Practice | Area | Slides | Coverage | Enforced by | Reason |", "|---|---|---|---|---|---|---|"];
    writeFileSync("docs/practices.md", `${[...header, ...rows].join("\n")}\n`);
  },
};

export async function runGate(name: string, args: string[] = []): Promise<void> {
  const gate = gates[name];
  if (!gate) throw new Error(`unknown gate: ${name}`);
  await gate(args);
}

async function main(argv: string[]): Promise<number> {
  const [name, ...args] = argv;
  try {
    for (const gate of name ? [name] : ORDER) {
      await runGate(gate, args);
      if (!name) process.stderr.write(`gate ${gate} passed\n`);
    }
    return 0;
  } catch (err) {
    if (err instanceof GateFailure) {
      process.stdout.write(`${err.message}\n`);
      return 1;
    }
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv.slice(2));
