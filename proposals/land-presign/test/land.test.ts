import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// scripts/bootstrap/land.sh is how the owner lands a staged batch: one signed commit, pushed to a candidate branch,
// and only after that branch's run passes, the same SHA to main (SPEC-001-R41). Each test runs it end to end against
// a temporary clone with a local bare origin, a throwaway software signing key set in that clone only, and a stub gh.
const script = join(process.cwd(), "scripts/bootstrap/land.sh");
const TIMEOUT = 60_000;

// A stand-in for gh. It logs every call, answers auth status, and for run list prints run 101 on a candidate branch
// or 202 on main. It also records where origin's main and that branch point at that moment, so a test can see that
// the candidate push came first and that main moved to the same SHA. run watch exits 1 for each run ID in STUB_FAIL.
// While it watches run 202, STUB_MOVE ("<ref> <sha>") moves a ref on origin, as a push made meanwhile would.
const stubGh = [
  "#!/usr/bin/env bash",
  'printf "%s\\n" "$*" >> "$STUB_DIR/calls"',
  'at() { git --git-dir="$STUB_ORIGIN" rev-parse -q --verify "refs/heads/$1" || true; }',
  'case "$1 ${2:-}" in',
  '  "auth status") exit 0 ;;',
  '  "run list")',
  '    branch=""; commit=""',
  '    while [ $# -gt 0 ]; do case "$1" in --branch) branch="$2"; shift ;; --commit) commit="$2"; shift ;; esac; shift; done',
  '    printf "list %s %s main=%s branch=%s\\n" "$branch" "$commit" "$(at main)" "$(at "$branch")" >> "$STUB_DIR/events"',
  '    if [ "$branch" = main ]; then echo 202; else echo 101; fi',
  "    exit 0 ;;",
  '  "run watch")',
  '    printf "watch %s\\n" "$3" >> "$STUB_DIR/events"',
  '    if [ -n "${STUB_MOVE:-}" ] && [ "$3" = 202 ]; then git --git-dir="$STUB_ORIGIN" update-ref $STUB_MOVE; fi',
  '    case " ${STUB_FAIL:-} " in *" $3 "*) echo "run $3 failed"; exit 1 ;; esac',
  '    echo "run $3 passed"',
  "    exit 0 ;;",
  "esac",
  'echo "unexpected gh call: $*" >&2',
  "exit 2",
  "",
].join("\n");

const MANIFEST = [
  "# A test batch: one file replaces a workflow, one goes to a directory that does not exist yet.",
  "message: spec: land the test batch",
  "spec: SPEC-001-R41",
  "requires: specs/SPEC-001-delivery-pipeline.md SPEC-001-R41",
  "move: github-workflows/pipeline.yml .github/workflows/pipeline.yml",
  "move: scripts/new.sh scripts/tool/new.sh",
  "",
].join("\n");

const BASE: Record<string, string> = {
  ".gitignore": "*.local\n",
  // land.sh checks Node.js against engines before it signs (SPEC-001-R213); the stub node, npm and npx below pass.
  "package.json": '{\n  "name": "t",\n  "engines": {\n    "node": ">=24.11.0 <25"\n  }\n}\n',
  "specs/SPEC-001-delivery-pipeline.md": "| ID | Requirement |\n|---|---|\n| SPEC-001-R41 | main only moves to a commit on which checks passed. |\n",
  ".github/workflows/pipeline.yml": "on: push\njobs: {}\n",
  "docs/a.md": "one\n",
};

const BATCH: Record<string, string> = {
  "proposals/batch/LAND.txt": MANIFEST,
  "proposals/batch/github-workflows/pipeline.yml": "on:\n  push:\n    branches: [main, 'candidate/**']\njobs: {}\n",
  "proposals/batch/scripts/new.sh": "echo new\n",
};

interface Repo { work: string; origin: string; stub: string; signers: string; env: NodeJS.ProcessEnv }
interface Result { status: number | null; stdout: string; out: string }

describe("SPEC-001-R41 land.sh lands a staged batch through a candidate branch", () => {
  // Made in beforeAll, not here, so listing the tests (the trace check runs vitest list) leaves no directory behind.
  let scratch = "";
  const keys = { approver: "", other: "" };
  const signerLine = (key: string) => `owner@example.com namespaces="git" ${readFileSync(`${key}.pub`, "utf8").trim().split(" ").slice(0, 2).join(" ")}\n`;
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), "land-sh-"));
    keys.approver = join(scratch, "approver");
    keys.other = join(scratch, "other");
    for (const key of Object.values(keys)) execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "land test", "-f", key]);
  });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  const write = (root: string, files: Record<string, string>) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
  };
  const git = (repo: Repo, ...args: string[]): string => execFileSync("git", args, { cwd: repo.work, env: repo.env, encoding: "utf8" }).trim();
  const originRef = (repo: Repo, branch: string): string =>
    spawnSync("git", ["--git-dir", repo.origin, "rev-parse", "-q", "--verify", `refs/heads/${branch}`], { env: repo.env, encoding: "utf8" }).stdout.trim();
  const events = (repo: Repo): string[] => {
    const file = join(repo.stub, "events");
    return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
  };
  const clearEvents = (repo: Repo) => rmSync(join(repo.stub, "events"), { force: true });

  // The test's own commits are unsigned; only land.sh signs, with git commit -S.
  function commitAll(repo: Repo, message: string): string {
    git(repo, "add", "-A");
    git(repo, "-c", "commit.gpgsign=false", "commit", "-q", "-m", message);
    git(repo, "push", "-q", "-u", "origin", "main");
    return git(repo, "rev-parse", "HEAD");
  }

  function makeRepo(files: Record<string, string> = BATCH): Repo {
    const dir = mkdtempSync(join(scratch, "repo-"));
    const repo: Repo = {
      work: join(dir, "work"), origin: join(dir, "origin.git"), stub: join(dir, "stub"), signers: join(dir, "allowed_signers"),
      env: {
        ...process.env, HOME: join(dir, "home"), GIT_CONFIG_GLOBAL: join(dir, "gitconfig"), GIT_CONFIG_NOSYSTEM: "1",
        PATH: `${join(dir, "stub")}:${process.env["PATH"] ?? ""}`, STUB_DIR: join(dir, "stub"), STUB_ORIGIN: join(dir, "origin.git"), STUB_FAIL: "",
      },
    };
    for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "SSH_AUTH_SOCK"]) delete repo.env[name];
    mkdirSync(repo.stub);
    mkdirSync(join(dir, "home"));
    writeFileSync(join(dir, "gitconfig"), "");
    writeFileSync(join(repo.stub, "gh"), stubGh);
    chmodSync(join(repo.stub, "gh"), 0o755);
    // The pre-sign preflight's tools pass here; test/land-presign.test.ts tests the preflight itself (SPEC-001-R213).
    for (const name of ["node", "npm", "npx"]) {
      writeFileSync(join(repo.stub, name), '#!/usr/bin/env bash\nif [ "$*" = --version ]; then echo v24.22.2; fi\nexit 0\n');
      chmodSync(join(repo.stub, name), 0o755);
    }
    writeFileSync(repo.signers, signerLine(keys.approver));
    execFileSync("git", ["init", "-q", "--bare", "-b", "main", repo.origin], { env: repo.env });
    execFileSync("git", ["init", "-q", "-b", "main", repo.work], { env: repo.env });
    const config = { "user.name": "Owner", "user.email": "owner@example.com", "gpg.format": "ssh", "user.signingkey": keys.approver, "commit.gpgsign": "true" };
    for (const [key, value] of Object.entries(config)) git(repo, "config", key, value);
    git(repo, "remote", "add", "origin", repo.origin);
    write(repo.work, { ...BASE, "approvers.txt": signerLine(keys.approver), ...files });
    commitAll(repo, "init");
    return repo;
  }

  function land(repo: Repo, args: string[], input = "", fail = "", extra: NodeJS.ProcessEnv = {}): Result {
    const r = spawnSync("bash", [script, ...args], { cwd: repo.work, env: { ...repo.env, STUB_FAIL: fail, ...extra }, input, encoding: "utf8", timeout: TIMEOUT });
    return { status: r.status, stdout: r.stdout, out: `${r.stdout}${r.stderr}` };
  }

  function expectUnchanged(repo: Repo, head: string) {
    expect(git(repo, "rev-parse", "HEAD")).toBe(head);
    expect(git(repo, "status", "--porcelain")).toBe("");
    expect(originRef(repo, "main")).toBe(head);
    expect(originRef(repo, "candidate/land-batch")).toBe("");
  }

  it("SPEC-001-R41 lands a batch as one signed commit: the candidate branch first, then the same SHA to main, then the candidate branch is deleted", () => {
    const repo = makeRepo();
    const before = git(repo, "rev-parse", "HEAD");
    const r = land(repo, ["proposals/batch"], "y\ny\n");
    expect(r).toMatchObject({ status: 0 });
    const sha = git(repo, "rev-parse", "HEAD");
    expect(git(repo, "rev-parse", "HEAD^")).toBe(before);
    // The full diff, asked for with the first yes, shows each destination before the batch's own removal.
    const workflowDiff = r.stdout.indexOf("diff --git a/.github/workflows/pipeline.yml b/.github/workflows/pipeline.yml");
    expect(workflowDiff).toBeGreaterThan(r.stdout.indexOf("Show the full diff in a pager? [y/N]"));
    expect(workflowDiff).toBeLessThan(r.stdout.indexOf("diff --git a/proposals/batch/LAND.txt b/proposals/batch/LAND.txt"));
    expect(r.stdout.indexOf("Sign and land? [y/N]")).toBeGreaterThan(workflowDiff);
    // The message and the moves come before the diff stat, and a new file shows in full, not as a rename with no lines.
    expect(r.stdout.indexOf("Message: spec: land the test batch")).toBeLessThan(r.stdout.indexOf(" files changed, "));
    expect(r.stdout).toContain("Moves:\n  proposals/batch/github-workflows/pipeline.yml -> .github/workflows/pipeline.yml\n  proposals/batch/scripts/new.sh -> scripts/tool/new.sh\n");
    expect(r.stdout).toContain("diff --git a/scripts/tool/new.sh b/scripts/tool/new.sh\nnew file mode 100644");
    expect(r.stdout).toContain("\n+echo new\n");
    expect(r.stdout).not.toContain("rename from");
    expect(events(repo)).toEqual([
      `list candidate/land-batch ${sha} main=${before} branch=${sha}`,
      "watch 101",
      `list main ${sha} main=${sha} branch=${sha}`,
      "watch 202",
    ]);
    expect(originRef(repo, "main")).toBe(sha);
    expect(originRef(repo, "candidate/land-batch")).toBe("");
    expect(git(repo, "ls-tree", "-r", "--name-only", "HEAD").split("\n")).toEqual([
      ".github/workflows/pipeline.yml", ".gitignore", "approvers.txt", "docs/a.md", "scripts/tool/new.sh", "specs/SPEC-001-delivery-pipeline.md",
    ]);
    expect(`${git(repo, "show", "HEAD:.github/workflows/pipeline.yml")}\n`).toBe(BATCH["proposals/batch/github-workflows/pipeline.yml"]);
    expect(existsSync(join(repo.work, "proposals"))).toBe(false);
    expect(git(repo, "status", "--porcelain")).toBe("");
    expect(git(repo, "log", "-1", "--format=%B")).toBe("spec: land the test batch\n\nSpec: SPEC-001-R41");
    expect(git(repo, "cat-file", "commit", "HEAD")).toContain("-----BEGIN SSH SIGNATURE-----");
    expect(spawnSync("git", ["-c", `gpg.ssh.allowedSignersFile=${repo.signers}`, "verify-commit", "HEAD"], { cwd: repo.work, env: repo.env }).status).toBe(0);
    expect(r.out).toContain("Precondition met: specs/SPEC-001-delivery-pipeline.md contains \"SPEC-001-R41\".");
    expect(r.out).toContain("Sign and land? [y/N]");
    expect(r.out).toContain("Tap your security key when it blinks.");
    expect(r.out).toContain("The deploy to the sandbox now waits for your approval in GitHub");
    expect(r.out).toContain("Deleted candidate/land-batch.");
  }, TIMEOUT);

  it("SPEC-001-R41 refuses a manifest with .., an absolute path, a proposals/ or .git/ destination, an untracked source, an unknown key or a control character, and runs and changes nothing", () => {
    const repo = makeRepo();
    writeFileSync(join(repo.work, "proposals/batch/ignored.local"), "ignored, so not tracked\n");
    const cases: [string, RegExp][] = [
      ["move: ../outside.txt docs/outside.txt", /\.\.\/outside\.txt is not a plain relative path inside the batch/],
      ["move: /etc/hosts docs/hosts", /\/etc\/hosts is not a plain relative path inside the batch/],
      ["move: scripts/new.sh /tmp/new.sh", /\/tmp\/new\.sh is not a plain relative path/],
      ["move: scripts/new.sh docs/../../new.sh", /docs\/\.\.\/\.\.\/new\.sh is not a plain relative path/],
      ["move: scripts/new.sh proposals/other/new.sh", /proposals\/other\/new\.sh is under proposals\//],
      ["move: scripts/new.sh Proposals/new.sh", /Proposals\/new\.sh is under proposals\//],
      ["move: scripts/new.sh .git/hooks/pre-commit", /\.git\/hooks\/pre-commit is under \.git\//],
      ["move: ignored.local docs/ignored.local", /proposals\/batch\/ignored\.local is not a tracked file/],
      ["run: touch pwned", /unknown key "run"/],
      ["spec: SPEC-001-R41\u001b[1A\u001b[2K", /proposals\/batch\/LAND\.txt line 7 holds a control character or a byte outside printable ASCII/],
      ["requires: specs/SPEC-001-delivery-pipeline.md SPEC-001-R99", /Precondition failed: specs\/SPEC-001-delivery-pipeline\.md does not contain "SPEC-001-R99"/],
    ];
    for (const [line, message] of cases) {
      write(repo.work, { "proposals/batch/LAND.txt": `${MANIFEST.replace("message: spec: land the test batch", "message: $(touch pwned) `touch pwned`")}${line}\n` });
      const head = commitAll(repo, `test: manifest with ${line}`);
      rmSync(join(repo.stub, "calls"), { force: true });
      const r = land(repo, ["proposals/batch"], "y\ny\ny\n");
      expect([line, r.status]).toEqual([line, 1]);
      expect(r.out).toMatch(message);
      expectUnchanged(repo, head);
      expect(readFileSync(join(repo.stub, "calls"), "utf8")).toBe("auth status\n");
      expect(existsSync(join(repo.work, "pwned"))).toBe(false);
      expect(r.out).not.toContain("\u001b");
    }
    write(repo.work, { "proposals/batch/LAND.txt": MANIFEST.replace("move: scripts/new.sh scripts/tool/new.sh\n", "") });
    const head = commitAll(repo, "test: manifest that leaves a file behind");
    const r = land(repo, ["proposals/batch"], "y\ny\ny\n");
    expect(r.status).toBe(1);
    expect(r.out).toContain("proposals/batch holds tracked files that proposals/batch/LAND.txt does not move:\n  proposals/batch/scripts/new.sh");
    expectUnchanged(repo, head);
    expect(events(repo)).toEqual([]);
  }, TIMEOUT);

  it("SPEC-001-R41 stops before main when the candidate run fails, and says to fix it in a new commit on top, never by amending", () => {
    const repo = makeRepo();
    const before = git(repo, "rev-parse", "HEAD");
    const r = land(repo, ["proposals/batch"], "n\ny\n", "101");
    expect(r.status).toBe(1);
    const sha = git(repo, "rev-parse", "HEAD");
    expect(sha).not.toBe(before);
    expect(originRef(repo, "main")).toBe(before);
    expect(originRef(repo, "candidate/land-batch")).toBe(sha);
    expect(events(repo)).toEqual([`list candidate/land-batch ${sha} main=${before} branch=${sha}`, "watch 101"]);
    expect(r.out).toContain("The pipeline run 101 on candidate/land-batch failed, so main has not moved.");
    expect(r.out).toContain(`Fix the problem in a new commit on top of ${sha.slice(0, 7)}`);
    expect(r.out).toContain("Never amend");
    expect(r.out).toContain('scripts/bootstrap/land.sh --to-main "$(git rev-parse HEAD)" candidate/land-batch');
    expect(r.stdout).toContain(`Pipeline run 101 on candidate/land-batch. If you stop watching, finish later with:\nscripts/bootstrap/land.sh --to-main ${sha} candidate/land-batch\n`);
    expect(git(repo, "status", "--porcelain")).toBe("");

    // Running it again says the failed attempt is still on the local branch and how to drop it. Those commands work.
    const again = land(repo, ["proposals/batch"], "y\ny\n");
    expect(again.status).toBe(1);
    expect(again.out).toContain(`HEAD is not origin/main after git pull. This branch has commits that are not on origin/main:\n  ${sha.slice(0, 7)} spec: land the test batch\n`);
    const drop = "git fetch origin\ngit reset --hard origin/main\ngit push origin --delete candidate/land-batch";
    expect(again.out).toContain(`If they are an earlier landing you gave up on, drop them, then run this again:\n${drop}\n`);
    for (const command of drop.split("\n")) git(repo, ...command.split(" ").slice(1));
    expectUnchanged(repo, before);
    const landed = land(repo, ["proposals/batch"], "n\ny\n");
    expect(landed).toMatchObject({ status: 0 });
    expect(originRef(repo, "main")).toBe(git(repo, "rev-parse", "HEAD"));
  }, TIMEOUT);

  it("SPEC-001-R41 keeps the candidate branch, and says so, when a commit reached it while main's run was watched", () => {
    const repo = makeRepo();
    const before = git(repo, "rev-parse", "HEAD");
    const r = land(repo, ["proposals/batch"], "n\ny\n", "", { STUB_MOVE: `refs/heads/candidate/land-batch ${before}` });
    expect(r).toMatchObject({ status: 0 });
    const sha = git(repo, "rev-parse", "HEAD");
    expect(originRef(repo, "main")).toBe(sha);
    expect(originRef(repo, "candidate/land-batch")).toBe(before);
    expect(r.out).toContain(`Kept candidate/land-batch: it now holds ${before.slice(0, 12)}, not ${sha.slice(0, 7)}, so a commit was pushed to it since.`);
    expect(r.out).toContain("git push origin --delete candidate/land-batch");
    expect(r.out).not.toContain("Deleted candidate/land-batch.");
    expect(r.out).toContain(`Landed ${sha.slice(0, 7)} on main.`);
  }, TIMEOUT);

  // script gives land.sh a terminal, so git pages the full diff; a pager of head -n 1 quits early, as q in less does.
  it.skipIf(process.platform !== "linux")("SPEC-001-R41 names a change to approvers.txt, and still asks to sign when the owner quits the pager before the end of a long diff", () => {
    const long = Array.from({ length: 40_000 }, (_, n) => `echo ${n}`).join("\n");
    const repo = makeRepo({
      ...BATCH,
      "proposals/batch/LAND.txt": `${MANIFEST}move: approvers.txt approvers.txt\n`,
      "proposals/batch/scripts/new.sh": `${long}\n`,
      "proposals/batch/approvers.txt": signerLine(keys.other),
    });
    const head = git(repo, "rev-parse", "HEAD");
    const r = spawnSync("script", ["-qec", `bash '${script}' proposals/batch`, "/dev/null"],
      { cwd: repo.work, env: { ...repo.env, GIT_PAGER: "head -n 1" }, input: "y\nn\n", encoding: "utf8", timeout: TIMEOUT });
    expect(r.stdout).toContain("Warning: this changes approvers.txt, the keys that may sign approver commits.");
    expect(r.stdout.split("diff --git").length - 1).toBe(1);
    expect(r.stdout).toContain("Sign and land? [y/N]");
    expect(r.stdout).toContain("You chose not to sign.");
    expect(r.status).toBe(1);
    expectUnchanged(repo, head);
  }, TIMEOUT);

  it("SPEC-001-R41 --stop-before-main stops once the candidate run passes, and --to-main then moves main to that exact SHA", () => {
    const repo = makeRepo();
    const before = git(repo, "rev-parse", "HEAD");
    const stopped = land(repo, ["proposals/batch", "--stop-before-main"], "n\ny\n");
    expect(stopped).toMatchObject({ status: 0 });
    const sha = git(repo, "rev-parse", "HEAD");
    expect(originRef(repo, "main")).toBe(before);
    expect(originRef(repo, "candidate/land-batch")).toBe(sha);
    expect(events(repo)).toEqual([`list candidate/land-batch ${sha} main=${before} branch=${sha}`, "watch 101"]);
    expect(stopped.out).toContain(`Stopped before main, as asked. Run 101 passed on candidate/land-batch for ${sha.slice(0, 7)}.`);
    const command = stopped.stdout.trim().split("\n").at(-1) ?? "";
    expect(command).toBe(`scripts/bootstrap/land.sh --to-main ${sha} candidate/land-batch`);

    clearEvents(repo);
    const wrong = land(repo, ["--to-main", before, "candidate/land-batch"]);
    expect(wrong.status).toBe(1);
    expect(wrong.out).toContain(`candidate/land-batch on origin is at ${sha}, not ${before}.`);
    expect(originRef(repo, "main")).toBe(before);
    expect(events(repo)).toEqual([]);

    const finished = land(repo, command.split(" ").slice(1));
    expect(finished).toMatchObject({ status: 0 });
    expect(events(repo)).toEqual([
      `list candidate/land-batch ${sha} main=${before} branch=${sha}`,
      "watch 101",
      `list main ${sha} main=${sha} branch=${sha}`,
      "watch 202",
    ]);
    expect(originRef(repo, "main")).toBe(sha);
    expect(originRef(repo, "candidate/land-batch")).toBe("");
    expect(finished.out).toContain(`Landed ${sha.slice(0, 7)} on main.`);
  }, TIMEOUT);

  it("SPEC-001-R41 refuses a dirty working tree, and a signature that approvers.txt does not accept, before anything is pushed", () => {
    const repo = makeRepo();
    const head = git(repo, "rev-parse", "HEAD");
    writeFileSync(join(repo.work, "docs/a.md"), "one\nlocal edit\n");
    const modified = land(repo, ["proposals/batch"], "y\ny\n");
    expect(modified.status).toBe(1);
    expect(modified.out).toContain("The working tree or index is not clean. Commit, stash or remove these first:\n M docs/a.md");
    expect(readFileSync(join(repo.work, "docs/a.md"), "utf8")).toBe("one\nlocal edit\n");
    git(repo, "checkout", "-q", "--", "docs/a.md");
    writeFileSync(join(repo.work, "notes.txt"), "draft\n");
    const untracked = land(repo, ["proposals/batch"], "y\ny\n");
    expect(untracked.status).toBe(1);
    expect(untracked.out).toContain("?? notes.txt");
    rmSync(join(repo.work, "notes.txt"));
    expectUnchanged(repo, head);
    expect(events(repo)).toEqual([]);

    const wrongKey = makeRepo({ ...BATCH, "approvers.txt": signerLine(keys.other) });
    const wrongHead = git(wrongKey, "rev-parse", "HEAD");
    const r = land(wrongKey, ["proposals/batch"], "n\ny\n");
    expect(r.status).toBe(1);
    expect(r.out).toContain("does not verify against approvers.txt");
    expect(r.out).toContain("Nothing was landed. The working tree and index are back as they were.");
    expectUnchanged(wrongKey, wrongHead);
    expect(existsSync(join(wrongKey.work, "proposals/batch/LAND.txt"))).toBe(true);
    expect(existsSync(join(wrongKey.work, "scripts"))).toBe(false);
    expect(events(wrongKey)).toEqual([]);
  }, TIMEOUT);

  it("SPEC-001-R41 warns and asks when a destination changed on main after its copy was staged, even if the copy was edited since, and a no leaves everything as it was", () => {
    const repo = makeRepo({
      "docs/b.md": "one\n",
      "proposals/batch/LAND.txt": "message: docs: refresh\nspec: SPEC-001-R41\nmove: a.md docs/a.md\nmove: b.md docs/b.md\nmove: new.sh scripts/tool/new.sh\n",
      "proposals/batch/a.md": "one\nstaged edit\n",
      "proposals/batch/b.md": "one\nshared line\nstaged edit\n",
      "proposals/batch/new.sh": "echo new\n",
    });
    write(repo.work, { "docs/a.md": "one\nnewer work on main\n", "docs/b.md": "one\nshared line\n" });
    commitAll(repo, "docs: newer work \u001b[2K");
    // A later edit to the staged copy does not make it newer than main's work.
    write(repo.work, { "proposals/batch/a.md": "one\nstaged edit, typo fixed\n" });
    const head = commitAll(repo, "agent: fix a typo in the staged copy");

    const no = land(repo, ["proposals/batch"], "n\n");
    expect(no.status).toBe(1);
    expect(no.out).toContain("Warning: docs/a.md changed on origin/main after proposals/batch/a.md was staged in");
    // Commit subjects come from git, so control characters in them are shown, not sent to the terminal.
    expect(no.out).toContain("docs: newer work ^[[2K");
    expect(no.out).not.toContain("\u001b");
    expect(no.out).toContain("The staged copy lacks lines those commits added (1 of 1). Landing it removes them:\n    newer work on main");
    expect(no.out).toContain("Warning: docs/b.md changed on origin/main after proposals/batch/b.md was staged in");
    expect(no.out).toContain("The staged copy keeps every line those commits added.");
    expect(no.out).not.toContain("Warning: scripts/tool/new.sh");
    expect(no.out).toContain("Continue anyway? [y/N]");
    expect(no.out).not.toContain("Sign and land?");
    expectUnchanged(repo, head);

    const declined = land(repo, ["proposals/batch"], "y\nn\nn\n");
    expect(declined.status).toBe(1);
    expect(declined.out).toContain("Sign and land? [y/N]");
    expect(declined.out).toContain("You chose not to sign.");
    expect(declined.out).toContain("Nothing was landed. The working tree and index are back as they were.");
    expectUnchanged(repo, head);
    expect(readFileSync(join(repo.work, "proposals/batch/a.md"), "utf8")).toBe("one\nstaged edit, typo fixed\n");
    expect(existsSync(join(repo.work, "scripts"))).toBe(false);
    expect(events(repo)).toEqual([]);
  }, TIMEOUT);

  it("SPEC-001-R41 land.sh is executable, parses, and keeps to bash 3.2 so it runs on macOS as well as Linux", () => {
    expect(statSync(script).mode & 0o111).not.toBe(0);
    expect(spawnSync("bash", ["-n", script]).status).toBe(0);
    const text = readFileSync(script, "utf8");
    expect(text.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(text).toContain("\nset -euo pipefail\n");
    // Comment lines may name what the script avoids; only the code is scanned.
    const code = text.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
    const bash4 = [/\bmapfile\b/, /\breadarray\b/, /\b(?:declare|local|typeset) -[a-zA-Z]*[An]/, /\$\{[^}]*(?:,,|\^\^)\}/, /\$\{[A-Za-z_][A-Za-z_0-9]*[,^]\}/,
      /\bcoproc\b/, /\|&/, /&>>/, /;;&/, /\bwait -n\b/, /\$\{[^}]*@[QEPAaKUuL]\}/, /\bEPOCH(?:SECONDS|REALTIME)\b/];
    for (const feature of bash4) expect([String(feature), feature.test(code)]).toEqual([String(feature), false]);
    expect(code).not.toMatch(/^\s*(?:eval|source|\.)\s/m);
  });
});
