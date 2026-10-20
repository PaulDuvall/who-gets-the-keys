import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { ORDER } from "../scripts/gates.ts";
import { firstFailure, judge, type Scenario } from "../scenarios/run.ts";

const scenarios = (parse(readFileSync("scenarios/scenarios.yaml", "utf8")) as { scenarios: Scenario[] }).scenarios;
const byId = new Map(scenarios.map((s) => [s.id, s]));

// Requirement → scenario → gate and expected line (SPEC-001 § Scenarios). The live run is `npm run scenarios`.
const table: [string, string, string, string][] = [
  ["SPEC-001-R19", "B1", "lint", "GATE lint FAILED: vitest/expect-expect"],
  ["SPEC-001-R20", "B2", "mutation", "GATE mutation FAILED: below break threshold"],
  ["SPEC-001-R21", "B3", "trace", "GATE trace FAILED: missing Spec trailer"],
  ["SPEC-001-R22", "B4", "signatures", "GATE signatures FAILED: unsigned change to specs/"],
  ["SPEC-001-R23", "B5", "secrets", "GATE secrets FAILED: "],
  ["SPEC-001-R24", "B6", "allowlist", "GATE allowlist FAILED: "],
  ["SPEC-001-R25", "B7", "ratchet", "GATE ratchet FAILED: break threshold lowered"],
  ["SPEC-001-R26", "B8a", "workflows", "GATE workflows FAILED: "],
  ["SPEC-001-R27", "B8b", "workflows", "GATE workflows FAILED: "],
  ["SPEC-001-R28", "B9", "boundary", "BOUNDARY HELD"],
  ["SPEC-001-R29", "B10", "attestation", "GATE attestation FAILED"],
  ["SPEC-001-R30", "B11", "boundary", "BOUNDARY HELD: with an explicit deny in a service control policy"],
  ["SPEC-001-R31", "B12", "sast", "GATE sast FAILED: "],
  ["SPEC-001-R32", "B13", "sca", "GATE sca FAILED: GHSA-35jh-r3h4-6jhm"],
  ["SPEC-001-R33", "B14", "irreversible", "GATE irreversible FAILED: aws_dynamodb_table.export_jobs"],
  ["SPEC-001-R34", "B15", "trace", "GATE trace FAILED: "],
  ["SPEC-001-R35", "B16", "trace", "GATE trace FAILED: export "],
  ["SPEC-001-R36", "B17", "signatures", "GATE signatures FAILED: unsigned change to specs/source-of-record/slides.txt"],
];

describe("SPEC-001 scenarios", () => {
  it.each(table)("%s: %s fails at %s with its expected line", (_req, id, gate, prefix) => {
    const s = byId.get(id);
    expect(s?.gate).toBe(gate);
    expect(s?.expect.startsWith(prefix)).toBe(true);
    expect(s && existsSync(s.patch)).toBe(true);
    const local = ORDER.includes(gate as (typeof ORDER)[number]) || gate === "attestation";
    expect(s?.requires === undefined).toBe(local);
  });

  it("SPEC-001-R28 B9 replays every injected action the requirement names", () => {
    const replay = readFileSync("scenarios/b9-replay.sh", "utf8");
    for (const action of ["push to main", "create a release", "dispatch a workflow", "read any secret", "fetch the URL in the issue"]) expect(replay).toContain(`"${action}"`);
    expect(readFileSync("scenarios/on-demand.sh", "utf8")).toContain("assume the deploy role with the triage OIDC token");
  });

  it("SPEC-001-R37 fails a scenario whose output has no gate failure or the wrong gate", () => {
    const b1 = byId.get("B1") as Scenario;
    expect(firstFailure("gate secrets passed\nGATE lint FAILED: vitest/expect-expect\n")).toEqual({ gate: "lint", line: "GATE lint FAILED: vitest/expect-expect" });
    expect(judge(b1, "GATE lint FAILED: vitest/expect-expect").status).toBe("pass");
    expect(judge(b1, "GATE typecheck FAILED: src/x.ts").status).toBe("fail");
    expect(judge(b1, "all gates passed").status).toBe("fail");
    expect(firstFailure("GATE attestation FAILED")).toEqual({ gate: "attestation", line: "GATE attestation FAILED" });
  });
});
