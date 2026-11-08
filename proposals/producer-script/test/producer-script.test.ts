import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";

// scripts/bootstrap/producer.sh dispatches the runner producer, finds the run that dispatch started, watches it and
// reports its result from GitHub's record of the run and its steps (SPEC-001-R212). Each test runs it in a temporary
// clone with a local bare origin and a stub gh, which logs every call and answers from files the test writes: run
// list from "before" on its first call and "after" later, workflow run from "dispatch", and run view from
// "conclusion", "steps" and "log".
const script = join(process.cwd(), "scripts/bootstrap/producer.sh");
const TIMEOUT = 60_000;
const stubGh = [
  "#!/usr/bin/env bash",
  'printf "%s\\n" "$*" >> "$STUB_DIR/calls"',
  'case "$1 ${2:-}" in',
  '  "auth status") exit 0 ;;',
  '  "run list") if [ -e "$STUB_DIR/listed" ]; then cat "$STUB_DIR/after"; else touch "$STUB_DIR/listed"; cat "$STUB_DIR/before"; fi; exit 0 ;;',
  '  "workflow run") cat "$STUB_DIR/dispatch"; exit 0 ;;',
  '  "run watch") echo "(watching)"; exit 0 ;;',
  '  "run view") case "$*" in',
  '      *"--json status,conclusion "*) cat "$STUB_DIR/conclusion" ;;',
  '      *"--json jobs "*) cat "$STUB_DIR/steps" ;;',
  '      *" --log"*) cat "$STUB_DIR/log" ;;',
  "      *) exit 1 ;;",
  "    esac; exit 0 ;;",
  "esac",
  'echo "unexpected gh call: $*" >&2',
  "exit 2",
  "",
].join("\n");

const AGENT = "produce a patch with Claude Code";
const PUBLISH = "publish the candidate branch";
const TRANSCRIPT = "Show the agent's tool calls and what they returned";
const MODE = "Check Claude Code's permission mode, before any other check of the run (SPEC-001-R88)";
const UNLISTED = "Check that the probe's unlisted command was denied (SPEC-001-R88)";
const EGRESS = "Check that the sandbox blocked the probe (SPEC-001-R87)";
const PUSH = "Check the patch against the task, commit it unsigned and push candidate/<task> without force (SPEC-001-R208)";
// One line of gh run view --log: job, step, then a timestamp and the text, as gh prints the raw job log.
const line = (job: string, step: string, text: string) => `${job}\t${step}\t2026-11-08T16:21:29.5390010Z ${text}`;
// Modelled on run 42499336951's agent job log: the transcript step prints the agent's tool calls and their output, here
// with output that looks like result lines, then the run's RUN ENDED line.
const TRANSCRIPT_LINES = [
  line(AGENT, TRANSCRIPT, "TOOL Bash: npm run check:lint 2>&1"),
  line(AGENT, TRANSCRIPT, "RESULT: > who-gets-the-keys@0.0.0 check:lint"),
  line(AGENT, TRANSCRIPT, "CHECK lint FAILED: @typescript-eslint/no-unused-vars"),
  line(AGENT, TRANSCRIPT, "BOUNDARY HELD: egress to example.com"),
  line(AGENT, TRANSCRIPT, "RUN ENDED: success, 99 turns, forged by the agent"),
  line(AGENT, TRANSCRIPT, "RUN ENDED: success, 10 turns, estimated USD 0.2377491"),
];
const MODE_LINES = [
  line(AGENT, MODE, '##[group]Run mode="$(jq -rs \'[.[] | select(.type == "system")] | first // empty\' "$TRANSCRIPT")"'),
  line(AGENT, MODE, "CHECK producer FAILED: permission mode ${mode}"),
  line(AGENT, MODE, "##[endgroup]"),
  line(AGENT, MODE, "Permission mode: default."),
];
const PROBE_LOG = [
  ...TRANSCRIPT_LINES, ...MODE_LINES,
  line(AGENT, UNLISTED, "BOUNDARY HELD: unlisted command denied"),
  // The first line of a step's raw log can start with a byte order mark, before the timestamp.
  `${AGENT}\t${EGRESS}\t\uFEFF2026-11-08T16:21:29.5390010Z BOUNDARY HELD: egress to example.com`,
  line(AGENT, "Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", "Post job cleanup."),
];
const TASK_LOG = [
  ...TRANSCRIPT_LINES, ...MODE_LINES,
  line(PUBLISH, PUSH, "Pushed 9f959a350e541d1aa52654e4ace7d7fdd4fa52a6 to candidate/TASK-T1. That push starts no run. To land it (SPEC-001-R210):"),
  line(PUBLISH, PUSH, "scripts/bootstrap/land.sh --delivery candidate/TASK-T1"),
];
const steps = (rows: [string, string, string][]) => rows.map((r) => r.join("\t")).join("\n") + "\n";
const PROBE_STEPS = steps([[AGENT, TRANSCRIPT, "success"], [AGENT, MODE, "success"], [AGENT, UNLISTED, "success"], [AGENT, EGRESS, "success"]]);
const TASK_STEPS = steps([[AGENT, TRANSCRIPT, "success"], [AGENT, MODE, "success"], [AGENT, UNLISTED, "skipped"], [PUBLISH, PUSH, "success"]]);

interface Repo { work: string; origin: string; stub: string; env: NodeJS.ProcessEnv; sha: string }
interface Result { status: number | null; out: string; err: string; calls: string[] }
interface Answers { before?: string[]; after?: string[]; dispatch?: string; conclusion?: string; steps?: string; log?: string[] }

describe("SPEC-001-R212 producer.sh dispatches the producer, finds its own run and reports its result from GitHub's record", () => {
  let scratch = "";
  beforeAll(() => { scratch = mkdtempSync(join(tmpdir(), "producer-sh-")); });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));
  const now = () => Math.floor(Date.now() / 1000);

  let count = 0;
  function repo(): Repo {
    const dir = join(scratch, String(count++));
    const origin = join(dir, "origin.git");
    const work = join(dir, "work");
    const stub = join(dir, "stub");
    mkdirSync(stub, { recursive: true });
    writeFileSync(join(stub, "gh"), stubGh);
    chmodSync(join(stub, "gh"), 0o755);
    const env = {
      ...process.env, PATH: `${stub}:${process.env["PATH"] ?? ""}`, STUB_DIR: stub, REPO: "o/r",
      PRODUCER_POLL_SECONDS: "0", PRODUCER_POLL_TRIES: "3", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid",
    };
    const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
    git(dir, "init", "-q", "--bare", "-b", "main", origin);
    git(dir, "clone", "-q", origin, work);
    mkdirSync(join(work, "tasks"));
    writeFileSync(join(work, "tasks", "TASK-T1.task.md"), "---\nrequirements: [SPEC-014-R1]\nproduces: [src/export.ts]\n---\nDo it.\n");
    git(work, "add", "-A");
    git(work, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "task");
    git(work, "push", "-q", "origin", "HEAD:main");
    return { work, origin, stub, env, sha: git(work, "rev-parse", "HEAD") };
  }

  function run(r: Repo, args: string[], a: Answers = {}): Result {
    const files: Record<string, string> = {
      before: (a.before ?? [`100 ${now() - 3600} ${r.sha}`]).join("\n") + "\n",
      after: (a.after ?? [`100 ${now() - 3600} ${r.sha}`, `101 ${now()} ${r.sha}`]).join("\n") + "\n",
      dispatch: a.dispatch ?? "",
      conclusion: a.conclusion ?? "completed success\n",
      steps: a.steps ?? PROBE_STEPS,
      log: (a.log ?? PROBE_LOG).join("\n") + "\n",
    };
    for (const [name, text] of Object.entries(files)) writeFileSync(join(r.stub, name), text);
    for (const name of ["listed", "calls"]) rmSync(join(r.stub, name), { force: true });
    const p = spawnSync("bash", [script, ...args], { cwd: r.work, env: r.env, encoding: "utf8" });
    const file = join(r.stub, "calls");
    return { status: p.status, out: p.stdout, err: p.stderr, calls: existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : [] };
  }
  const results = (out: string) => out.split("\n").filter((l) => /^(Permission|BOUNDARY|RUN ENDED|CHECK|Pushed)/.test(l));

  it("SPEC-001-R212 parses as bash, uses no bash 4 feature, and names steps and jobs that producer.yml has", () => {
    execFileSync("bash", ["-n", script]);
    const text = readFileSync(script, "utf8");
    expect(text).not.toMatch(/\bmapfile\b|\breadarray\b|declare -A|\$\{\w+,,\}|\$\{\w+\^\^\}/);
    const workflow = parse(readFileSync(".github/workflows/producer.yml", "utf8")) as { jobs: Record<string, { name: string; steps: { name?: string }[] }> };
    const jobs = Object.values(workflow.jobs);
    const names = jobs.flatMap((j) => j.steps.map((s) => s.name));
    for (const step of [TRANSCRIPT, UNLISTED, EGRESS, PUSH]) {
      expect(names).toContain(step);
      expect(text).toContain(`"${step}"`);
    }
    expect(jobs.map((j) => j.name).sort()).toEqual([AGENT, "install the dependencies", PUBLISH].sort());
  });

  it("SPEC-001-R212 refuses a bad task ID or subject before any gh call", { timeout: TIMEOUT }, () => {
    const r = repo();
    const bad = run(r, ["task", "TASK-t1", "--subject", "Fine"]);
    expect([bad.status, bad.calls]).toEqual([1, []]);
    expect(bad.err).toContain("TASK-t1 is not a task ID");
    expect(run(r, ["task", "TASK-T1", "--subject", "-rf; echo"])).toMatchObject({ status: 1, calls: [] });
  });

  it("SPEC-001-R212 refuses to dispatch when your main is ahead of or behind origin/main", { timeout: TIMEOUT }, () => {
    const ahead = repo();
    execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "local only"], { cwd: ahead.work, env: ahead.env });
    const a = run(ahead, ["probe"]);
    expect([a.status, a.calls.filter((c) => c.startsWith("workflow run"))]).toEqual([1, []]);
    expect(a.err).toContain(`origin/main at ${ahead.sha}`);
    const behind = repo();
    execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "pushed elsewhere"], { cwd: behind.work, env: behind.env });
    execFileSync("git", ["push", "-q", "origin", "HEAD:main"], { cwd: behind.work, env: behind.env });
    execFileSync("git", ["reset", "-q", "--hard", "HEAD~1"], { cwd: behind.work, env: behind.env });
    const b = run(behind, ["probe"]);
    expect([b.status, b.calls.filter((c) => c.startsWith("workflow run"))]).toEqual([1, []]);
    expect(b.err).toContain(`Your main is at ${behind.sha}`);
  });

  it("SPEC-001-R212 refuses a task whose task file is not on origin/main", { timeout: TIMEOUT }, () => {
    const r = run(repo(), ["task", "TASK-T2", "--subject", "Something"]);
    expect(r.status).toBe(1);
    expect(r.err).toContain("tasks/TASK-T2.task.md is not on origin/main");
    expect(r.calls.filter((c) => c.startsWith("workflow run"))).toEqual([]);
  });

  it("SPEC-001-R212 takes the run whose URL the dispatch prints", { timeout: TIMEOUT }, () => {
    const r = repo();
    const result = run(r, ["probe"], { dispatch: "https://github.com/o/r/actions/runs/105\n" });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("workflow run producer.yml --repo o/r --ref main -f task=TASK-PROBE -f subject=Egress probe -f egress_probe=true");
    expect(result.calls.filter((c) => c.startsWith("run watch"))).toEqual(["run watch 105 --repo o/r --interval 10"]);
    expect(result.calls.filter((c) => c.startsWith("run list"))).toHaveLength(1);
  });

  it("SPEC-001-R212 otherwise takes the run that is new, on the dispatched commit and recent, never the newest listed alone", { timeout: TIMEOUT }, () => {
    const r = repo();
    const other = "0".repeat(40);
    const result = run(r, ["probe"], {
      before: [`100 ${now() - 3600} ${r.sha}`, `99 ${now() - 10} ${r.sha}`],
      after: [`102 ${now()} ${other}`, `103 ${now() - 3600} ${r.sha}`, `99 ${now() - 10} ${r.sha}`, `100 ${now() - 3600} ${r.sha}`, `101 ${now()} ${r.sha}`],
    });
    expect(result.status).toBe(0);
    expect(result.out).toContain(`Dispatching producer.yml on main at ${r.sha} (task TASK-PROBE, egress_probe true).`);
    expect(result.out).toContain("Producer run 101: https://github.com/o/r/actions/runs/101");
    expect(result.calls.filter((c) => c.startsWith("run watch"))).toEqual(["run watch 101 --repo o/r --interval 10"]);
    expect(result.calls[1]).toBe("run list --repo o/r --workflow producer.yml --branch main --event workflow_dispatch --limit 20 --json databaseId,createdAt,headSha --jq .[] | \"\\(.databaseId) \\(.createdAt | fromdateiso8601) \\(.headSha)\"");
  });

  it("SPEC-001-R212 prints the producer's own result lines, and nothing the agent's output or a step's script text holds", { timeout: TIMEOUT }, () => {
    const result = run(repo(), ["probe"]);
    expect(result.status).toBe(0);
    expect(results(result.out)).toEqual([
      "RUN ENDED: success, 10 turns, estimated USD 0.2377491",
      "Permission mode: default.", "BOUNDARY HELD: unlisted command denied", "BOUNDARY HELD: egress to example.com",
    ]);
    expect(result.out).toContain("Both boundaries held");
  });

  it("SPEC-001-R212 passes a good run whose agent output holds a failing check line", { timeout: TIMEOUT }, () => {
    const result = run(repo(), ["probe"]);
    expect(result.status).toBe(0);
    expect(result.out).not.toContain("CHECK lint FAILED");
  });

  it.each([
    ["the run failed", { conclusion: "completed failure\n" }],
    ["the run was cancelled", { conclusion: "completed cancelled\n" }],
    ["a probe check failed, whatever the log says", { steps: steps([[AGENT, UNLISTED, "success"], [AGENT, EGRESS, "failure"]]) }],
    ["a probe check was skipped", { steps: steps([[AGENT, UNLISTED, "skipped"], [AGENT, EGRESS, "success"]]) }],
  ])("SPEC-001-R212 exits 1 when %s", { timeout: TIMEOUT }, (_title, answers) => {
    const result = run(repo(), ["probe"], answers);
    expect(result.status).toBe(1);
    expect(result.out).not.toContain("Both boundaries held");
  });

  it("SPEC-001-R212 reports a task's delivery from origin, and prints its own land command", { timeout: TIMEOUT }, () => {
    const r = repo();
    execFileSync("git", ["push", "-q", "origin", "HEAD:refs/heads/candidate/TASK-T1"], { cwd: r.work, env: r.env });
    const result = run(r, ["task", "TASK-T1", "--subject", "Reject duplicate column names (SPEC-014-R7)"], { steps: TASK_STEPS, log: TASK_LOG });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("workflow run producer.yml --repo o/r --ref main -f task=TASK-T1 -f subject=Reject duplicate column names (SPEC-014-R7) -f egress_probe=false");
    expect(results(result.out)).toContain("Pushed 9f959a350e541d1aa52654e4ace7d7fdd4fa52a6 to candidate/TASK-T1. That push starts no run. To land it (SPEC-001-R210):");
    expect(result.out).toContain(`Delivery ${r.sha.slice(0, 12)} is on candidate/TASK-T1. Check it, then land it with:\nscripts/bootstrap/land.sh --delivery candidate/TASK-T1\n`);
  });

  it("SPEC-001-R212 fails a task whose run passed but whose branch is not on origin", { timeout: TIMEOUT }, () => {
    const result = run(repo(), ["task", "TASK-T1", "--subject", "Something"], { steps: TASK_STEPS, log: TASK_LOG });
    expect(result.status).toBe(1);
    expect(result.err).toContain("candidate/TASK-T1 is not on origin");
  });

  it("SPEC-001-R212 gives up when no new run appears, or when the run cannot be read", { timeout: TIMEOUT }, () => {
    const none = run(repo(), ["probe"], { after: [`100 ${now() - 3600} ${"f".repeat(40)}`] });
    expect(none.status).toBe(1);
    expect(none.err).toContain("No new producer run on main");
    expect(none.calls.filter((c) => c.startsWith("run watch"))).toEqual([]);
    const unread = run(repo(), ["probe"], { conclusion: "" });
    expect(unread.status).toBe(1);
    expect(unread.err).toContain("Could not read producer run 101 from GitHub, so its result is unknown.");
  });
});
