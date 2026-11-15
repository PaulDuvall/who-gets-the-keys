import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { afterAll, describe, expect, it } from "vitest";
import { type Artifact, artifactList, type Run, runsFor, runWithGh } from "./helpers/artifacts-gh.ts";

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
    // `artifacts`, by default one video built on main at the built commit, and whose runs are pushes to main running this
    // workflow unless `runs` says otherwise.
    const decide = (changes: Record<string, string>, artifacts: Artifact[] = [video(built)], env: Record<string, string> = {}, runs: Record<string, Partial<Run>> = {}) => {
      git("checkout", "-q", "--detach", built);
      for (const [f, body] of Object.entries(changes)) writeFileSync(join(repo, f), body);
      git("commit", "-q", "--allow-empty", "-am", "pushed");
      const work = tempDir("factory-decide-");
      const out = join(work, "output"), list = join(work, "artifacts.json"), runList = join(work, "runs.json");
      writeFileSync(out, "");
      writeFileSync(list, artifactList(artifacts));
      writeFileSync(runList, runsFor(artifacts, runs));
      const r = runWithGh(script, repo, { EVENT: "push", GITHUB_SHA: git("rev-parse", "HEAD"), GITHUB_OUTPUT: out, STUB_ARTIFACTS: list, STUB_RUNS: runList, ...env });
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

    it("SPEC-001-R235 judges by the newest video this workflow built on main, by run, whatever newer artifacts claim", () => {
      // Each decoy names a newer run and claims to have built side, which would force a rebuild if it counted.
      const decoys: Artifact[] = [
        video(side, { run: 81, branch: "side", id: 8 }),
        video(side, { run: 82, expired: true, id: 9 }),
        { ...video(side, { run: 83, id: 10 }), name: `factory-claims-${side.slice(0, 7)}-20261115T1500Z` },
        video(side, { run: 84, branch: null, id: 11 }),
        video(side, { run: 85, id: 12 }),
        video(side, { run: 86, id: 13 }),
        { ...video(side, { run: 87, id: 14 }), name: `x-factory-video-${side.slice(0, 7)}-20261115T1500Z` },
        video(side, { run: 88, branch: "main-x", id: 15 }),
        video(side, { run: "abc", id: 16 }),
        { ...video(side, { run: 89, id: 17 }), name: "factory-video-x y z" },
        video("1".repeat(40), { run: 60, created: "2026-11-16T12:00:00Z", id: 6 }),
      ];
      const runs = { "85": { event: "pull_request" }, "86": { path: ".github/workflows/evil.yml" } };
      expect(decide({}, [...decoys, video(built)], {}, runs).video).toBe("video=false");
      expect(decide({}, [...decoys, video(built, { run: 50 })], {}, runs).video).toBe("video=true");
      // When the counts changed, a newer pull request run from a branch named main, or a name with spaces that claims a
      // branch and a commit, must not stand in for the built commit.
      const counts = { "docs/progress.json": progress(2, 1, 1) };
      expect(decide(counts, [video(built), video("0".repeat(40), { run: 90, id: 30 })], {}, { "90": { event: "pull_request" } }).video).toBe("video=true");
      const crafted = { ...video("0".repeat(40), { run: 91, id: 31, branch: "candidate/x" }), name: `factory-video-x main ${"0".repeat(40)}` };
      expect(decide(counts, [video(built), crafted]).video).toBe("video=true");
      // Two pages of artifacts: the only real build is on the second.
      expect(decide({}, [video(side, { run: 81, branch: "side" }), video(side, { run: 82, expired: true }), video(built)], { STUB_PAGE_SIZE: "2" }).video).toBe("video=false");
    });

    it("SPEC-001-R235 counts a build started by hand, and builds when the build's run cannot be read", () => {
      const work = tempDir("factory-runs-");
      writeFileSync(join(work, "none.json"), "{}");
      expect(decide({}, [video(built)], { STUB_RUNS: join(work, "none.json") }).video).toBe("video=true");
      expect(decide({}, [video(built)], {}, { "70": { event: "workflow_dispatch" } }).video).toBe("video=false");
    });

    it("SPEC-001-R235 sets pipefail, so a list that fails part way is no answer", () => {
      expect(script.startsWith("set -o pipefail\n")).toBe(true);
    });

    it("SPEC-001-R235 builds when started by hand, without asking GitHub", () => {
      const run = decide({}, [video(built)], { EVENT: "workflow_dispatch" });
      expect([run.video, run.calls]).toEqual(["video=true", []]);
    });
  });

  it("SPEC-001-R235 publishes with SPEC-001-R236 on every run on main whose build passed or was not needed", () => {
    expect(job("pages").needs).toEqual(["claims", "build"]);
    expect(job("pages").if).toBe("always() && github.ref == 'refs/heads/main' && needs.claims.result == 'success' && (needs.build.result == 'success' || needs.build.result == 'skipped')");
    expect(job("pages").uses).toBe("$/.github/workflows/pages.yml");
    expect(Object.keys(workflow.jobs)).not.toContain("deploy");
  });

  it("SPEC-001-R235 gives no job contents: write, a secret, a cache or AWS credentials, and pins every action", () => {
    expect(workflow.permissions).toEqual({});
    expect(text).toMatch(/^cache-mode: none$/m);
    for (const j of Object.values(workflow.jobs)) expect(j.permissions?.["contents"] ?? "read").toBe("read");
    expect(text).not.toMatch(/\bsecrets\b|aws-actions|actions\/cache/);
    for (const uses of text.match(/uses: \S+/g) ?? []) expect(uses).toMatch(/@[0-9a-f]{40}$|^uses: \$\/\.github\/workflows\/pages\.yml$/);
  });

  it("SPEC-001-R235 links the page from the README", () => {
    expect(readFileSync("README.md", "utf8")).toContain("https://paulduvall.github.io/who-gets-the-keys/");
  });
});
