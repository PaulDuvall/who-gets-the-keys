import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const read = (path: string) => readFileSync(path, "utf8");

interface Job { name?: string; if?: string; environment?: string }
interface Workflow { on: { push: { branches: string[] } }; jobs: Record<string, Job> }
interface Rule { type: string; parameters?: { strict_required_status_checks_policy: boolean; required_status_checks: { context: string; integration_id: number }[] } }
interface Ruleset { bypass_actors: unknown[]; enforcement: string; conditions: { ref_name: { include: string[] } }; rules: Rule[] }

describe("SPEC-001 merge gate", () => {
  const workflow = parse(read(".github/workflows/pipeline.yml")) as Workflow;

  it("SPEC-001-R40 runs the pipeline on candidate branches and deploys only from main", () => {
    expect(workflow.on.push.branches).toEqual(["main", "candidate/**"]);
    expect(workflow.jobs["deploy"]?.environment).toBe("sandbox");
    expect(workflow.jobs["deploy"]?.if).toContain("github.ref == 'refs/heads/main'");
    const withEnvironment = Object.entries(workflow.jobs).filter(([, job]) => job.environment !== undefined).map(([id]) => id);
    expect(withEnvironment).toEqual(["deploy"]);
  });

  it("SPEC-001-R41 github.sh requires the checks job from GitHub Actions on main, with no bypass actors", () => {
    const script = read("scripts/bootstrap/github.sh");
    execFileSync("bash", ["-n", "scripts/bootstrap/github.sh"]);
    const start = script.indexOf('ruleset_body="$(cat <<JSON');
    const end = script.indexOf('\nJSON\n)"', start);
    expect(start).toBeGreaterThan(-1);
    const block = script.slice(start, end + '\nJSON\n)"'.length);
    const body = JSON.parse(execFileSync("bash", ["-c", `actions_app=15368; ruleset="protect main"; ${block}\nprintf '%s' "$ruleset_body"`], { encoding: "utf8" })) as Ruleset;
    expect(body.bypass_actors).toEqual([]);
    expect(body.enforcement).toBe("active");
    expect(body.conditions.ref_name.include).toEqual(["~DEFAULT_BRANCH"]);
    expect(body.rules.map((r) => r.type)).toEqual(["deletion", "non_fast_forward", "required_linear_history", "required_status_checks"]);
    expect(body.rules[3]?.parameters).toEqual({ strict_required_status_checks_policy: true, required_status_checks: [{ context: "checks", integration_id: 15368 }] });
    expect(workflow.jobs["checks"]?.name).toBe("checks");
    expect(script).toContain('select(.app.slug == "github-actions")');
    expect(script).toContain('-X PUT "repos/${repo}/rulesets/${ruleset_id}"');
    expect(script).not.toContain("exists, skipped");
  });
});
