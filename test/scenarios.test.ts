import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { ORDER } from "../scripts/checks.ts";
import { firstFailure, judge, type Scenario } from "../scenarios/run.ts";

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
];

describe("SPEC-001 scenarios", () => {
  it.each(table)("%s: %s fails at %s with its expected line", (_req, id, check, prefix) => {
    const s = byId.get(id);
    expect(s?.check).toBe(check);
    expect(s?.expect.startsWith(prefix)).toBe(true);
    const local = ORDER.includes(check as (typeof ORDER)[number]) || check === "attestation";
    expect(s?.patch !== undefined && existsSync(s.patch)).toBe(local || id === "B14");
    expect(s?.requires === undefined).toBe(local);
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
