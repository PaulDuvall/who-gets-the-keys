// Scenario harness (SPEC-001-R19 to R37, R72, R73, R107). Usage: node scenarios/run.ts [scenario ID]
// Each local scenario: temporary worktree from HEAD, apply patch, commit unsigned, run the checks,
// assert the first failing check and its line, remove the worktree. Results go to build/scenarios/results.json.
// A scenario with a task fixture first commits it as tasks/<ID>.task.md, the base of the task and scope checks' range,
// then commits its patch, or nothing, with a Task trailer, and runs only the checks its mode names (SPEC-001-R107).
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

export interface Scenario {
  id: string;
  title: string;
  patch?: string;
  check: string;
  expect: string;
  slide: (number | string)[];
  spec?: string;
  run?: "checks" | "deploy-verify" | "task-verify" | "scope-verify";
  requires?: "sandbox-account" | "github-actions";
  fixture?: string;
  task?: string;
}

// The task ID a task fixture names: scenarios/fixtures/tasks/<ID>.task.md (SPEC-001-R107).
export function taskIdOf(fixture: string | undefined): string | undefined {
  return /^(TASK-[A-Z0-9-]{1,32})\.task\.md$/.exec(basename(fixture ?? ""))?.[1];
}

// B3 is the scenario whose commit carries no Spec: trailer; every other scenario commit names one. A scenario with a
// task fixture adds its Task: trailer to the same paragraph, so git reads both as trailers.
export const commitMessage = (s: Pick<Scenario, "id" | "title" | "spec" | "task">): string[] => {
  const trailers = [...(s.id === "B3" ? [] : [`Spec: ${s.spec ?? "SPEC-014-R1"}`]), ...(s.task ? [`Task: ${taskIdOf(s.task) ?? ""}`] : [])];
  return [`scenario ${s.id}: ${s.title}`, ...(trailers.length ? [trailers.join("\n")] : [])];
};

// The checks each mode runs, in order; the first failure is judged (SPEC-001-R107).
export const MODE_CHECKS: Readonly<Record<string, readonly string[]>> = { "task-verify": ["task"], "scope-verify": ["task", "scope"] };

export interface Outcome { id: string; status: "pass" | "fail" | "skipped"; check?: string; line?: string; detail: string }

export function firstFailure(output: string): { check: string; line: string } | undefined {
  const m = /^((?:CHECK (\S+) FAILED)(?::.*)?)$/m.exec(output);
  return m ? { check: m[2] ?? "", line: (m[1] ?? "").trimEnd() } : undefined;
}

export function judge(s: Scenario, output: string): Outcome {
  const found = firstFailure(output);
  if (!found) return { id: s.id, status: "fail", detail: "no check failed" };
  const ok = found.check === s.check && found.line.startsWith(s.expect);
  return { id: s.id, status: ok ? "pass" : "fail", check: found.check, line: found.line, detail: ok ? "failed at its named check" : `expected ${s.expect}` };
}

const sh = (argv: readonly string[], cwd: string, env: NodeJS.ProcessEnv = process.env) => {
  const [file, ...args] = argv;
  const r = spawnSync(file ?? "", args, { cwd, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return { status: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};

const GIT_ID = ["-c", "user.name=scenario-harness", "-c", "user.email=harness@example.invalid", "-c", "commit.gpgsign=false"];

function runScenario(root: string, s: Scenario, env: NodeJS.ProcessEnv): Outcome {
  const outcome = runInWorktree(root, s, env);
  writeFileSync(join(root, "build", "scenarios", `${s.id}.log`), `${outcome.log}\n`);
  return outcome.result;
}

function runInWorktree(root: string, s: Scenario, env: NodeJS.ProcessEnv): { result: Outcome; log: string } {
  const dir = mkdtempSync(join(tmpdir(), `scenario-${s.id}-`));
  try {
    sh(["git", "worktree", "add", "--detach", "--force", dir, "HEAD"], root);
    return runIn(root, dir, s, env);
  } finally {
    sh(["git", "worktree", "remove", "--force", dir], root);
    rmSync(dir, { recursive: true, force: true });
  }
}

// One scenario in `dir`, a checkout of main that the caller made and removes; `root` holds its patch and fixtures.
export function runIn(root: string, dir: string, s: Scenario, env: NodeJS.ProcessEnv): { result: Outcome; log: string } {
  let base: string | undefined;
  if (s.task !== undefined) {
    const id = taskIdOf(s.task);
    if (id === undefined) return { result: { id: s.id, status: "fail", detail: `task fixture ${s.task} is not named <task ID>.task.md` }, log: "" };
    mkdirSync(join(dir, "tasks"), { recursive: true });
    copyFileSync(join(root, s.task), join(dir, "tasks", `${id}.task.md`));
    sh(["git", "add", "--", `tasks/${id}.task.md`], dir);
    sh(["git", ...GIT_ID, "commit", "-q", "--no-verify", "-m", `scenario ${s.id}: task fixture ${id}`], dir);
    base = sh(["git", "rev-parse", "HEAD"], dir).out.trim();
  }
  if (s.patch !== undefined) {
    const applied = sh(["git", "apply", "--index", join(root, s.patch)], dir);
    if (applied.status !== 0) return { result: { id: s.id, status: "fail", line: `SCENARIO ${s.id} FAILED: patch does not apply`, detail: applied.out.trim() }, log: applied.out };
  }
  sh(["git", ...GIT_ID, "commit", "-q", "--no-verify", "--allow-empty", ...commitMessage(s).flatMap((m) => ["-m", m])], dir);
  const mode = MODE_CHECKS[s.run ?? ""];
  if (mode !== undefined) {
    let out = "";
    for (const check of mode) {
      const r = sh(["node", "scripts/checks.ts", check, ...(base === undefined ? [] : [base])], dir, env);
      out += r.out;
      if (r.status !== 0) break;
    }
    return { result: judge(s, out), log: out };
  }
  if (s.run === "deploy-verify") {
    sh(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], dir, env);
    // package.json's build script, run as the build job runs it: without npm, so no .npmrc adds code (SPEC-001-R215).
    sh(["node_modules/.bin/tsc", "--noEmit", "false", "--outDir", "dist"], dir, env);
    sh(["bash", "-c", "mkdir -p dist/function && cp dist/src/*.js dist/function/ && cd dist/function && zip -X -q ../function.zip ./*"], dir, env);
    const out = sh(["node", "scripts/checks.ts", "attestation", "dist/function.zip"], dir, env).out;
    return { result: judge(s, out), log: out };
  }
  const out = sh(["node", "scripts/checks.ts"], dir, env).out;
  return { result: judge(s, out), log: out };
}

async function main(filter: string | undefined): Promise<number> {
  const root = resolve(".");
  const { parse } = await import("yaml");
  const { readFileSync } = await import("node:fs");
  const all = (parse(readFileSync("scenarios/scenarios.yaml", "utf8")) as { scenarios: Scenario[] }).scenarios;
  const chosen = all.filter((s) => filter === undefined || s.id === filter);
  if (chosen.length === 0) throw new Error(`no scenario ${filter ?? ""}`);
  const env = { ...process.env, TF_PLUGIN_CACHE_DIR: join(tmpdir(), "tf-plugin-cache"), CHECKPOINT_DISABLE: "1" };
  mkdirSync(env.TF_PLUGIN_CACHE_DIR, { recursive: true });
  mkdirSync("build/scenarios", { recursive: true });
  const outcomes = chosen.map((s): Outcome => {
    if (s.requires) return { id: s.id, status: "skipped", detail: `runs in ${s.requires === "github-actions" ? "scenarios.yml b9-replay" : "scenarios.yml on-demand (sandbox account)"}` };
    process.stderr.write(`scenario ${s.id} ...\n`);
    return runScenario(root, s, env);
  });
  console.log("| Scenario | Result | Check | Line |\n|---|---|---|---|");
  for (const o of outcomes) console.log(`| ${o.id} | ${o.status} | ${o.check ?? "—"} | ${o.line ?? o.detail} |`);
  mkdirSync("build/scenarios", { recursive: true });
  writeFileSync("build/scenarios/results.json", `${JSON.stringify(outcomes, null, 2)}\n`);
  return outcomes.some((o) => o.status === "fail") ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv[2]);
