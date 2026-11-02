// Rewrites main's history in this clone before it is published to a new repository. Owner-run; never pushes.
// Removes Gmail addresses, the private deck's Drive ID, and every slide snapshot older than the current one
// (the private deck's slide text and speaker notes). Any other file version that quotes private deck text the
// tip no longer publishes is replaced by the tip's version. Text the tip still holds counts as public.
// Re-signs exactly the commits that were signed, keeps every author, committer and date, and updates
// commit SHAs quoted in commit messages. The tip's files must already be clean and stay byte-identical.
// Usage: node scripts/bootstrap/rewrite-history.ts [--apply]
//   default  builds unsigned refs/rewrite/preview, checks it and reports; main is untouched
//   --apply  builds signed history, keeps the old tip at refs/rewrite/original and moves main
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SNAPSHOTS = ["specs/source-of-record/slides.txt", "proposals/source-of-record/slides.txt"];
const GMAIL = /[A-Za-z0-9._%+-]+@gmail\.com/gi;
const HAS_GMAIL = /[A-Za-z0-9._%+-]+@gmail\.com/i;
const IDENTITY = { author: /^author (.*) <(.*)> (\d+ [+-]\d{4})$/m, committer: /^committer (.*) <(.*)> (\d+ [+-]\d{4})$/m };
const ADDRESS = "approver@example.com";
const REDACTED_DECK = "REDACTED-PRIVATE-DECK";
const SHINGLE = 8;
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
  const apply = process.argv.includes("--apply");
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
  if (tipLeaks.length) fail(`the current tip still holds private content; clean it first:\n${tipLeaks.map(([p, why]) => `  ${p}: ${why}`).join("\n")}`);

  const done = new Map<string, string>(), cache = new Map<string, string>();
  const tally = { snapshots: 0, scrubbed: 0, replacedByTip: new Map<string, number>(), shaRefs: 0, signed: 0 };
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
      if (leak(text, markers)) {
        const tip = tipEntries.get(e.path);
        if (!tip) fail(`${e.path} in ${commit.slice(0, 7)} holds private deck text and no longer exists at the tip; remove it from history by hand`);
        tally.replacedByTip.set(e.path, (tally.replacedByTip.get(e.path) ?? 0) + 1);
        result = tip?.blob ?? e.blob;
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
      for (const { e, blob } of changes) git(["update-index", "--cacheinfo", `${e.mode},${blob},${e.path}`], env);
      tree = git(["write-tree"], env);
    }
    let message = c.message.replace(GMAIL, ADDRESS);
    for (const id of markers.ids) message = message.split(id).join(REDACTED_DECK);
    const remapped = remapShas(message, all, done);
    tally.shaRefs += remapped.count;
    message = remapped.text;
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
    const why = leak(git(["cat-file", "commit", sha]), markers);
    if (why) problems.push(`commit ${sha.slice(0, 7)} still holds ${why}`);
    for (const e of entries(sha)) {
      if (e.type !== "blob" || seen.has(e.blob)) continue;
      seen.add(e.blob);
      const bytes = blobBytes(e.blob);
      const found = bytes.includes(0) ? undefined : leak(bytes.toString("utf8"), markers);
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
  console.log(`file versions scrubbed in place: ${tally.scrubbed}; commit SHAs updated in messages: ${tally.shaRefs}`);
  for (const [path, n] of tally.replacedByTip) console.log(`replaced with the tip's version, because it quoted private deck text: ${path} (${n} versions)`);
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
