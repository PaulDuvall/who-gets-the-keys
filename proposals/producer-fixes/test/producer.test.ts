import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  agentPrompt, agentSettings, BASH_RULES, commitMessage, DENY_RULES, EDIT_RULES, inScope, isEntryPoint, MAX_PATCH_BYTES, PROBE_RULE,
  ProducerRefusal, SCOPE_DIRS, SCOPE_FILES, scopeRefusal, SPEC_ID, stagedEntries, SUBJECT, TASK_ID,
} from "../scripts/ci/producer.ts";

const read = (path: string) => readFileSync(path, "utf8");

type Permissions = string | Record<string, string> | undefined;
interface Step { id?: string; name?: string; uses?: string; run?: string; if?: string | boolean; env?: Record<string, string>; with?: Record<string, unknown>; "working-directory"?: string }
interface Job { name?: string; if?: string; needs?: string | string[]; "runs-on"?: string; environment?: string; permissions?: Permissions; "timeout-minutes"?: number; env?: Record<string, string>; outputs?: Record<string, string>; steps: Step[] }
interface Input { type: string; required?: boolean; default?: unknown }
interface Workflow { on: Record<string, { inputs?: Record<string, Input> } | null>; permissions?: Permissions; "cache-mode"?: string; env?: Record<string, string>; jobs: Record<string, Job> }

const producerText = read(".github/workflows/producer.yml");
const producer = parse(producerText) as Workflow;
const jobs = producer.jobs;
const job = (id: string): Job => {
  const found = jobs[id];
  if (!found) throw new Error(`no job ${id}`);
  return found;
};
const stepIndex = (id: string, match: (s: Step) => boolean) => job(id).steps.findIndex(match);
const step = (id: string, match: (s: Step) => boolean): Step => {
  const found = job(id).steps.find(match);
  if (!found) throw new Error(`no matching step in ${id}`);
  return found;
};
const runStep = (id: string) => step(id, (s) => s.id === "run");
const named = (text: string) => (s: Step) => s.name?.includes(text) === true;
const guard = "github.ref == 'refs/heads/main' && github.actor_id == '1619259' && github.triggering_actor == github.actor";
const allowlist = JSON.parse(read(".github/egress/producer-allowlist.json")) as { allowedDomains: string[] };

// Runs one step's script as GitHub runs a bash step, its env from the step with each ${{ }} value replaced from `values`.
function bash(s: Step, values: Record<string, string>, cwd: string, extra: Record<string, string> = {}) {
  const env: Record<string, string> = { PATH: process.env["PATH"] ?? "", HOME: process.env["HOME"] ?? "" };
  for (const [key, value] of Object.entries(s.env ?? {})) env[key] = value.includes("${{") ? (values[key] ?? "") : value;
  return spawnSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", s.run ?? ""], { cwd, env: { ...env, ...extra }, encoding: "utf8" });
}

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

const gitIn = (dir: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });

function repoWith(files: Record<string, string>): { dir: string; head: string } {
  const dir = tempDir("producer-repo-");
  gitIn(dir, "init", "-q", "-b", "main");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  gitIn(dir, "add", "-A");
  gitIn(dir, "commit", "-q", "-m", "base");
  return { dir, head: gitIn(dir, "rev-parse", "HEAD").trim() };
}

describe("SPEC-001 runner producer (Tracer 2, T2)", () => {
  it("SPEC-001-R83 is started only by workflow_dispatch with the five inputs, and every job runs only for the owner on main", () => {
    expect(Object.keys(producer.on)).toEqual(["workflow_dispatch"]);
    const inputs = producer.on["workflow_dispatch"]?.inputs ?? {};
    expect(Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, [v.type, v.required ?? false]]))).toEqual({
      task: ["string", true], spec: ["string", false], subject: ["string", true], prompt: ["string", true], egress_probe: ["boolean", false],
    });
    expect(inputs["egress_probe"]?.default).toBe(false);
    expect(Object.fromEntries(Object.entries(jobs).map(([id, j]) => [id, j.if]))).toEqual({
      install: guard, agent: guard, publish: `${guard} && !inputs.egress_probe`, dispatch: `${guard} && !inputs.egress_probe`,
    });
    expect([job("agent").needs, job("publish").needs, job("dispatch").needs]).toEqual(["install", "agent", "publish"]);
  });

  it("SPEC-001-R83 checks every input in the first step, with the patterns producer.ts uses, before any step uses one", () => {
    const first = job("install").steps[0] ?? {};
    expect(first.uses).toBeUndefined();
    expect(first.env?.["TASK_PATTERN"]).toBe(TASK_ID.source);
    expect(first.env?.["SPEC_PATTERN"]).toBe(SPEC_ID.source);
    expect(first.env?.["SUBJECT_PATTERN"]).toBe(SUBJECT.source);
    const usesInput = Object.entries(jobs).flatMap(([id, j]) => j.steps.map((s, i) => [id, i, JSON.stringify(s)] as const))
      .filter(([, , text]) => text.includes("inputs.task") || text.includes("inputs.prompt") || text.includes("inputs.subject"))
      .map(([id, i]) => `${id}:${i}`);
    expect(usesInput[0]).toBe("install:0");
    const dir = tempDir("producer-inputs-");
    try {
      const good = { TASK: "TASK-T2-1", SPEC: "SPEC-014-R7", SUBJECT: "Reject duplicate column names (SPEC-014-R7)", PROMPT: "Add R7." };
      const ok = bash(first, good, dir);
      expect([ok.status, ok.stdout]).toEqual([0, "Inputs checked: task TASK-T2-1, spec SPEC-014-R7.\n"]);
      const cases: [Record<string, string>, string][] = [
        [{ TASK: "task-1" }, "task"], [{ TASK: "TASK-$(id)" }, "task"], [{ TASK: `TASK-${"A".repeat(33)}` }, "task"],
        [{ SPEC: "SPEC-14-R7" }, "spec"], [{ SUBJECT: "::warning::x" }, "subject"], [{ SUBJECT: "x".repeat(73) }, "subject"],
        [{ SUBJECT: "a\nb" }, "subject"], [{ PROMPT: "" }, "prompt"], [{ PROMPT: "p".repeat(8001) }, "prompt"],
      ];
      for (const [bad, name] of cases) {
        const r = bash(first, { ...good, ...bad }, dir);
        expect([r.status, r.stdout]).toEqual([1, `CHECK producer FAILED: input ${name}\n`]);
      }
      expect(bash(first, { ...good, SPEC: "" }, dir).status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("SPEC-001-R85 runs the agent on a GitHub-hosted runner in environment producer with contents: read and id-token: write only", () => {
    const agent = job("agent");
    expect([agent["runs-on"], agent.environment, agent.permissions]).toEqual(["ubuntu-24.04", "producer", { contents: "read", "id-token": "write" }]);
    expect(agent["timeout-minutes"]).toBeLessThanOrEqual(60);
    expect(Object.entries(jobs).filter(([, j]) => j.environment !== undefined).map(([id]) => id)).toEqual(["agent"]);
    const idToken = Object.entries(jobs).filter(([, j]) => typeof j.permissions === "object" && j.permissions["id-token"] !== undefined);
    expect(idToken.map(([id]) => id)).toEqual(["agent"]);
    expect(producerText).not.toMatch(/secrets\./);
    expect(JSON.stringify(agent)).not.toMatch(/github\.token|GH_TOKEN|GITHUB_TOKEN/);
  });

  it("SPEC-001-R85 starts Claude Code from an empty environment that holds Bedrock, the scrub and the pinned model, and no GitHub or Actions variable", () => {
    const run = runStep("agent");
    const script = run.run ?? "";
    const launch = script.slice(script.indexOf("env -i"), script.indexOf("> \"$RUNNER_TEMP/transcript.jsonl\""));
    const names = [...launch.matchAll(/(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=/g)].map((m) => m[1]);
    expect(names).toEqual([
      "PATH", "HOME", "TMPDIR", "LANG", "TERM", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
      "CLAUDE_CODE_USE_BEDROCK", "ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "CLAUDE_CODE_SUBPROCESS_ENV_SCRUB",
      "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "npm_config_update_notifier",
    ]);
    for (const flag of ["CLAUDE_CODE_USE_BEDROCK=1", "CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1", 'ANTHROPIC_MODEL="$MODEL"']) {
      expect(launch).toContain(flag);
    }
    expect(run.env?.["MODEL"]).toBe("${{ vars.PRODUCER_MODEL }}");
    expect(producerText).not.toMatch(/ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN/);
  });

  it("SPEC-001-R86 defines the invoke-only producer role for one inference profile, and the SCP and github.sh know it", () => {
    const iam = read("infra/sandbox/iam.tf");
    expect(iam).toMatch(/producer\s+= "\$\{var\.github_repository\}\/\.github\/workflows\/producer\.yml@refs\/heads\/main"/);
    expect(iam).toMatch(/producer\s+= \{ sub = "\$\{var\.github_subject_prefix\}:environment:producer", workflow = local\.workflow_ref\.producer \}/);
    const role = /resource "aws_iam_role" "producer" \{([^}]*)\}/.exec(iam)?.[1] ?? "";
    expect(role).toContain('name                 = "who-gets-the-keys-producer-bedrock"');
    expect(role).toContain("max_session_duration = 3600");
    expect(role).toContain('assume_role_policy   = data.aws_iam_policy_document.github_trust["producer"].json');
    const policy = iam.slice(iam.indexOf('resource "aws_iam_role_policy" "producer"'), iam.indexOf('resource "aws_iam_role" "probe"'));
    expect([...policy.matchAll(/Action\s+= (\[.*\])/g)].map((m) => m[1])).toEqual([
      '["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]', '["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]',
    ]);
    expect([...policy.matchAll(/Resource\s+= (.*)/g)].map((m) => m[1])).toEqual([
      "local.producer_profile_arn", '"arn:aws:bedrock:*::foundation-model/${local.producer_model}"',
    ]);
    expect(policy).toContain('Condition = { StringEquals = { "bedrock:InferenceProfileArn" = local.producer_profile_arn } }');
    expect(policy).not.toMatch(/Effect\s+= "Allow"[^}]*Action\s+= "\*"/);
    expect(iam).toContain('producer_profile_arn = "arn:aws:bedrock:${var.region}:${local.account_id}:inference-profile/${var.producer_inference_profile}"');
    const profile = /variable "producer_inference_profile" \{[^]*?default\s+= "([^"]+)"/.exec(read("infra/sandbox/variables.tf"))?.[1] ?? "";
    expect(profile).toMatch(/^us\.anthropic\.[a-z0-9.:-]+$/);
    const outputs = read("infra/sandbox/main.tf");
    expect(outputs).toMatch(/output "producer_role_arn" \{[^}]*value\s+= aws_iam_role\.producer\.arn/);
    expect(outputs).toMatch(/output "producer_inference_profile" \{[^}]*value\s+= var\.producer_inference_profile/);
    const scp = read("infra/org/main.tf");
    const identity = scp.slice(scp.indexOf('Sid    = "DenyIdentityWritesExceptBreakGlass"'));
    expect(identity).toContain('"${local.role_arn}who-gets-the-keys-producer-bedrock"');
    const github = read("scripts/bootstrap/github.sh");
    expect(github).toContain(`producer="$(jq -r '.producer_role_arn.value // empty' <<<"$outputs")"`);
    expect(github).toContain(`producer_model="$(jq -r '.producer_inference_profile.value // empty' <<<"$outputs")"`);
    expect(github).toContain('gh variable set PRODUCER_ROLE_ARN --repo "$repo" --body "$producer"');
    expect(github).toContain('gh variable set PRODUCER_MODEL --repo "$repo" --body "$producer_model"');
    const agent = job("agent").steps.find((s) => s.uses?.startsWith("aws-actions/configure-aws-credentials@") === true);
    expect(agent?.with?.["role-to-assume"]).toBe("${{ vars.PRODUCER_ROLE_ARN }}");
  });

  it("SPEC-001-R87 writes the agent's settings from the producer's empty allowlist: no hooks, dontAsk, the sandbox strict, admin-required and not auto-allowing", () => {
    expect(allowlist.allowedDomains).toEqual([]);
    expect(job("agent").env?.["EGRESS_ALLOWLIST"]).toBe(".github/egress/producer-allowlist.json");
    expect(agentSettings(allowlist, false)).toEqual({
      disableAllHooks: true,
      enableAllProjectMcpServers: false,
      permissions: {
        defaultMode: "dontAsk", blockReadsOutsideWorkingDirectories: true,
        allow: [...EDIT_RULES, ...BASH_RULES], deny: ["WebFetch", "WebSearch", "Read(//proc/**)"],
      },
      sandbox: {
        enabled: true, failIfUnavailable: true, autoAllowBashIfSandboxed: false, allowUnsandboxedCommands: false,
        network: { allowedDomains: [], strictAllowlist: true },
      },
    });
    const probe = agentSettings(allowlist, true) as { permissions: { allow: string[] } };
    expect(probe.permissions.allow).toEqual([...BASH_RULES, PROBE_RULE]);
    const listed = agentSettings({ allowedDomains: ["a.example.com"] }, false) as { sandbox: { network: { allowedDomains: string[] } } };
    expect(listed.sandbox.network.allowedDomains).toEqual(["a.example.com"]);
    for (const bad of [{}, { allowedDomains: "a.com" }, { allowedDomains: ["*"] }, { allowedDomains: ["a.com", 1] }, null]) {
      expect(() => agentSettings(bad, false)).toThrow(new ProducerRefusal("egress allowlist"));
    }
    expect(DENY_RULES).toEqual(["WebFetch", "WebSearch", "Read(//proc/**)"]);
    expect(`${producerText}\n${read("scripts/ci/producer.ts")}`).not.toMatch(/bypassPermissions|dangerously-skip-permissions/);
  });

  it("SPEC-001-R87 writes settings and prompt before any AWS credential, and runs no repository code once the agent has run", () => {
    const steps = job("agent").steps;
    const settings = stepIndex("agent", named("Write Claude Code's settings"));
    const credentials = stepIndex("agent", (s) => s.uses?.startsWith("aws-actions/configure-aws-credentials@") === true);
    const run = stepIndex("agent", (s) => s.id === "run");
    expect(steps[settings]?.run).toBe([
      'node scripts/ci/producer.ts settings "$EGRESS_ALLOWLIST" "$RUNNER_TEMP/claude-settings.json" "$EGRESS_PROBE"',
      'node scripts/ci/producer.ts prompt "$RUNNER_TEMP/prompt.txt"', 'cat "$RUNNER_TEMP/claude-settings.json"', "",
    ].join("\n"));
    expect([settings < credentials, credentials < run]).toEqual([true, true]);
    const repoCode = /\b(node|npm|npx|tsx|bash|sh)\s+(?!-)|scripts\//;
    const after = steps.slice(run + 1).filter((s) => repoCode.test(s.run ?? "") || (s.uses !== undefined && !s.uses.startsWith("actions/upload-artifact@")));
    expect(after.map((s) => s.name ?? s.uses)).toEqual([]);
  });

  it("SPEC-001-R87 prints BOUNDARY HELD only when the sandbox proxy refused the probe's curl with a 403", () => {
    const check = step("agent", named("Check that the sandbox blocked the probe"));
    expect(check.if).toBe("inputs.egress_probe");
    const dir = tempDir("producer-probe-");
    try {
      const transcript = (command: string | undefined, result: string) => [
        ...(command === undefined ? [] : [{ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command } }] } }]),
        { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: result, is_error: true }] } },
      ].map((line) => JSON.stringify(line)).join("\n");
      const curl = "curl -sS --max-time 15 https://example.com/";
      const cases: [string | undefined, string, number, string][] = [
        [curl, "curl: (56) CONNECT tunnel failed, response 403", 0, "BOUNDARY HELD: egress to example.com"],
        [curl, "<title>Example Domain</title>", 1, "BOUNDARY BROKEN: egress to example.com"],
        [curl, "Permission to use Bash has been denied.", 1, "BOUNDARY CHECK INVALID: egress probe got no 403 from the sandbox proxy"],
        [undefined, "", 1, "BOUNDARY CHECK INVALID: egress probe did not run"],
      ];
      for (const [command, result, status, line] of cases) {
        writeFileSync(join(dir, "transcript.jsonl"), `${transcript(command, result)}\n`);
        const r = bash(check, { TRANSCRIPT: join(dir, "transcript.jsonl") }, dir);
        expect([r.status, r.stdout]).toEqual([status, `${line}\n`]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("SPEC-001-R88 runs the pinned Claude Code with exactly the flags that keep it headless, sandboxed and model-only", () => {
    expect(producer.env?.["CLAUDE_CODE_VERSION"]).toBe("2.1.304");
    expect(producer.env?.["CLAUDE_CODE_SHA256"]).toMatch(/^[0-9a-f]{64}$/);
    const script = runStep("agent").run ?? "";
    const command = script.slice(script.indexOf('"$RUNNER_TEMP/claude-code/bin/claude"'), script.indexOf("> \"$RUNNER_TEMP/transcript.jsonl\""))
      .replace(/\\\n\s*/g, "").replace(/\s+/g, " ").trim();
    expect(command).toBe([
      '"$RUNNER_TEMP/claude-code/bin/claude" -p "$(cat "$RUNNER_TEMP/prompt.txt")"',
      "--setting-sources project --strict-mcp-config --mcp-config '{\"mcpServers\":{}}'",
      '--settings "$RUNNER_TEMP/claude-settings.json" --permission-mode dontAsk --allowedTools "${allowed[@]}"',
      "--tools Bash,Read,Edit,Write,Glob,Grep --disallowedTools WebFetch WebSearch",
      "--max-turns 40 --max-budget-usd 5 --no-session-persistence",
      "--output-format stream-json --verbose",
    ].join(" "));
    expect(EDIT_RULES).toEqual(["Edit(src/**)", "Edit(test/**)", "Edit(docs/**)", "Edit(traceability.md)"]);
    expect(BASH_RULES).toEqual([
      "Bash(npm run check:lint)", "Bash(npm run check:typecheck)", "Bash(npm run check:trace)", "Bash(npm run check:test)",
      "Bash(git status)", "Bash(git diff)", "Bash(git diff *)",
    ]);
    // With autoAllowBashIfSandboxed off, a command the prompt asks for runs only if an allow rule names it.
    const asked = [...agentPrompt("TASK-1", "", "x", false).matchAll(/npm run check:\w+/g)].map((m) => `Bash(${m[0]})`);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.filter((rule) => !(BASH_RULES as readonly string[]).includes(rule))).toEqual([]);
    expect(agentPrompt("TASK-P", "", "ignored", true)).toContain("curl -sS --max-time 15 https://example.com/");
    expect(agentPrompt("TASK-P", "", "ignored", true)).not.toContain("ignored");
    expect(agentPrompt("TASK-1", "SPEC-014-R7", "Add R7.", false)).toMatch(/task TASK-1 in this repository\. The change implements SPEC-014-R7\.[^]*\nTask:\nAdd R7\.\n$/);
    expect(() => agentPrompt("TASK-1", "R7", "x", false)).toThrow(new ProducerRefusal("input spec"));
  });

  it("SPEC-001-R88 passes on --allowedTools exactly the allow rules of the settings file, in both modes, and starts no agent without them", () => {
    const script = runStep("agent").run ?? "";
    const lines = script.split("\n");
    const mapLine = lines.findIndex((l) => l.includes("allowed+=("));
    const guardLine = lines.findIndex((l) => l.includes("CHECK producer FAILED: allow rules"));
    expect(lines[mapLine]?.trim()).toBe(`allowed=(); while IFS= read -r rule; do allowed+=("$rule"); done < <(jq -r '.permissions.allow[]' "$RUNNER_TEMP/claude-settings.json")`);
    expect([mapLine >= 0, mapLine < guardLine, guardLine < lines.findIndex((l) => l.includes("env -i"))]).toEqual([true, true, true]);
    const dir = tempDir("producer-allowed-");
    try {
      const snippet = `${lines[mapLine] ?? ""}\n${lines[guardLine] ?? ""}\nprintf '%s\\n' "\${allowed[@]}"`;
      for (const probe of [false, true]) {
        const settings = agentSettings(allowlist, probe) as { permissions: { allow: string[] } };
        writeFileSync(join(dir, "claude-settings.json"), JSON.stringify(settings));
        const r = bash({ run: snippet }, {}, dir, { RUNNER_TEMP: dir });
        expect([r.status, r.stdout.split("\n").filter((l) => l !== "")]).toEqual([0, settings.permissions.allow]);
      }
      writeFileSync(join(dir, "claude-settings.json"), JSON.stringify({ permissions: { allow: [] } }));
      expect(bash({ run: snippet }, {}, dir, { RUNNER_TEMP: dir }).stdout).toBe("CHECK producer FAILED: allow rules\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("SPEC-001-R88 fails the run unless the transcript's init event shows dontAsk, before the probe and end-of-run checks", () => {
    const steps = job("agent").steps;
    const mode = stepIndex("agent", named("Check that Claude Code kept the dontAsk permission mode"));
    const probe = stepIndex("agent", named("Check that the sandbox blocked the probe"));
    const ended = stepIndex("agent", named("Check how the agent's run ended"));
    expect([mode > stepIndex("agent", (s) => s.id === "run"), mode < probe, mode < ended]).toEqual([true, true, true]);
    const check = steps[mode] as Step;
    expect(check.if).toBe("always() && steps.run.outcome != 'skipped'");
    expect(check.run).toContain('select(.type == "system" and .subtype == "init") | .permissionMode');
    const dir = tempDir("producer-mode-");
    try {
      const transcript = join(dir, "transcript.jsonl");
      const init = (fields: Record<string, unknown>) =>
        writeFileSync(transcript, `${JSON.stringify({ type: "system", subtype: "init", ...fields })}\n${JSON.stringify({ type: "result", subtype: "success" })}\n`);
      const cases: [Record<string, unknown> | undefined, number, string][] = [
        [{ permissionMode: "dontAsk" }, 0, "Permission mode: dontAsk.\n"],
        [{ permissionMode: "default" }, 1, "CHECK producer FAILED: permission mode default\n"],
        [{ permissionMode: "bypassPermissions" }, 1, "CHECK producer FAILED: permission mode bypassPermissions\n"],
        [{ permissionMode: "::warning::x" }, 1, "CHECK producer FAILED: permission mode unknown\n"],
        [{}, 1, "CHECK producer FAILED: permission mode unknown\n"],
        [undefined, 1, "CHECK producer FAILED: permission mode unknown\n"],
      ];
      for (const [fields, status, out] of cases) {
        if (fields === undefined) rmSync(transcript, { force: true });
        else init(fields);
        const r = bash(check, { TRANSCRIPT: transcript }, dir);
        expect([r.status, r.stdout]).toEqual([status, out]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("SPEC-001-R89 writes the binary, rename-free patch against github.sha with git alone, and refuses a commit or an empty patch", () => {
    const patchStep = step("agent", (s) => s.id === "patch");
    expect(patchStep.if).toBe("${{ !inputs.egress_probe }}");
    const ended = step("agent", named("Check how the agent's run ended"));
    const { dir, head } = repoWith({ "src/a.ts": "export const a = 1;\n", ".gitignore": "node_modules/\n" });
    const temp = tempDir("producer-patch-");
    try {
      const extra = { GITHUB_SHA: head, RUNNER_TEMP: temp, GITHUB_OUTPUT: join(temp, "out") };
      writeFileSync(join(dir, "src/a.ts"), "export const a = 2;\n");
      writeFileSync(join(dir, "src/b.ts"), "export const b = 1;\n");
      mkdirSync(join(dir, "node_modules"));
      writeFileSync(join(dir, "node_modules/x.js"), "x\n");
      const ok = bash(patchStep, {}, dir, extra);
      expect(ok.status).toBe(0);
      // The stat lists file names the agent chose, so workflow commands are off while it prints.
      const out = ok.stdout.split("\n");
      const token = /^::stop-commands::([0-9a-f]{32})$/.exec(out[0] ?? "")?.[1];
      expect(token).toMatch(/^[0-9a-f]{32}$/);
      expect(out.indexOf(`::${token ?? ""}::`)).toBeGreaterThan(out.findIndex((l) => l.includes("src/b.ts")));
      expect(out.findIndex((l) => l.includes("src/b.ts"))).toBeGreaterThan(0);
      const diff = read(join(temp, "changes.diff"));
      expect(diff).toContain("diff --git a/src/b.ts b/src/b.ts\nnew file mode 100644");
      expect(diff).not.toContain("node_modules");
      const digest = createHash("sha256").update(readFileSync(join(temp, "changes.diff"))).digest("hex");
      expect(read(join(temp, "out"))).toBe(`patch_sha256=${digest}\n`);
      gitIn(dir, "commit", "-q", "-m", "agent commit");
      expect(bash(patchStep, {}, dir, extra).stdout).toBe("CHECK producer FAILED: commit made\n");
      const clean = repoWith({ "src/a.ts": "x\n" });
      expect(bash(patchStep, {}, clean.dir, { ...extra, GITHUB_SHA: clean.head }).stdout).toBe("CHECK producer FAILED: empty patch\n");
      rmSync(clean.dir, { recursive: true, force: true });
      const result = (subtype: string, fields: Record<string, unknown> = { is_error: false }) =>
        writeFileSync(join(temp, "transcript.jsonl"), `${JSON.stringify({ type: "result", subtype, ...fields })}\n`);
      result("success");
      expect(bash(ended, { STATUS: "0" }, dir, { RUNNER_TEMP: temp }).status).toBe(0);
      result("error_max_turns");
      expect(bash(ended, { STATUS: "1" }, dir, { RUNNER_TEMP: temp }).stdout).toBe("CHECK producer FAILED: agent error_max_turns\n");
      result("::warning::x");
      expect(bash(ended, { STATUS: "0" }, dir, { RUNNER_TEMP: temp }).stdout).toBe("CHECK producer FAILED: agent no result\n");
      // Run 42389828816 ended as success with is_error true after Bedrock refused the model, with no tool run.
      result("success", { is_error: true });
      expect(bash(ended, { STATUS: "0" }, dir, { RUNNER_TEMP: temp }).stdout).toBe("CHECK producer FAILED: agent error\n");
      result("success", {});
      expect(bash(ended, { STATUS: "0" }, dir, { RUNNER_TEMP: temp }).stdout).toBe("CHECK producer FAILED: agent error\n");
      rmSync(join(temp, "transcript.jsonl"));
      expect(bash(ended, { STATUS: "0" }, dir, { RUNNER_TEMP: temp }).stdout).toBe("CHECK producer FAILED: agent no result\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(temp, { recursive: true, force: true });
    }
    const uploads = job("agent").steps.filter((s) => s.uses?.startsWith("actions/upload-artifact@") === true);
    expect(uploads.map((s) => [s.with?.["name"], s.if])).toEqual([["producer-patch", "${{ !inputs.egress_probe }}"], ["producer-transcript", "always()"]]);
    expect(JSON.stringify(job("agent"))).not.toMatch(/git (commit|push|tag)|git -c|gh release/);
  });

  it("SPEC-001-R207 installs from the lockfile and fetches the pinned Claude Code, with no cache, SHA-pinned actions and checked digests", () => {
    expect([producer.permissions, producer["cache-mode"]]).toEqual([{}, "none"]);
    expect(job("install").permissions).toEqual({ contents: "read" });
    const fetch = step("install", named("Install the dependencies")).run ?? "";
    expect(fetch).toContain("npm ci --ignore-scripts --no-audit --no-fund");
    expect(fetch).toContain("https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-${CLAUDE_CODE_VERSION}.tgz");
    expect(fetch).toContain('echo "${CLAUDE_CODE_SHA256}  $RUNNER_TEMP/claude-code.tgz" | sha256sum -c --quiet -');
    expect(job("install").outputs?.["deps_sha256"]).toBe("${{ steps.pack.outputs.deps_sha256 }}");
    const unpack = step("agent", named("Check both digests")).run ?? "";
    const verified = unpack.indexOf('echo "${CLAUDE_CODE_SHA256}  $in/claude-code.tgz" | sha256sum -c --quiet -');
    expect(unpack.indexOf('echo "${DEPS_SHA256}  $in/node_modules.tar" | sha256sum -c --quiet -')).toBeLessThan(verified);
    expect(verified).toBeLessThan(unpack.indexOf("tar -x"));
    const uses = Object.values(jobs).flatMap((j) => j.steps.map((s) => s.uses)).filter((u): u is string => u !== undefined);
    expect(uses.filter((u) => !/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(u))).toEqual([]);
    expect(uses.filter((u) => u.startsWith("actions/cache"))).toEqual([]);
    const setupNode = Object.values(jobs).flatMap((j) => j.steps).filter((s) => s.uses?.startsWith("actions/setup-node@") === true);
    expect(setupNode.map((s) => s.with?.["package-manager-cache"])).toEqual([false, false, false]);
    const checkouts = Object.values(jobs).flatMap((j) => j.steps).filter((s) => s.uses?.startsWith("actions/checkout@") === true);
    expect(checkouts.map((s) => s.with?.["persist-credentials"])).toEqual([false, false, false, false]);
  });

  it("SPEC-001-R208 publishes with contents: write only, from a checkout it never patches, after checking the patch's digest and scope", () => {
    const publish = job("publish");
    expect([publish.permissions, publish.environment]).toEqual([{ contents: "write" }, undefined]);
    expect(JSON.stringify(publish)).not.toMatch(/vars\.|id-token|aws-actions/);
    const checkouts = publish.steps.filter((s) => s.uses?.startsWith("actions/checkout@") === true).map((s) => s.with?.["path"]);
    expect(checkouts).toEqual(["trusted", "work"]);
    const push = step("publish", (s) => s.id === "push");
    expect(push["working-directory"]).toBe("work");
    const lines = (push.run ?? "").split("\n");
    const at = (start: string) => lines.findIndex((l) => l.startsWith(start));
    const order = [
      at('echo "${PATCH_SHA256}  ${patch}" | sha256sum -c --status - || { echo "CHECK producer FAILED: patch digest"; exit 1; }'),
      at('git apply --index "$patch" ||'),
      at('scope="$(node ../trusted/scripts/ci/producer.ts scope "$patch")" || { echo "$scope"; exit 1; }'),
      at('[ "$scope" = "scope ok" ] || { echo "CHECK producer FAILED: scope not confirmed"; exit 1; }'),
      at('node ../trusted/scripts/ci/producer.ts message "$RUNNER_TEMP/message.txt"'), at("git -c user.name="),
      at('git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic ${auth}" push origin "HEAD:refs/heads/candidate/${TASK}"'),
    ];
    expect(order.every((i, n) => i >= 0 && (n === 0 || i > (order[n - 1] ?? -1)))).toBe(true);
    expect(push.run).not.toMatch(/--force|\s-f\s|\+HEAD/);
    expect(push.run).not.toMatch(/node (?!\.\.\/trusted\/)/);
  });

  it("SPEC-001-R208 allows only src/, test/, docs/ and traceability.md, the same places the Edit rules name, and refuses every other path", () => {
    expect([...SCOPE_DIRS.map((d) => `Edit(${d}**)`), ...SCOPE_FILES.map((f) => `Edit(${f})`)]).toEqual([...EDIT_RULES]);
    expect(agentPrompt("TASK-1", "", "x", false)).toContain("Change only files under src/, test/ or docs/, or traceability.md.");
    const protectedList = [".github/", "scripts/ci/", "package.json", "CLAUDE.md"];
    const refusal = (path: string, spec = "SPEC-014-R7") => scopeRefusal([{ status: "A", mode: "100644", path }], protectedList, 10, spec);
    for (const allowed of ["src/export.ts", "test/export.acceptance.test.ts", "docs/notes/x.md", "traceability.md"]) {
      expect([allowed, refusal(allowed)]).toEqual([allowed, undefined]);
    }
    const refused: [string, string][] = [
      [".npmrc", "outside scope .npmrc"], ["package.json", "protected path package.json"], ["README.md", "outside scope README.md"],
      [".github/x", "protected path .github/x"], ["src/../x", "outside scope src/../x"], ["src/./x.ts", "outside scope src/./x.ts"],
      ["src//x.ts", "outside scope src//x.ts"], ["docs/.npmrc", "outside scope docs/.npmrc"], ["test/.hidden/x.ts", "outside scope test/.hidden/x.ts"],
      ["srcx/a.ts", "outside scope srcx/a.ts"], ["traceability.md.bak", "outside scope traceability.md.bak"], ["infra/sandbox/x.tf", "outside scope infra/sandbox/x.tf"],
      ["docs/a\n::warning::x", "path with a control character"],
    ];
    for (const [path, id] of refused) expect([path, refusal(path)]).toEqual([path, id]);
    expect([inScope("src/export.ts"), inScope("src"), inScope("src/"), inScope(".gitattributes")]).toEqual([true, false, false, false]);
  });

  it("SPEC-001-R208 refuses a patch that is too big, empty, protected, not a plain file, or touches src/ or test/ with no spec", () => {
    const protectedList = [".github/", "scripts/ci/", "CLAUDE.md"];
    const entry = (path: string, mode = "100644", status = "M") => ({ status, mode, path });
    expect(scopeRefusal([entry("src/a.ts")], protectedList, 10, "SPEC-014-R7")).toBeUndefined();
    expect(scopeRefusal([entry("docs/a.md")], protectedList, 10, "")).toBeUndefined();
    expect(scopeRefusal([entry("src/a.ts")], protectedList, MAX_PATCH_BYTES + 1, "SPEC-014-R7")).toBe("patch over 1 MiB");
    expect(scopeRefusal([], protectedList, 0, "")).toBe("empty patch");
    expect(scopeRefusal([entry("docs/a.md"), entry(".github/workflows/x.yml", "100644", "A")], protectedList, 10, "")).toBe("protected path .github/workflows/x.yml");
    expect(scopeRefusal([entry("specs/SPEC-014-export-latency.md")], [], 10, "")).toBe("protected path specs/SPEC-014-export-latency.md");
    expect(scopeRefusal([entry("approvers.txt")], [], 10, "")).toBe("protected path approvers.txt");
    expect(scopeRefusal([entry("CLAUDE.md", "100644", "D")], protectedList, 10, "")).toBe("protected path CLAUDE.md");
    expect(scopeRefusal([entry("docs/link", "120000", "A")], protectedList, 10, "")).toBe("file mode 120000 docs/link");
    expect(scopeRefusal([entry("docs/sub", "160000", "A")], protectedList, 10, "")).toBe("file mode 160000 docs/sub");
    expect(scopeRefusal([entry("docs/old.md", "000000", "D")], protectedList, 10, "")).toBeUndefined();
    expect(scopeRefusal([entry("test/a.test.ts")], protectedList, 10, "")).toBe("missing spec");
    expect(stagedEntries(":100644 100644 aaa bbb M\0src/a.ts\0:000000 120000 000 ccc A\0docs/l\0:100644 000000 ddd 000 D\0x.md\0")).toEqual([
      entry("src/a.ts"), entry("docs/l", "120000", "A"), entry("x.md", "100644", "D"),
    ]);
  });

  it("SPEC-001-R208 the scope command reads the protected paths from HEAD, not from the patched tree", () => {
    const { dir } = repoWith({ "specs/protected-paths.txt": "# list\n.github/\nscripts/ci/\n", "docs/a.md": "a\n" });
    const temp = tempDir("producer-scope-");
    try {
      const script = join(process.cwd(), "scripts/ci/producer.ts");
      const scope = (patchText: string, spec = "") => {
        gitIn(dir, "reset", "-q", "--hard", "HEAD");
        gitIn(dir, "clean", "-qfd");
        writeFileSync(join(temp, "changes.diff"), patchText);
        gitIn(dir, "apply", "--index", join(temp, "changes.diff"));
        return spawnSync(process.execPath, [script, "scope", join(temp, "changes.diff")], { cwd: dir, encoding: "utf8", env: { ...process.env, SPEC: spec } });
      };
      const add = (path: string, text: string) => `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1 @@\n+${text}\n`;
      const ok = scope(add("docs/b.md", "b"));
      expect([ok.status, ok.stdout]).toEqual([0, "scope ok\n"]);
      const workflow = scope(add(".github/workflows/x.yml", "on: push"));
      expect([workflow.status, workflow.stdout]).toEqual([1, "CHECK producer FAILED: protected path .github/workflows/x.yml\n"]);
      const npmrc = scope(add(".npmrc", "node-options=--import=./docs/notes/x.mjs"));
      expect([npmrc.status, npmrc.stdout]).toEqual([1, "CHECK producer FAILED: outside scope .npmrc\n"]);
      const loosened = "diff --git a/specs/protected-paths.txt b/specs/protected-paths.txt\n--- a/specs/protected-paths.txt\n+++ b/specs/protected-paths.txt\n@@ -1,3 +1 @@\n # list\n-.github/\n-scripts/ci/\n";
      const both = scope(`${loosened}${add("scripts/ci/x.sh", "x")}`);
      expect(both.stdout).toBe("CHECK producer FAILED: protected path scripts/ci/x.sh\n");
      expect(scope(add("src/c.ts", "export const c = 1;")).stdout).toBe("CHECK producer FAILED: missing spec\n");
      expect(scope(add("src/c.ts", "export const c = 1;"), "SPEC-014-R7").status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("SPEC-001-R208 runs scope when started through a symlink or a path that needs percent-encoding, never exiting 0 silently", () => {
    const temp = tempDir("producer entry ");
    const { dir } = repoWith({ "specs/protected-paths.txt": ".github/\n", "docs/a.md": "a\n" });
    try {
      const script = join(process.cwd(), "scripts/ci/producer.ts");
      const spaced = join(temp, "with space.ts");
      writeFileSync(spaced, "");
      expect(isEntryPoint(pathToFileURL(spaced).href, spaced)).toBe(true);
      expect(isEntryPoint(pathToFileURL(spaced).href, script)).toBe(false);
      expect(isEntryPoint(pathToFileURL(spaced).href, undefined)).toBe(false);
      mkdirSync(join(temp, "ci"));
      symlinkSync(script, join(temp, "ci", "linked.ts"));
      expect(isEntryPoint(pathToFileURL(script).href, join(temp, "ci", "linked.ts"))).toBe(true);
      writeFileSync(join(dir, "docs/a.md"), "b\n");
      gitIn(dir, "add", "docs/a.md");
      writeFileSync(join(temp, "changes.diff"), "x\n");
      const r = spawnSync(process.execPath, [join(temp, "ci", "linked.ts"), "scope", join(temp, "changes.diff")], { cwd: dir, encoding: "utf8" });
      expect([r.status, r.stdout]).toEqual([0, "scope ok\n"]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("SPEC-001-R208 commits with the Task, Spec, Agent and Producer-Run trailers, and refuses inputs it did not check", () => {
    const url = "https://github.com/PaulDuvall/who-gets-the-keys/actions/runs/42/attempts/1";
    const message = commitMessage("TASK-T2-1", "SPEC-014-R7", "Reject duplicate column names", url);
    expect(message.split("\n")[0]).toBe("Reject duplicate column names");
    expect(message.endsWith(`\n\nTask: TASK-T2-1\nSpec: SPEC-014-R7\nAgent: Claude Code\nProducer-Run: ${url}\n`)).toBe(true);
    expect(commitMessage("TASK-T2-1", "", "Docs only", url)).not.toContain("Spec:");
    expect(() => commitMessage("TASK-T2-1", "", "x\nSpec: SPEC-001-R1", url)).toThrow(new ProducerRefusal("input subject"));
    expect(() => commitMessage("TASK-T2-1", "", "x", "https://evil.example/actions/runs/1")).toThrow(new ProducerRefusal("run URL"));
    const { dir } = repoWith({ "a.txt": "a\n" });
    try {
      writeFileSync(join(dir, "msg"), message);
      gitIn(dir, "commit", "-q", "--allow-empty", "-F", "msg");
      expect(gitIn(dir, "log", "-1", "--format=%(trailers:key=Spec,valueonly)%(trailers:key=Agent,valueonly)%(trailers:key=Task,valueonly)")).toBe("SPEC-014-R7\nClaude Code\nTASK-T2-1\n\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("SPEC-001-R209 starts pipeline.yml on the candidate branch from a job that holds only actions: write and checks out nothing", () => {
    const dispatch = job("dispatch");
    expect(dispatch.permissions).toEqual({ actions: "write" });
    expect(dispatch.steps.map((s) => s.uses)).toEqual([undefined]);
    const run = dispatch.steps[0]?.run ?? "";
    expect(run).toContain('gh workflow run pipeline.yml --repo "$REPO" --ref "$BRANCH"');
    expect(dispatch.steps[0]?.env?.["BRANCH"]).toBe("${{ needs.publish.outputs.branch }}");
    expect(dispatch.steps[0]?.env?.["BRANCH_PATTERN"]).toBe(`^candidate/${TASK_ID.source.slice(1)}`);
    expect(job("publish").outputs?.["branch"]).toBe("${{ steps.push.outputs.branch }}");
  });

  it("SPEC-001-R41 producer.yml defines no job named checks and grants neither checks: write nor statuses: write", () => {
    expect(Object.entries(jobs).filter(([id, j]) => (j.name ?? id).trim().toLowerCase() === "checks" || (j.name ?? "").includes("${{"))).toEqual([]);
    const granted = Object.values(jobs).map((j) => j.permissions).filter((p) => typeof p === "object" && (p["checks"] !== undefined || p["statuses"] !== undefined));
    expect(granted).toEqual([]);
    const writes = Object.fromEntries(Object.entries(jobs).map(([id, j]) => [id, Object.entries(typeof j.permissions === "object" ? j.permissions : {}).filter(([, v]) => v === "write").map(([k]) => k)]));
    expect(writes).toEqual({ install: [], agent: ["id-token"], publish: ["contents"], dispatch: ["actions"] });
  });
});
