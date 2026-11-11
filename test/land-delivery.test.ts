import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { git, lines, originRef, runScript, scratchDir, tempRepo, TIMEOUT, type ScriptRun, type TempRepo } from "./helpers/temp-repo.ts";

// scripts/bootstrap/land.sh --delivery is how the owner lands a runner producer delivery. The publish job's push, made
// with the GITHUB_TOKEN, starts no run, and checks from a workflow_dispatch run do not count for main's ruleset, so the
// owner pushes the same commit to candidate/<task>-owner, whose push run does, then to main (SPEC-001-R210). Each test
// runs it against a temporary clone with a local bare origin and a stub gh. Nothing here signs, so no key is made.
const script = join(process.cwd(), "scripts/bootstrap/land.sh");
const BRANCH = "candidate/TASK-T1";
const OWNER_BRANCH = "candidate/TASK-T1-owner";

// A stand-in for gh. It logs every call, answers auth status, and for run list prints run 101 on a candidate branch
// or 202 on main, recording where origin's main and that branch point at that moment. run watch exits 1 for each run
// ID in STUB_FAIL. While it watches run STUB_MOVE_RUN, STUB_MOVE ("<ref> <sha>") moves a ref on origin, as a push made
// meanwhile would.
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
  '    if [ -n "${STUB_MOVE:-}" ] && [ "$3" = "${STUB_MOVE_RUN:-}" ]; then git --git-dir="$STUB_ORIGIN" update-ref $STUB_MOVE; fi',
  '    case " ${STUB_FAIL:-} " in *" $3 "*) echo "run $3 failed"; exit 1 ;; esac',
  '    echo "run $3 passed"',
  "    exit 0 ;;",
  "esac",
  'echo "unexpected gh call: $*" >&2',
  "exit 2",
  "",
].join("\n");

interface Repo extends TempRepo { base: string; delivery: string }

describe("SPEC-001-R210 land.sh --delivery lands a producer delivery through the owner's own push", () => {
  const scratch = scratchDir("land-delivery-");
  const events = (repo: Repo): string[] => lines(join(repo.stub, "events"));

  // origin's main holds one commit; candidate/TASK-T1 holds the producer's commit on top of it, as the publish job
  // pushes it: unsigned, by github-actions[bot], with the Task, Agent and Producer-Run trailers.
  function makeRepo(task = "TASK-T1", extraTrailers = ""): Repo {
    const repo = tempRepo(scratch(), { stubs: { gh: stubGh }, files: { "a.md": "one\n" }, message: "base" });
    const base = git(repo, "rev-parse", "HEAD");
    writeFileSync(join(repo.work, "a.md"), "two\n");
    git(repo, "add", "-A");
    git(repo, "-c", "user.name=github-actions[bot]", "commit", "-q", "-m", "Add a line", "-m",
      `Task: ${task}\n${extraTrailers}Agent: Claude Code\nProducer-Run: https://github.com/o/r/actions/runs/1/attempts/1`);
    const delivery = git(repo, "rev-parse", "HEAD");
    git(repo, "push", "-q", "origin", `HEAD:refs/heads/${BRANCH}`);
    git(repo, "reset", "-q", "--hard", base);
    return { ...repo, base, delivery };
  }

  // The first answer is "Show the full diff in a pager?", the second is the push question.
  function deliver(repo: Repo, branch: string, input: string, fail = "", extra: NodeJS.ProcessEnv = {}): ScriptRun {
    return runScript(repo, script, ["--delivery", branch], { input, env: { STUB_FAIL: fail, ...extra } });
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

  it("SPEC-001-R210 refuses a tip whose Task trailers are not exactly the task, one main already holds, and one main has moved past", { timeout: TIMEOUT }, () => {
    const other = makeRepo("TASK-OTHER");
    const r = deliver(other, BRANCH, "y\ny\n");
    expect([r.status, r.out]).toEqual([1, expect.stringContaining('has the Task trailer "TASK-OTHER", not "TASK-T1"')]);
    expect([originRef(other, "main"), originRef(other, OWNER_BRANCH)]).toEqual([other.base, ""]);

    const twice = makeRepo("TASK-T1", "Task: TASK-T1\n");
    const t = deliver(twice, BRANCH, "y\ny\n");
    expect([t.status, t.out]).toEqual([1, expect.stringContaining('has the Task trailer "TASK-T1,TASK-T1", not "TASK-T1"')]);
    expect(originRef(twice, OWNER_BRANCH)).toBe("");

    const landed = makeRepo();
    git(landed, "push", "-q", "origin", `${landed.delivery}:refs/heads/main`);
    const l = deliver(landed, BRANCH, "y\ny\n");
    expect([l.status, l.out]).toEqual([1, expect.stringContaining("main is already at ")]);
    expect(originRef(landed, OWNER_BRANCH)).toBe("");

    const moved = makeRepo();
    git(moved, "commit", "-q", "--allow-empty", "-m", "main moved");
    git(moved, "push", "-q", "origin", "main");
    const m = deliver(moved, BRANCH, "y\ny\n");
    expect([m.status, m.out]).toEqual([1, expect.stringContaining("main has moved since the producer made")]);
    expect(originRef(moved, OWNER_BRANCH)).toBe("");
  });

  it("SPEC-001-R210 refuses a candidate/<task>-owner branch that holds another commit, and reuses one that holds the delivery", { timeout: TIMEOUT }, () => {
    const taken = makeRepo();
    git(taken, "push", "-q", "origin", `${taken.base}:refs/heads/${OWNER_BRANCH}`);
    const r = deliver(taken, BRANCH, "y\ny\n");
    expect([r.status, r.out]).toEqual([1, expect.stringContaining(`${OWNER_BRANCH} already holds`)]);
    expect([originRef(taken, "main"), originRef(taken, OWNER_BRANCH)]).toEqual([taken.base, taken.base]);

    const again = makeRepo();
    git(again, "push", "-q", "origin", `${again.delivery}:refs/heads/${OWNER_BRANCH}`);
    const a = deliver(again, BRANCH, "n\ny\n");
    expect([a.status, originRef(again, "main"), originRef(again, BRANCH), originRef(again, OWNER_BRANCH)]).toEqual([0, again.delivery, "", ""]);
  });

  it("SPEC-001-R210 leaves main and the producer branch alone when the owner branch's run fails", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const r = deliver(repo, BRANCH, "n\ny\n", "101");
    expect(r.status).toBe(1);
    expect([originRef(repo, "main"), originRef(repo, BRANCH), originRef(repo, OWNER_BRANCH)]).toEqual([repo.base, repo.delivery, repo.delivery]);
    expect(r.out).toContain(`do not fix it with a commit on top`);
    expect(r.out).toContain(`git push origin --delete ${OWNER_BRANCH} ${BRANCH}`);
    expect(r.out).not.toContain("--to-main");
  });

  it("SPEC-001-R210 deletes the producer branch as soon as main holds the commit, even when main's run then fails", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    const r = deliver(repo, BRANCH, "n\ny\n", "202");
    expect(r.status).toBe(1);
    expect([originRef(repo, "main"), originRef(repo, BRANCH)]).toEqual([repo.delivery, ""]);
    expect(r.out).toContain(`Deleted ${BRANCH}.`);
  });

  it("SPEC-001-R210 deletes each branch only while it still holds the delivery", { timeout: TIMEOUT }, () => {
    const producerMoved = makeRepo();
    const p = deliver(producerMoved, BRANCH, "n\ny\n", "", { STUB_MOVE_RUN: "101", STUB_MOVE: `refs/heads/${BRANCH} ${producerMoved.base}` });
    expect([p.status, originRef(producerMoved, "main"), originRef(producerMoved, BRANCH), originRef(producerMoved, OWNER_BRANCH)])
      .toEqual([0, producerMoved.delivery, producerMoved.base, ""]);
    expect(p.out).toContain(`Kept ${BRANCH}: it now holds ${producerMoved.base.slice(0, 12)}`);

    const ownerMoved = makeRepo();
    const o = deliver(ownerMoved, BRANCH, "n\ny\n", "", { STUB_MOVE_RUN: "202", STUB_MOVE: `refs/heads/${OWNER_BRANCH} ${ownerMoved.base}` });
    expect([o.status, originRef(ownerMoved, BRANCH), originRef(ownerMoved, OWNER_BRANCH)]).toEqual([0, "", ownerMoved.base]);
    expect(o.out).toContain(`Kept ${OWNER_BRANCH}: it now holds ${ownerMoved.base.slice(0, 12)}`);
  });

  it("SPEC-001-R210 says to delete both branches, and never to reset the clone, when main refuses the push", { timeout: TIMEOUT }, () => {
    const repo = makeRepo();
    writeFileSync(join(repo.work, "b.md"), "other\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "someone else's commit");
    const sibling = git(repo, "rev-parse", "HEAD");
    git(repo, "reset", "-q", "--hard", repo.base);
    git(repo, "push", "-q", "origin", `${sibling}:refs/heads/scratch`);
    const r = deliver(repo, BRANCH, "n\ny\n", "", { STUB_MOVE_RUN: "101", STUB_MOVE: `refs/heads/main ${sibling}` });
    expect([r.status, originRef(repo, "main"), originRef(repo, BRANCH), originRef(repo, OWNER_BRANCH)]).toEqual([1, sibling, repo.delivery, repo.delivery]);
    expect(r.out).toContain(`git push origin --delete ${OWNER_BRANCH} ${BRANCH}`);
    expect(r.out).not.toContain("reset --hard");
  });
});
