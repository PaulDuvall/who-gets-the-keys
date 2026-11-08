import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// scripts/bootstrap/land.sh tests the moved tree before it asks to sign, and says where to approve the deploy and why a
// run failed (SPEC-001-R213). These tests stop before any signature, or use --to-main, which signs nothing, so they need
// no signing key. Each runs land.sh against a temporary clone with a local bare origin and stub gh, node, npm and npx.
const script = join(process.cwd(), "scripts/bootstrap/land.sh");
const TIMEOUT = 60_000;

// gh: logs every call, answers auth status, prints run 101 for a candidate branch and 202 for main, exits 1 from run
// watch for each run in STUB_FAIL, and answers run view from STUB_URL, the file STUB_JOBS, and the file STUB_STATES,
// whose first line it prints and drops each time, keeping the last.
const stubGh = [
  "#!/usr/bin/env bash",
  'printf "gh %s\\n" "$*" >> "$STUB_DIR/calls"',
  'case "$1 ${2:-}" in',
  '  "auth status") exit 0 ;;',
  '  "run list") branch=""; while [ $# -gt 0 ]; do [ "$1" = --branch ] && branch="$2"; shift; done',
  '    if [ "$branch" = main ]; then echo 202; else echo 101; fi; exit 0 ;;',
  '  "run watch") echo "watching $3" >> "$STUB_DIR/events"; case " ${STUB_FAIL:-} " in *" $3 "*) exit 1 ;; esac; exit 0 ;;',
  '  "run view")',
  '    case "$*" in',
  '      *"--json url "*) [ -n "${STUB_URL:-}" ] || exit 1; echo "$STUB_URL" ;;',
  '      *"--json status,jobs "*) [ -n "${STUB_STATES:-}" ] || exit 1; s="$(head -n 1 "$STUB_STATES")"; echo "state $s" >> "$STUB_DIR/events"; echo "$s"',
  '        if [ "$(wc -l < "$STUB_STATES" | tr -d " ")" -gt 1 ]; then tail -n +2 "$STUB_STATES" > "$STUB_STATES.next" && mv "$STUB_STATES.next" "$STUB_STATES"; fi ;;',
  '      *"--json jobs "*) [ -n "${STUB_JOBS:-}" ] || exit 1; cat "$STUB_JOBS" ;;',
  "      *) exit 1 ;;",
  "    esac; exit 0 ;;",
  "esac",
  'echo "unexpected gh call: $*" >&2',
  "exit 2",
  "",
].join("\n");

// node, npm and npx: land.sh runs the preflight's steps from an empty environment, so these find their settings in files
// beside them, not in variables. node --version prints the file node-version. Every other call is logged with the
// directory it ran in, what that directory holds and the variables it got, and fails when its command line contains
// the text in the file fail-step.
const stubTool = [
  "#!/usr/bin/env bash",
  'STUB_DIR="$(cd "$(dirname "$0")" && pwd)"',
  'name="$(basename "$0")"',
  'if [ "$name $*" = "node --version" ]; then cat "$STUB_DIR/node-version" 2>/dev/null || echo v24.22.2; exit 0; fi',
  'printf "%s %s @ %s\\n" "$name" "$*" "$(pwd -P)" >> "$STUB_DIR/calls"',
  'printf "%s|%s|%s\\n" "$name $*" "$(cat docs/b.md 2>/dev/null)" "$([ -e proposals/batch/LAND.txt ] && echo manifest)" >> "$STUB_DIR/seen"',
  'printf "%s|%s|%s|%s\\n" "${GIT_LITERAL_PATHSPECS-unset}" "${SSH_AUTH_SOCK-unset}" "${AWS_PROFILE-unset}" "$HOME" >> "$STUB_DIR/envs"',
  'fail="$(cat "$STUB_DIR/fail-step" 2>/dev/null || true)"',
  'if [ -n "$fail" ]; then case "$name $*" in *"$fail"*) echo "stub failure: $name $*"; exit 1 ;; esac; fi',
  "exit 0",
  "",
].join("\n");

const BASE: Record<string, string> = {
  "package.json": '{\n  "name": "t",\n  "engines": {\n    "node": ">=24.11.0 <25"\n  }\n}\n',
  "specs/SPEC-001-delivery-pipeline.md": "| ID | Requirement |\n|---|---|\n| SPEC-001-R41 | main only moves to a commit on which checks passed. |\n",
  "docs/b.md": "one\ntwo\n",
  "docs/c.md": "three\n",
  // S1 touches a moved file and applies after the move; S2 touches only an unmoved file.
  "scenarios/S1.patch": "--- a/docs/b.md\n+++ b/docs/b.md\n@@ -1,2 +1,2 @@\n one\n-two, staged\n+two, patched\n",
  "scenarios/S2.patch": "--- a/docs/c.md\n+++ b/docs/c.md\n@@ -1 +1 @@\n-three\n+three, patched\n",
};
const BATCH: Record<string, string> = {
  "proposals/batch/LAND.txt": "message: spec: land the test batch\nspec: SPEC-001-R41\nmove: b.md docs/b.md\nmove: a.ts src/a.ts\n",
  "proposals/batch/b.md": "one\ntwo, staged\n",
  "proposals/batch/a.ts": "export const a = 1;\n",
};

interface Repo { work: string; origin: string; stub: string; env: NodeJS.ProcessEnv }
interface Result { status: number | null; out: string; calls: string[]; seen: string[] }

describe("SPEC-001-R213 land.sh tests the moved tree before it asks to sign, and explains main's run", () => {
  let scratch = "";
  beforeAll(() => { scratch = mkdtempSync(join(tmpdir(), "land-presign-")); });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  const write = (root: string, files: Record<string, string>) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
  };
  const git = (repo: Repo, ...args: string[]): string => execFileSync("git", args, { cwd: repo.work, env: repo.env, encoding: "utf8" }).trim();
  const lines = (file: string): string[] => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : []);

  function makeRepo(files: Record<string, string> = BATCH): Repo {
    const dir = mkdtempSync(join(scratch, "repo-"));
    const repo: Repo = {
      work: join(dir, "work"), origin: join(dir, "origin.git"), stub: join(dir, "stub"),
      env: {
        ...process.env, HOME: join(dir, "home"), GIT_CONFIG_GLOBAL: join(dir, "gitconfig"), GIT_CONFIG_NOSYSTEM: "1", TMPDIR: join(dir, "tmp"),
        PATH: `${join(dir, "stub")}:${process.env["PATH"] ?? ""}`, STUB_DIR: join(dir, "stub"), LAND_POLL_SECONDS: "0",
      },
    };
    for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "SSH_AUTH_SOCK", "STUB_FAIL_STEP", "STUB_NODE_VERSION"]) delete repo.env[name];
    for (const path of [repo.stub, join(dir, "home"), join(dir, "tmp")]) mkdirSync(path);
    writeFileSync(join(dir, "gitconfig"), "");
    writeFileSync(join(repo.stub, "gh"), stubGh);
    for (const name of ["node", "npm", "npx"]) writeFileSync(join(repo.stub, name), stubTool);
    for (const name of ["gh", "node", "npm", "npx"]) chmodSync(join(repo.stub, name), 0o755);
    execFileSync("git", ["init", "-q", "--bare", "-b", "main", repo.origin], { env: repo.env });
    execFileSync("git", ["init", "-q", "-b", "main", repo.work], { env: repo.env });
    // Signing is configured but never reached: every land-mode test answers no at the signing prompt.
    const config = { "user.name": "Owner", "user.email": "owner@example.com", "gpg.format": "ssh", "user.signingkey": join(dir, "no-such-key"), "commit.gpgsign": "false" };
    for (const [key, value] of Object.entries(config)) git(repo, "config", key, value);
    git(repo, "remote", "add", "origin", repo.origin);
    write(repo.work, { ...BASE, ...files });
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "init");
    git(repo, "push", "-q", "-u", "origin", "main");
    return repo;
  }

  function land(repo: Repo, args: string[], input: string, extra: NodeJS.ProcessEnv = {}): Result {
    rmSync(join(repo.stub, "calls"), { force: true });
    rmSync(join(repo.stub, "seen"), { force: true });
    rmSync(join(repo.stub, "events"), { force: true });
    rmSync(join(repo.stub, "envs"), { force: true });
    for (const [key, file] of [["STUB_FAIL_STEP", "fail-step"], ["STUB_NODE_VERSION", "node-version"]] as const) {
      const value = extra[key];
      if (value === undefined) rmSync(join(repo.stub, file), { force: true });
      else writeFileSync(join(repo.stub, file), `${value}\n`);
    }
    const r = spawnSync("bash", [script, ...args], { cwd: repo.work, env: { ...repo.env, ...extra }, input, encoding: "utf8", timeout: TIMEOUT });
    const calls = lines(join(repo.stub, "calls")).filter((c) => !c.startsWith("gh "));
    return { status: r.status, out: `${r.stdout}${r.stderr}`, calls, seen: lines(join(repo.stub, "seen")) };
  }

  function expectUnchanged(repo: Repo, head: string) {
    expect(git(repo, "rev-parse", "HEAD")).toBe(head);
    expect(git(repo, "status", "--porcelain")).toBe("");
    expect(git(repo, "worktree", "list", "--porcelain").split("\n").filter((l) => l.startsWith("worktree "))).toHaveLength(1);
  }

  it("SPEC-001-R213 runs npm ci, tsc, ESLint on the moved code, every test and the trace check in a worktree of the moved tree, then asks", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const head = git(repo, "rev-parse", "HEAD");
    const r = land(repo, ["proposals/batch"], "n\nn\n", { SSH_AUTH_SOCK: "/tmp/agent.sock", AWS_PROFILE: "admin" });
    expect(r.status).toBe(1);
    expect(r.out).toContain("You chose not to sign.");
    // After the review, before the signature, and from an empty environment: none of land.sh's or the owner's variables.
    const pager = r.out.indexOf("Show the full diff in a pager? [y/N]");
    expect(pager).toBeGreaterThan(-1);
    expect(pager).toBeLessThan(r.out.indexOf("Preflight: testing the moved tree"));
    const envs = lines(join(repo.stub, "envs"));
    expect(envs).toHaveLength(5);
    for (const e of envs) expect(e).toMatch(/^unset\|unset\|unset\|\S+\/home$/);
    const at = r.calls.map((c) => c.split(" @ "));
    const dirs = [...new Set(at.map(([, dir]) => dir))];
    expect(dirs).toHaveLength(1);
    expect(dirs[0]).not.toBe(execFileSync("pwd", ["-P"], { cwd: repo.work, encoding: "utf8" }).trim());
    expect(at.map(([command]) => command)).toEqual([
      "npm ci --ignore-scripts --no-audit --no-fund",
      "npx --no-install tsc --noEmit -p .",
      "npx --no-install eslint -- src/a.ts",
      "npx --no-install vitest run",
      "node scripts/checks.ts trace",
    ]);
    // Each step saw the moved tree: the staged copy in place and the manifest gone.
    const seen = readFileSync(join(repo.stub, "seen"), "utf8");
    expect(seen.split("two, staged|\n")).toHaveLength(6);
    expect(seen).toContain("npm ci --ignore-scripts --no-audit --no-fund|one\ntwo, staged|\n");
    expect(seen).not.toContain("|manifest");
    expect(r.out).toContain("passed: Node.js 24.22.2 is in >=24.11.0 <25");
    expect(r.out).toContain("passed: git apply --check scenarios/S1.patch");
    expect(r.out).not.toContain("scenarios/S2.patch");
    expect(r.out.indexOf("Preflight passed.")).toBeGreaterThan(-1);
    expect(r.out.indexOf("Preflight passed.")).toBeLessThan(r.out.indexOf("Sign and land? [y/N]"));
    expectUnchanged(repo, head);
  });

  it.each([
    ["npm ci", "npm ci --ignore-scripts"],
    ["tsc", "tsc --noEmit"],
    ["eslint", "ESLint on the moved code"],
    ["vitest run", "every test (vitest run)"],
    ["scripts/checks.ts trace", "the trace check"],
  ])("SPEC-001-R213 refuses to sign when %s fails, and leaves everything as it was", { timeout: TIMEOUT }, (step, name) => {
    const repo = makeRepo();
    const head = git(repo, "rev-parse", "HEAD");
    const r = land(repo, ["proposals/batch"], "n\n", { STUB_FAIL_STEP: step });
    expect(r.status).toBe(1);
    expect(r.out).toContain(`Preflight failed: ${name}. Nothing was signed.`);
    expect(r.out).toContain(`stub failure: `);
    expect(r.out).toMatch(/The whole output is in \S+land-preflight\.\w+\./);
    expect(r.out).not.toContain("Sign and land?");
    expect(r.out).toContain("Nothing was landed. The working tree and index are back as they were.");
    expectUnchanged(repo, head);
  });

  it("SPEC-001-R213 refuses a pre-release Node.js before running anything", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const r = land(repo, ["proposals/batch"], "n\n", { STUB_NODE_VERSION: "v24.11.0-pre" });
    expect(r.status).toBe(1);
    expect(r.out).toContain("Preflight failed: Node.js 24.11.0-pre is a pre-release or not a version.");
    expect(r.out).not.toContain("integer expression");
    expect(r.calls).toEqual([]);
  });

  it.each([["v24.1.0", "24.1.0"], ["v25.0.0", "25.0.0"], ["v22.22.0", "22.22.0"]])(
    "SPEC-001-R213 refuses Node.js %s, outside package.json's engines range, before running anything", { timeout: TIMEOUT }, (version, plain) => {
      const repo = makeRepo();
      const head = git(repo, "rev-parse", "HEAD");
      const r = land(repo, ["proposals/batch"], "n\n", { STUB_NODE_VERSION: version });
      expect(r.status).toBe(1);
      expect(r.out).toContain(`Preflight failed: Node.js ${plain} is outside package.json's engines range, >=24.11.0 <25.`);
      expect(r.calls).toEqual([]);
      expectUnchanged(repo, head);
    });

  it("SPEC-001-R213 refuses to sign when a scenario patch that touches a moved file no longer applies", { timeout: TIMEOUT }, () => {
    const repo = makeRepo({ ...BATCH, "scenarios/S3.patch": "--- a/docs/b.md\n+++ b/docs/b.md\n@@ -1,2 +1,2 @@\n one\n-two\n+two, patched\n" });
    const head = git(repo, "rev-parse", "HEAD");
    const r = land(repo, ["proposals/batch"], "n\n");
    expect(r.status).toBe(1);
    expect(r.out).toContain("Preflight failed: git apply --check scenarios/S3.patch. Nothing was signed.");
    expect(r.out).not.toContain("Sign and land?");
    expectUnchanged(repo, head);
  });

  it.each([
    ["moves a scenario patch that does not apply", "--- a/docs/c.md\n+++ b/docs/c.md\n@@ -1 +1 @@\n-not there\n+three, patched\n"],
    ["moves a scenario patch git cannot read", "not a patch\n"],
  ])("SPEC-001-R213 refuses to sign when the batch %s", { timeout: TIMEOUT }, (_title, patch) => {
    const repo = makeRepo({
      ...BATCH, "proposals/batch/S4.patch": patch,
      "proposals/batch/LAND.txt": `${BATCH["proposals/batch/LAND.txt"] ?? ""}move: S4.patch scenarios/S4.patch\n`,
    });
    const head = git(repo, "rev-parse", "HEAD");
    const r = land(repo, ["proposals/batch"], "n\n");
    expect(r.status).toBe(1);
    expect(r.out).toContain("Preflight failed: git apply --check scenarios/S4.patch. Nothing was signed.");
    expectUnchanged(repo, head);
  });

  // --to-main signs nothing: it checks the candidate run, moves main and watches main's run.
  function toMain(extra: NodeJS.ProcessEnv, jobs?: string, states: string[] = ["in_progress waiting", "in_progress in_progress"]): Result {
    const repo = makeRepo();
    write(repo.work, { "docs/c.md": "changed\n" });
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "docs: a change");
    const sha = git(repo, "rev-parse", "HEAD");
    git(repo, "push", "-q", "origin", `${sha}:refs/heads/candidate/x`);
    git(repo, "reset", "-q", "--hard", "HEAD~1");
    if (jobs !== undefined) writeFileSync(join(repo.stub, "jobs"), jobs);
    writeFileSync(join(repo.stub, "states"), `${states.join("\n")}\n`);
    const env = { STUB_URL: "https://github.com/o/r/actions/runs/202", STUB_STATES: join(repo.stub, "states"), ...(jobs === undefined ? {} : { STUB_JOBS: join(repo.stub, "jobs") }), ...extra };
    return land(repo, ["--to-main", sha, "candidate/x"], "", env);
  }
  const passed = ["checks\tsuccess\t15", "build\tsuccess\t13", "attest\tsuccess\t5", "receipt\tsuccess\t11"].join("\n");

  it("SPEC-001-R213 prints main's run URL when its deploy waits for approval, and again after the watch", { timeout: TIMEOUT }, () => {
    const r = toMain({});
    expect(r.status).toBe(0);
    const approve = r.out.indexOf("Approve the sandbox deployment in main's run 202: https://github.com/o/r/actions/runs/202");
    const after = r.out.indexOf("main's run 202: https://github.com/o/r/actions/runs/202\n", approve + 1);
    expect(approve).toBeGreaterThan(-1);
    expect(after).toBeGreaterThan(approve);
    expect(r.out).toContain("Landed ");
  });

  it("SPEC-001-R213 says nothing needs fixing when only the deploy job was cancelled", { timeout: TIMEOUT }, () => {
    const r = toMain({ STUB_FAIL: "202" }, `${passed}\ndeploy to sandbox\tcancelled\t0\n`);
    expect(r.status).toBe(1);
    expect(r.out).toContain("only its deploy job, deploy to sandbox, was cancelled before it ran a step");
    expect(r.out).toContain("nothing needs fixing");
    expect(r.out).not.toContain("fix the problem in a new commit on top");
  });

  it("SPEC-001-R213 says nothing needs fixing when the deploy was rejected, failing before any step ran", { timeout: TIMEOUT }, () => {
    const r = toMain({ STUB_FAIL: "202" }, `${passed}\ndeploy to sandbox\tfailure\t0\n`);
    expect(r.status).toBe(1);
    expect(r.out).toContain("failed without running a step:\nthe sandbox deployment was rejected, or the job could not start.");
    expect(r.out).toContain("If you rejected it, ");
    expect(r.out).toContain("gh run view 202 --log-failed");
    expect(r.out).not.toContain("fix the problem in a new commit on top");
  });

  it.each([
    ["a deploy step failed", `${passed}\ndeploy to sandbox\tfailure\t9\n`],
    ["the deploy was cancelled after it ran steps", `${passed}\ndeploy to sandbox\tcancelled\t7\n`],
    ["a check failed", "checks\tfailure\t15\nbuild\tskipped\t0\nattest\tskipped\t0\nreceipt\tskipped\t0\ndeploy to sandbox\tskipped\t0\n"],
  ])("SPEC-001-R213 still says to fix it in a new commit when %s", { timeout: TIMEOUT }, (_title, jobs) => {
    const r = toMain({ STUB_FAIL: "202" }, jobs, ["completed none"]);
    expect(r.status).toBe(1);
    expect(r.out).toContain("main's run did not pass. The commit is on main, so fix the problem in a new commit on top.");
    expect(r.out).not.toContain("nothing needs fixing");
  });

  it("SPEC-001-R213 keeps the old messages when gh cannot read the run", { timeout: TIMEOUT }, () => {
    const r = toMain({ STUB_URL: "", STUB_STATES: "", STUB_FAIL: "202" });
    expect(r.status).toBe(1);
    expect(r.out).not.toContain("Approve the sandbox deployment");
    expect(r.out).toContain("main's run did not pass.");
  });

  it("SPEC-001-R213 keeps polling, not watching, while the deploy waits, so the approval line stays on screen", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    write(repo.work, { "docs/c.md": "changed\n" });
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "docs: a change");
    const sha = git(repo, "rev-parse", "HEAD");
    git(repo, "push", "-q", "origin", `${sha}:refs/heads/candidate/x`);
    git(repo, "reset", "-q", "--hard", "HEAD~1");
    writeFileSync(join(repo.stub, "states"), "in_progress queued\nin_progress waiting\nin_progress waiting\nwaiting waiting\nin_progress in_progress\n");
    const r = land(repo, ["--to-main", sha, "candidate/x"], "", { STUB_URL: "https://github.com/o/r/actions/runs/202", STUB_STATES: join(repo.stub, "states") });
    expect(r.status).toBe(0);
    expect(lines(join(repo.stub, "events"))).toEqual([
      "watching 101", "state in_progress queued", "state in_progress waiting", "state in_progress waiting", "state waiting waiting",
      "state in_progress in_progress", "watching 202",
    ]);
    expect(r.out.split("Approve the sandbox deployment")).toHaveLength(2);
  });
});
