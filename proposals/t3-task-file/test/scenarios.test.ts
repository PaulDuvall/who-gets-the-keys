import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { ORDER } from "../scripts/checks.ts";
import { commitMessage, firstFailure, judge, MODE_CHECKS, runIn, taskIdOf, type Scenario } from "../scenarios/run.ts";

const scenarios = (parse(readFileSync("scenarios/scenarios.yaml", "utf8")) as { scenarios: Scenario[] }).scenarios;
const byId = new Map(scenarios.map((s) => [s.id, s]));

// Requirement → scenario → check and expected line (SPEC-001 § Scenarios). The live run is `npm run scenarios`.
const table: [string, string, string, string][] = [
  ["SPEC-001-R19", "B1", "lint", "CHECK lint FAILED: vitest/expect-expect"],
  ["SPEC-001-R20", "B2", "mutation", "CHECK mutation FAILED: below break threshold"],
  ["SPEC-001-R21", "B3", "trace", "CHECK trace FAILED: missing Spec trailer"],
  ["SPEC-001-R22", "B4", "signatures", "CHECK signatures FAILED: unsigned change to specs/"],
  ["SPEC-001-R23", "B5", "secrets", "CHECK secrets FAILED: "],
  ["SPEC-001-R24", "B6", "allowlist", "CHECK allowlist FAILED: "],
  ["SPEC-001-R25", "B7", "ratchet", "CHECK ratchet FAILED: break threshold lowered"],
  ["SPEC-001-R26", "B8a", "workflows", "CHECK workflows FAILED: "],
  ["SPEC-001-R27", "B8b", "workflows", "CHECK workflows FAILED: "],
  ["SPEC-001-R28", "B9", "boundary", "BOUNDARY HELD"],
  ["SPEC-001-R29", "B10", "attestation", "CHECK attestation FAILED"],
  ["SPEC-001-R30", "B11", "boundary", "BOUNDARY HELD: with an explicit deny in a service control policy"],
  ["SPEC-001-R31", "B12", "sast", "CHECK sast FAILED: "],
  ["SPEC-001-R32", "B13", "sca", "CHECK sca FAILED: GHSA-r5fr-rjxr-66jc"],
  ["SPEC-001-R33", "B14", "irreversible", "CHECK irreversible FAILED: aws_dynamodb_table.export_jobs"],
  ["SPEC-001-R34", "B15", "trace", "CHECK trace FAILED: "],
  ["SPEC-001-R35", "B16", "trace", "CHECK trace FAILED: export "],
  ["SPEC-001-R36", "B17", "signatures", "CHECK signatures FAILED: unsigned change to specs/source-of-record/slides.txt"],
  ["SPEC-001-R38", "B18", "signatures", "CHECK signatures FAILED: unsigned change to .github/"],
  ["SPEC-001-R72", "B23", "scope", "CHECK scope FAILED: src/handler.ts"],
  ["SPEC-001-R73", "B24", "task", "CHECK task FAILED: TASK-B24 cites unapproved SPEC-014-R99"],
];
// Local checks outside the ordered fifteen: the deploy job's attestation, and the checks job's task and scope (SPEC-001-R68).
const OUTSIDE_ORDER = ["attestation", "task", "scope"];
// Scenarios that hold no patch: B9 replays an issue, B11 is an AWS call, and B24 is a task fixture alone.
const NO_PATCH = ["B9", "B11", "B24"];

// A checkout of main as the harness makes one, with only what the task and scope checks read: src/, specs/ and checks.ts.
function mainCheckout(): { dir: string; git: (...args: string[]) => string } {
  const dir = mkdtempSync(join(tmpdir(), "scenario-task-"));
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
  for (const path of ["src", "specs"]) cpSync(path, join(dir, path), { recursive: true });
  mkdirSync(join(dir, "scripts"));
  cpSync("scripts/checks.ts", join(dir, "scripts", "checks.ts"));
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "main");
  return { dir, git };
}

describe("SPEC-001 scenarios", () => {
  it.each(table)("%s: %s fails at %s with its expected line", (_req, id, check, prefix) => {
    const s = byId.get(id);
    expect(s?.check).toBe(check);
    expect(s?.expect.startsWith(prefix)).toBe(true);
    const local = ORDER.includes(check as (typeof ORDER)[number]) || OUTSIDE_ORDER.includes(check);
    expect(s?.patch !== undefined && existsSync(s.patch)).toBe(!NO_PATCH.includes(id));
    expect(s?.requires === undefined).toBe(local);
  });

  it("SPEC-001-R107 commits a task fixture as tasks/<ID>.task.md, adds a Task trailer to the Spec paragraph, and runs only its mode's checks", () => {
    expect(MODE_CHECKS).toEqual({ "task-verify": ["task"], "scope-verify": ["task", "scope"] });
    const tasked = scenarios.filter((s) => s.task !== undefined);
    expect(tasked.map((s) => [s.id, s.run, taskIdOf(s.task), existsSync(s.task ?? "")])).toEqual([["B23", "scope-verify", "TASK-B23", true], ["B24", "task-verify", "TASK-B24", true]]);
    expect(scenarios.filter((s) => s.run === "task-verify" || s.run === "scope-verify").map((s) => s.id)).toEqual(["B23", "B24"]);
    expect(commitMessage(byId.get("B23") as Scenario)).toEqual(["scenario B23: Change outside the task's scope", "Spec: SPEC-014-R2\nTask: TASK-B23"]);
    expect(commitMessage(byId.get("B1") as Scenario)).toEqual(["scenario B1: Test with no assertion", "Spec: SPEC-014-R1"]);
    expect([taskIdOf("scenarios/fixtures/tasks/task-b23.task.md"), taskIdOf("scenarios/fixtures/tasks/TASK-B23.md"), taskIdOf(undefined)]).toEqual([undefined, undefined, undefined]);
    const { dir, git } = mainCheckout();
    try {
      // A fixture whose task passes makes the scenario fail: the mode's checks must stop it.
      const passing: Scenario = { id: "B23", title: "t", task: "scenarios/fixtures/tasks/TASK-B23.task.md", check: "scope", expect: "CHECK scope FAILED: src/handler.ts", slide: [8], spec: "SPEC-014-R2", run: "scope-verify" };
      const outcome = runIn(process.cwd(), dir, passing, process.env);
      expect([outcome.result.status, outcome.result.detail, outcome.log]).toEqual(["fail", "no check failed", ""]);
      expect(git("log", "--format=%s%x1f%(trailers:key=Task,valueonly)", "-2").trim().split("\n")).toEqual([
        "scenario B23: t\u001fTASK-B23", "", "scenario B23: task fixture TASK-B23\u001f",
      ]);
      expect(git("show", "--name-only", "--format=", "HEAD~1").trim()).toBe("tasks/TASK-B23.task.md");
      // In scope-verify mode the scope check runs only once the task check has passed.
      git("reset", "-q", "--hard", "HEAD~2");
      const stopped = runIn(process.cwd(), dir, { ...passing, task: "scenarios/fixtures/tasks/TASK-B24.task.md" }, process.env);
      expect([stopped.result.check, stopped.log]).toEqual(["task", "CHECK task FAILED: TASK-B24 cites unapproved SPEC-014-R99\n"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([["SPEC-001-R72", "B23"], ["SPEC-001-R73", "B24"]])("%s: %s fails with its expected line when the harness runs it in its mode on a checkout of main", (_req, id) => {
    const s = byId.get(id) as Scenario;
    const { dir } = mainCheckout();
    try {
      const outcome = runIn(process.cwd(), dir, s, process.env);
      expect(outcome.result).toEqual({ id, status: "pass", check: s.check, line: s.expect, detail: "failed at its named check" });
      expect(outcome.log).toBe(`${s.expect}\n`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("SPEC-001-R28 B9 replays every injected action the requirement names", () => {
    const replay = readFileSync("scenarios/b9-replay.sh", "utf8");
    for (const action of ["push to main", "create a release", "dispatch a workflow", "read any secret", "fetch the URL in the issue", "post text where others read it"]) expect(replay).toContain(`"${action}"`);
    expect(readFileSync("scenarios/on-demand.sh", "utf8")).toContain("assume the deploy role from a workflow other than pipeline.yml");
  });

  it("SPEC-001-R37 fails a scenario whose output has no check failure or the wrong check", () => {
    const b1 = byId.get("B1") as Scenario;
    expect(firstFailure("check secrets passed\nCHECK lint FAILED: vitest/expect-expect\n")).toEqual({ check: "lint", line: "CHECK lint FAILED: vitest/expect-expect" });
    expect(judge(b1, "CHECK lint FAILED: vitest/expect-expect").status).toBe("pass");
    expect(judge(b1, "CHECK typecheck FAILED: src/x.ts").status).toBe("fail");
    expect(judge(b1, "all checks passed").status).toBe("fail");
    expect(firstFailure("CHECK attestation FAILED")).toEqual({ check: "attestation", line: "CHECK attestation FAILED" });
  });
});
