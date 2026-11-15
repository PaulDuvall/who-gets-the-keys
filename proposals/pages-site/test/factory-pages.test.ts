import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { afterAll, describe, expect, it } from "vitest";
import { type Artifact, artifactList, runWithGh } from "./helpers/artifacts-gh.ts";

const WORKFLOW = ".github/workflows/factory-video.yml";
const text = readFileSync(WORKFLOW, "utf8");
interface Step { name?: string; id?: string; if?: string; uses?: string; run?: string; with?: Record<string, unknown> }
interface Job { needs?: string | string[]; if?: string; uses?: string; permissions?: Record<string, string>; steps?: Step[] }
const workflow = parse(text) as { on: { push: { branches: string[]; paths: string[] }; workflow_dispatch?: unknown }; permissions: unknown; jobs: Record<string, Job> };
const job = (name: string): Job => {
  const found = workflow.jobs[name];
  if (!found) throw new Error(`no job ${name}`);
  return found;
};
const step = (j: string, name: string): Step => {
  const found = (job(j).steps ?? []).find((s) => s.name === name);
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

describe("SPEC-001-R235 the factory video follows main", () => {
  it("SPEC-001-R235 runs on a push to main that changes docs/progress.json, and when started by hand", () => {
    expect(workflow.on.push.branches).toEqual(["main"]);
    expect(workflow.on.push.paths).toEqual(expect.arrayContaining(["factory-video/**", ".github/workflows/factory-video.yml", "docs/progress.json"]));
    expect(Object.keys(workflow.on)).toContain("workflow_dispatch");
    expect(job("claims").permissions).toEqual({ contents: "read", actions: "read" });
  });

  describe("SPEC-001-R235 the claims job builds the video unless nothing it shows changed since the newest video built on main", () => {
    const repo = tempDir("factory-rebuild-");
    const git = (...args: string[]): string =>
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args],
        { cwd: repo, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }).trim();
    const progress = (approved: number, built: number, open: number) =>
      `${JSON.stringify({ requirements: { approved, drafted: 2 }, claims: { built, open: 1 }, backlog: { open, closed: 0 } }, null, 2)}\n`;
    git("init", "-q", "-b", "main");
    for (const [f, body] of [["factory-video/kit.txt", "a\n"], [".github/workflows/factory-video.yml", "a\n"], ["docs/notes/n.md", "a\n"], ["docs/progress.json", progress(1, 1, 1)]] as const) {
      mkdirSync(join(repo, f, ".."), { recursive: true });
      writeFileSync(join(repo, f), body);
    }
    git("add", "-A");
    git("commit", "-q", "-m", "built");
    const built = git("rev-parse", "HEAD");
    git("checkout", "-q", "-b", "side");
    writeFileSync(join(repo, "docs/notes/n.md"), "side\n");
    git("commit", "-q", "-am", "side");
    const side = git("rev-parse", "HEAD");
    const script = step("claims", "Decide whether the video needs a rebuild, against the newest video built on main").run ?? "";
    const video = (sha: string, over: Partial<Artifact> = {}): Artifact =>
      ({ name: `factory-video-${sha.slice(0, 7)}-20261115T1200Z`, created: "2026-11-15T12:00:00Z", id: 7, run: 70, branch: "main", sha, ...over });

    // Commits `changes` on top of the built commit and runs the step with the stand-in gh, whose artifact list is
    // `artifacts`: by default one video built on main at the built commit.
    const decide = (changes: Record<string, string>, artifacts: Artifact[] = [video(built)], env: Record<string, string> = {}) => {
      git("checkout", "-q", "--detach", built);
      for (const [f, body] of Object.entries(changes)) writeFileSync(join(repo, f), body);
      git("commit", "-q", "--allow-empty", "-am", "pushed");
      const work = tempDir("factory-decide-");
      const out = join(work, "output"), list = join(work, "artifacts.json");
      writeFileSync(out, "");
      writeFileSync(list, artifactList(artifacts));
      const r = runWithGh(script, repo, { EVENT: "push", GITHUB_SHA: git("rev-parse", "HEAD"), GITHUB_OUTPUT: out, STUB_ARTIFACTS: list, ...env });
      expect(r.status).toBe(0);
      return { video: readFileSync(out, "utf8").trim(), calls: r.calls };
    };

    it.each([
      ["the kit changed", { "factory-video/kit.txt": "b\n" }, "video=true"],
      ["the workflow changed", { ".github/workflows/factory-video.yml": "b\n" }, "video=true"],
      ["an approved count changed", { "docs/progress.json": progress(2, 1, 1) }, "video=true"],
      ["a claim count changed", { "docs/progress.json": progress(1, 2, 1) }, "video=true"],
      ["only the backlog count changed", { "docs/progress.json": progress(1, 1, 2) }, "video=false"],
      ["only a note changed", { "docs/notes/n.md": "b\n" }, "video=false"],
      ["nothing changed", {}, "video=false"],
    ])("SPEC-001-R235 when %s", (_title, changes, expected) => {
      expect(decide(changes).video).toBe(expected);
    });

    it.each([
      ["no video was ever built on main", [], {}],
      ["the only video built on main has expired", [video(built, { expired: true })], {}],
      ["the artifacts cannot be listed", [video(built)], { STUB_FAIL_LIST: "1" }],
      ["the built commit is not in the checkout", [video("f".repeat(40))], {}],
      ["the built commit is not an ancestor of the pushed one", [video(side)], {}],
    ])("SPEC-001-R235 builds when %s", (_title, artifacts, env) => {
      expect(decide({}, artifacts, env).video).toBe("video=true");
    });

    it("SPEC-001-R235 judges by the newest unexpired video built on main, not a claims report, another branch's video or an expired one", () => {
      const decoys: Artifact[] = [
        video(side, { created: "2026-11-15T13:00:00Z", branch: "side", id: 8 }),
        video(side, { created: "2026-11-15T14:00:00Z", expired: true, id: 9 }),
        { ...video(side, { created: "2026-11-15T15:00:00Z", id: 10 }), name: `factory-claims-${side.slice(0, 7)}-20261115T1500Z` },
        video(side, { created: "2026-11-15T16:00:00Z", branch: null, id: 11 }),
        video("1".repeat(40), { created: "2026-11-14T12:00:00Z", id: 6 }),
      ];
      expect(decide({}, [...decoys, video(built)]).video).toBe("video=false");
      expect(decide({}, [...decoys, video(built, { created: "2026-11-13T12:00:00Z" })]).video).toBe("video=true");
    });

    it("SPEC-001-R235 builds when started by hand, without asking GitHub", () => {
      const run = decide({}, [video(built)], { EVENT: "workflow_dispatch" });
      expect([run.video, run.calls]).toEqual(["video=true", []]);
    });
  });

  it("SPEC-001-R235 publishes with SPEC-001-R236 on every run on main whose build passed or was not needed", () => {
    expect(job("pages").needs).toEqual(["claims", "build"]);
    expect(job("pages").if).toBe("always() && github.ref == 'refs/heads/main' && needs.claims.result == 'success' && (needs.build.result == 'success' || needs.build.result == 'skipped')");
    expect(job("pages").uses).toBe("./.github/workflows/pages.yml");
    expect(Object.keys(workflow.jobs)).not.toContain("deploy");
  });

  it("SPEC-001-R235 gives no job contents: write, a secret, a cache or AWS credentials, and pins every action", () => {
    expect(workflow.permissions).toEqual({});
    expect(text).toMatch(/^cache-mode: none$/m);
    for (const j of Object.values(workflow.jobs)) expect(j.permissions?.["contents"] ?? "read").toBe("read");
    expect(text).not.toMatch(/\bsecrets\b|aws-actions|actions\/cache/);
    for (const uses of text.match(/uses: \S+/g) ?? []) expect(uses).toMatch(/@[0-9a-f]{40}$|^uses: \.\/\.github\/workflows\/pages\.yml$/);
  });

  it("SPEC-001-R235 links the page from the README", () => {
    expect(readFileSync("README.md", "utf8")).toContain("https://paulduvall.github.io/who-gets-the-keys/");
  });
});
