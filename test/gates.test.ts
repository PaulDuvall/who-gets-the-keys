import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import eslintConfig from "../eslint.config.js";
import {
  COMMANDS, GateFailure, ORDER, allowedNames, dependencyNames, destructiveChanges, exportsOf, failedTestFiles,
  jobBlock, lockfilePaths, lowered, pipelineCacheFinding, mutationId, names, requirementIds, sha256, signatureId, slideNumbers, snapshotBody, topAdvisory, verifySigned,
} from "../scripts/gates.ts";

const read = (path: string) => readFileSync(path, "utf8");

describe("SPEC-001 gates", () => {
  it("SPEC-001-R1 runs the fifteen gates in order and prints one stable failure line", () => {
    expect(ORDER).toEqual(["secrets", "allowlist", "workflows", "install", "lint", "typecheck", "iac", "sast", "sca", "trace", "signatures", "slides", "ratchet", "test", "mutation"]);
    expect(new GateFailure("lint", "vitest/expect-expect").message).toBe("GATE lint FAILED: vitest/expect-expect");
  });

  it("SPEC-001-R2 scans with gitleaks and excludes only scenario patches from source paths", () => {
    expect(COMMANDS.secrets.slice(0, 2)).toEqual(["gitleaks", "dir"]);
    const paths = [...read(".gitleaks.toml").matchAll(/'''(.+?)'''/g)].map((m) => new RegExp(m[1] ?? "$^"));
    const excluded = (p: string) => paths.some((r) => r.test(p));
    expect(excluded("scenarios/B05-secret.patch")).toBe(true);
    expect(excluded("src/handler.ts")).toBe(false);
    expect(excluded("scenarios/run.ts")).toBe(false);
  });

  it("SPEC-001-R3 collects every dependency field and ignores allowlist comments", () => {
    const pkg = { dependencies: { a: "1" }, devDependencies: { b: "1" }, optionalDependencies: { c: "1" }, peerDependencies: { d: "1" } };
    expect(dependencyNames(pkg)).toEqual(["a", "b", "c", "d"]);
    expect([...allowedNames("# note\na\n\n b \n")]).toEqual(["a", "b"]);
  });

  it("SPEC-001-R4 runs zizmor offline and extracts a job's block for the replay-parity check", () => {
    expect(COMMANDS.workflows).toContain("--offline");
    const wf = "jobs:\n  triage:\n    runs-on: x\n    permissions:\n      contents: read\n      issues: write\n    steps: []\n  other:\n    permissions: {}\n";
    expect(jobBlock(wf, "triage", "permissions")).toEqual(["    permissions:", "      contents: read", "      issues: write"]);
    expect(jobBlock(wf, "missing", "permissions")).toEqual([]);
    expect(pipelineCacheFinding(read(".github/workflows/pipeline.yml"))).toBe(false);
    expect(pipelineCacheFinding("on: push\njobs: {}\n")).toBe(true);
    expect(pipelineCacheFinding("cache-mode: none\n      - uses: actions/cache@abc # v6\n")).toBe(true);
    expect(pipelineCacheFinding("cache-mode: none\n    cache-mode: write\n")).toBe(true);
    expect(pipelineCacheFinding("cache-mode: none\n          cache: npm\n")).toBe(true);
  });

  it("SPEC-001-R5 installs from a lockfile that matches package.json", () => {
    expect(COMMANDS.install).toEqual(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
    const pkg = JSON.parse(read("package.json")) as { devDependencies: Record<string, string> };
    const lock = JSON.parse(read("package-lock.json")) as { packages: Record<string, { devDependencies?: Record<string, string> }> };
    expect(lock.packages[""]?.devDependencies).toEqual(pkg.devDependencies);
  });

  it("SPEC-001-R6 sets vitest/expect-expect to error for test files", () => {
    const testConfig = eslintConfig.find((c) => c.files?.includes("test/**/*.ts"));
    expect(testConfig?.rules?.["vitest/expect-expect"]).toBe("error");
  });

  it("SPEC-001-R7 type-checks with the four strict options", () => {
    const options = (JSON.parse(read("tsconfig.json")) as { compilerOptions: Record<string, unknown> }).compilerOptions;
    for (const key of ["strict", "noUncheckedIndexedAccess", "exactOptionalPropertyTypes", "verbatimModuleSyntax"]) expect(options[key]).toBe(true);
  });

  it("SPEC-001-R9 runs Semgrep p/default with findings failing and metrics off", () => {
    expect(COMMANDS.sast).toEqual(expect.arrayContaining(["p/default", "--error", "--metrics=off"]));
  });

  it("SPEC-001-R10 reports the most severe advisory, preferring its GHSA ID", () => {
    const groups = [{ ids: ["GHSA-29mw-wpgm-hmr9"], max_severity: "5.3" }, { ids: ["CVE-2021-23337", "GHSA-35jh-r3h4-6jhm"], max_severity: "7.2" }];
    expect(topAdvisory(groups)).toBe("GHSA-35jh-r3h4-6jhm");
    expect(topAdvisory([{ ids: ["GHSA-b"], max_severity: "5" }, { ids: ["GHSA-a"], max_severity: "5" }])).toBe("GHSA-a");
    expect(topAdvisory([])).toBeUndefined();
  });

  it("SPEC-001-R10 scans every committed lockfile, npm and Python", () => {
    expect(lockfilePaths()).toEqual(expect.arrayContaining(["package-lock.json", "video/record/package-lock.json", "scripts/ci/requirements.txt", "video/narration/requirements.txt"]));
  });

  it("SPEC-001-R11 reads requirement IDs, matches IDs exactly and finds untagged exports", () => {
    expect(requirementIds("| SPEC-014-R1 | x |\n| SPEC-014-AC1 | y |\ntext SPEC-014-R9\n| SPEC-001-R12 | z |")).toEqual(["SPEC-014-R1", "SPEC-001-R12"]);
    expect(names("covers SPEC-001-R12 only", "SPEC-001-R1")).toBe(false);
    expect(names("SPEC-001-R12 and SPEC-001-R1.", "SPEC-001-R1")).toBe(true);
    const src = "/**\n * Doc.\n * @requirement SPEC-014-R1\n */\nexport function tagged() {}\n\nexport const bare = 1;\n";
    expect(exportsOf(src)).toEqual([{ name: "tagged", tags: ["SPEC-014-R1"] }, { name: "bare", tags: [] }]);
  });

  describe("SPEC-001-R12 signatures", () => {
    const dir = mkdtempSync(join(tmpdir(), "sig-test-"));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd: dir, encoding: "utf8" });

    it("SPEC-001-R12 names the most specific unsigned path", () => {
      expect(signatureId(["specs/source-of-record/slides.txt", "specs/a.md"])).toBe("unsigned change to specs/source-of-record/slides.txt");
      expect(signatureId(["specs/SPEC-014-export-latency.md"])).toBe("unsigned change to specs/");
      expect(signatureId(["approvers.txt"])).toBe("unsigned change to approvers.txt");
    });

    it("SPEC-001-R12 accepts an approver's signature and rejects an unsigned commit", () => {
      execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", join(dir, "key")]);
      const pub = read(join(dir, "key.pub")).split(" ").slice(0, 2).join(" ");
      const approvers = `t@example.com namespaces="git" ${pub}\n`;
      git("init", "-q", "-b", "main");
      writeFileSync(join(dir, "a.txt"), "a");
      git("add", "a.txt");
      git("-c", "gpg.format=ssh", "-c", "gpg.ssh.program=ssh-keygen", "-c", `user.signingkey=${join(dir, "key")}`, "commit", "-q", "-S", "-m", "signed");
      expect(verifySigned("HEAD", approvers, dir)).toBe(true);
      writeFileSync(join(dir, "a.txt"), "b");
      git("-c", "commit.gpgsign=false", "commit", "-q", "-am", "unsigned");
      expect(verifySigned("HEAD", approvers, dir)).toBe(false);
    });
  });

  it("SPEC-001-R13 hashes the snapshot body and finds slides 1 to 13 and Q1 to Q3", () => {
    const snapshot = read("specs/source-of-record/slides.txt");
    const body = snapshotBody(snapshot);
    expect(snapshot).toContain(`body-sha256: ${sha256(body)}`);
    expect([...slideNumbers(body)]).toEqual([...Array.from({ length: 13 }, (_, i) => String(i + 1)), "Q1", "Q2", "Q3"]);
    expect(snapshotBody("no separator")).toBe("");
  });

  it("SPEC-001-R14 flags only a lowered break threshold", () => {
    expect(lowered(80, 90)).toBe(true);
    expect(lowered(90, 90)).toBe(false);
    expect(lowered(95, 90)).toBe(false);
  });

  it("SPEC-001-R15 reports failed test files relative to the repo", () => {
    expect(failedTestFiles([{ name: "/r/test/b.test.ts", status: "failed" }, { name: "/r/test/a.test.ts", status: "passed" }], "/r")).toEqual(["test/b.test.ts"]);
  });

  it("SPEC-001-R16 maps Stryker's threshold message and keeps break at 95", () => {
    expect(mutationId("Final mutation score 80.00 under breaking threshold 90")).toBe("below break threshold");
    expect(mutationId("Error: cannot find vitest")).toBe("stryker error");
    expect((JSON.parse(read("stryker.config.json")) as { thresholds: { break: number } }).thresholds.break).toBe(95);
  });

  it("SPEC-001-R17 prints the attestation failure line with the artifact path", () => {
    expect(new GateFailure("attestation", "dist/function.zip").message).toContain("GATE attestation FAILED");
  });

  it("SPEC-001-R18 flags deletes of stateful resources only", () => {
    const plan = {
      resource_changes: [
        { address: "aws_dynamodb_table.export_jobs", type: "aws_dynamodb_table", change: { actions: ["delete", "create"] } },
        { address: "aws_lambda_function.export", type: "aws_lambda_function", change: { actions: ["delete", "create"] } },
        { address: "aws_s3_bucket.logs", type: "aws_s3_bucket", change: { actions: ["update"] } },
      ],
    };
    expect(destructiveChanges(plan)).toEqual(["aws_dynamodb_table.export_jobs"]);
    expect(destructiveChanges({})).toEqual([]);
  });

  it("SPEC-001-R8 checks both Terraform roots with committed provider locks", () => {
    for (const dir of ["infra/sandbox", "infra/org"]) expect(existsSync(join(dir, ".terraform.lock.hcl"))).toBe(true);
  });
});
