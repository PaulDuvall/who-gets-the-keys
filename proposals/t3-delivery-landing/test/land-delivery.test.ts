import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// scripts/bootstrap/land.sh --delivery is how the owner lands a runner producer delivery. The publish job's push, made
// with the GITHUB_TOKEN, starts no run, and checks from a workflow_dispatch run do not count for main's ruleset, so the
// owner pushes the same commit to candidate/<task>-owner, whose push run does, then to main (SPEC-001-R210). Each test
// runs it against a temporary clone with a local bare origin and a stub gh. Nothing here signs, so no key is made.
const script = join(process.cwd(), "scripts/bootstrap/land.sh");
const TIMEOUT = 60_000;
const BRANCH = "candidate/TASK-T1";
const OWNER_BRANCH = "candidate/TASK-T1-owner";

// A stand-in for gh. It logs every call, answers auth status, and for run list prints run 101 on a candidate branch
// or 202 on main, recording where origin's main and that branch point at that moment. run watch exits 1 for each run
// ID in STUB_FAIL.
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
  '    case " ${STUB_FAIL:-} " in *" $3 "*) echo "run $3 failed"; exit 1 ;; esac',
  '    echo "run $3 passed"',
  "    exit 0 ;;",
  "esac",
  'echo "unexpected gh call: $*" >&2',
  "exit 2",
  "",
].join("\n");

interface Repo { work: string; origin: string; stub: string; env: NodeJS.ProcessEnv; base: string; delivery: string }
interface Result { status: number | null; out: string }

describe("SPEC-001-R210 land.sh --delivery lands a producer delivery through the owner's own push", () => {
  // Made in beforeAll, not here, so listing the tests (the trace check runs vitest list) leaves no directory behind.
  let scratch = "";
  beforeAll(() => { scratch = mkdtempSync(join(tmpdir(), "land-delivery-")); });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  const gitIn = (repo: Repo, ...args: string[]): string => execFileSync("git", args, { cwd: repo.work, env: repo.env, encoding: "utf8" }).trim();
  const originRef = (repo: Repo, branch: string): string =>
    spawnSync("git", ["--git-dir", repo.origin, "rev-parse", "-q", "--verify", `refs/heads/${branch}`], { env: repo.env, encoding: "utf8" }).stdout.trim();
  const events = (repo: Repo): string[] => {
    const file = join(repo.stub, "events");
    return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
  };

  // origin's main holds one commit; candidate/TASK-T1 holds the producer's commit on top of it, as the publish job
  // pushes it: unsigned, by github-actions[bot], with the Task, Agent and Producer-Run trailers.
  function makeRepo(task = "TASK-T1"): Repo {
    const dir = mkdtempSync(join(scratch, "repo-"));
    const env: NodeJS.ProcessEnv = {
      ...process.env, HOME: join(dir, "home"), GIT_CONFIG_GLOBAL: join(dir, "gitconfig"), GIT_CONFIG_NOSYSTEM: "1",
      PATH: `${join(dir, "stub")}:${process.env["PATH"] ?? ""}`, STUB_DIR: join(dir, "stub"), STUB_ORIGIN: join(dir, "origin.git"), STUB_FAIL: "",
    };
    for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "SSH_AUTH_SOCK"]) delete env[name];
    const repo: Repo = { work: join(dir, "work"), origin: join(dir, "origin.git"), stub: join(dir, "stub"), env, base: "", delivery: "" };
    mkdirSync(repo.stub);
    mkdirSync(join(dir, "home"));
    writeFileSync(join(dir, "gitconfig"), "");
    writeFileSync(join(repo.stub, "gh"), stubGh);
    chmodSync(join(repo.stub, "gh"), 0o755);
    execFileSync("git", ["init", "-q", "--bare", "-b", "main", repo.origin], { env });
    execFileSync("git", ["init", "-q", "-b", "main", repo.work], { env });
    for (const [key, value] of Object.entries({ "user.name": "Owner", "user.email": "owner@example.com", "commit.gpgsign": "false" })) gitIn(repo, "config", key, value);
    gitIn(repo, "remote", "add", "origin", repo.origin);
    writeFileSync(join(repo.work, "a.md"), "one\n");
    gitIn(repo, "add", "-A");
    gitIn(repo, "commit", "-q", "-m", "base");
    gitIn(repo, "push", "-q", "origin", "main");
    repo.base = gitIn(repo, "rev-parse", "HEAD");
    writeFileSync(join(repo.work, "a.md"), "two\n");
    gitIn(repo, "add", "-A");
    gitIn(repo, "-c", "user.name=github-actions[bot]", "commit", "-q", "-m", "Add a line", "-m",
      `Task: ${task}\nAgent: Claude Code\nProducer-Run: https://github.com/o/r/actions/runs/1/attempts/1`);
    repo.delivery = gitIn(repo, "rev-parse", "HEAD");
    gitIn(repo, "push", "-q", "origin", `HEAD:refs/heads/${BRANCH}`);
    gitIn(repo, "reset", "-q", "--hard", repo.base);
    return repo;
  }

  // The first answer is "Show the full diff in a pager?", the second is the push question.
  function deliver(repo: Repo, branch: string, input: string, fail = ""): Result {
    const r = spawnSync("bash", [script, "--delivery", branch], { cwd: repo.work, env: { ...repo.env, STUB_FAIL: fail }, input, encoding: "utf8", timeout: TIMEOUT });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  }

  it("SPEC-001-R210 shows the delivery, pushes it to candidate/<task>-owner on a yes, waits for that run, then moves main and deletes both branches", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const r = deliver(repo, BRANCH, "n\ny\n");
    expect([r.status, r.out]).toEqual([0, expect.stringContaining("Landed ")]);
    expect(r.out).toContain("Task: TASK-T1");
    expect(r.out).toContain(" a.md | 2 +-");
    expect(originRef(repo, "main")).toBe(repo.delivery);
    expect([originRef(repo, BRANCH), originRef(repo, OWNER_BRANCH)]).toEqual(["", ""]);
    // The owner branch held the delivery while main was still at the base: the counted run came first.
    expect(events(repo)).toEqual([
      `list ${OWNER_BRANCH} ${repo.delivery} main=${repo.base} branch=${repo.delivery}`, "watch 101",
      `list main ${repo.delivery} main=${repo.delivery} branch=${repo.delivery}`, "watch 202",
    ]);
  });

  it("SPEC-001-R210 pushes nothing unless the owner answers yes", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const r = deliver(repo, BRANCH, "n\nn\n");
    expect([r.status, r.out.trimEnd().split("\n").at(-1)]).toEqual([1, "You chose not to land it. Nothing was pushed."]);
    expect([originRef(repo, "main"), originRef(repo, BRANCH), originRef(repo, OWNER_BRANCH)]).toEqual([repo.base, repo.delivery, ""]);
    expect(events(repo)).toEqual([]);
  });

  it("SPEC-001-R210 refuses, before any push, a branch that is not candidate/TASK-<ID> or is not on origin", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const bad = ["candidate/land-x", "candidate/TASK-", "candidate/TASK-t1", "candidate/TASK-T1/x", OWNER_BRANCH, `candidate/TASK-${"A".repeat(33)}`, "main", "candidate/TASK-T2"];
    for (const branch of bad) {
      const r = deliver(repo, branch, "y\ny\n");
      expect([branch, r.status, originRef(repo, "main"), originRef(repo, OWNER_BRANCH)]).toEqual([branch, 1, repo.base, ""]);
    }
    expect(deliver(repo, "candidate/TASK-T2", "y\ny\n").out).toContain("candidate/TASK-T2 is not on origin.");
    expect(events(repo)).toEqual([]);
  });

  it("SPEC-001-R210 refuses a tip whose Task trailer is not the task, and one that main has moved past", { timeout: TIMEOUT }, () => {
    const other = makeRepo("TASK-OTHER");
    const r = deliver(other, BRANCH, "y\ny\n");
    expect([r.status, r.out]).toEqual([1, expect.stringContaining('has the Task trailer "TASK-OTHER", not "TASK-T1"')]);
    expect([originRef(other, "main"), originRef(other, OWNER_BRANCH)]).toEqual([other.base, ""]);

    const moved = makeRepo();
    gitIn(moved, "commit", "-q", "--allow-empty", "-m", "main moved");
    gitIn(moved, "push", "-q", "origin", "main");
    const m = deliver(moved, BRANCH, "y\ny\n");
    expect([m.status, m.out]).toEqual([1, expect.stringContaining("main has moved since the producer made")]);
    expect(originRef(moved, OWNER_BRANCH)).toBe("");
  });

  it("SPEC-001-R210 refuses a candidate/<task>-owner branch that holds another commit, and reuses one that holds the delivery", { timeout: TIMEOUT }, () => {
    const taken = makeRepo();
    gitIn(taken, "push", "-q", "origin", `${taken.base}:refs/heads/${OWNER_BRANCH}`);
    const r = deliver(taken, BRANCH, "y\ny\n");
    expect([r.status, r.out]).toEqual([1, expect.stringContaining(`${OWNER_BRANCH} already holds`)]);
    expect([originRef(taken, "main"), originRef(taken, OWNER_BRANCH)]).toEqual([taken.base, taken.base]);

    const again = makeRepo();
    gitIn(again, "push", "-q", "origin", `${again.delivery}:refs/heads/${OWNER_BRANCH}`);
    const a = deliver(again, BRANCH, "n\ny\n");
    expect([a.status, originRef(again, "main"), originRef(again, BRANCH), originRef(again, OWNER_BRANCH)]).toEqual([0, again.delivery, "", ""]);
  });

  it("SPEC-001-R210 leaves main and the producer branch alone when the owner branch's run fails", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const r = deliver(repo, BRANCH, "n\ny\n", "101");
    expect(r.status).toBe(1);
    expect([originRef(repo, "main"), originRef(repo, BRANCH), originRef(repo, OWNER_BRANCH)]).toEqual([repo.base, repo.delivery, repo.delivery]);
  });

  it("SPEC-001-R210 deletes the producer branch as soon as main holds the commit, even when main's run then fails", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const r = deliver(repo, BRANCH, "n\ny\n", "202");
    expect(r.status).toBe(1);
    expect([originRef(repo, "main"), originRef(repo, BRANCH)]).toEqual([repo.delivery, ""]);
    expect(r.out).toContain(`Deleted ${BRANCH}.`);
  });
});
