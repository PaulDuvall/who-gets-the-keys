import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { commitRecord } from "../scripts/receipt.ts";

interface Step { uses?: string; run?: string; with?: Record<string, string> }
const jobs = (parse(readFileSync(".github/workflows/pipeline.yml", "utf8")) as { jobs: Record<string, { steps?: Step[]; permissions?: unknown }> }).jobs;
const steps = (job: string): string[] => (jobs[job]?.steps ?? []).map((s) => s.run ?? s.uses?.split("@")[0] ?? "");

describe("SPEC-001 receipt, slice 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "receipt-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" }).trim();
  const cli = (...args: string[]) => spawnSync("node", [resolve("scripts/receipt.ts"), ...args], { cwd: dir, encoding: "utf8" });

  it("SPEC-001-R45 records the commit's Spec and Agent trailers as reported, unfolding a folded trailer into one line, and never its model", () => {
    git("init", "-q", "-b", "main");
    git("commit", "-q", "--allow-empty", "-m", "agent change", "--trailer", "Spec: SPEC-001-R45", "--trailer", "Spec: SPEC-001-R50", "--trailer", "Agent: Claude\n Code", "--trailer", "Model: claude-opus-5-5");
    const agent = git("rev-parse", "HEAD");
    expect(commitRecord(agent, dir)).toEqual({ commit: agent, spec_ids: ["SPEC-001-R45", "SPEC-001-R50"], agent: "Claude Code", model: "not recorded" });
    expect(cli("predicate", agent).stdout).toBe(`${JSON.stringify({ commits: [commitRecord(agent, dir)] })}\n`);
    git("commit", "-q", "--allow-empty", "-m", "owner change");
    const owner = git("rev-parse", "HEAD");
    expect(commitRecord(owner, dir)).toEqual({ commit: owner, spec_ids: [], agent: "none reported", model: "not recorded" });
    expect(() => commitRecord("HEAD", dir)).toThrow("not a full commit SHA: HEAD");
    expect(() => commitRecord("0".repeat(40), dir)).toThrow("git cannot read commit");
    expect([cli("predicate", "0".repeat(40)).status, cli().status]).toEqual([1, 1]);
  });

  it("SPEC-001-R48 signs SLSA provenance and the provenance/v2 predicate over the zip with SHA-pinned actions, signing permissions only and no repository code, and SPEC-001-R50 the receipt job runs the check unmasked", () => {
    const attest = jobs["attest"]?.steps ?? [];
    expect([steps("attest"), steps("receipt")]).toEqual([["actions/download-artifact", "actions/attest-build-provenance", "actions/attest"],
      ["actions/checkout", "actions/setup-node", "actions/download-artifact", "gh --version && node scripts/checks.ts receipt dist/function.zip"]]);
    expect([attest.filter((s) => s.run !== undefined || !/@[0-9a-f]{40}$/.test(s.uses ?? "")), jobs["attest"]?.permissions]).toEqual([[], { "id-token": "write", attestations: "write" }]);
    expect(attest.slice(1).map((s) => s.with)).toEqual([{ "subject-path": "dist/function.zip" },
      { "subject-path": "dist/function.zip", "predicate-type": "https://github.com/PaulDuvall/who-gets-the-keys/provenance/v2", "predicate-path": "dist/receipt-predicate.json" }]);
    expect(steps("build")).toContain('node scripts/receipt.ts predicate "$GITHUB_SHA" > dist/receipt-predicate.json');
  });

  it("SPEC-001-R56 runs the attestation check, then the receipt check pinned to main, before any AWS call in the deploy job", () => {
    const order = ["actions/setup-node", "actions/download-artifact", "node scripts/checks.ts attestation dist/function.zip",
      "node scripts/checks.ts receipt dist/function.zip deploy", "aws-actions/configure-aws-credentials"];
    expect(steps("deploy").filter((s) => order.includes(s))).toEqual(order);
  });
});
