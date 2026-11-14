import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { afterAll, describe, expect, it } from "vitest";

const WORKFLOW = ".github/workflows/factory-video.yml";
const text = readFileSync(WORKFLOW, "utf8");
interface Step { name?: string; id?: string; if?: string; uses?: string; run?: string; with?: Record<string, unknown> }
interface Job { needs?: string | string[]; if?: string; permissions?: Record<string, string>; environment?: { name?: string; url?: string }; steps: Step[] }
const workflow = parse(text) as { on: { push: { paths: string[] } }; permissions: unknown; jobs: Record<string, Job> };
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

// Runs a step's script as GitHub Actions does, `bash -e` with pipefail, in `cwd` with only the given environment.
function runStep(script: string, cwd: string, env: Record<string, string>): { status: number; stdout: string; stderr: string } {
  const r = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", script], {
    cwd,
    encoding: "utf8",
    env: { PATH: process.env["PATH"] ?? "", HOME: cwd, ...env },
  });
  return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
}

describe("SPEC-001-R235 the factory video follows main and is published to GitHub Pages", () => {
  it("SPEC-001-R235 runs the workflow when docs/progress.json changes", () => {
    expect(workflow.on.push.paths).toEqual(expect.arrayContaining(["factory-video/**", ".github/workflows/factory-video.yml", "docs/progress.json"]));
  });

  it("SPEC-001-R235 rebuilds the video when the kit, the workflow or the progress record changed, and only then", () => {
    const repo = tempDir("factory-rebuild-");
    const git = (...args: string[]): string =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: repo, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    const files = ["factory-video/kit.txt", ".github/workflows/factory-video.yml", "docs/progress.json", "docs/notes/n.md", "specs/s.md"];
    for (const f of files) {
      mkdirSync(join(repo, f, ".."), { recursive: true });
      writeFileSync(join(repo, f), "a\n");
    }
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    const base = git("rev-parse", "HEAD");
    const script = step("claims", "Decide whether the video itself needs a rebuild").run ?? "";
    const decide = (changed: string | undefined, event = "push", before = base): string => {
      git("checkout", "-q", base);
      if (changed) {
        writeFileSync(join(repo, changed), `changed ${Math.random()}\n`);
        git("commit", "-q", "-am", `change ${changed}`);
      }
      const out = join(tempDir("factory-out-"), "output");
      writeFileSync(out, "");
      const r = runStep(script, repo, { EVENT: event, BEFORE: before, GITHUB_SHA: git("rev-parse", "HEAD"), GITHUB_OUTPUT: out });
      expect(r.status).toBe(0);
      return readFileSync(out, "utf8").trim();
    };
    expect(decide("docs/progress.json")).toBe("video=true");
    expect(decide("factory-video/kit.txt")).toBe("video=true");
    expect(decide(".github/workflows/factory-video.yml")).toBe("video=true");
    expect(decide("docs/notes/n.md")).toBe("video=false");
    expect(decide("specs/s.md")).toBe("video=false");
    expect(decide(undefined, "workflow_dispatch")).toBe("video=true");
    expect(decide("docs/notes/n.md", "push", "0".repeat(40))).toBe("video=true");
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
    expect(text).not.toMatch(/secrets\.|aws-actions|actions\/cache/);
    for (const uses of text.match(/uses: \S+/g) ?? []) expect(uses).toMatch(/@[0-9a-f]{40}$/);
  });

  it("SPEC-001-R235 links the page from the README", () => {
    expect(readFileSync("README.md", "utf8")).toContain("https://paulduvall.github.io/who-gets-the-keys/");
  });
});
