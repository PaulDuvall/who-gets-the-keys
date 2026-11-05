import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const read = (path: string) => readFileSync(path, "utf8");

type Permissions = string | Record<string, string> | undefined;
interface Job { name?: string; if?: string; needs?: string | string[]; environment?: string; permissions?: Permissions }
interface Workflow { on: { push?: { branches?: string[] } }; permissions?: Permissions; jobs: Record<string, Job> }
interface Rule { type: string; parameters?: { strict_required_status_checks_policy: boolean; required_status_checks: { context: string; integration_id: number }[] } }
interface Ruleset { name: string; bypass_actors: unknown[]; enforcement: string; conditions: { ref_name: { include: string[] } }; rules: Rule[] }

const workflowDir = ".github/workflows";
const workflows = readdirSync(workflowDir).filter((file) => /\.ya?ml$/.test(file)).sort()
  .map((file) => ({ file, workflow: parse(read(join(workflowDir, file))) as Workflow }));
const pipeline = workflows.find((w) => w.file === "pipeline.yml")?.workflow as Workflow;
const script = read("scripts/bootstrap/github.sh");
const lines = script.split("\n").map((line) => line.trim());

// A stand-in for gh: it logs every call, keeps each request body sent with --input -, and answers the reads github.sh makes.
// STUB_REFUSE_MERGE fails the merge-method PATCH as GitHub would with a 422; STUB_MERGE_METHODS is what reading them back returns.
const stubGh = [
  "#!/usr/bin/env bash",
  'printf \'%s\\n\' "$*" >> "$STUB_DIR/calls"',
  '[ "$1" = "auth" ] && exit 0',
  'if [ "${2:-}" = "-X" ]; then',
  '  if [[ " $* " == *" --input - "* ]]; then cat > "$STUB_DIR/body_${4//\\//_}"; fi',
  '  if [ -n "${STUB_REFUSE_MERGE:-}" ] && [[ " $* " == *" allow_squash_merge="* ]]; then echo "gh: Validation Failed (HTTP 422)" >&2; exit 1; fi',
  "  exit 0",
  "fi",
  'case "$2" in',
  '  "repos/o/r")',
  '    if [ "$4" = ".visibility" ]; then echo "$STUB_VISIBILITY"',
  '    elif [[ "$4" == *"allow_merge_commit) "* ]]; then echo "$STUB_MERGE_METHODS"',
  "    else echo stub; fi ;;",
  '  user) if [ "$4" = ".id" ]; then echo 1; else echo owner; fi ;;',
  '  *"/rulesets?includes_parents=false") echo "${STUB_RULESET_ID:-}" ;;',
  '  *"/check-runs?check_name=checks") echo "${STUB_APP_ID:-}" ;;',
  '  *"/deployment-branch-policies") echo main ;;',
  "  *) echo stub ;;",
  "esac",
  "",
].join("\n");

interface Stub { appId: string; rulesetId: string; visibility?: string; refuseMerge?: boolean; mergeMethods?: string }

function runGithubSh(stub: Stub) {
  const dir = mkdtempSync(join(tmpdir(), "github-sh-"));
  try {
    writeFileSync(join(dir, "gh"), stubGh);
    chmodSync(join(dir, "gh"), 0o755);
    const env = {
      ...process.env, PATH: `${dir}:${process.env["PATH"] ?? ""}`, STUB_DIR: dir, STUB_APP_ID: stub.appId, STUB_RULESET_ID: stub.rulesetId,
      STUB_VISIBILITY: stub.visibility ?? "private", STUB_REFUSE_MERGE: stub.refuseMerge === true ? "1" : "", STUB_MERGE_METHODS: stub.mergeMethods ?? "true false false",
      REPO: "o/r", GH_TOKEN: "stub", GH_CONFIG_DIR: dir,
    };
    const r = spawnSync("bash", ["scripts/bootstrap/github.sh"], { input: "y\n", encoding: "utf8", env });
    const calls = read(join(dir, "calls")).trimEnd().split("\n");
    const bodyFile = join(dir, `body_repos_o_r_rulesets${stub.rulesetId ? `_${stub.rulesetId}` : ""}`);
    const ruleset = existsSync(bodyFile) ? (JSON.parse(read(bodyFile)) as Ruleset) : undefined;
    return { status: r.status, out: r.stdout, calls, writes: calls.filter((c) => c.startsWith("api -X ")), ruleset };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const tokenAndEnvironmentWrites = [
  "api -X PUT repos/o/r/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false",
  "api -X PUT repos/o/r/actions/permissions -F enabled=true -f allowed_actions=all -F sha_pinning_required=true",
  "api -X PUT repos/o/r/environments/sandbox --input -",
  "api -X PUT repos/o/r/environments/probe --input -",
];
const secretScanningWrites = ["api -X PATCH repos/o/r --input -", "api -X PUT repos/o/r/private-vulnerability-reporting"];
const mergeWrite = "api -X PATCH repos/o/r -F allow_merge_commit=true -F allow_squash_merge=false -F allow_rebase_merge=false";
const settingWrites = [...tokenAndEnvironmentWrites, mergeWrite];
const mergeRefused = "GitHub refused squash and rebase merges off while linear history is required.";

describe("SPEC-001 checks before main", () => {
  it("SPEC-001-R40 runs checks, build, attest and receipt on candidate branches, and deploys only from main after the receipt", () => {
    expect(pipeline.on.push?.branches).toEqual(["main", "candidate/**"]);
    const mainOrCandidate = "github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/heads/candidate/')";
    expect(["attest", "receipt", "deploy"].map((id) => pipeline.jobs[id]?.if)).toEqual([mainOrCandidate, mainOrCandidate, "github.ref == 'refs/heads/main'"]);
    expect([pipeline.jobs["deploy"]?.needs, pipeline.jobs["receipt"]?.permissions]).toEqual([["build", "attest", "receipt"], { contents: "read", attestations: "read" }]);
    const unconditional = Object.entries(pipeline.jobs).filter(([, job]) => job.if === undefined).map(([id]) => id);
    expect(unconditional).toEqual(["checks", "build"]);
    expect(pipeline.jobs["deploy"]?.environment).toBe("sandbox");
    const withEnvironment = Object.entries(pipeline.jobs).filter(([, job]) => job.environment !== undefined).map(([id]) => id);
    expect(withEnvironment).toEqual(["deploy"]);
  });

  it("SPEC-001-R41 only pipeline.yml defines a job named checks, no other job name is an expression, and no workflow grants checks: write or statuses: write", () => {
    expect(workflows.length).toBeGreaterThan(1);
    expect(pipeline.jobs["checks"]?.name).toBe("checks");
    const checksJobs = workflows.flatMap(({ file, workflow }) =>
      Object.entries(workflow.jobs).filter(([id, job]) => {
        const name = job.name ?? id;
        return name.includes("${{") || name.trim().toLowerCase() === "checks";
      }).map(([id]) => `${file}:${id}`));
    expect(checksJobs).toEqual(["pipeline.yml:checks"]);
    const grants = (p: Permissions) => p === "write-all" || (typeof p === "object" && (p["checks"] === "write" || p["statuses"] === "write"));
    const granting = workflows.flatMap(({ file, workflow }) =>
      [["workflow", workflow.permissions] as const, ...Object.entries(workflow.jobs).map(([id, job]) => [id, job.permissions] as const)]
        .filter(([, p]) => grants(p)).map(([id]) => `${file}:${id}`));
    expect(granting).toEqual([]);
    expect(workflows.filter(({ workflow }) => workflow.permissions === undefined).map(({ file }) => file)).toEqual([]);
  });

  it("SPEC-001-R41 github.sh turns off squash and rebase merges, keeps merge commits, and sends the ruleset body on PUT and POST", () => {
    execFileSync("bash", ["-n", "scripts/bootstrap/github.sh"]);
    const merge = lines.filter((line) => line.includes('gh api -X PATCH "repos/${repo}"') && line.includes("allow_"));
    expect(merge).toHaveLength(1);
    const fields = Object.fromEntries([...(merge[0] ?? "").matchAll(/-F (allow_\w+)=(\w+)/g)].map((m) => [m[1] ?? "", m[2] ?? ""]));
    expect(fields).toEqual({ allow_merge_commit: "true", allow_squash_merge: "false", allow_rebase_merge: "false" });
    const put = lines.filter((line) => line.startsWith('gh api -X PUT "repos/${repo}/rulesets'));
    const post = lines.filter((line) => line.startsWith('gh api -X POST "repos/${repo}/rulesets'));
    expect(put).toEqual(['gh api -X PUT "repos/${repo}/rulesets/${ruleset_id}" --input - >/dev/null <<<"$ruleset_body"']);
    expect(post).toEqual(['gh api -X POST "repos/${repo}/rulesets" --input - >/dev/null <<<"$ruleset_body"']);
    expect(script).toContain('select(.app.slug == "github-actions")');
    const lookup = script.indexOf("commits/main/check-runs?check_name=checks");
    expect(lookup).toBeGreaterThan(script.indexOf('-X PATCH "repos/${repo}" -F allow_'));
    expect(lookup).toBeGreaterThan(script.indexOf("security_and_analysis\": {\"secret_scanning\""));
    expect(lookup).toBeLessThan(script.indexOf('ruleset_body="$(cat <<JSON'));
  });

  it("SPEC-001-R41 github.sh applies every other setting, skips the ruleset and exits 1 when main has no checks run", () => {
    const run = runGithubSh({ appId: "", rulesetId: "" });
    expect(run.calls[0]).toBe("auth status");
    expect(run.writes).toEqual(settingWrites);
    expect(run.ruleset).toBeUndefined();
    expect(run.out).toContain('ruleset "protect main": skipped');
    expect(run.out).not.toContain(mergeRefused);
    expect(run.status).toBe(1);
  });

  it.each([
    ["refuses the merge-method change", true, "true true true"],
    ["accepts it but reads back squash and rebase merges still on", false, "true true true"],
  ])("SPEC-001-R41 github.sh still applies the environments, secret scanning and ruleset, then exits 1, when GitHub %s", (_title, refuseMerge, mergeMethods) => {
    const run = runGithubSh({ appId: "15368", rulesetId: "7", visibility: "public", refuseMerge, mergeMethods });
    expect(run.writes).toEqual([...tokenAndEnvironmentWrites, ...secretScanningWrites, mergeWrite, "api -X PUT repos/o/r/rulesets/7 --input -"]);
    expect(run.ruleset?.rules.map((r) => r.type)).toContain("required_status_checks");
    expect(run.out).toContain(mergeRefused);
    expect(run.out).not.toContain('ruleset "protect main": skipped');
    expect(run.status).toBe(1);
  });

  it.each([
    ["updates an existing ruleset with PUT", "7", "api -X PUT repos/o/r/rulesets/7 --input -"],
    ["creates the ruleset with POST", "", "api -X POST repos/o/r/rulesets --input -"],
  ])("SPEC-001-R41 github.sh %s, requiring checks from GitHub Actions with no bypass actors", (_title, rulesetId, write) => {
    const run = runGithubSh({ appId: "15368", rulesetId });
    expect(run.status).toBe(0);
    expect(run.out).not.toContain(mergeRefused);
    expect(run.writes).toEqual([...settingWrites, write]);
    expect(run.ruleset?.name).toBe("protect main");
    expect(run.ruleset?.bypass_actors).toEqual([]);
    expect(run.ruleset?.enforcement).toBe("active");
    expect(run.ruleset?.conditions.ref_name.include).toEqual(["~DEFAULT_BRANCH"]);
    expect(run.ruleset?.rules.map((r) => r.type)).toEqual(["deletion", "non_fast_forward", "required_linear_history", "required_status_checks"]);
    expect(run.ruleset?.rules[3]?.parameters).toEqual({ strict_required_status_checks_policy: true, required_status_checks: [{ context: "checks", integration_id: 15368 }] });
  });
});
