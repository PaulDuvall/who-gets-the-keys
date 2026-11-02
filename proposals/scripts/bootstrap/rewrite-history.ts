// Rewrites main's history in this clone before it is published to a new repository. Owner-run; never pushes.
// Removes Gmail addresses, the private deck's Drive ID, and every slide snapshot older than the current one
// (the private deck's slide text and speaker notes). Any other file version that quotes private deck text the
// tip no longer publishes is replaced by the tip's version, or removed if the tip no longer has that file.
// Text the tip still holds counts as public.
// In commit messages, private deck text is cut out in place and marked "[speaker-deck text removed]".
// Re-signs exactly the commits that were signed, keeps every author, committer and date, and updates
// commit SHAs quoted in commit messages. The tip's files must already be clean and stay byte-identical.
// Optional rules, kept outside the repository so the text they remove is never committed:
//   --replace <file>        lines "old==>new", applied in order to every file version and commit message
//   --drop-trailer <name>   removes every "<name>: ..." line from commit messages
// Usage: node scripts/bootstrap/rewrite-history.ts [--replace <file>]... [--drop-trailer <name>]... [--apply]
//   default  builds unsigned refs/rewrite/preview, checks it and reports; main is untouched
//   --apply  builds signed history, keeps the old tip at refs/rewrite/original and moves main
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SNAPSHOTS = ["specs/source-of-record/slides.txt", "proposals/source-of-record/slides.txt"];
const GMAIL = /[A-Za-z0-9._%+-]+@gmail\.com/gi;
const HAS_GMAIL = /[A-Za-z0-9._%+-]+@gmail\.com/i;
const IDENTITY = { author: /^author (.*) <(.*)> (\d+ [+-]\d{4})$/m, committer: /^committer (.*) <(.*)> (\d+ [+-]\d{4})$/m };
const ADDRESS = "approver@example.com";
const REDACTED_DECK = "REDACTED-PRIVATE-DECK";
const SHINGLE = 8;
const REMOVE = "";
const MIN_LINE = 20;

interface Entry { mode: string; type: string; blob: string; path: string }
interface Identity { name: string; email: string; date: string }
interface Original { sha: string; parent: string | undefined; tree: string; author: Identity; committer: Identity; message: string; signed: boolean }

let scratch = "";
const fail = (message: string): never => { if (scratch) rmSync(scratch, { recursive: true, force: true }); console.error(`rewrite-history: ${message}`); process.exit(1); };
const git = (args: string[], env?: NodeJS.ProcessEnv, input?: string): string =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28, ...(env ? { env } : {}), ...(input === undefined ? {} : { input }) }).trimEnd();

const blobs = new Map<string, Buffer>();
const blobBytes = (sha: string): Buffer => {
  let bytes = blobs.get(sha);
  if (!bytes) { bytes = execFileSync("git", ["cat-file", "blob", sha], { maxBuffer: 1 << 28 }); blobs.set(sha, bytes); }
  return bytes;
};
const writeBlob = (text: string): string => git(["hash-object", "-w", "--stdin"], undefined, text);

function entries(commit: string): Entry[] {
  return execFileSync("git", ["ls-tree", "-r", "-z", commit], { encoding: "utf8", maxBuffer: 1 << 28 }).split("\0").filter(Boolean).map((line) => {
    const tab = line.indexOf("\t");
    const [mode = "", type = "", blob = ""] = line.slice(0, tab).split(" ");
    return { mode, type, blob, path: line.slice(tab + 1) };
  });
}

function original(sha: string, parent: string | undefined): Original {
  const raw = git(["cat-file", "commit", sha]);
  const split = raw.indexOf("\n\n");
  const headers = raw.slice(0, split), message = `${raw.slice(split + 2)}\n`;
  if (/^encoding (?!utf-8$)/im.test(headers)) fail(`${sha} uses a non-UTF-8 message encoding`);
  const who = (kind: keyof typeof IDENTITY): Identity => {
    const m = IDENTITY[kind].exec(headers);
    if (!m) return fail(`${sha} has no ${kind} line`);
    return { name: m[1] ?? "", email: m[2] ?? "", date: m[3] ?? "" };
  };
  return { sha, parent, tree: /^tree (\S+)$/m.exec(headers)?.[1] ?? fail(`${sha} has no tree`), author: who("author"), committer: who("committer"),
    message, signed: /^gpgsig(-sha256)? /m.test(headers) };
}

const words = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
const windows = (list: string[]): string[] => list.length < SHINGLE ? [] : list.slice(0, list.length - SHINGLE + 1).map((_, i) => list.slice(i, i + SHINGLE).join(" "));

// Fingerprints of private deck text: 8-word windows of lines no tip file holds, and whole short lines. Lines the
// owner marked private in the notes are kept as hard markers that must not appear anywhere, the tip included.
export function privateMarkers(privateTexts: readonly string[], publicTexts: readonly string[], publicId: string) {
  const ids = new Set<string>();
  for (const text of privateTexts) {
    for (const m of text.matchAll(/(?:presentation\/d\/|drive-file-id: )([A-Za-z0-9_-]{20,})/g)) if (m[1] && m[1] !== publicId) ids.add(m[1]);
  }
  const publicLines = new Set(publicTexts.flatMap((t) => t.split("\n").map((l) => l.trim())));
  const publicWindows = new Set(publicTexts.flatMap((t) => windows(words(t))));
  const publicWords = publicTexts.map((t) => words(t).join(" ")).join("\n");
  const shingles = new Set<string>(), shortLines = new Set<string>(), hard = new Set<string>();
  for (const text of privateTexts) {
    for (const line of text.split("\n").map((l) => l.trim())) {
      if (/\(private\b|never say aloud/i.test(line)) hard.add(words(line).join(" "));
      if (line.length < MIN_LINE || publicLines.has(line)) continue;
      const w = words(line);
      if (w.length >= SHINGLE) for (const s of windows(w)) { if (!publicWindows.has(s)) shingles.add(s); }
      else if (w.length >= 4 && !publicWords.includes(w.join(" "))) shortLines.add(w.join(" "));
    }
  }
  return { ids: [...ids], shingles, shortLines: [...shortLines], hard: [...hard] };
}

export function leak(text: string, markers: ReturnType<typeof privateMarkers>): string | undefined {
  if (HAS_GMAIL.test(text)) return "a Gmail address";
  if (markers.ids.some((id) => text.includes(id))) return "the private deck's ID";
  const w = words(text);
  if (windows(w).some((s) => markers.shingles.has(s))) return "private deck text";
  const joined = w.join(" ");
  if (markers.hard.some((l) => joined.includes(l))) return "a speaker note marked private";
  if (markers.shortLines.some((l) => joined.includes(l))) return "private deck text";
  return undefined;
}

// Cuts every run of words that matches a private fingerprint out of a commit message, keeping the rest verbatim.
export function scrubText(text: string, markers: ReturnType<typeof privateMarkers>): { text: string; count: number } {
  const tokens = [...text.matchAll(/[A-Za-z0-9']+/g)].map((m) => ({ word: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length }));
  const marked = new Array<boolean>(tokens.length).fill(false);
  const key = (from: number, length: number) => tokens.slice(from, from + length).map((t) => t.word).join(" ");
  for (let i = 0; i + SHINGLE <= tokens.length; i++) if (markers.shingles.has(key(i, SHINGLE))) marked.fill(true, i, i + SHINGLE);
  for (const phrase of [...markers.shortLines, ...markers.hard]) {
    const length = phrase.split(" ").length;
    for (let i = 0; i + length <= tokens.length; i++) if (key(i, length) === phrase) marked.fill(true, i, i + length);
  }
  let out = "", at = 0, count = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (!marked[i] || marked[i - 1]) continue;
    let j = i;
    while (marked[j + 1]) j++;
    out += `${text.slice(at, tokens[i]?.start)}[speaker-deck text removed]`;
    at = tokens[j]?.end ?? at;
    count++;
  }
  return { text: out + text.slice(at), count };
}

export interface Rule { old: string; replacement: string }

export function parseRules(text: string): Rule[] {
  return text.split("\n").filter((line) => line.trim() !== "" && !line.startsWith("#")).map((line) => {
    const at = line.indexOf("==>");
    return at > 0 ? { old: line.slice(0, at), replacement: line.slice(at + 3) } : fail("a --replace line has no \"old==>new\" pair");
  });
}

export const applyRules = (text: string, rules: readonly Rule[]): string => rules.reduce((t, r) => t.split(r.old).join(r.replacement), text);

export function dropTrailers(message: string, names: readonly string[]): { text: string; count: number } {
  const lines = message.split("\n");
  const kept = lines.filter((line) => !names.some((name) => line.startsWith(`${name}: `)));
  return { text: kept.join("\n"), count: lines.length - kept.length };
}

// Says what a rule or trailer left behind, without echoing the removed text.
export function leftover(text: string, rules: readonly Rule[], names: readonly string[]): string | undefined {
  const rule = rules.findIndex((r) => text.includes(r.old));
  if (rule >= 0) return `text that replacement rule ${rule + 1} removes`;
  const name = names.find((n) => text.split("\n").some((line) => line.startsWith(`${n}: `)));
  return name ? `a "${name}:" trailer` : undefined;
}

export function remapShas(text: string, all: readonly string[], done: ReadonlyMap<string, string>): { text: string; count: number } {
  let count = 0;
  const out = text.replace(/\b[0-9a-f]{7,40}\b/g, (token) => {
    const hits = all.filter((sha) => sha.startsWith(token));
    const target = hits.length === 1 && hits[0] ? done.get(hits[0]) : undefined;
    if (!target) return token;
    count++;
    return target.slice(0, token.length);
  });
  return { text: out, count };
}

function main(): void {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const values = (flag: string): string[] => args.flatMap((a, i) => (a === flag ? [args[i + 1] ?? fail(`${flag} needs a value`)] : []));
  const unknown = args.find((a, i) => a.startsWith("--") && !["--apply", "--replace", "--drop-trailer"].includes(a) && !["--replace", "--drop-trailer"].includes(args[i - 1] ?? ""));
  if (unknown) fail(`unknown option ${unknown}`);
  const rules = values("--replace").flatMap((file) => parseRules(readFileSync(file, "utf8")));
  const trailers = values("--drop-trailer");
  scratch = mkdtempSync(join(tmpdir(), "rewrite-history-"));
  if (git(["status", "--porcelain"]) !== "") fail("the working tree is not clean");
  if (git(["rev-parse", "--abbrev-ref", "HEAD"]) !== "main") fail("check out main first");
  if (git(["rev-parse", "--is-shallow-repository"]) === "true") fail("the clone is shallow; run git fetch --unshallow");
  const oldTip = git(["rev-parse", "main"]);
  const chain = git(["rev-list", "--reverse", "--parents", "main"]).split("\n").map((l) => l.split(" "));
  if (chain.some((c) => c.length > 2)) fail("main has a merge commit; this script handles linear history only");
  const commits = chain.map(([sha = "", parent]) => original(sha, parent));
  const all = commits.map((c) => c.sha);

  const tipEntries = new Map(entries(oldTip).map((e) => [e.path, e]));
  const tipSnapshot = tipEntries.get(SNAPSHOTS[0] ?? "")?.blob ?? fail(`${SNAPSHOTS[0]} is missing at the tip`);
  const publicText = blobBytes(tipSnapshot).toString("utf8");
  const publicId = /^drive-file-id: (\S+)$/m.exec(publicText)?.[1] ?? fail("the current snapshot has no drive-file-id line");
  const listing = new Map(commits.map((c) => [c.sha, entries(c.sha)]));
  const privateSnapshots = new Set([...listing.values()].flat().filter((e) => SNAPSHOTS.includes(e.path) && e.blob !== tipSnapshot).map((e) => e.blob));
  const tipTexts = [...tipEntries.values()].filter((e) => e.type === "blob" && !blobBytes(e.blob).includes(0)).map((e) => blobBytes(e.blob).toString("utf8"));
  const markers = privateMarkers([...privateSnapshots].map((b) => blobBytes(b).toString("utf8")), tipTexts, publicId);
  const tipLeaks = [...tipEntries.values()].filter((e) => e.type === "blob" && !blobBytes(e.blob).includes(0))
    .map((e) => [e.path, leak(blobBytes(e.blob).toString("utf8"), markers)]).filter(([, why]) => why);
  const tipRuleHits = [...tipEntries.values()].filter((e) => e.type === "blob" && !blobBytes(e.blob).includes(0) && leftover(blobBytes(e.blob).toString("utf8"), rules, []));
  if (tipRuleHits.length) fail(`the current tip still holds text a replacement rule removes; clean it first: ${tipRuleHits.map((e) => e.path).join(", ")}`);
  if (tipLeaks.length) fail(`the current tip still holds private content; clean it first:\n${tipLeaks.map(([p, why]) => `  ${p}: ${why}`).join("\n")}`);

  const done = new Map<string, string>(), cache = new Map<string, string>();
  const tally = { snapshots: 0, scrubbed: 0, replacedByTip: new Map<string, number>(), removed: new Map<string, number>(), shaRefs: 0, messageCuts: 0, signed: 0,
    ruleFiles: 0, ruleMessages: 0, trailers: 0 };
  const index = join(scratch, "index"), messageFile = join(scratch, "message");
  const transform = (commit: string, e: Entry): string => {
    if (e.type !== "blob") return e.blob;
    if (SNAPSHOTS.includes(e.path)) { if (e.blob !== tipSnapshot) tally.snapshots++; return tipSnapshot; }
    const key = `${e.path}\0${e.blob}`;
    const known = cache.get(key);
    if (known) return known;
    const bytes = blobBytes(e.blob);
    let result = e.blob;
    if (!bytes.includes(0)) {
      const before = bytes.toString("utf8");
      let text = before.replace(GMAIL, ADDRESS);
      for (const id of markers.ids) text = text.split(id).join(REDACTED_DECK);
      const ruled = applyRules(text, rules);
      if (ruled !== text) tally.ruleFiles++;
      text = ruled;
      if (leak(text, markers)) {
        const tip = tipEntries.get(e.path);
        const counts = tip ? tally.replacedByTip : tally.removed;
        counts.set(e.path, (counts.get(e.path) ?? 0) + 1);
        result = tip?.blob ?? REMOVE;
      } else if (text !== before) {
        tally.scrubbed++;
        result = writeBlob(text);
      }
    }
    cache.set(key, result);
    return result;
  };

  let parent: string | undefined;
  for (const c of commits) {
    const changes = (listing.get(c.sha) ?? []).map((e) => ({ e, blob: transform(c.sha, e) })).filter(({ e, blob }) => blob !== e.blob);
    let tree = c.tree;
    if (changes.length) {
      const env = { ...process.env, GIT_INDEX_FILE: index };
      git(["read-tree", c.tree], env);
      for (const { e, blob } of changes) {
        if (blob === REMOVE) git(["update-index", "--force-remove", "--", e.path], env);
        else git(["update-index", "--cacheinfo", `${e.mode},${blob},${e.path}`], env);
      }
      tree = git(["write-tree"], env);
    }
    let message = c.message.replace(GMAIL, ADDRESS);
    for (const id of markers.ids) message = message.split(id).join(REDACTED_DECK);
    const ruledMessage = applyRules(message, rules);
    if (ruledMessage !== message) tally.ruleMessages++;
    const trimmed = dropTrailers(ruledMessage, trailers);
    tally.trailers += trimmed.count;
    message = trimmed.text;
    const remapped = remapShas(message, all, done);
    tally.shaRefs += remapped.count;
    const scrubbed = scrubText(remapped.text, markers);
    tally.messageCuts += scrubbed.count;
    message = scrubbed.text;
    const why = leak(message, markers) ?? leak(`${c.author.email} ${c.committer.email}`, markers);
    if (why) fail(`the message or identity of ${c.sha.slice(0, 7)} holds ${why}; this script does not rewrite those`);
    writeFileSync(messageFile, message);
    const sign = apply && c.signed;
    if (sign) tally.signed++;
    const env = { ...process.env, GIT_AUTHOR_NAME: c.author.name, GIT_AUTHOR_EMAIL: c.author.email, GIT_AUTHOR_DATE: c.author.date,
      GIT_COMMITTER_NAME: c.committer.name, GIT_COMMITTER_EMAIL: c.committer.email, GIT_COMMITTER_DATE: c.committer.date };
    if (sign) console.log(`signing ${c.sha.slice(0, 7)} ${c.message.split("\n")[0] ?? ""}`);
    parent = git(["commit-tree", tree, ...(parent ? ["-p", parent] : []), sign ? "-S" : "--no-gpg-sign", "-F", messageFile], env);
    done.set(c.sha, parent);
  }
  const newTip = parent ?? fail("main has no commits");

  const problems: string[] = [];
  if (git(["rev-parse", `${newTip}^{tree}`]) !== git(["rev-parse", `${oldTip}^{tree}`])) problems.push(`the tip's files changed: ${git(["diff", "--name-only", oldTip, newTip]).split("\n").join(", ")}`);
  const rewritten = git(["rev-list", newTip]).split("\n");
  if (rewritten.length !== commits.length) problems.push(`${rewritten.length} commits after the rewrite, ${commits.length} before`);
  const seen = new Set<string>();
  for (const sha of rewritten) {
    const body = git(["cat-file", "commit", sha]);
    const why = leak(body, markers) ?? leftover(body, rules, trailers);
    if (why) problems.push(`commit ${sha.slice(0, 7)} still holds ${why}`);
    for (const e of entries(sha)) {
      if (e.type !== "blob" || seen.has(e.blob)) continue;
      seen.add(e.blob);
      const bytes = blobBytes(e.blob);
      const found = bytes.includes(0) ? undefined : leak(bytes.toString("utf8"), markers) ?? leftover(bytes.toString("utf8"), rules, []);
      if (found) problems.push(`${e.path} in ${sha.slice(0, 7)} still holds ${found}`);
    }
  }
  const wasSigned = commits.filter((c) => c.signed).length;
  if (apply) {
    const signers = join(scratch, "allowed_signers");
    writeFileSync(signers, blobBytes(tipEntries.get("approvers.txt")?.blob ?? fail("approvers.txt is missing at the tip")));
    for (const c of commits.filter((x) => x.signed)) {
      try { execFileSync("git", ["-c", `gpg.ssh.allowedSignersFile=${signers}`, "verify-commit", done.get(c.sha) ?? ""], { stdio: "pipe" }); }
      catch { problems.push(`the new signature on ${c.sha.slice(0, 7)} does not verify against approvers.txt`); }
    }
  }
  writeFileSync(join(git(["rev-parse", "--git-dir"]), "rewrite-history-map.txt"), commits.map((c) => `${c.sha} ${done.get(c.sha) ?? ""}`).join("\n") + "\n");

  console.log(`commits: ${commits.length}; signed before: ${wasSigned}; ${apply ? `signed now: ${tally.signed}` : `would sign: ${wasSigned}`}`);
  console.log(`older slide snapshots replaced with the current one: ${tally.snapshots} (in ${privateSnapshots.size} distinct versions)`);
  console.log(`private deck IDs found: ${markers.ids.length}; private-text fingerprints: ${markers.shingles.size + markers.shortLines.length}; notes marked private: ${markers.hard.length}`);
  console.log(`file versions scrubbed in place: ${tally.scrubbed}; commit SHAs updated in messages: ${tally.shaRefs}; private passages cut from messages: ${tally.messageCuts}`);
  console.log(`replacement rules: ${rules.length}, applied in ${tally.ruleFiles} file versions and ${tally.ruleMessages} messages; trailer lines dropped: ${tally.trailers}`);
  for (const [path, n] of tally.replacedByTip) console.log(`replaced with the tip's version, because it quoted private deck text: ${path} (${n} versions)`);
  for (const [path, n] of tally.removed) console.log(`removed from history, because it quoted private deck text and the tip no longer has it: ${path} (${n} versions)`);
  if (problems.length) fail(`not applied:\n${problems.map((p) => `  ${p}`).join("\n")}`);
  if (apply) {
    git(["update-ref", "refs/rewrite/original", oldTip]);
    git(["update-ref", "refs/heads/main", newTip, oldTip]);
    console.log(`main is now ${newTip.slice(0, 7)}; the old tip is kept at refs/rewrite/original; the SHA map is in .git/rewrite-history-map.txt`);
  } else {
    git(["update-ref", "refs/rewrite/preview", newTip]);
    console.log(`preview: refs/rewrite/preview (${newTip.slice(0, 7)}), unsigned; main is unchanged. Run again with --apply to sign and move main.`);
  }
  rmSync(scratch, { recursive: true, force: true });
}

if (import.meta.url === `file://${process.argv[1]}`) main();
