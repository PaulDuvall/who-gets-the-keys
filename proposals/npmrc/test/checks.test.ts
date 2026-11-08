import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { configDefaults } from "vitest/config";
import eslintConfig from "../eslint.config.js";
import baseVitest from "../vitest.config.ts";
import strykerVitest from "../vitest.stryker.config.ts";
import {
  COMMANDS, CheckFailure, ORDER, allowedNames, approversFor, attestationArgs, changedFiles, dependencyNames, destructiveChanges, exportsOf, failedTestFiles,
  guardedBy, jobBlock, lockfilePaths, lowered, protectedPaths, pipelineCacheFinding, pipelineNpmFinding, mutationId, names, requirementIds, sha256, signatureId, slideNumbers, snapshotBody, topAdvisory, verifySigned,
  RECEIPT_TYPES, pinArgs, receiptLines, receiptPin, receiptRecord, verifiedStatement,
  deployTipId,
} from "../scripts/checks.ts";

const read = (path: string) => readFileSync(path, "utf8");

describe("SPEC-001 checks", () => {
  it("SPEC-001-R1 runs the fifteen checks in order and prints one stable failure line", () => {
    expect(ORDER).toEqual(["secrets", "allowlist", "workflows", "install", "lint", "typecheck", "iac", "sast", "sca", "trace", "ratchet", "signatures", "slides", "test", "mutation"]);
    expect(new CheckFailure("lint", "vitest/expect-expect").message).toBe("CHECK lint FAILED: vitest/expect-expect");
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

  it("SPEC-001-R215 lets pipeline.yml run npm only as npm ci --ignore-scripts, and starts the checks and the build with node", () => {
    const pipeline = read(".github/workflows/pipeline.yml");
    expect(pipelineNpmFinding(pipeline)).toBe(false);
    expect(pipeline).toContain("        run: node scripts/checks.ts\n");
    const build = (JSON.parse(read("package.json")) as { scripts: { build: string } }).scripts.build.split(" ");
    expect(build[0]).toBe("tsc");
    const direct = ["node_modules/.bin/tsc", ...build.slice(1)];
    expect(pipeline).toContain(`\n          ${direct.join(" ")}\n`);
    const harness = read("scenarios/run.ts");
    expect(harness).toContain(`sh(${JSON.stringify(direct).replace(/","/g, '", "')}, dir, env)`);
    expect(harness).not.toMatch(/"npm", "(?!ci")|"npx"/);
    const step = (run: string) => `jobs:\n  build:\n    steps:\n      - run: ${run}\n`;
    const bad = ["npm run checks", "npm test", "npm ci", "npm ci --no-audit", "npm install --ignore-scripts", "npm exec --no -- node x.ts",
      "npx --no-install srt", "/usr/bin/npm run build", "npm ci --ignore-scripts && npm run build", "(cd x && npm run y)", "pnpm install", "pnpx x",
      "yarn", "corepack enable", "bun x.ts", "bunx x", "npm ci --ignore-scripts --no-ignore-scripts", "npm ci --ignore-scripts false",
      "npm ci --ignore-scripts --ignore-scripts=false", "npm ci --ignore-scripts --foreground-scripts"];
    expect(bad.filter((run) => !pipelineNpmFinding(step(run)))).toEqual([]);
    const good = ["node scripts/checks.ts", "npm ci --ignore-scripts --no-audit --no-fund", "npm ci --no-audit --ignore-scripts", "# npm run checks",
      "echo built # npm run build", "cat .npmrc", "npm_config_update_notifier=false node x.ts", "rebuild", "package-manager-cache: false"];
    expect(good.filter((run) => pipelineNpmFinding(step(run)))).toEqual([]);
  });

  it("SPEC-001-R215 a committed .npmrc reaches what npm run and npm exec start, never node itself or npm ci --ignore-scripts, and no environment variable undoes it", () => {
    const dir = mkdtempSync(join(tmpdir(), "npmrc-"));
    try {
      const pkg = { name: "probe", version: "0.0.0", private: true };
      writeFileSync(join(dir, "package.json"), JSON.stringify({ ...pkg, scripts: { probe: "node probe.mjs", preinstall: "node probe.mjs" } }));
      writeFileSync(join(dir, "package-lock.json"), JSON.stringify({ ...pkg, lockfileVersion: 3, requires: true, packages: { "": pkg } }));
      writeFileSync(join(dir, "probe.mjs"), "process.exitCode = 1;\n");
      writeFileSync(join(dir, "payload.mjs"), 'import { appendFileSync } from "node:fs";\nappendFileSync("loaded.log", "loaded\\n");\nprocess.on("exit", () => { process.exitCode = 0; });\n');
      writeFileSync(join(dir, ".npmrc"), "node-options=--import=./payload.mjs\nignore-scripts=false\n");
      const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:npm_|node_options$)/i.test(key)));
      const run = (argv: string[], extra: Record<string, string> = {}) => {
        rmSync(join(dir, "loaded.log"), { force: true });
        const [file = "", ...args] = argv;
        const r = spawnSync(file, args, { cwd: dir, encoding: "utf8", env: { ...clean, npm_config_update_notifier: "false", ...extra } });
        return { status: r.status, loaded: existsSync(join(dir, "loaded.log")) };
      };
      const hijacked = { status: 0, loaded: true };
      expect(run(["npm", "run", "probe"])).toEqual(hijacked);
      expect(run(["npm", "exec", "--no", "--", "node", "probe.mjs"])).toEqual(hijacked);
      expect(run(["npm", "ci", "--no-audit", "--no-fund"])).toEqual(hijacked);
      // npm skips an empty npm_config_ variable, and NPM_CONFIG_USERCONFIG replaces only ~/.npmrc, not the project's.
      expect(run(["npm", "run", "probe"], { npm_config_node_options: "", NPM_CONFIG_USERCONFIG: "/dev/null" })).toEqual(hijacked);
      expect(run(["node", "probe.mjs"])).toEqual({ status: 1, loaded: false });
      expect(run([...COMMANDS.install])).toEqual({ status: 0, loaded: false });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

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
      expect(signatureId([".github/workflows/pipeline.yml"], [".github/", "scripts/checks.ts"])).toBe("unsigned change to .github/");
      expect(signatureId(["src/x.ts", "scripts/checks.ts"], [".github/", "scripts/checks.ts"])).toBe("unsigned change to scripts/checks.ts");
    });

    it("SPEC-001-R12 reads the protected-path list and matches directories by prefix and files exactly", () => {
      const paths = protectedPaths("# comment\n.github/\n\n  scripts/checks.ts  \npackage.json\n");
      expect(paths).toEqual([".github/", "scripts/checks.ts", "package.json"]);
      expect(guardedBy(".github/workflows/video.yml", paths)).toBe(".github/");
      expect(guardedBy("scripts/checks.ts", paths)).toBe("scripts/checks.ts");
      expect(guardedBy("scripts/checks.tsx", paths)).toBeUndefined();
      expect(guardedBy("video/record/package.json", paths)).toBeUndefined();
      expect(guardedBy("src/export.ts", paths)).toBeUndefined();
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

  describe("SPEC-001-R12 signatures across renames, merges and approver history", () => {
    const dir = mkdtempSync(join(tmpdir(), "sig-history-"));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
    const head = () => git("rev-parse", "HEAD").trim();

    it("SPEC-001-R12 lists every file of a root commit and both paths of a rename", () => {
      git("init", "-q", "-b", "main");
      mkdirSync(join(dir, "specs"));
      writeFileSync(join(dir, "specs", "a.md"), "a");
      writeFileSync(join(dir, "b.txt"), "b");
      git("add", ".");
      git("commit", "-q", "-m", "root");
      const root = head();
      expect(changedFiles(root, undefined, dir).sort()).toEqual(["b.txt", "specs/a.md"]);
      git("mv", "specs/a.md", "moved.md");
      git("commit", "-q", "-m", "move");
      expect(changedFiles(head(), root, dir).sort()).toEqual(["moved.md", "specs/a.md"]);
    });

    it("SPEC-001-R12 compares a merge commit with its first parent", () => {
      const base = head();
      git("checkout", "-q", "-b", "side");
      writeFileSync(join(dir, "specs-x.md"), "x");
      mkdirSync(join(dir, "specs"), { recursive: true });
      writeFileSync(join(dir, "specs", "x.md"), "x");
      git("add", ".");
      git("commit", "-q", "-m", "side");
      git("checkout", "-q", "main");
      git("merge", "-q", "--no-ff", "-m", "merge", "side");
      expect(changedFiles(head(), base, dir).sort()).toEqual(["specs-x.md", "specs/x.md"]);
    });

    it("SPEC-001-R12 lets only the first approvers.txt judge its own commit", () => {
      expect(approversFor("parent", "own", false)).toBe("parent");
      expect(approversFor("parent", "own", true)).toBe("parent");
      expect(approversFor(undefined, "own", false)).toBe("own");
      expect(approversFor(undefined, "own", true)).toBe("");
      expect(approversFor(undefined, undefined, false)).toBe("");
    });
  });

  it("SPEC-001-R13 hashes the snapshot body and finds slides 1 to 13 of the audience deck", () => {
    const snapshot = read("specs/source-of-record/slides.txt");
    const body = snapshotBody(snapshot);
    expect(snapshot).toContain(`body-sha256: ${sha256(body)}`);
    expect([...slideNumbers(body)]).toEqual(Array.from({ length: 13 }, (_, i) => String(i + 1)));
    expect([...slideNumbers("1\n2\n1\nLikely questions\n3\nLikely questions, part 2\n")]).toEqual(["1", "2", "3", "Q1", "Q2"]);
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

  it("SPEC-001-R16 leaves only the wall-clock test file out of mutation runs", () => {
    const stryker = JSON.parse(read("stryker.config.json")) as { vitest?: { configFile?: string } };
    expect(stryker.vitest?.configFile).toBe("vitest.stryker.config.ts");
    expect(strykerVitest.test?.include).toEqual(baseVitest.test?.include);
    expect(strykerVitest.test?.exclude).toEqual([...configDefaults.exclude, "test/export.performance.test.ts"]);
    expect(baseVitest.test?.exclude).toBeUndefined();
  });

  it("SPEC-001-R17 prints the attestation failure line with the artifact path", () => {
    expect(new CheckFailure("attestation", "dist/function.zip").message).toContain("CHECK attestation FAILED");
  });

  it("SPEC-001-R17 pins the attestation exactly to pipeline.yml on main, GitHub-hosted runners, the commit and a 1000-result window", () => {
    expect(attestationArgs("dist/function.zip", "o/r", "abc123")).toEqual([
      "gh", "attestation", "verify", "dist/function.zip", "--repo", "o/r",
      "--cert-identity", "https://github.com/o/r/.github/workflows/pipeline.yml@refs/heads/main", "--source-ref", "refs/heads/main",
      "--deny-self-hosted-runners", "--predicate-type", "https://slsa.dev/provenance/v1", "--limit", "1000",
      "--source-digest", "abc123", "--signer-digest", "abc123",
    ]);
    expect(attestationArgs("dist/function.zip", "o/r", undefined)).not.toContain("--source-digest");
  });

  describe("SPEC-001-R50 receipt check", () => {
    // `gh attestation verify --format json` as derived from gh v2.103.2 source, not captured output:
    // [{attestation, verificationResult}] (verification/sigstore.go), protojson statement with predicate, sigstore-go v1.3.0 certificate fields.
    const SHA = "9113f5b4818b90a7a32f79ef9e0e13aef8908aeb", ZIP = "f54e781891f54871b23e9d4e82efd0f072e3104ed4ecfbc5c07080976bbdff35";
    const REF = "refs/heads/candidate/receipt-tracer", MAIN = "refs/heads/main", [SLSA, V2] = RECEIPT_TYPES;
    const record = { commit: SHA, spec_ids: ["SPEC-001-R45", "SPEC-001-R50"], agent: "Claude Code", model: "not recorded" };
    const verified = (type: string, predicate: unknown = {}, digest = ZIP, commit = SHA, ref = REF) => ({ attestation: { bundle: {}, bundle_url: "https://example.invalid/b" },
      verificationResult: {
        statement: { _type: "https://in-toto.io/Statement/v1", subject: [{ name: "function.zip", digest: { sha256: digest } }], predicateType: type, predicate },
        signature: { certificate: { subjectAlternativeName: `https://github.com/o/r/.github/workflows/pipeline.yml@${ref}`, buildSignerDigest: commit,
          sourceRepositoryDigest: commit, sourceRepositoryRef: ref, runnerEnvironment: "github-hosted" } },
        verifiedTimestamps: [{ type: "Tlog", uri: "https://rekor.sigstore.dev", timestamp: "2026-11-05T12:00:00Z" }],
      } });
    const dir = mkdtempSync(join(tmpdir(), "receipt-check-")), zip = join(dir, "function.zip");
    afterAll(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(zip, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe, 0x00, 0x80]));

    it("SPEC-001-R50 pins a run to its own ref and commit, SPEC-001-R56 pins deploy to main, and any other ref or no commit fails before gh", () => {
      expect([REF, MAIN, "refs/heads/candidate/fix+1"].map((ref) => receiptPin("run", ref, SHA))).toEqual([REF, MAIN, "refs/heads/candidate/fix+1"].map((ref) => ({ ref, sha: SHA })));
      for (const ref of ["refs/heads/wip/x", "refs/pull/1/merge", "refs/heads/candidatex", "refs/heads/candidate/", "refs/heads/candidate/a\nb", "refs/tags/candidate/x", undefined]) {
        expect(() => receiptPin("run", ref, SHA)).toThrow(new CheckFailure("receipt", `unpinned ref ${ref ?? "unset"}`));
      }
      for (const [mode, sha] of [["run", undefined], ["run", "HEAD"], ["deploy", undefined]] as const) expect(() => receiptPin(mode, REF, sha)).toThrow(new CheckFailure("receipt", "unpinned commit"));
      expect(pinArgs("z", "o/r", REF, SHA, V2).slice(6)).toEqual([
        "--cert-identity", `https://github.com/o/r/.github/workflows/pipeline.yml@${REF}`, "--source-ref", REF,
        "--deny-self-hosted-runners", "--predicate-type", V2, "--limit", "1000", "--source-digest", SHA, "--signer-digest", SHA,
      ]);
      for (const ref of [REF, "refs/heads/wip/x", undefined]) expect(receiptPin("deploy", ref, SHA)).toEqual({ ref: MAIN, sha: SHA });
    });

    it("SPEC-001-R50 matches the predicate type, a 64-hex zip digest, the commit and the ref itself and ignores decoys, and SPEC-001-R45 and R55 accept only safe one-line fields and the model `not recorded`", () => {
      const decoys = [verified(SLSA), verified(V2, {}, "0".repeat(64)), verified(V2, {}, ZIP, "f".repeat(40)), verified(V2, {}, ZIP, SHA, MAIN), null, 1, {}];
      expect(verifiedStatement(JSON.stringify([...decoys, verified(V2, { commits: [record] })]), V2, ZIP, SHA, REF)?.predicate).toEqual({ commits: [record] });
      for (const out of [JSON.stringify(decoys), "", "not json", "{}"]) expect(verifiedStatement(out, V2, ZIP, SHA, REF)).toBeUndefined();
      expect(verifiedStatement(JSON.stringify([verified(V2, { commits: [record] }, "")]), V2, "", SHA, REF)).toBeUndefined();
      expect(receiptRecord({ commits: [{ ...record, commit: "f".repeat(40) }, record] }, SHA)).toEqual(record);
      const unsafe = [{ spec_ids: "SPEC-001-R45" }, { spec_ids: ["SPEC-001-R45\n x"] }, { agent: "Claude Code\n ```\n **x**\n <!--" }, { agent: "a\rb" }, { agent: "a\u202eb" }, { agent: "" }, { model: "claude-opus-5-5" }];
      for (const fields of unsafe) expect(receiptRecord({ commits: [{ ...record, ...fields }] }, SHA)).toBeUndefined();
    });

    it("SPEC-001-R55 the receipt check prints seven verified lines to stdout and appends them to the run summary, labels the signer editable by the agent, and fails closed when gh exits 0 but nothing matches; SPEC-001-R56 deploy refuses a candidate", () => {
      writeFileSync(join(dir, "gh"), '#!/bin/sh\nprintf "%s" "$GH_STUB"\n', { mode: 0o755 });
      const check = (entries: unknown[], mode = "run") => spawnSync(process.execPath, [join(process.cwd(), "scripts/checks.ts"), "receipt", "function.zip", mode], { cwd: dir, encoding: "utf8",
        env: { ...process.env, PATH: `${dir}:${process.env["PATH"] ?? ""}`, GH_STUB: JSON.stringify(entries), GITHUB_REF: REF, GITHUB_SHA: SHA, GITHUB_STEP_SUMMARY: join(dir, "summary") } }).stdout;
      const good = [verified(SLSA), verified(V2, { commits: [record] })], lines = ["COMMIT   9113f5b4818b", "FILES    function.zip sha256:f54e781891f5",
        "AGENT    Claude Code (as reported by the commit)", "MODEL    not recorded", "SPEC     SPEC-001-R45, SPEC-001-R50", `SIGNED   pipeline.yml@${REF} (editable by the agent)`, "VERIFIED 2/2 predicate types"];
      expect([check(good), check(good), read(join(dir, "summary"))]).toEqual([...Array(2).fill(`${lines.join("\n")}\n`), ["## Receipt", "", "```text", ...lines, "```", ""].join("\n").repeat(2)]);
      expect([check([verified(SLSA, {}, "0".repeat(64)), ...good.slice(1)]), check(good, "deploy")]).toEqual(Array(2).fill(`CHECK receipt FAILED: missing ${SLSA}\n`));
      expect(receiptLines("z", ZIP, { ...record, agent: "none reported", spec_ids: [] }, "s", 2).slice(2, 5)).toEqual(["AGENT    none reported", "MODEL    not recorded", "SPEC     none reported"]);
    });
  });

  describe("SPEC-001-R190 deploy-tip check", () => {
    const A = "a".repeat(40), B = "b".repeat(40), LONG = "c".repeat(64);
    const dir = mkdtempSync(join(tmpdir(), "deploy-tip-")), work = join(dir, "work");
    afterAll(() => rmSync(dir, { recursive: true, force: true }));
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: work, encoding: "utf8" }).trim();
    const check = (sha?: string) => {
      const env: NodeJS.ProcessEnv = { ...process.env };
      delete env["GITHUB_SHA"];
      if (sha !== undefined) env["GITHUB_SHA"] = sha;
      const r = spawnSync(process.execPath, [join(process.cwd(), "scripts/checks.ts"), "deploy-tip"], { cwd: work, encoding: "utf8", env });
      return [r.status, r.stdout];
    };

    it("SPEC-001-R190 accepts only the one line for exactly refs/heads/main naming the deployed commit, and fails closed otherwise", () => {
      expect(deployTipId(A, `${A}\trefs/heads/main\n`)).toBeUndefined();
      expect(deployTipId(LONG, `${LONG}\trefs/heads/main\n`)).toBeUndefined();
      expect(deployTipId(A, `${B}\trefs/heads/main\n${A}\trefs/heads/candidate/refs/heads/main\n`)).toBe("aaaaaaaaaaaa");
      for (const remote of [undefined, "", `${A}\trefs/heads/candidate/refs/heads/main\n`, `${A}\trefs/heads/mainline\n`, `${A}\trefs/heads/main\n${A}\trefs/heads/main\n`]) {
        expect(deployTipId(A, remote)).toBe("aaaaaaaaaaaa");
      }
      for (const deployed of ["A".repeat(40), "a".repeat(12), "a".repeat(41)]) expect(deployTipId(deployed, `${deployed}\trefs/heads/main\n`)).toBe(deployed.slice(0, 12));
      expect(deployTipId("", "\trefs/heads/main\n")).toBe("HEAD");
    });

    it("SPEC-001-R190 passes silently when the commit is main's tip on a local bare origin", () => {
      execFileSync("git", ["init", "-q", "--bare", "-b", "main", join(dir, "origin.git")]);
      execFileSync("git", ["init", "-q", "-b", "main", work]);
      git("remote", "add", "origin", join(dir, "origin.git"));
      git("commit", "-q", "--allow-empty", "-m", "old");
      git("push", "-q", "origin", "HEAD:refs/heads/main");
      expect([check(), check(git("rev-parse", "HEAD"))]).toEqual([[0, ""], [0, ""]]);
    });

    it("SPEC-001-R190 fails with the first 12 characters of the deployed commit once main has moved, reading GITHUB_SHA before HEAD", () => {
      const old = git("rev-parse", "HEAD");
      git("commit", "-q", "--allow-empty", "-m", "new");
      git("push", "-q", "origin", "HEAD:refs/heads/main", `${old}:refs/heads/candidate/refs/heads/main`);
      const failed = [1, `CHECK deploy-tip FAILED: ${old.slice(0, 12)}\n`];
      expect([check(old), check()]).toEqual([failed, [0, ""]]);
      git("checkout", "-q", "--detach", old);
      expect(check()).toEqual(failed);
      git("checkout", "-q", "main");
    });

    it("SPEC-001-R190 fails closed when main's tip cannot be read from origin", () => {
      const failed = [1, `CHECK deploy-tip FAILED: ${git("rev-parse", "HEAD").slice(0, 12)}\n`];
      git("remote", "set-url", "origin", join(dir, "missing.git"));
      expect(check()).toEqual(failed);
      git("remote", "remove", "origin");
      expect(check()).toEqual(failed);
    });
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
