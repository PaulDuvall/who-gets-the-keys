import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { afterAll, describe, expect, it } from "vitest";
import { type Artifact, artifactList, type Run, runsFor, runWithGh } from "./helpers/artifacts-gh.ts";

interface Step { name?: string; id?: string; if?: string; uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, string> }
interface Job {
  name?: string; needs?: string | string[]; if?: string; uses?: string; permissions?: Record<string, string>;
  concurrency?: { group?: string; "cancel-in-progress"?: boolean }; environment?: { name?: string; url?: string }; steps?: Step[];
}
interface Workflow { on: Record<string, { paths?: string[] } | null>; permissions?: unknown; jobs: Record<string, Job> }

const DIR = ".github/workflows";
const read = (file: string): string => readFileSync(join(DIR, file), "utf8");
const load = (file: string): Workflow => parse(read(file)) as Workflow;
const pages = load("pages.yml");
const job = (wf: Workflow, name: string): Job => {
  const found = wf.jobs[name];
  if (!found) throw new Error(`no job ${name}`);
  return found;
};
const step = (wf: Workflow, j: string, name: string): Step => {
  const found = (job(wf, j).steps ?? []).find((s) => s.name === name);
  if (!found) throw new Error(`no step ${name} in ${j}`);
  return found;
};
const PINNED = (action: string) => new RegExp(`^actions/${action}@[0-9a-f]{40}$`);
// GitHub's self-repository form: pages.yml at the caller's commit, resolved against the repository, not the workspace.
const CALL = "$/.github/workflows/pages.yml";
const CALLER_PERMISSIONS = { actions: "read", contents: "read", pages: "write", "id-token": "write" };

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
const tempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

const TIP = "d".repeat(40), VIDEO_SHA = "a".repeat(40), POSTER_SHA = "b".repeat(40), OTHER_SHA = "c".repeat(40);
const OLDER_SHA = "e".repeat(40), AHEAD_SHA = "f".repeat(40), UNKNOWN_SHA = "0".repeat(40);
// Commits main's tip holds, each with how many commits it is behind the tip.
const ON_MAIN = `${VIDEO_SHA}:1 ${POSTER_SHA}:1 ${OLDER_SHA}:5`;
const VIDEO_FILES = ["factory-guided.mp4", "factory-guided.srt", "poster.png", "factory-guided-clean.mp4"];
const POSTER_FILES = ["poster.png", "poster-back.png", "poster.pdf", "who-gets-the-keys-carousel.pdf"];
const video = (over: Partial<Artifact> = {}): Artifact =>
  ({ name: "factory-video-aaaaaaa-20261115T1200Z", created: "2026-11-15T12:00:00Z", id: 1, run: 101, branch: "main", sha: VIDEO_SHA, ...over });
const poster = (over: Partial<Artifact> = {}): Artifact =>
  ({ name: "practices-carousel-bbbbbbb-20261115T1300Z", created: "2026-11-15T13:00:00Z", id: 2, run: 202, branch: "main", sha: POSTER_SHA, ...over });
// Artifacts of newer runs that must not be published, each commented with the reason.
const DECOYS: Artifact[] = [
  video({ name: "factory-video-ccccccc-20261115T1400Z", id: 3, run: 901, branch: "feature", sha: OTHER_SHA }), // another branch
  poster({ name: "practices-carousel-ccccccc-20261115T1400Z", id: 4, run: 902, expired: true, sha: OTHER_SHA }), // expired
  video({ name: "factory-claims-ccccccc-20261115T1500Z", id: 5, run: 903, sha: OTHER_SHA }), // a claims report
  poster({ name: "practices-carousel-ccccccc-20261115T1600Z", id: 6, run: 904, branch: null, sha: OTHER_SHA }), // no run
  video({ name: "factory-video-ccccccc-20261115T1700Z", id: 7, run: 905, sha: OTHER_SHA }), // a pull request from a branch named main
  poster({ name: "practices-carousel-ccccccc-20261115T1700Z", id: 8, run: 906, sha: OTHER_SHA }), // another workflow's run
  video({ name: "factory-video-ccccccc-20261115T1800Z", id: 9, run: 907, sha: OTHER_SHA }), // a tag named main, at a commit not on main
  poster({ name: `practices-carousel-x main ${OTHER_SHA}`, id: 10, run: 908, sha: OTHER_SHA }), // a name with spaces
  video({ name: "x-factory-video-ccccccc-20261115T1900Z", id: 11, run: 909, sha: OTHER_SHA }), // the prefix not at the start
  poster({ name: "practices-carousel-ccccccc-20261115T1900Z", id: 12, run: 910, branch: "main-x", sha: OTHER_SHA }), // branch main-x
  video({ name: "factory-video-ccccccc-20261115T2000Z", id: 13, run: "abc", sha: OTHER_SHA }), // a run ID that is no number
  poster({ name: "practices-carousel-ccccccc-20261115T2000Z", id: 14, run: 911, created: "<b>", sha: OTHER_SHA }), // a time of another form
  video({ name: "factory-video-eeeeeee-20261116T0900Z", id: 15, run: 100, created: "2026-11-16T09:00:00Z", sha: OLDER_SHA }), // an older run at an older commit, uploaded later by a re-run
  video({ name: "factory-video-eeeeeee-20261116T1000Z", id: 16, run: 950, sha: OLDER_SHA }), // a newer dispatch on a tag named main, at an older commit
  poster({ name: "practices-carousel-fffffff-20261116T1000Z", id: 17, run: 951, sha: AHEAD_SHA }), // a commit ahead of main's tip, which main does not hold
  video({ name: "factory-video-ccccccc-20261116T1100Z", id: 18, run: 952, sha: OTHER_SHA }), // a fork's run
  poster({ name: "practices-carousel-ccccccc-20261116T1100Z", id: 19, run: 953, sha: OTHER_SHA }), // a pull_request_target run
  video({ name: "factory-video-0000000-20261116T1200Z", id: 20, run: 954, sha: UNKNOWN_SHA }), // a commit GitHub does not know
  poster({ name: "practices-carousel-ccccccc-20261116T1200Z", id: 21, run: 955, sha: OTHER_SHA }), // a run GitHub no longer knows
];
const DECOY_RUNS: Record<string, Partial<Run>> = {
  "905": { event: "pull_request" },
  "906": { path: ".github/workflows/evil.yml" },
  "950": { event: "workflow_dispatch" },
  "952": { head_repository: { full_name: "fork/r" } },
  "953": { event: "pull_request_target" },
};
const GONE = ["955"];

// Builds stand-in artifacts named as `artifacts` says, each holding `files` whose content is the file's own name, and
// runs the assemble job's two scripts. Returns the run and the laid-out site's directory.
function assemble(artifacts: Artifact[], files: Record<string, string[]> = {}, env: Record<string, string> = {}, runs: Record<string, Partial<Run>> = DECOY_RUNS) {
  const known = JSON.parse(runsFor(artifacts, runs)) as Record<string, Run>;
  for (const id of GONE) delete known[id];
  const work = tempDir("pages-assemble-");
  const builds = join(work, "artifacts"), runnerTemp = join(work, "runner");
  mkdirSync(runnerTemp);
  for (const a of artifacts) {
    mkdirSync(join(builds, a.name), { recursive: true });
    const names = files[a.name] ?? (a.name.includes("factory-video-") ? VIDEO_FILES : POSTER_FILES);
    for (const f of names) writeFileSync(join(builds, a.name, f), `${a.name}/${f}`);
  }
  writeFileSync(join(work, "artifacts.json"), artifactList(artifacts));
  writeFileSync(join(work, "runs.json"), JSON.stringify(known));
  const script = [
    step(pages, "assemble", "Download the newest factory video and practices carousel built on main").run ?? "",
    step(pages, "assemble", "Lay out the page for GitHub Pages").run ?? "",
  ].join("\n");
  const r = runWithGh(script, work, {
    RUNNER_TEMP: runnerTemp, STUB_ARTIFACTS: join(work, "artifacts.json"), STUB_RUNS: join(work, "runs.json"), STUB_BUILDS: builds,
    STUB_TIP: TIP, STUB_ON_MAIN: ON_MAIN, STUB_BEHIND: AHEAD_SHA, STUB_UNKNOWN: UNKNOWN_SHA, ...env,
  });
  return { ...r, site: join(runnerTemp, "site") };
}
const content = (site: string, f: string) => readFileSync(join(site, f), "utf8");

describe("SPEC-001-R236 one workflow publishes the factory video and the practices poster to GitHub Pages", () => {
  it("SPEC-001-R236 pages.yml runs only when another workflow calls it, with no token permission of its own", () => {
    expect(Object.keys(pages.on)).toEqual(["workflow_call"]);
    expect(pages.permissions).toEqual({});
    expect(read("pages.yml")).toMatch(/^cache-mode: none$/m);
    expect(Object.keys(pages.jobs)).toEqual(["assemble", "deploy"]);
  });

  it("SPEC-001-R236 assembles on main only, with actions: read and contents: read, checking out nothing and using only upload-pages-artifact", () => {
    const a = job(pages, "assemble");
    expect([a.if, a.permissions]).toEqual(["github.ref == 'refs/heads/main'", { actions: "read", contents: "read" }]);
    const uses = (a.steps ?? []).flatMap((s) => (s.uses === undefined ? [] : [s.uses]));
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatch(PINNED("upload-pages-artifact"));
    expect(step(pages, "assemble", "Upload the page for GitHub Pages").with).toEqual({ path: "${{ runner.temp }}/site" });
    const scripts = (a.steps ?? []).flatMap((s) => (s.run === undefined ? [] : [s.run.split("\n")[0]]));
    expect(scripts).toEqual(["set -o pipefail", "set -o pipefail"]);
  });

  it("SPEC-001-R236 deploys on main only, after assemble, in github-pages, with pages: write and id-token: write and one pinned step", () => {
    const d = job(pages, "deploy");
    expect([d.needs, d.if, d.environment?.name, d.permissions]).toEqual(["assemble", "github.ref == 'refs/heads/main'", "github-pages", { pages: "write", "id-token": "write" }]);
    expect(d.steps).toHaveLength(1);
    expect(d.steps?.[0]?.uses).toMatch(PINNED("deploy-pages"));
    expect(d.steps?.[0]?.run).toBeUndefined();
  });

  it("SPEC-001-R236 gives no job of pages.yml contents: write, a secret, a cache or AWS credentials", () => {
    expect(read("pages.yml")).not.toMatch(/\bsecrets\b|aws-actions|actions\/cache/);
    expect(Object.values(pages.jobs).map((j) => j.permissions?.["contents"] ?? "none")).toEqual(["read", "none"]);
  });

  it("SPEC-001-R236 is the only workflow that deploys to Pages, and other workflows hold pages: write only to call it", () => {
    const others = readdirSync(DIR).filter((f) => f.endsWith(".yml") && f !== "pages.yml");
    expect(others.filter((file) => /upload-pages-artifact|deploy-pages/.test(read(file)))).toEqual([]);
    const holders = others.flatMap((file) => Object.entries(load(file).jobs).filter(([, j]) => j.permissions?.["pages"] !== undefined).map(([name, j]) => [file, name, j.uses]));
    expect(holders).toEqual([["factory-video.yml", "pages", CALL], ["practices-carousel.yml", "pages", CALL]]);
  });

  it.each([
    ["factory-video.yml", ["claims", "build"], "always() && github.ref == 'refs/heads/main' && needs.claims.result == 'success' && (needs.build.result == 'success' || needs.build.result == 'skipped')"],
    ["practices-carousel.yml", "build", "github.ref == 'refs/heads/main'"],
  ])("SPEC-001-R236 %s calls it on main after its build, newest call wins, and runs when pages.yml changes", (file, needs, condition) => {
    const wf = load(file);
    const p = job(wf, "pages");
    expect([p.uses, p.needs, p.if, p.concurrency, p.permissions]).toEqual([
      CALL, needs, condition, { group: "github-pages-site", "cancel-in-progress": true }, CALLER_PERMISSIONS,
    ]);
    expect(wf.on["push"]?.paths).toContain(".github/workflows/pages.yml");
  });

  it("SPEC-001-R236 lays out the newest video and poster that each kit's own workflow built on main, and a page that plays one and shows both sides of the other", () => {
    const r = assemble([...DECOYS, video(), poster()]);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.calls.filter((c) => c.startsWith("run download"))).toEqual([
      `run download 101 --repo o/r --name ${video().name} --dir ${join(r.site, "..", "builds", "factory-video")}`,
      `run download 202 --repo o/r --name ${poster().name} --dir ${join(r.site, "..", "builds", "practices-carousel")}`,
    ]);
    expect(r.calls.filter((c) => c.includes("actions/artifacts?per_page=100")).every((c) => c.startsWith("api --paginate "))).toBe(true);
    // The artifact filter alone excludes the other decoys: only these candidates' runs are looked up, newest run first,
    // and only those whose run passed are compared with main's tip, which is read once.
    const id = (c: string) => c.split(" ")[1]?.split("/").pop()?.split("...")[0];
    expect(r.calls.filter((c) => c.startsWith("api repos/o/r/actions/runs/")).map(id)).toEqual(["954", "952", "950", "907", "905", "101", "100", "955", "953", "951", "906", "202"]);
    expect(r.calls.filter((c) => c.startsWith("api repos/o/r/compare/")).map(id)).toEqual([UNKNOWN_SHA, OLDER_SHA, OTHER_SHA, VIDEO_SHA, OLDER_SHA, AHEAD_SHA, POSTER_SHA]);
    expect(r.calls.filter((c) => c.startsWith("api repos/o/r/compare/")).every((c) => c.includes(`...${TIP}?per_page=1 `))).toBe(true);
    expect(r.calls.filter((c) => c.startsWith("api repos/o/r/branches/main"))).toHaveLength(1);
    expect(r.stdout).toContain("Skipped factory-video-ccccccc-20261115T1700Z: run 905 is pull_request .github/workflows/factory-video.yml main o/r");
    expect(r.stdout).toContain("Skipped practices-carousel-ccccccc-20261115T1700Z: run 906 is push .github/workflows/evil.yml main o/r");
    expect(r.stdout).toContain(`Skipped factory-video-ccccccc-20261115T1800Z: main's tip does not hold commit ${OTHER_SHA} (diverged)`);
    expect(r.stdout).toContain(`Skipped practices-carousel-fffffff-20261116T1000Z: main's tip does not hold commit ${AHEAD_SHA} (behind)`);
    expect(r.stdout).toContain("Skipped factory-video-ccccccc-20261116T1100Z: run 952 is push .github/workflows/factory-video.yml main fork/r");
    expect(r.stdout).toContain("Skipped practices-carousel-ccccccc-20261116T1100Z: run 953 is pull_request_target .github/workflows/practices-carousel.yml main o/r");
    expect(r.stdout).toContain(`Skipped factory-video-0000000-20261116T1200Z: main's tip does not hold commit ${UNKNOWN_SHA} (not found)`);
    expect(r.stdout).toContain("Skipped practices-carousel-ccccccc-20261116T1200Z: run 955 is gone");
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)).map((f) => `${e.name}/${f}`) : [e.name])).sort();
    expect(files(r.site)).toEqual(["factory-guided.mp4", "factory-guided.srt", "index.html", "poster.png", "practices/poster-back.png", "practices/poster-front.png", "practices/poster.pdf"]);
    expect(content(r.site, "factory-guided.mp4")).toBe(`${video().name}/factory-guided.mp4`);
    expect(content(r.site, "poster.png")).toBe(`${video().name}/poster.png`);
    expect(content(r.site, "practices/poster-front.png")).toBe(`${poster().name}/poster.png`);
    expect(content(r.site, "practices/poster-back.png")).toBe(`${poster().name}/poster-back.png`);
    expect(content(r.site, "practices/poster.pdf")).toBe(`${poster().name}/poster.pdf`);
    const html = content(r.site, "index.html");
    expect(html.startsWith("<!doctype html>\n")).toBe(true);
    expect(html).toContain('<video controls preload="metadata" poster="poster.png" src="factory-guided.mp4"></video>');
    expect(html).toContain(`<a href="https://github.com/o/r/commit/${VIDEO_SHA}">aaaaaaa</a>`);
    expect(html).toContain('built 2026-11-15T12:00:00Z in <a href="https://github.com/o/r/actions/runs/101">run 101</a>');
    expect(html).toContain(`<a href="https://github.com/o/r/commit/${POSTER_SHA}">bbbbbbb</a>`);
    expect(html).toContain('<a href="https://github.com/o/r/actions/runs/202">run 202</a>');
    expect(html).toContain('<img src="practices/poster-front.png"');
    expect(html).toContain('<img src="practices/poster-back.png"');
    expect(html).toContain('<a href="practices/poster.pdf">');
    expect(html).not.toContain(OTHER_SHA);
  });

  it("SPEC-001-R236 takes a build started by hand on main, and the build closest to main's tip over a newer run at an older commit", () => {
    const newerRun = video({ name: "factory-video-eeeeeee-20261116T0900Z", id: 20, run: 400, created: "2026-11-16T09:00:00Z", sha: OLDER_SHA });
    const r = assemble([video({ run: 300 }), newerRun, poster()], {}, {}, { "300": { event: "workflow_dispatch" } });
    expect(r.status).toBe(0);
    expect(content(r.site, "factory-guided.mp4")).toBe(`${video().name}/factory-guided.mp4`);
    const atTip = video({ name: "factory-video-ddddddd-20261116T0800Z", id: 21, run: 250, sha: TIP });
    const tipped = assemble([video({ run: 300 }), atTip, poster()]);
    expect(content(tipped.site, "factory-guided.mp4")).toBe(`${atTip.name}/factory-guided.mp4`);
    const tie = video({ name: "factory-video-aaaaaaa-20261116T0700Z", id: 22, run: 350, sha: VIDEO_SHA });
    const tied = assemble([video({ run: 300 }), tie, poster()]);
    expect(content(tied.site, "factory-guided.mp4")).toBe(`${tie.name}/factory-guided.mp4`);
  });

  it("SPEC-001-R236 finds the files whether gh extracts an artifact into the directory or into a folder named for it", () => {
    const r = assemble([video(), poster()], {}, { STUB_SUBDIR: "1" });
    expect(r.status).toBe(0);
    expect(content(r.site, "practices/poster-front.png")).toBe(`${poster().name}/poster.png`);
  });

  it.each([
    ["no poster was built on main", [video()], {}, "No practices-carousel- artifact that a run of practices-carousel.yml on main uploaded. Run the practices-carousel workflow on main"],
    ["only decoys hold a video", [...DECOYS.filter((a) => a.run !== 100 && a.run !== 950), poster()], {}, "No factory-video- artifact that a run of factory-video.yml on main uploaded. Run the factory-video workflow on main"],
    ["the poster build lacks its back", [video(), poster()], { [poster().name]: ["poster.png", "poster.pdf"] }, `${poster().name} holds no poster-back.png. Run the practices-carousel workflow on main`],
    ["the video build lacks its captions", [video(), poster()], { [video().name]: ["factory-guided.mp4", "poster.png"] }, `${video().name} holds no factory-guided.srt. Run the factory-video workflow on main`],
  ])("SPEC-001-R236 fails and lays out nothing when %s", (_title, artifacts, files, message) => {
    const r = assemble(artifacts, files);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/^::error::/m);
    expect(r.stdout).toContain(message);
    expect(r.calls.filter((c) => c.includes("actions/runs/abc"))).toEqual([]);
    expect(() => readdirSync(join(r.site))).toThrow();
  });

  it.each([
    ["the artifacts cannot be listed", { STUB_FAIL_LIST: "1" }, "(HTTP 500)"],
    ["main's tip cannot be read", { STUB_TIP: "" }, "::error::Could not read main's tip commit"],
    ["a candidate's run cannot be read", { STUB_RUN_ERROR: "1" }, "(HTTP 500)"],
    ["a candidate's commit cannot be compared", { STUB_COMPARE_ERROR: "1" }, "(HTTP 500)"],
  ])("SPEC-001-R236 fails and lays out nothing when %s", (_title, env, error) => {
    const r = assemble([video(), poster()], {}, env);
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).toContain(error);
    expect(r.calls.filter((c) => c.startsWith("run download"))).toEqual([]);
    expect(() => readdirSync(join(r.site))).toThrow();
  });

  it.each([
    ["factory-video.yml", "Upload the videos, GIF, captions and poster"],
    ["practices-carousel.yml", "Upload the PDFs, page images, contact sheet, poster and report"],
  ])("SPEC-001-R236 %s keeps the artifact pages.yml reads for 90 days", (file, name) => {
    expect(step(load(file), "build", name).with?.["retention-days"]).toBe(90);
  });

  describe("SPEC-001-R236 each prune job deletes only what earlier runs on its own branch uploaded", () => {
    // This run is 2000. Its own builds, and a newer run's, must stay whatever they claim.
    const list: Artifact[] = [
      video({ id: 11, run: 1100 }), video({ id: 12, run: 1200 }), video({ id: 19, run: 2000 }),
      video({ id: 31, run: 2500 }), // a newer pull request run whose head branch is named main
      video({ id: 17, run: 1700, expired: true }),
      video({ id: 13, run: 1300, branch: "feature" }), video({ id: 14, run: 1000, branch: "feature" }),
      video({ id: 15, run: 1500, name: "factory-claims-x" }), video({ id: 16, run: 1400, name: "factory-claims-y" }), video({ id: 32, run: 2000, name: "factory-claims-z" }),
      video({ id: 18, run: 1800, name: `factory-video-x main ${OTHER_SHA}`, branch: "candidate/x" }),
      poster({ id: 21, run: 1100 }), poster({ id: 22, run: 1200 }), poster({ id: 29, run: 2000 }),
      poster({ id: 27, run: 2600 }), poster({ id: 25, run: 1500, expired: true }),
      poster({ id: 23, run: 1300, branch: "feature" }), poster({ id: 24, run: 1000, branch: "feature" }),
      poster({ id: 26, run: 1800, name: `practices-carousel-x main ${OTHER_SHA}`, branch: "candidate/x" }),
    ];
    const prune = (file: string, ref: string, env: Record<string, string> = {}) => {
      const work = tempDir("pages-prune-");
      writeFileSync(join(work, "artifacts.json"), artifactList(list));
      const s = (job(load(file), "prune").steps ?? [])[0];
      const r = runWithGh(s?.run ?? "", work, { STUB_ARTIFACTS: join(work, "artifacts.json"), REF: ref, RUN_ID: "2000", ...env });
      expect(r.status).toBe(0);
      expect(r.calls.filter((c) => c.includes("actions/artifacts?per_page=100")).every((c) => c.startsWith("api --paginate "))).toBe(true);
      return r.calls.filter((c) => c.startsWith("api -X DELETE")).map((c) => Number(c.split("/").pop())).sort((x, y) => x - y);
    };

    it.each([
      ["factory-video.yml", "refs/heads/main", { BUILT: "success" }, [11, 12, 15, 16]],
      ["factory-video.yml", "refs/heads/main", { BUILT: "skipped" }, [15, 16]],
      ["factory-video.yml", "refs/heads/feature", { BUILT: "success" }, [13, 14]],
      ["factory-video.yml", "refs/heads/candidate/x", { BUILT: "success" }, [18]],
      ["factory-video.yml", "refs/tags/main", { BUILT: "success" }, []],
      ["factory-video.yml", "refs/pull/5/merge", { BUILT: "success" }, []],
      ["factory-video.yml", 'refs/heads/main" or true or "', { BUILT: "success" }, []],
      ["factory-video.yml", "refs/heads/main", { BUILT: "success", RUN_ID: "2000 or true" }, []],
      ["practices-carousel.yml", "refs/heads/main", {}, [21, 22]],
      ["practices-carousel.yml", "refs/heads/feature", {}, [23, 24]],
      ["practices-carousel.yml", "refs/tags/main", {}, []],
      ["practices-carousel.yml", 'refs/heads/main" or true or "', {}, []],
    ])("SPEC-001-R236 %s for %s", (file, ref, env, deleted) => {
      expect(prune(file, ref, env)).toEqual(deleted);
    });

    it.each(["factory-video.yml", "practices-carousel.yml"])("SPEC-001-R236 %s takes the ref and this run's ID from the run, and sets pipefail", (file) => {
      const s = (job(load(file), "prune").steps ?? [])[0];
      expect([s?.env?.["REF"], s?.env?.["RUN_ID"]]).toEqual(["${{ github.ref }}", "${{ github.run_id }}"]);
      expect(s?.run?.startsWith("set -o pipefail\n")).toBe(true);
    });
  });

  it("SPEC-001-R236 shows both sides of the poster in the README, from the site", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("https://paulduvall.github.io/who-gets-the-keys/practices/poster-front.png");
    expect(readme).toContain("https://paulduvall.github.io/who-gets-the-keys/practices/poster-back.png");
  });
});
