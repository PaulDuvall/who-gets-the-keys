import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// scripts/bootstrap/producer.sh dispatches the runner producer, finds the run that dispatch started, watches it and
// prints only its result lines (SPEC-001-R212). Each test runs it in a temporary clone with a local bare origin and a
// stub gh. The stub logs every call. run list prints STUB_BEFORE on its first call and STUB_AFTER on later ones, each
// a file of "<ID> <created> <head SHA>" lines; run watch exits STUB_WATCH; run view prints the file STUB_LOG.
const script = join(process.cwd(), "scripts/bootstrap/producer.sh");
const TIMEOUT = 60_000;
const stubGh = [
  "#!/usr/bin/env bash",
  'printf "%s\\n" "$*" >> "$STUB_DIR/calls"',
  'case "$1 ${2:-}" in',
  '  "auth status") exit 0 ;;',
  '  "run list") if [ -e "$STUB_DIR/listed" ]; then cat "$STUB_AFTER"; else touch "$STUB_DIR/listed"; cat "$STUB_BEFORE"; fi; exit 0 ;;',
  '  "workflow run") exit 0 ;;',
  '  "run watch") exit "${STUB_WATCH:-0}" ;;',
  '  "run view") cat "$STUB_LOG"; exit 0 ;;',
  "esac",
  'echo "unexpected gh call: $*" >&2',
  "exit 2",
  "",
].join("\n");

const now = () => Math.floor(Date.now() / 1000);
// One line of gh run view --log: job, step and a timestamp before the text, as GitHub prints it.
const line = (text: string, step = "Check how the agent's run ended (SPEC-001-R89)") => `produce a patch with Claude Code\t${step}\t2026-11-08T16:21:29.1234567Z ${text}`;
const PROBE_LOG = [
  line("##[group]Run id=\"$(jq -r 'probe' \"$RUNNER_TEMP/transcript.jsonl\")\""),
  line("BOUNDARY BROKEN: this is script text inside the step's group, never a result"),
  line("CHECK producer FAILED: also script text"),
  line("##[endgroup]"),
  line("RUN ENDED: success, 4 turns, estimated USD 0.12"),
  line("Permission mode: default."),
  line("BOUNDARY HELD: unlisted command denied"),
  line("BOUNDARY HELD: egress to example.com"),
  line("Post job cleanup."),
];
const TASK_LOG = [
  line("RUN ENDED: success, 12 turns, estimated USD 0.40"),
  line("Permission mode: default."),
  "publish the candidate branch\tCheck the patch\t2026-11-08T16:21:46.7Z ##[group]Run patch=\"$RUNNER_TEMP/patch/changes.diff\"",
  "publish the candidate branch\tCheck the patch\t2026-11-08T16:21:46.7Z scripts/bootstrap/land.sh --delivery candidate/TASK-WRONG",
  "publish the candidate branch\tCheck the patch\t2026-11-08T16:21:46.7Z ##[endgroup]",
  "publish the candidate branch\tCheck the patch\t2026-11-08T16:21:46.7Z remote: Create a pull request",
  "publish the candidate branch\tCheck the patch\t2026-11-08T16:21:46.7Z Pushed 9f959a350e541d1aa52654e4ace7d7fdd4fa52a6 to candidate/TASK-T1. That push starts no run. To land it (SPEC-001-R210):",
  "publish the candidate branch\tCheck the patch\t2026-11-08T16:21:46.7Z scripts/bootstrap/land.sh --delivery candidate/TASK-T1",
];

interface Repo { work: string; origin: string; stub: string; env: NodeJS.ProcessEnv; sha: string }
interface Result { status: number | null; out: string; err: string; calls: string[] }

describe("SPEC-001-R212 producer.sh dispatches the producer, finds its own run and prints only the result lines", () => {
  let scratch = "";
  beforeAll(() => { scratch = mkdtempSync(join(tmpdir(), "producer-sh-")); });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

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

  function run(r: Repo, args: string[], opts: { before?: string[]; after?: string[]; log?: string[]; watch?: number } = {}): Result {
    writeFileSync(join(r.stub, "before"), (opts.before ?? [`100 ${now() - 3600} ${r.sha}`]).join("\n") + "\n");
    writeFileSync(join(r.stub, "after"), (opts.after ?? [`100 ${now() - 3600} ${r.sha}`, `101 ${now()} ${r.sha}`]).join("\n") + "\n");
    writeFileSync(join(r.stub, "log"), (opts.log ?? PROBE_LOG).join("\n") + "\n");
    rmSync(join(r.stub, "listed"), { force: true });
    rmSync(join(r.stub, "calls"), { force: true });
    const env = { ...r.env, STUB_BEFORE: join(r.stub, "before"), STUB_AFTER: join(r.stub, "after"), STUB_LOG: join(r.stub, "log"), STUB_WATCH: String(opts.watch ?? 0) };
    const p = spawnSync("bash", [script, ...args], { cwd: r.work, env, encoding: "utf8" });
    const file = join(r.stub, "calls");
    return { status: p.status, out: p.stdout, err: p.stderr, calls: existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : [] };
  }

  it("SPEC-001-R212 parses as bash and uses no bash 4 feature, so it runs on macOS's bash 3.2", () => {
    execFileSync("bash", ["-n", script]);
    expect(readFileSync(script, "utf8")).not.toMatch(/\bmapfile\b|\breadarray\b|declare -A|\$\{\w+,,\}|\$\{\w+\^\^\}/);
  });

  it("SPEC-001-R212 refuses a bad task ID or subject before any gh call", { timeout: TIMEOUT }, () => {
    const r = repo();
    const bad = run(r, ["task", "TASK-t1", "--subject", "Fine"]);
    expect([bad.status, bad.calls]).toEqual([1, []]);
    expect(bad.err).toContain("TASK-t1 is not a task ID");
    const subject = run(r, ["task", "TASK-T1", "--subject", "-rf; echo"]);
    expect([subject.status, subject.calls]).toEqual([1, []]);
  });

  it("SPEC-001-R212 refuses to dispatch unless your main is origin/main", { timeout: TIMEOUT }, () => {
    const r = repo();
    execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "local only"], { cwd: r.work, env: r.env });
    const result = run(r, ["probe"]);
    expect(result.status).toBe(1);
    expect(result.err).toContain(`origin/main at ${r.sha}`);
    expect(result.calls.filter((c) => c.startsWith("workflow run"))).toEqual([]);
  });

  it("SPEC-001-R212 refuses a task whose task file is not on origin/main", { timeout: TIMEOUT }, () => {
    const r = repo();
    const result = run(r, ["task", "TASK-T2", "--subject", "Something"]);
    expect(result.status).toBe(1);
    expect(result.err).toContain("tasks/TASK-T2.task.md is not on origin/main");
    expect(result.calls.filter((c) => c.startsWith("workflow run"))).toEqual([]);
  });

  it("SPEC-001-R212 takes the run that is new, on the dispatched commit and recent, never the newest listed alone", { timeout: TIMEOUT }, () => {
    const r = repo();
    const other = "0".repeat(40);
    const result = run(r, ["probe"], {
      before: [`100 ${now() - 3600} ${r.sha}`, `99 ${now() - 10} ${r.sha}`],
      after: [`102 ${now()} ${other}`, `103 ${now() - 3600} ${r.sha}`, `99 ${now() - 10} ${r.sha}`, `100 ${now() - 3600} ${r.sha}`, `101 ${now()} ${r.sha}`],
    });
    expect(result.status).toBe(0);
    expect(result.out).toContain(`Dispatching producer.yml on main at ${r.sha} (task TASK-PROBE, egress_probe true).`);
    expect(result.out).toContain("Producer run 101: https://github.com/o/r/actions/runs/101");
    expect(result.calls).toContain("workflow run producer.yml --repo o/r --ref main -f task=TASK-PROBE -f subject=Egress probe -f egress_probe=true");
    expect(result.calls.filter((c) => c.startsWith("run watch"))).toEqual(["run watch 101 --repo o/r --exit-status"]);
    expect(result.calls.indexOf("run list --repo o/r --workflow producer.yml --branch main --event workflow_dispatch --limit 20 --json databaseId,createdAt,headSha --jq .[] | \"\\(.databaseId) \\(.createdAt | fromdateiso8601) \\(.headSha)\""))
      .toBe(1);
  });

  it("SPEC-001-R212 prints only the result lines, never the steps' script text", { timeout: TIMEOUT }, () => {
    const r = repo();
    const result = run(r, ["probe"]);
    expect(result.status).toBe(0);
    const results = result.out.split("\n").filter((l) => /^(Permission|BOUNDARY|RUN ENDED|CHECK)/.test(l));
    expect(results).toEqual(["RUN ENDED: success, 4 turns, estimated USD 0.12", "Permission mode: default.", "BOUNDARY HELD: unlisted command denied", "BOUNDARY HELD: egress to example.com"]);
    expect(result.out).not.toContain("script text");
    expect(result.out).toContain("Both boundaries held.");
  });

  it.each([
    ["a BROKEN line", [line("BOUNDARY HELD: unlisted command denied"), line("BOUNDARY BROKEN: egress to example.com")], 0],
    ["an INVALID line", [line("BOUNDARY HELD: unlisted command denied"), line("BOUNDARY CHECK INVALID: egress probe did not run")], 0],
    ["a CHECK FAILED line", [line("CHECK producer FAILED: permission mode bypassPermissions")], 0],
    ["one HELD line only", [line("BOUNDARY HELD: unlisted command denied")], 0],
    ["a failed run", PROBE_LOG, 1],
  ])("SPEC-001-R212 exits 1 on %s", { timeout: TIMEOUT }, (_title, log, watch) => {
    const r = repo();
    const result = run(r, ["probe"], { log, watch });
    expect(result.status).toBe(1);
    expect(result.err).toMatch(/did not pass|did not print both BOUNDARY HELD lines/);
  });

  it("SPEC-001-R212 dispatches a task and ends on its own land command, not one from script text", { timeout: TIMEOUT }, () => {
    const r = repo();
    const result = run(r, ["task", "TASK-T1", "--subject", "Reject duplicate column names (SPEC-014-R7)"], { log: TASK_LOG });
    expect(result.status).toBe(0);
    expect(result.calls).toContain("workflow run producer.yml --repo o/r --ref main -f task=TASK-T1 -f subject=Reject duplicate column names (SPEC-014-R7) -f egress_probe=false");
    expect(result.out).not.toContain("TASK-WRONG");
    expect(result.out).toContain("scripts/bootstrap/land.sh --delivery candidate/TASK-T1\n");
    expect(result.out).toContain("Delivery on candidate/TASK-T1.");
    const missing = run(r, ["task", "TASK-T1", "--subject", "Reject duplicate column names"], { log: TASK_LOG.slice(0, 2) });
    expect(missing.status).toBe(1);
    expect(missing.err).toContain("printed no land command for candidate/TASK-T1");
  });

  it("SPEC-001-R212 gives up after its tries when no new run appears, and watches nothing", { timeout: TIMEOUT }, () => {
    const r = repo();
    const result = run(r, ["probe"], { after: [`100 ${now() - 3600} ${r.sha}`] });
    expect(result.status).toBe(1);
    expect(result.err).toContain("No new producer run on main");
    expect(result.calls.filter((c) => c.startsWith("run watch"))).toEqual([]);
  });
});
