// Check dispatcher (SPEC-001-R1 to R18 and R190), and the task and scope checks (R64 to R68), which run outside ORDER.
// Usage: node scripts/checks.ts [check [args] | practices-md]; node scripts/checks.ts task|scope [<base commit>]
// No check imports a package before the install check has run, so the first three need only Node.js built-ins.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const ORDER = [
  "secrets", "allowlist", "workflows", "install", "lint", "typecheck", "iac",
  "sast", "sca", "trace", "ratchet", "signatures", "slides", "test", "mutation",
] as const;

export class CheckFailure extends Error {
  readonly check: string;
  readonly id: string;
  constructor(check: string, id: string) {
    super(`CHECK ${check} FAILED: ${id}`);
    this.check = check;
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

function mustPass(check: string, result: Result, id: string): void {
  if (result.status === 0) return;
  process.stderr.write(`${(result.stdout + result.stderr).slice(-4000)}\n`);
  throw new CheckFailure(check, id);
}

const git = (...args: string[]): string => tool(["git", ...args]).stdout;
const tracked = (...patterns: string[]): string[] => git("ls-files", "-z", "--", ...patterns).split("\0").filter(Boolean);

// Every committed lockfile for the sca check: npm lockfiles and the hash-pinned Python requirements.
export const lockfilePaths = (): string[] => tracked("package-lock.json", "**/package-lock.json", "requirements.txt", "**/requirements.txt");
const first = (ids: readonly string[]): string | undefined => [...ids].sort()[0];

// ---------- pure helpers, unit-tested in test/checks.test.ts ----------

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

// ---------- checks ----------

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

// Approver keys are meant to live on a FIDO2 security key (SPEC-001-R12). A signature from one carries flags the
// authenticator asserted for that signature alone: 0x01 user presence (a touch) and 0x04 user verification (a PIN).
// The flags are inside the signed data, so a verified signature's flags cannot be altered, but ssh-keygen -Y verify
// does not require them and allowed-signers files have no option that does. The signatures check reads them itself.
// This catches an approver's misconfigured key, such as one created with no-touch-required. It cannot prove that a
// key lives on hardware: whoever holds a key's private half chooses its flags. The control against the agent is the
// approver's private key on a device the agent cannot use (docs/decisions/0003-approver-key.md).
export const SECURITY_KEY_TYPES: readonly string[] = ["sk-ssh-ed25519@openssh.com", "sk-ecdsa-sha2-nistp256@openssh.com"];
export const SOFTWARE_KEY_TYPES: readonly string[] = ["ssh-ed25519", "ssh-rsa", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521"];
const FLAGGED = /^(?:sk-|webauthn-sk-)/;
const TOUCH_FLAG = 0x01, PIN_FLAG = 0x04;

// The flags every approver signature from a security key must assert (SPEC-001-R12).
// Owner decision, 2026-11-05, "Touch-only for now": the owner's security key refused to enroll any credential with
// -O verify-required ("requested feature not supported"). The probable cause, inferred and not verified, is that it
// lacks the CTAP 2.1 credProtect extension. Until the owner has a key that supports it, a touch (0x01) is enough.
// Setting this to 0x05 restores touch and PIN. The signatures check reads it as of each commit's parent, so the
// change binds only later commits. The touch flag is required whatever this holds.
export const REQUIRED_SIGNATURE_FLAGS: number = 0x01;

// Principal and key type of each approvers.txt line, read by position as sshsig.c does: principals, then an options
// token unless the next two tokens are a key type and a base64 key, then the key type.
export function approverKeys(approvers: string): { principal: string; keyType: string }[] {
  return approvers.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#")).map((line) => {
    const [principal = "", second = "", third = "", fourth = ""] = line.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
    const isKey = (type: string, key: string) => /^[a-z0-9.@-]+$/.test(type) && /^AAAA[A-Za-z0-9+/]*={0,2}$/.test(key);
    return { principal, keyType: isKey(second, third) ? second : isKey(third, fourth) ? third : "" };
  });
}

// The armored SSH signature in the one header git verify-commit checks: gpgsig in a SHA-1 repository, gpgsig-sha256 in
// a SHA-256 one. git leaves every other header starting with gpgsig out of the signed payload, so one there could
// carry another signature's flags. More than one such header, or a signature that is not an SSH signature, gives
// undefined, and the signatures check fails closed (SPEC-001-R12). Continuation lines come back unindented.
export function commitSignature(raw: string, objectFormat = "sha1"): string | undefined {
  const end = raw.indexOf("\n\n");
  const lines = (end < 0 ? raw : raw.slice(0, end)).split("\n");
  const name = objectFormat === "sha256" ? "gpgsig-sha256 " : "gpgsig ";
  const start = lines.findIndex((l) => l.startsWith(name));
  if (start < 0 || lines.filter((l) => l.startsWith("gpgsig")).length !== 1) return undefined;
  const out = [(lines[start] ?? "").slice(name.length)];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith(" ")) break;
    out.push(line.slice(1));
  }
  const armored = out.join("\n");
  return armored.startsWith("-----BEGIN SSH SIGNATURE-----") ? armored : undefined;
}

function sshReader(buf: Buffer) {
  let at = 0;
  const take = (n: number): Buffer => {
    if (at + n > buf.length) throw new RangeError("truncated SSH data");
    at += n;
    return buf.subarray(at - n, at);
  };
  const u32 = (): number => take(4).readUInt32BE(0);
  return { take, u32, byte: (): number => take(1).readUInt8(0), string: (): Buffer => take(u32()) };
}

export interface SshSignature { keyType: string; flags: number | undefined }

// Key type and, for a security key, the flags of an armored SSH signature (OpenSSH PROTOCOL.sshsig and PROTOCOL.u2f).
// Undefined when the text is not a well-formed SSH signature.
export function sshSignature(armored: string): SshSignature | undefined {
  try {
    const sig = sshReader(Buffer.from(armored.replace(/-----(?:BEGIN|END) SSH SIGNATURE-----/g, "").replace(/\s/g, ""), "base64"));
    if (sig.take(6).toString("latin1") !== "SSHSIG") return undefined;
    sig.u32();
    const keyType = sshReader(sig.string()).string().toString("latin1");
    sig.string();
    sig.string();
    sig.string();
    const inner = sshReader(sig.string());
    const sigType = inner.string().toString("latin1");
    inner.string();
    return { keyType, flags: FLAGGED.test(keyType) || FLAGGED.test(sigType) ? inner.byte() : undefined };
  } catch {
    return undefined;
  }
}

// SPEC-001-R12: an approver signature from a security key must assert every flag in `required`, and always a touch.
// A plain software key type carries no flags; whether it may approve is decided by the key types in approvers.txt.
// A signature that is unreadable, or of any other key type, fails closed.
export const lacksRequiredFlags = (sig: SshSignature | undefined, required = REQUIRED_SIGNATURE_FLAGS): boolean => {
  if (sig === undefined) return true;
  if (!SECURITY_KEY_TYPES.includes(sig.keyType)) return sig.flags !== undefined || !SOFTWARE_KEY_TYPES.includes(sig.keyType);
  const must = required | TOUCH_FLAG;
  return sig.flags === undefined || (sig.flags & must) !== must;
};

// Required flags in words, for the signatures failure identifier and the rotation script: "touch" or "touch and PIN".
export const flagWords = (required = REQUIRED_SIGNATURE_FLAGS): string =>
  ([[TOUCH_FLAG, "touch"], [PIN_FLAG, "PIN"]] as const).filter(([bit]) => ((required | TOUCH_FLAG) & bit) !== 0).map(([, word]) => word).join(" and ");

// REQUIRED_SIGNATURE_FLAGS in a copy of scripts/checks.ts, so each commit is judged by the rule as of its parent, as
// approvers.txt is (SPEC-001-R12). No copy, or no readable constant, requires the touch flag alone.
export function requiredFlagsIn(checksSource: string | undefined): number {
  const value = /^export const REQUIRED_SIGNATURE_FLAGS\b[^=\n]*=\s*(0x[0-9a-f]+|\d+)\s*;/im.exec(checksSource ?? "")?.[1];
  return (value === undefined ? 0 : Number(value)) | TOUCH_FLAG;
}

const COMMIT_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/**
 * The deploy-tip failure identifier, or undefined when `deployed` is main's tip. An older run approved after main moved
 * would deploy an older commit whose artifact still verifies, since it was attested when built. `remote` is the output
 * of `git ls-remote`, or undefined when main's tip could not be read. Only a line for exactly refs/heads/main counts.
 * None, more than one, or a SHA that is not 40 or 64 lowercase hex characters fails closed. @requirement SPEC-001-R190
 */
export function deployTipId(deployed: string, remote: string | undefined): string | undefined {
  const tips = (remote ?? "").split("\n").map((line) => line.split("\t")).filter(([, ref]) => ref === "refs/heads/main").map(([sha = ""]) => sha);
  return tips.length === 1 && COMMIT_SHA.test(deployed) && tips[0] === deployed ? undefined : (deployed.slice(0, 12) || "HEAD");
}

const MAIN = "refs/heads/main";
const CANDIDATE = /^refs\/heads\/candidate\/.+$/;
// A receipt field: one printable line with no control, format, line or paragraph separator, so it cannot end the summary fence or start a workflow command.
const ONE_LINE = /^[^\p{Cc}\p{Cf}\p{Zl}\p{Zp}]{1,200}$/u, SPEC_ID = /^SPEC-\d{3}-R\d+$/;

/** Predicate types every receipt needs; gh verifies one per call. A later slice reads them from the policy. @requirement SPEC-001-R50 */
export const RECEIPT_TYPES = ["https://slsa.dev/provenance/v1", "https://github.com/PaulDuvall/who-gets-the-keys/provenance/v2"] as const;

/**
 * gh attestation verify for one type, pinned exactly: pipeline.yml at `ref` as signer and source ref, a hosted runner, and
 * `sha` as source and signer digest. The store lists newest first; 1000 is gh's largest window. @requirement SPEC-001-R17 @requirement SPEC-001-R50
 */
export function pinArgs(artifact: string, repo: string, ref: string, sha: string | undefined, type: string = RECEIPT_TYPES[0]): string[] {
  return [
    "gh", "attestation", "verify", artifact, "--repo", repo,
    "--cert-identity", `https://github.com/${repo}/.github/workflows/pipeline.yml@${ref}`, "--source-ref", ref,
    "--deny-self-hosted-runners", "--predicate-type", type, "--limit", "1000",
    ...(sha ? ["--source-digest", sha, "--signer-digest", sha] : []),
  ];
}

/** SLSA provenance from pipeline.yml on main, before any AWS call. @requirement SPEC-001-R17 */
export const attestationArgs = (artifact: string, repo: string, sha: string | undefined): string[] => pinArgs(artifact, repo, MAIN, sha);

/** A run pins its own ref (main or a candidate branch), deploy always main; anything else fails before gh runs. @requirement SPEC-001-R50 @requirement SPEC-001-R56 */
export function receiptPin(mode: "run" | "deploy", ref: string | undefined, sha: string | undefined): { ref: string; sha: string } {
  const pinned = mode === "deploy" ? MAIN : ref ?? "";
  if (pinned !== MAIN && !CANDIDATE.test(pinned)) throw new CheckFailure("receipt", `unpinned ref ${pinned || "unset"}`);
  if (sha === undefined || !/^[0-9a-f]{40}$/.test(sha)) throw new CheckFailure("receipt", "unpinned commit");
  return { ref: pinned, sha };
}

/** SHA-256 of a file's raw bytes; `sha256` hashes UTF-8 text, which would alter a zip. @requirement SPEC-001-R50 */
export const fileSha256 = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");

const parsed = (json: string): unknown => { try { return JSON.parse(json); } catch { return undefined; } };
const lower = (v: unknown): string => (typeof v === "string" ? v.toLowerCase() : "");
interface Verification { statement?: { predicateType?: unknown; subject?: unknown; predicate?: unknown }; signature?: { certificate?: Record<string, unknown> } }

/**
 * The first verified entry in `gh attestation verify --format json` output with predicate type `type`, 64-hex subject `digest`, and
 * certificate source `commit` at `ref`. gh trusts the store's type filter, so this matches them all itself. @requirement SPEC-001-R50
 */
export function verifiedStatement(output: string, type: string, digest: string, commit: string, ref: string) {
  const entries = /^[0-9a-f]{64}$/i.test(digest) ? parsed(output) : undefined;
  for (const { statement, signature } of (Array.isArray(entries) ? entries : []).map((e: { verificationResult?: Verification } | null): Verification => e?.verificationResult ?? {})) {
    const subjects = (Array.isArray(statement?.subject) ? statement.subject : []) as ({ digest?: { sha256?: unknown } } | null)[];
    const certificate = signature?.certificate;
    if (statement?.predicateType === type && certificate?.["sourceRepositoryRef"] === ref && lower(certificate["sourceRepositoryDigest"]) === commit.toLowerCase()
      && subjects.some((s) => lower(s?.digest?.sha256) === digest.toLowerCase())) return { predicate: statement.predicate, certificate };
  }
  return undefined;
}

interface ReceiptRecord { commit: string; spec_ids: string[]; agent: string; model: string }

/** The record for `commit` in a verified provenance/v2 predicate, if its fields are safe lines and its model is `not recorded` (owner decision D3). @requirement SPEC-001-R45 @requirement SPEC-001-R55 */
export function receiptRecord(predicate: unknown, commit: string): ReceiptRecord | undefined {
  const commits = (predicate as { commits?: unknown } | null)?.commits;
  return (Array.isArray(commits) ? (commits as Partial<Record<keyof ReceiptRecord, unknown>>[]) : []).find((r): r is ReceiptRecord => r?.commit === commit
    && typeof r.agent === "string" && ONE_LINE.test(r.agent) && r.model === "not recorded" && Array.isArray(r.spec_ids) && r.spec_ids.every((id) => typeof id === "string" && SPEC_ID.test(id)));
}

/** The seven lines the reviewer reads, from verified statements only. The agent can edit the signer, so SIGNED says so. @requirement SPEC-001-R55 */
export function receiptLines(artifact: string, digest: string, record: ReceiptRecord, san: string, verified: number): string[] {
  const none = "none reported";
  return [
    ["COMMIT", record.commit.slice(0, 12)], ["FILES", `${artifact} sha256:${digest.slice(0, 12)}`],
    ["AGENT", record.agent === none ? none : `${record.agent} (as reported by the commit)`], ["MODEL", record.model],
    ["SPEC", record.spec_ids.join(", ") || none], ["SIGNED", `${san.replace(/^.*\/\.github\/workflows\//, "")} (editable by the agent)`],
    ["VERIFIED", `${verified}/${RECEIPT_TYPES.length} predicate types`],
  ].map(([label = "", value = ""]) => `${label.padEnd(8)} ${value}`);
}

// ---------- task files, and the scope of a task's commits (SPEC-001-R64 to R68) ----------

/** A task ID, which also names its file, tasks/<ID>.task.md. @requirement SPEC-001-R64 */
export const TASK_ID = /^TASK-[A-Z0-9-]{1,32}$/;
export const TASK_KEYS = ["requirements", "produces"] as const;
export const MAX_TASK_ENTRIES = 16;
// Paths no task may produce and no task's commit may touch, besides those specs/protected-paths.txt lists (SPEC-001-R64, R67).
export const RESERVED_PATHS: readonly string[] = ["specs/", "tasks/", "approvers.txt"];

export interface Task { id: string; requirements: string[]; produces: string[]; body: string }
export interface RangeCommit { sha: string; parent: string | undefined; tasks: string[]; specs: string[] }
export interface PathEntry { path: string; mode: string }

const gitIn = (cwd: string, ...args: string[]): Result => tool(["git", ...args], cwd);
const showIn = (cwd: string, rev: string, path: string): string | undefined => {
  const r = gitIn(cwd, "show", `${rev}:${path}`);
  return r.status === 0 ? r.stdout : undefined;
};

// A path or trailer value inside a failure identifier: as a JSON string when it holds a control character, so the
// failure stays one line and cannot start a workflow command.
const printable = (text: string): string => ([...text].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f) ? JSON.stringify(text) : text);

/** Compares two paths by their UTF-8 bytes, as git sorts them. @requirement SPEC-001-R67 */
export const byteOrder = (a: string, b: string): number => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));

/**
 * A YAML flow list on one line, "[a, b]", of plain entries: none empty, quoted, nested, or holding white space or a YAML
 * indicator. Anything else gives undefined, so the task check needs no YAML parser. @requirement SPEC-001-R64
 */
export function flowList(value: string): string[] | undefined {
  const inner = /^\[(.*)\]$/.exec(value)?.[1];
  if (inner === undefined) return undefined;
  const entries = inner.split(",").map((e) => e.trim());
  return entries.every((e) => /^[^\s"'`[\]{},#&*!|>%@?:]+$/.test(e)) ? entries : undefined;
}

/**
 * A relative repository path of letters, digits, ".", "_", "-" and "/", with no empty, "." or ".." segment and no leading
 * "-". A trailing "/" makes it a directory entry, which covers everything under it. @requirement SPEC-001-R64
 */
export const plainPath = (path: string): boolean =>
  /^(?!-)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\/?$/.test(path) && !path.split("/").some((s) => s === "." || s === "..");

// True when either entry covers the other: the same file, or a path under a directory entry.
const overlaps = (a: string, b: string): boolean => guardedBy(a, [b]) !== undefined || guardedBy(b, [a]) !== undefined;

/**
 * Parses a task file strictly and throws the task check's failure (SPEC-001-R64). The lines between a first line "---"
 * and the next "---" line are the front matter, each "<key>: <value>"; the rest is the body, the instruction.
 * `protectedList` is specs/protected-paths.txt at the base commit. @requirement SPEC-001-R64
 */
export function parseTask(id: string, text: string, protectedList: readonly string[] = []): Task {
  const failure = (what: string) => new CheckFailure("task", `${id} ${what}`);
  const lines = text.split("\n");
  const close = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  const values = new Map<string, string[]>();
  for (const line of close < 0 ? [] : lines.slice(1, close)) {
    const m = /^([^:\s]+):(.*)$/.exec(line);
    const key = m?.[1] ?? "";
    if (!(TASK_KEYS as readonly string[]).includes(key)) throw failure("unknown key");
    values.set(key, [...(values.get(key) ?? []), (m?.[2] ?? "").trim()]);
  }
  const list = (key: (typeof TASK_KEYS)[number], valid: (entry: string) => boolean): string[] => {
    const raw = values.get(key) ?? [];
    const entries = raw.length === 1 ? flowList(raw[0] ?? "") : undefined;
    if (entries === undefined || entries.length > MAX_TASK_ENTRIES || new Set(entries).size !== entries.length || !entries.every(valid)) {
      throw failure(`invalid ${key}`);
    }
    return entries;
  };
  const requirements = list("requirements", (e) => SPEC_ID.test(e));
  const produces = list("produces", (e) => plainPath(e) && ![...RESERVED_PATHS, ...protectedList].some((p) => overlaps(e, p)));
  const body = lines.slice(close + 1).join("\n");
  if (body.trim() === "") throw failure("empty body");
  return { id, requirements, produces, body };
}

/** Requirement IDs that a file under specs/ defines at `rev` (SPEC-001-R65). @requirement SPEC-001-R65 */
export function requirementIdsAt(rev: string, cwd = "."): Set<string> {
  const files = gitIn(cwd, "ls-tree", "-r", "-z", "--name-only", rev, "--", "specs/").stdout.split("\0").filter((f) => f.endsWith(".md"));
  return new Set(files.flatMap((f) => requirementIds(showIn(cwd, rev, f) ?? "")));
}

/**
 * Reads tasks/<ID>.task.md at `base` with git show only and checks it (SPEC-001-R64), then checks that specs/ at `base`
 * defines every requirement it cites, naming the first that is not (SPEC-001-R65). @requirement SPEC-001-R64 @requirement SPEC-001-R65
 */
export function readTask(id: string, base: string, cwd = "."): Task {
  if (!TASK_ID.test(id)) throw new CheckFailure("task", "invalid task id");
  const text = showIn(cwd, base, `tasks/${id}.task.md`);
  if (text === undefined) throw new CheckFailure("task", `${id} not found`);
  const task = parseTask(id, text, protectedPaths(showIn(cwd, base, PROTECTED) ?? ""));
  const defined = requirementIdsAt(base, cwd);
  const unapproved = task.requirements.find((r) => !defined.has(r));
  if (unapproved !== undefined) throw new CheckFailure("task", `${id} cites unapproved ${unapproved}`);
  return task;
}

/**
 * The base of the task and scope checks' range: the commit given, or the merge base of HEAD with main as last fetched,
 * refs/remotes/origin/main, or refs/heads/main where that is missing. Undefined when there is none. @requirement SPEC-001-R68
 */
export function rangeBase(given: string | undefined, cwd = "."): string | undefined {
  const commit = (rev: string): string | undefined => {
    const r = gitIn(cwd, "rev-parse", "--verify", "--quiet", "--end-of-options", `${rev}^{commit}`);
    return r.status === 0 ? r.stdout.trim() : undefined;
  };
  if (given !== undefined) return commit(given);
  const main = ["refs/remotes/origin/main", "refs/heads/main"].find((ref) => commit(ref) !== undefined);
  if (main === undefined) return undefined;
  const r = gitIn(cwd, "merge-base", "HEAD", main);
  return r.status === 0 ? r.stdout.trim() : undefined;
}

// A trailer field from git log: "Key: value" entries separated by 0x1d, or nothing. An empty value still counts as one.
const trailerValues = (field: string): string[] => (field === "" ? [] : field.split("\x1d").map((t) => t.replace(/^[^:]*:\s*/, "").trim()));

/** The commits after `base` up to HEAD, oldest first, with their first parent and their Task and Spec trailers. @requirement SPEC-001-R66 */
export function rangeCommits(base: string, cwd = "."): RangeCommit[] | undefined {
  const format = "--format=%H%x1f%P%x1f%(trailers:key=Task,unfold,separator=%x1d)%x1f%(trailers:key=Spec,unfold,separator=%x1d)%x1e";
  const r = gitIn(cwd, "log", "--reverse", "--topo-order", format, `${base}..HEAD`);
  if (r.status !== 0) return undefined;
  return r.stdout.split("\x1e").map((e) => e.replace(/^\n/, "")).filter((e) => e !== "").map((entry) => {
    const [sha = "", parents = "", tasks = "", specs = ""] = entry.split("\x1f");
    return { sha, parent: parents.split(" ")[0] || undefined, tasks: trailerValues(tasks), specs: trailerValues(specs) };
  });
}

/**
 * Every path a commit adds, changes or deletes against its first parent, with renames split into a delete and an add, and
 * the mode each leaves: the new mode, or the old one for a delete (SPEC-001-R67). @requirement SPEC-001-R67
 */
export function pathEntries(commit: string, parent: string | undefined, cwd = "."): PathEntry[] {
  const range = parent ? [parent, commit] : ["--root", commit];
  const parts = gitIn(cwd, "diff-tree", "-r", "--no-commit-id", "--raw", "--no-renames", "-z", ...range).stdout.split("\0");
  const out: PathEntry[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const [oldMode = "", newMode = "", , , status = ""] = (parts[i] ?? "").replace(/^:/, "").split(" ");
    const path = parts[i + 1] ?? "";
    if (path !== "") out.push({ path, mode: status.startsWith("D") ? oldMode : newMode });
  }
  return out;
}

/**
 * The scope failure for the paths a task's commits touch, or undefined (SPEC-001-R67). In byte order, a path fails if it is
 * reserved, protected at the base or outside the task's produces, and otherwise if it leaves a symlink or a gitlink.
 * @requirement SPEC-001-R67
 */
export function scopeFailure(entries: readonly PathEntry[], produces: readonly string[], protectedList: readonly string[]): string | undefined {
  for (const path of [...new Set(entries.map((e) => e.path))].sort(byteOrder)) {
    if (guardedBy(path, [...RESERVED_PATHS, ...protectedList]) !== undefined || guardedBy(path, produces) === undefined) return printable(path);
    const link = entries.find((e) => e.path === path && (e.mode === "120000" || e.mode === "160000"));
    if (link) return `${printable(path)} mode ${link.mode}`;
  }
  return undefined;
}

function taskRange(check: string, args: readonly string[], cwd: string): { base: string; commits: RangeCommit[] } {
  const base = rangeBase(args[0], cwd);
  const commits = base === undefined ? undefined : rangeCommits(base, cwd);
  if (base === undefined || commits === undefined) throw new CheckFailure(check, "no merge base");
  return { base, commits };
}

/** The task check: each task a Task trailer in the range names, in the order first named, at the range's base. @requirement SPEC-001-R68 */
export function taskCheck(args: readonly string[], cwd = "."): void {
  const { base, commits } = taskRange("task", args, cwd);
  for (const id of new Set(commits.flatMap((c) => c.tasks))) readTask(id, base, cwd);
}

/**
 * The scope check: only the range's commits that carry a Task trailer, all naming one task, judged against that task at
 * the base (SPEC-001-R66, R67). @requirement SPEC-001-R66 @requirement SPEC-001-R67 @requirement SPEC-001-R68
 */
export function scopeCheck(args: readonly string[], cwd = "."): void {
  const { base, commits } = taskRange("scope", args, cwd);
  const tasked = commits.filter((c) => c.tasks.length > 0);
  if (tasked.length === 0) return;
  const ids = new Set(tasked.flatMap((c) => c.tasks));
  const [id = ""] = ids;
  if (ids.size !== 1 || tasked.some((c) => c.tasks.length !== 1)) throw new CheckFailure("scope", "mixed Task trailers");
  const task = readTask(id, base, cwd);
  const stray = tasked.flatMap((c) => c.specs).find((s) => !task.requirements.includes(s));
  if (stray !== undefined) throw new CheckFailure("scope", `Spec ${printable(stray)} not in ${task.id}`);
  const protectedList = protectedPaths(showIn(cwd, base, PROTECTED) ?? "");
  const failure = scopeFailure(tasked.flatMap((c) => pathEntries(c.sha, c.parent, cwd)), task.produces, protectedList);
  if (failure !== undefined) throw new CheckFailure("scope", failure);
}

const show = (rev: string, path: string): string | undefined => {
  const r = tool(["git", "show", `${rev}:${path}`]);
  return r.status === 0 ? r.stdout : undefined;
};

const checks: Record<string, (args: string[]) => void | Promise<void>> = {
  secrets() {
    const dir = mkdtempSync(join(tmpdir(), "gitleaks-"));
    const report = join(dir, "report.json");
    try {
      const r = tool([...COMMANDS.secrets, "--report-path", report]);
      if (r.status === 0) return;
      const findings = existsSync(report) ? (JSON.parse(readFileSync(report, "utf8")) as { RuleID: string }[]) : [];
      mustPass("secrets", r, first(findings.map((f) => f.RuleID)) ?? "gitleaks error");
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
    if (name !== undefined) throw new CheckFailure("allowlist", name);
  },

  workflows() {
    const r = tool(COMMANDS.workflows);
    if (r.status !== 0) {
      const findings = (r.stdout.trim().startsWith("[") ? JSON.parse(r.stdout) : []) as { ident: string }[];
      mustPass("workflows", r, first(findings.map((f) => f.ident)) ?? "zizmor error");
    }
    if (pipelineCacheFinding(readFileSync(".github/workflows/pipeline.yml", "utf8"))) throw new CheckFailure("workflows", "deploy-cache");
    const triage = readFileSync(".github/workflows/issue-triage.yml", "utf8");
    const replay = readFileSync(".github/workflows/scenarios.yml", "utf8");
    for (const key of ["permissions", "env"]) {
      const a = jobBlock(triage, "triage", key);
      const b = jobBlock(replay, "b9-replay", key);
      if (a.length === 0 || a.join("\n") !== b.join("\n")) throw new CheckFailure("workflows", "replay-parity");
    }
  },

  install() {
    mustPass("install", tool(COMMANDS.install), "package-lock.json");
  },

  lint() {
    const r = tool(["node_modules/.bin/eslint", ".", "--format", "json"]);
    if (r.status === 0) return;
    const files = (JSON.parse(r.stdout || "[]") as { filePath: string; messages: { ruleId: string | null; severity: number }[] }[]);
    const ids = files.flatMap((f) => f.messages.filter((m) => m.severity === 2).map((m) => m.ruleId ?? "parse-error"));
    mustPass("lint", r, first(ids) ?? "eslint error");
  },

  typecheck() {
    const r = tool(["node_modules/.bin/tsc", "--noEmit", "-p", "."]);
    mustPass("typecheck", r, /^([^\s(]+)\(\d+,\d+\): error/m.exec(r.stdout)?.[1] ?? "tsc error");
  },

  iac() {
    for (const dir of ["infra/sandbox", "infra/org"]) {
      mustPass("iac", tool(["terraform", "fmt", "-check", "-recursive"], dir), dir);
      mustPass("iac", tool(["terraform", "init", "-backend=false", "-input=false", "-no-color"], dir), dir);
      mustPass("iac", tool(["terraform", "validate", "-no-color"], dir), dir);
      const config = join(process.cwd(), ".tflint.hcl");
      mustPass("iac", tool(["tflint", "--init", "--config", config], dir), dir);
      mustPass("iac", tool(["tflint", "--no-color", "--config", config], dir), dir);
    }
  },

  sast() {
    const r = tool(COMMANDS.sast);
    if (r.status === 0) return;
    const results = (JSON.parse(r.stdout || "{}") as { results?: { check_id: string }[] }).results ?? [];
    mustPass("sast", r, first(results.map((x) => x.check_id)) ?? "semgrep error");
  },

  sca() {
    const lockfiles = lockfilePaths().flatMap((l) => ["-L", l]);
    const exceptions = existsSync("specs/sca-exceptions.toml") ? ["--config", "specs/sca-exceptions.toml"] : [];
    const r = tool([...COMMANDS.sca, ...exceptions, ...lockfiles]);
    if (r.status === 0) return;
    const parsed = JSON.parse(r.stdout || "{}") as { results?: { packages?: { groups?: AdvisoryGroup[] }[] }[] };
    const groups = (parsed.results ?? []).flatMap((x) => (x.packages ?? []).flatMap((p) => p.groups ?? []));
    mustPass("sca", r, topAdvisory(groups) ?? "osv-scanner error");
  },

  trace() {
    const ids = new Set(tracked("specs/*.md").flatMap((f) => requirementIds(readFileSync(f, "utf8"))));
    const log = git("log", "--format=%H%x1f%(trailers:key=Spec,valueonly,separator=%x2C)%x1e", "--", "src", "test");
    for (const entry of log.split("\x1e").map((e) => e.trim()).filter(Boolean)) {
      const values = (entry.split("\x1f")[1] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
      if (values.length === 0 || !values.every((v) => ids.has(v))) throw new CheckFailure("trace", "missing Spec trailer");
    }
    const listed = tool(["node_modules/.bin/vitest", "list", "--json"]);
    if (listed.status !== 0) mustPass("trace", listed, "vitest list error");
    const tests = (JSON.parse(listed.stdout) as { name: string }[]).map((t) => t.name).join("\n");
    const untested = [...ids].find((id) => !names(tests, id));
    if (untested !== undefined) throw new CheckFailure("trace", `${untested} has no test`);
    for (const file of tracked("src/*.ts", "src/**/*.ts")) {
      const bad = exportsOf(readFileSync(file, "utf8")).find((e) => e.tags.length === 0 || !e.tags.every((t) => ids.has(t)));
      if (bad) throw new CheckFailure("trace", `export ${bad.name} has no requirement`);
    }
  },

  signatures() {
    const log = git("log", "--reverse", "--topo-order", "--format=%H %P");
    const format = git("rev-parse", "--show-object-format").trim();
    let seen = false;
    for (const line of log.split("\n").filter(Boolean)) {
      const [commit = "", parent] = line.split(" ");
      const files = changedFiles(commit, parent);
      const paths = protectedPaths((parent ? show(parent, PROTECTED) : undefined) ?? "");
      const parentCopy = parent ? show(parent, "approvers.txt") : undefined;
      if (files.some((f) => f.startsWith("specs/") || f === "approvers.txt" || guardedBy(f, paths) !== undefined)) {
        const approvers = approversFor(parentCopy, show(commit, "approvers.txt"), seen);
        if (approvers === "" || !verifySigned(commit, approvers)) throw new CheckFailure("signatures", signatureId(files, paths));
        const required = requiredFlagsIn(parent ? show(parent, "scripts/checks.ts") : undefined);
        if (lacksRequiredFlags(sshSignature(commitSignature(git("cat-file", "commit", commit), format) ?? ""), required)) {
          throw new CheckFailure("signatures", `approver signature without ${flagWords(required)}: ${commit.slice(0, 12)}`);
        }
      }
      if (parentCopy !== undefined || files.includes("approvers.txt")) seen = true;
    }
    const software = approverKeys(show("HEAD", "approvers.txt") ?? "").find((k) => !SECURITY_KEY_TYPES.includes(k.keyType));
    if (software) throw new CheckFailure("signatures", `approver key is not a security key: ${software.principal}`);
  },

  async slides() {
    const { parse } = await import("yaml");
    const practices = parse(readFileSync("practices.yaml", "utf8")) as {
      source: { snapshot: string; sha256: string };
      practices: { id: string; slides: (number | string)[]; enforced_by: string[]; files: string[] }[];
    };
    const body = snapshotBody(readFileSync(practices.source.snapshot, "utf8"));
    if (sha256(body) !== practices.source.sha256) throw new CheckFailure("slides", "snapshot hash");
    const slides = slideNumbers(body);
    for (const p of practices.practices) {
      const missing = p.slides.find((s) => !slides.has(String(s)));
      if (missing !== undefined) throw new CheckFailure("slides", `${p.id} slide ${missing}`);
    }
    const scenarios = (parse(readFileSync("scenarios/scenarios.yaml", "utf8")) as { scenarios: { id: string }[] }).scenarios;
    const enforced = new Set(practices.practices.flatMap((p) => p.enforced_by));
    const orphan = scenarios.find((s) => !enforced.has(s.id));
    if (orphan) throw new CheckFailure("slides", `${orphan.id} has no practice`);
    const absent = practices.practices.flatMap((p) => p.files).find((f) => !existsSync(f));
    if (absent !== undefined) throw new CheckFailure("slides", absent);
  },

  ratchet() {
    const breakOf = (text: string | undefined): number => (JSON.parse(text ?? "{}") as { thresholds?: { break?: number } }).thresholds?.break ?? 0;
    const history = git("log", "--format=%H", "--", "stryker.config.json").split("\n").filter(Boolean);
    const highest = Math.max(0, ...history.map((c) => breakOf(show(c, "stryker.config.json"))));
    if (lowered(breakOf(readFileSync("stryker.config.json", "utf8")), highest)) {
      throw new CheckFailure("ratchet", "break threshold lowered");
    }
  },

  test() {
    const dir = mkdtempSync(join(tmpdir(), "vitest-"));
    const out = join(dir, "results.json");
    try {
      const r = tool(["node_modules/.bin/vitest", "run", "--reporter=json", `--outputFile=${out}`]);
      if (r.status === 0) return;
      const results = existsSync(out) ? (JSON.parse(readFileSync(out, "utf8")) as { testResults: { name: string; status: string }[] }).testResults : [];
      mustPass("test", r, first(failedTestFiles(results, process.cwd())) ?? "vitest error");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },

  mutation() {
    const r = tool(["node_modules/.bin/stryker", "run"]);
    mustPass("mutation", r, mutationId(r.stdout + r.stderr));
  },

  // Outside ORDER: the checks job runs these two after npm run checks, over the range from the merge base with main (SPEC-001-R68).
  task(args) {
    taskCheck(args);
  },

  scope(args) {
    scopeCheck(args);
  },

  // Run first in the deploy job: main's tip is read from the remote, and an unreadable tip fails closed (SPEC-001-R190).
  "deploy-tip"() {
    const deployed = process.env.GITHUB_SHA || git("rev-parse", "--verify", "--quiet", "HEAD^{commit}").trim();
    const r = spawnSync("git", ["ls-remote", "origin", "refs/heads/main"], { encoding: "utf8", timeout: 60_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    const id = deployTipId(deployed, r.status === 0 ? r.stdout : undefined);
    if (id === undefined) return;
    const said = r.status === 0 ? r.stdout.trim() || "no refs/heads/main" : String(r.error ?? r.stderr.trim());
    process.stderr.write(`deploy-tip: only main's tip deploys. This run's commit is ${deployed || "unreadable"}. git ls-remote origin said: ${said.slice(-4000)}\n`);
    throw new CheckFailure("deploy-tip", id);
  },

  attestation([artifact = "dist/function.zip"]) {
    const repo = process.env.GITHUB_REPOSITORY ?? "PaulDuvall/who-gets-the-keys";
    mustPass("attestation", tool(attestationArgs(artifact, repo, process.env.GITHUB_SHA)), artifact);
  },

  receipt([artifact = "dist/function.zip", mode = "run"]) {
    if (mode !== "run" && mode !== "deploy") throw new Error(`unknown receipt mode: ${mode}`);
    const repo = process.env.GITHUB_REPOSITORY ?? "PaulDuvall/who-gets-the-keys";
    const pin = receiptPin(mode, process.env.GITHUB_REF, process.env.GITHUB_SHA);
    const digest = existsSync(artifact) ? fileSha256(artifact) : "";
    const verified = RECEIPT_TYPES.map((type) => {
      const r = tool([...pinArgs(artifact, repo, pin.ref, pin.sha, type), "--format", "json"]);
      mustPass("receipt", r, `missing ${type}`);
      const statement = verifiedStatement(r.stdout, type, digest, pin.sha, pin.ref);
      process.stderr.write(statement ? `receipt: verified ${type}: ${JSON.stringify(statement.certificate)}\n` : `${r.stdout.slice(0, 4000)}\n`);
      if (!statement) throw new CheckFailure("receipt", `missing ${type}`);
      return statement;
    });
    const record = receiptRecord(verified[1]?.predicate, pin.sha), san = verified[1]?.certificate["subjectAlternativeName"];
    if (!record) throw new CheckFailure("receipt", `missing ${RECEIPT_TYPES[1]}`);
    const lines = receiptLines(artifact, digest, record, typeof san === "string" ? san : "", verified.length);
    process.stdout.write(`${lines.join("\n")}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, ["## Receipt", "", "```text", ...lines, "```", ""].join("\n"), { flag: "a" });
  },

  irreversible([planJson = "plan.json"]) {
    const plan = JSON.parse(readFileSync(planJson, "utf8")) as Parameters<typeof destructiveChanges>[0];
    const address = first(destructiveChanges(plan));
    if (address === undefined) return;
    const approvers = existsSync("approvers.txt") ? readFileSync("approvers.txt", "utf8") : "";
    if (approvers === "" || !verifySigned("HEAD", approvers)) throw new CheckFailure("irreversible", address);
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

export async function runCheck(name: string, args: string[] = []): Promise<void> {
  const check = checks[name];
  if (!check) throw new Error(`unknown check: ${name}`);
  await check(args);
}

async function main(argv: string[]): Promise<number> {
  const [name, ...args] = argv;
  try {
    for (const check of name ? [name] : ORDER) {
      await runCheck(check, args);
      if (!name) process.stderr.write(`check ${check} passed\n`);
    }
    return 0;
  } catch (err) {
    if (err instanceof CheckFailure) {
      process.stdout.write(`${err.message}\n`);
      return 1;
    }
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv.slice(2));
