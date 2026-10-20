// Scenario harness (SPEC-001-R19 to R37). Usage: node scenarios/run.ts [scenario ID]
// Each local scenario: temporary worktree from HEAD, apply patch, commit unsigned, run the gates,
// assert the first failing gate and its line, remove the worktree. Results go to build/scenarios/results.json.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface Scenario {
  id: string;
  title: string;
  patch: string;
  gate: string;
  expect: string;
  slide: (number | string)[];
  spec?: string;
  run?: "gates" | "deploy-verify";
  requires?: "sandbox-account" | "github-actions";
}

export interface Outcome { id: string; status: "pass" | "fail" | "skipped"; gate?: string; line?: string; detail: string }

export function firstFailure(output: string): { gate: string; line: string } | undefined {
  const m = /^((?:GATE (\S+) FAILED)(?::.*)?)$/m.exec(output);
  return m ? { gate: m[2] ?? "", line: (m[1] ?? "").trimEnd() } : undefined;
}

export function judge(s: Scenario, output: string): Outcome {
  const found = firstFailure(output);
  if (!found) return { id: s.id, status: "fail", detail: "no gate failed" };
  const ok = found.gate === s.gate && found.line.startsWith(s.expect);
  return { id: s.id, status: ok ? "pass" : "fail", gate: found.gate, line: found.line, detail: ok ? "failed at its named gate" : `expected ${s.expect}` };
}

const sh = (argv: readonly string[], cwd: string, env: NodeJS.ProcessEnv = process.env) => {
  const [file, ...args] = argv;
  const r = spawnSync(file ?? "", args, { cwd, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return { status: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};

const GIT_ID = ["-c", "user.name=scenario-harness", "-c", "user.email=harness@example.invalid", "-c", "commit.gpgsign=false"];

function runScenario(root: string, s: Scenario, env: NodeJS.ProcessEnv): Outcome {
  const dir = mkdtempSync(join(tmpdir(), `scenario-${s.id}-`));
  try {
    sh(["git", "worktree", "add", "--detach", "--force", dir, "HEAD"], root);
    const applied = sh(["git", "apply", "--index", join(root, s.patch)], dir);
    if (applied.status !== 0) return { id: s.id, status: "fail", line: `SCENARIO ${s.id} FAILED: patch does not apply`, detail: applied.out.trim() };
    const trailer = s.id === "B3" ? [] : ["-m", `Spec: ${s.spec ?? "SPEC-014-R1"}`];
    sh(["git", ...GIT_ID, "commit", "-q", "--no-verify", "-m", `scenario ${s.id}: ${s.title}`, ...trailer], dir);
    if (s.run === "deploy-verify") {
      sh(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], dir, env);
      sh(["npm", "run", "build"], dir, env);
      sh(["bash", "-c", "mkdir -p dist/function && cp dist/src/*.js dist/function/ && cd dist/function && zip -X -q ../function.zip ./*"], dir, env);
      return judge(s, sh(["node", "scripts/gates.ts", "attestation", "dist/function.zip"], dir, env).out);
    }
    return judge(s, sh(["node", "scripts/gates.ts"], dir, env).out);
  } finally {
    sh(["git", "worktree", "remove", "--force", dir], root);
    rmSync(dir, { recursive: true, force: true });
  }
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
  const outcomes = chosen.map((s): Outcome => {
    if (s.requires) return { id: s.id, status: "skipped", detail: `runs in ${s.requires === "github-actions" ? "scenarios.yml b9-replay" : "scenarios.yml on-demand (sandbox account)"}` };
    process.stderr.write(`scenario ${s.id} ...\n`);
    return runScenario(root, s, env);
  });
  console.log("| Scenario | Result | Gate | Line |\n|---|---|---|---|");
  for (const o of outcomes) console.log(`| ${o.id} | ${o.status} | ${o.gate ?? "—"} | ${o.line ?? o.detail} |`);
  mkdirSync("build/scenarios", { recursive: true });
  writeFileSync("build/scenarios/results.json", `${JSON.stringify(outcomes, null, 2)}\n`);
  return outcomes.some((o) => o.status === "fail") ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main(process.argv[2]);
