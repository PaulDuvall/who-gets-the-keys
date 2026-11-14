import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { afterAll, describe, expect, it } from "vitest";

const WORKFLOW = ".github/workflows/factory-video.yml";
const text = readFileSync(WORKFLOW, "utf8");
interface Step { name?: string; id?: string; if?: string; uses?: string; run?: string; with?: Record<string, unknown> }
interface Job { needs?: string | string[]; if?: string; permissions?: Record<string, string>; environment?: { name?: string; url?: string }; steps: Step[] }
const workflow = parse(text) as { on: { push: { branches: string[]; paths: string[] }; workflow_dispatch?: unknown }; permissions: unknown; jobs: Record<string, Job> };
const job = (name: string): Job => {
  const found = workflow.jobs[name];
  if (!found) throw new Error(`no job ${name}`);
  return found;
};
const step = (j: string, name: string): Step => {
  const found = job(j).steps.find((s) => s.name === name);
  if (!found) throw new Error(`no step ${name} in ${j}`);
  return found;
};

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
const tempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

// No git configuration of the machine running the tests reaches the temporary repositories.
const gitEnv = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };

// Runs a step's script as GitHub Actions does, `bash -e` with pipefail, in `cwd` with only the given environment.
function runStep(script: string, cwd: string, env: Record<string, string>): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], {
    cwd,
    encoding: "utf8",
    env: { PATH: process.env["PATH"] ?? "", HOME: cwd, ...gitEnv, ...env },
  });
  return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
}

// A stand-in for gh in the claims job's decide step. It logs each call, answers the newest github-pages deployment as
// STUB_DEPLOY, "<id> <sha>" or nothing, and true for a deployment ID listed in STUB_SUCCESS when asked whether it ever
// had a success status. STUB_FAIL_LIST and STUB_FAIL_STATUSES fail those calls, as an API error would.
const stubGh = [
  "#!/usr/bin/env bash",
  'printf \'%s\\n\' "$*" >> "$STUB_LOG"',
  'case "$2" in',
  '  "repos/o/r/deployments?environment=github-pages&per_page=1") [ -z "${STUB_FAIL_LIST:-}" ] || exit 1; [ -z "${STUB_DEPLOY:-}" ] || echo "$STUB_DEPLOY" ;;',
  '  "repos/o/r/deployments/"*"/statuses?per_page=100") [ -z "${STUB_FAIL_STATUSES:-}" ] || exit 1; id="${2#repos/o/r/deployments/}"; id="${id%%/*}"; case " ${STUB_SUCCESS:-} " in *" $id "*) echo true ;; *) echo false ;; esac ;;',
  "  *) exit 1 ;;",
  "esac",
  "",
].join("\n");

describe("SPEC-001-R235 the factory video follows main and is published to GitHub Pages", () => {
  it("SPEC-001-R235 runs on a push to main that changes docs/progress.json, and when started by hand", () => {
    expect(workflow.on.push.branches).toEqual(["main"]);
    expect(workflow.on.push.paths).toEqual(expect.arrayContaining(["factory-video/**", ".github/workflows/factory-video.yml", "docs/progress.json"]));
    expect(Object.keys(workflow.on)).toContain("workflow_dispatch");
    expect(job("claims").permissions).toEqual({ contents: "read", deployments: "read" });
  });

  describe("SPEC-001-R235 the claims job builds the video unless nothing it shows changed since the last page published", () => {
    const repo = tempDir("factory-rebuild-");
    const bin = tempDir("factory-gh-");
    writeFileSync(join(bin, "gh"), stubGh);
    chmodSync(join(bin, "gh"), 0o755);
    const git = (...args: string[]): string =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args],
        { cwd: repo, encoding: "utf8", env: { ...process.env, ...gitEnv } }).trim();
    const progress = (approved: number, built: number, open: number) =>
      `${JSON.stringify({ requirements: { approved, drafted: 2 }, claims: { built, open: 1 }, backlog: { open, closed: 0 } }, null, 2)}\n`;
    git("init", "-q", "-b", "main");
    for (const [f, body] of [["factory-video/kit.txt", "a\n"], [".github/workflows/factory-video.yml", "a\n"], ["docs/notes/n.md", "a\n"], ["docs/progress.json", progress(1, 1, 1)]] as const) {
      mkdirSync(join(repo, f, ".."), { recursive: true });
      writeFileSync(join(repo, f), body);
    }
    git("add", "-A");
    git("commit", "-q", "-m", "published");
    const published = git("rev-parse", "HEAD");
    git("checkout", "-q", "-b", "side");
    writeFileSync(join(repo, "docs/notes/n.md"), "side\n");
    git("commit", "-q", "-am", "side");
    const side = git("rev-parse", "HEAD");
    const script = step("claims", "Decide whether the video needs a rebuild, against the last page published").run ?? "";

    // Commits `changes` on top of the published commit and runs the step with the stand-in gh, which answers that the
    // newest github-pages deployment is `deployed` and succeeded, unless `env` says otherwise.
    const decide = (changes: Record<string, string>, env: Record<string, string> = {}, deployed = published) => {
      git("checkout", "-q", "--detach", published);
      for (const [f, body] of Object.entries(changes)) writeFileSync(join(repo, f), body);
      git("commit", "-q", "--allow-empty", "-am", "pushed");
      const out = join(tempDir("factory-out-"), "output");
      const log = join(tempDir("factory-log-"), "calls");
      writeFileSync(out, "");
      writeFileSync(log, "");
      const r = runStep(script, repo, {
        PATH: `${bin}:${process.env["PATH"] ?? ""}`, EVENT: "push", REPO: "o/r", GITHUB_SHA: git("rev-parse", "HEAD"), GITHUB_OUTPUT: out,
        GH_TOKEN: "stub", STUB_LOG: log, STUB_DEPLOY: `41 ${deployed}`, STUB_SUCCESS: "41", ...env,
      });
      expect(r.status).toBe(0);
      return { video: readFileSync(out, "utf8").trim(), calls: readFileSync(log, "utf8").trim().split("\n").filter(Boolean) };
    };

    it.each([
      ["the kit changed", { "factory-video/kit.txt": "b\n" }, {}, "video=true"],
      ["the workflow changed", { ".github/workflows/factory-video.yml": "b\n" }, {}, "video=true"],
      ["an approved count changed", { "docs/progress.json": progress(2, 1, 1) }, {}, "video=true"],
      ["a claim count changed", { "docs/progress.json": progress(1, 2, 1) }, {}, "video=true"],
      ["only the backlog count changed", { "docs/progress.json": progress(1, 1, 2) }, {}, "video=false"],
      ["only a note changed", { "docs/notes/n.md": "b\n" }, {}, "video=false"],
      ["nothing changed", {}, {}, "video=false"],
      ["no page was ever published", {}, { STUB_DEPLOY: "" }, "video=true"],
      ["the newest deployment never succeeded", {}, { STUB_SUCCESS: "" }, "video=true"],
      ["the deployments cannot be listed", {}, { STUB_FAIL_LIST: "1" }, "video=true"],
      ["a deployment's statuses cannot be read", {}, { STUB_FAIL_STATUSES: "1" }, "video=true"],
      ["the published commit is not in the checkout", {}, { STUB_DEPLOY: `41 ${"0".repeat(40)}` }, "video=true"],
    ])("SPEC-001-R235 when %s", (_title, changes, env, expected) => {
      expect(decide(changes, env).video).toBe(expected);
    });

    it("SPEC-001-R235 when the published commit is not an ancestor of the pushed one", () => {
      expect(decide({}, {}, side).video).toBe("video=true");
    });

    it("SPEC-001-R235 when started by hand, without asking GitHub", () => {
      const run = decide({}, { EVENT: "workflow_dispatch" });
      expect([run.video, run.calls]).toEqual(["video=true", []]);
    });
  });

  it("SPEC-001-R235 lays out a page that plays the guided video and names the commit, on main only", () => {
    const layout = step("build", "Lay out the page for GitHub Pages");
    expect(layout.if).toBe("github.ref == 'refs/heads/main'");
    const kit = tempDir("factory-kit-"), runnerTemp = tempDir("factory-runner-");
    mkdirSync(join(kit, "out"));
    for (const f of ["factory-guided.mp4", "factory-guided.srt", "poster.png"]) writeFileSync(join(kit, "out", f), f);
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const r = runStep(layout.run ?? "", kit, { RUNNER_TEMP: runnerTemp, GITHUB_SHA: sha, REPO: "o/r", RUN_ID: "42" });
    expect(r.status).toBe(0);
    const site = join(runnerTemp, "site");
    for (const f of ["factory-guided.mp4", "factory-guided.srt", "poster.png"]) expect(readFileSync(join(site, f), "utf8")).toBe(f);
    const html = readFileSync(join(site, "index.html"), "utf8");
    expect(html.startsWith("<!doctype html>\n")).toBe(true);
    expect(html).toContain('<video controls preload="metadata" poster="poster.png" src="factory-guided.mp4"></video>');
    expect(html).toContain(`<a href="https://github.com/o/r/commit/${sha}">0123456</a>`);
    expect(html).toContain('<a href="https://github.com/o/r/actions/runs/42">run 42</a>');
    expect(html).toContain('<a href="factory-guided.srt">Captions (SRT)</a>');
    expect(existsSync(join(site, "factory-guided-clean.mp4"))).toBe(false);
  });

  it("SPEC-001-R235 uploads the page from the build job with actions/upload-pages-artifact pinned by SHA, on main only", () => {
    const upload = step("build", "Upload the page for GitHub Pages");
    expect(upload.uses).toMatch(/^actions\/upload-pages-artifact@[0-9a-f]{40}$/);
    expect(upload.if).toBe("github.ref == 'refs/heads/main'");
    expect(upload.with).toEqual({ path: "${{ runner.temp }}/site" });
  });

  it("SPEC-001-R235 deploys from main only, in github-pages, with pages: write and id-token: write and one pinned step", () => {
    const deploy = job("deploy");
    expect(deploy.needs).toBe("build");
    expect(deploy.if).toBe("needs.build.result == 'success' && github.ref == 'refs/heads/main'");
    expect(deploy.environment?.name).toBe("github-pages");
    expect(deploy.permissions).toEqual({ pages: "write", "id-token": "write" });
    expect(deploy.steps).toHaveLength(1);
    expect(deploy.steps[0]?.uses).toMatch(/^actions\/deploy-pages@[0-9a-f]{40}$/);
    expect(deploy.steps[0]?.run).toBeUndefined();
    for (const [name, j] of Object.entries(workflow.jobs)) {
      if (name === "deploy") continue;
      expect(Object.keys(j.permissions ?? {})).not.toContain("pages");
      expect(Object.keys(j.permissions ?? {})).not.toContain("id-token");
    }
  });

  it("SPEC-001-R235 gives no job contents: write, a secret, a cache or AWS credentials, and pins every action", () => {
    expect(workflow.permissions).toEqual({});
    expect(text).toMatch(/^cache-mode: none$/m);
    for (const j of Object.values(workflow.jobs)) expect(j.permissions?.["contents"] ?? "read").toBe("read");
    expect(text).not.toMatch(/\bsecrets\b|aws-actions|actions\/cache/);
    for (const uses of text.match(/uses: \S+/g) ?? []) expect(uses).toMatch(/@[0-9a-f]{40}$/);
  });

  it("SPEC-001-R235 links the page from the README", () => {
    expect(readFileSync("README.md", "utf8")).toContain("https://paulduvall.github.io/who-gets-the-keys/");
  });
});
