import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { muxCommand, run, wavInfo } from "../video/build.ts";
import {
  FPS, HEIGHT, KitError, WIDTH, buildTour, captions, chapters, fillTemplate, importsAwsSdk, missingTools, onsetResults, pinProblem,
  planTimeline, preflight, sceneScores, silenceEnds, slideResults, spoken, stillAt, streamProblems, type Practice, type TourInput,
} from "../video/kit.ts";

const read = (p: string) => readFileSync(p, "utf8");
const build = read("video/build.ts");
const templates = parse(read("video/narration-templates.yaml")) as Record<string, string>;

const practice = (id: string, coverage: Practice["coverage"], enforced: string[]): Practice =>
  ({ id, practice: `practice ${id}`, area: "testing", slides: [5], coverage, enforced_by: enforced, files: ["package.json"], reason: "r" });

const input = (over: Partial<TourInput> = {}): TourInput => ({
  repo: "who-gets-the-keys", commit: "abc1234", commitDate: "2026-10-20", gatesPassed: ["secrets", "lint"],
  practices: [practice("P11", "good+bad", ["gate:lint", "B1"]), practice("P13", "good-only", ["gate:test"]), practice("P09", "not-shown", []), practice("P24", "good+bad", ["B11"])],
  scenarios: [{ id: "B1", title: "Test with no assertion", patch: "p", gate: "lint", expect: "GATE lint FAILED: vitest/expect-expect" },
    { id: "B11", title: "Probe write", patch: "p", gate: "boundary", expect: "BOUNDARY HELD: with an explicit deny", requires: "sandbox-account" }],
  results: [{ id: "B1", status: "pass", line: "GATE lint FAILED: vitest/expect-expect" }],
  patches: { B1: "--- a/x\n+++ b/x\n+  it(\"x\", () => {});\n" }, onDemand: [], existing: () => true, templates, overrides: {}, ...over,
});

const timeline = planTimeline(["one", "two", "three"], [1.0, 3.0, 0.5], [0.05, 0.1, 0]);

describe("SPEC-002 walkthrough video", () => {
  it("SPEC-002-R1 refuses a dirty tree or missing tools before fetching anything", () => {
    expect(preflight(" M src/x.ts\n", [])).toBe("the working tree is dirty");
    expect(preflight("", ["ffmpeg", "uv"])).toBe("not on PATH: ffmpeg, uv");
    expect(preflight("", [])).toBeUndefined();
    expect(missingTools((t) => t !== "Xvfb")).toEqual(["Xvfb"]);
    expect(build.indexOf("preflight(")).toBeLessThan(build.indexOf("fetchVoice(join"));
  });

  it("SPEC-002-R2 stops a step past its limit with its process group and reports status 124", async () => {
    const started = Date.now();
    const r = await run(["sh", "-c", "sleep 30 & sleep 30"], { timeout: 0.3 });
    expect(r.status).toBe(124);
    expect(r.stderr).toContain("stopped");
    expect(Date.now() - started).toBeLessThan(11_000);
    expect((await run(["sh", "-c", "exit 3"])).status).toBe(3);
  });

  it("SPEC-002-R3 runs the gates and the scenario harness before generating the page", () => {
    const gates = build.indexOf('"npm", "run", "gates"');
    expect(gates).toBeGreaterThan(0);
    expect(gates).toBeLessThan(build.indexOf('"node", "scenarios/run.ts"'));
    expect(build.indexOf('"node", "scenarios/run.ts"')).toBeLessThan(build.indexOf("writePage(OUT"));
  });

  it("SPEC-002-R4 records the page SHA-256 and commit before any browser starts", () => {
    expect(build.indexOf("report.page_sha256 = sha256(")).toBeLessThan(build.indexOf('"playwright", "install"'));
    expect(build).toContain('yaml<{ practices: Practice[] }>("practices.yaml")');
  });

  it("SPEC-002-R5 builds opening, practice, scenario-under-practice and closing steps", () => {
    const steps = buildTour(input());
    expect(steps.map((s) => s.id)).toEqual(["opening", "P11", "B1", "P13", "P24", "B11", "closing"]);
    expect(steps.at(-1)?.rows).toEqual([["P09 (not-shown)", "practice P09: r"]]);
    expect(() => buildTour(input({ results: [{ id: "B1", status: "pass", line: "GATE lint FAILED: other" }] }))).toThrow(KitError);
    expect(() => buildTour(input({ existing: () => false }))).toThrow(/does not exist/);
  });

  it("SPEC-002-R6 shows an on-demand scenario only from a real log", () => {
    const without = buildTour(input()).find((s) => s.id === "B11");
    expect(without?.rows[1]?.[1]).toMatch(/^Not recorded: B11 needs the sandbox account/);
    const logged = buildTour(input({ onDemand: ["BOUNDARY HELD: with an explicit deny in a service control policy"] })).find((s) => s.id === "B11");
    expect(logged?.rows[1]?.[1]).toBe("BOUNDARY HELD: with an explicit deny in a service control policy");
  });

  it("SPEC-002-R7 rejects a voice file whose SHA-256 differs from its pin", () => {
    expect(pinProblem("v.onnx", "aa", "aa")).toBeUndefined();
    expect(pinProblem("v.onnx", "aa", "bb")).toContain("does not match its pin");
    const pins = JSON.parse(read("video/narration/voice.json")) as { files: { url: string; sha256: string }[] };
    for (const f of pins.files) {
      expect(f.url).toMatch(/\/resolve\/v1\.0\.0\//);
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("SPEC-002-R8 pins Piper by hash and nothing in the repo imports it", () => {
    const reqs = read("video/narration/requirements.txt");
    expect(reqs).toMatch(/^piper-tts==1\.8\.0 \\$/m);
    for (const block of reqs.split(/\n(?=\S)/).filter((b) => /^[a-z]/.test(b))) expect(block).toContain("--hash=sha256:");
    const files = execFileSync("git", ["ls-files", "*.ts", "*.js", "*.cjs", "*.mjs", "*.py"], { encoding: "utf8" }).split("\n").filter(Boolean);
    for (const f of files) expect(read(f)).not.toMatch(/(?:import|require)\b[^\n]*["']piper/);
  });

  it("SPEC-002-R9 fills templates, lets owner overrides win and speaks identifiers", () => {
    expect(fillTemplate("{id}. {title}.", { id: "B12", title: "x" })).toBe("B12. x.");
    expect(() => fillTemplate("{missing}", {})).toThrow(KitError);
    const steps = buildTour(input({ overrides: { B1: "Owner line.\n" } }));
    expect(steps.find((s) => s.id === "B1")?.say).toBe("Owner line.");
    expect(steps.find((s) => s.id === "P11")?.say).toBe(fillTemplate(templates.practice ?? "", steps.find((s) => s.id === "P11")?.fields ?? {}));
    expect(spoken("B12 and B8a cite SPEC-014-R1 and GHSA-35jh-r3h4-6jhm", { SCP: "S C P" })).toBe("B 12 and B 8 A cite spec 14 requirement 1 and a GitHub security advisory");
    expect(spoken("the SCP denies `it`", { SCP: "S C P" })).toBe("the S C P denies it");
    expect(readdirSync("video/narration").filter((f) => f.endsWith(".md"))).toEqual([]);
  });

  it("SPEC-002-R10 records at 1920x1080 and 30 fps and places frames by wall clock", () => {
    expect([WIDTH, HEIGHT, FPS]).toEqual([1920, 1080, 30]);
    const cmd = muxCommand("raw.mkv", 1.2, 0.05, timeline, "clips", "out.mp4");
    expect(cmd.join(" ")).toContain("setpts=PTS+0.050/TB,fps=30:start_time=0");
    expect(cmd.slice(cmd.indexOf("-ss"), cmd.indexOf("-ss") + 2)).toEqual(["-ss", "1.200"]);
    expect(read("video/record/record.cjs")).toContain("window.walkthrough.setRecording(true)");
  });

  it("SPEC-002-R11 checks voice onsets, slide changes, streams and length against the thresholds", () => {
    expect(silenceEnds("silence_end: 0.452 | x\nsilence_end: 3.1")).toEqual([0.452, 3.1]);
    const onsets = onsetResults(timeline, [0.46, 3.45 + 0.1 + 0.2]);
    expect(onsets.map((o) => o.ok)).toEqual([true, false, false]);
    const scores = sceneScores("pts_time:3.0 x\nlavfi.scene_score=0.5\npts_time:6.9\nlavfi.scene_score=0.02\npts_time:6.4\nlavfi.scene_score=0.2");
    const slides = slideResults(timeline, scores);
    expect(slides.map((s) => s.measured)).toEqual([3, 6.4]);
    expect(slides.map((s) => s.ok)).toEqual([true, false]);
    const good = { streams: [{ codec_type: "video", codec_name: "h264", width: 1920, height: 1080, r_frame_rate: "30/1" }, { codec_type: "audio", codec_name: "aac" }],
      format: { duration: String(timeline.total - 0.2) }, chapters: [{}, {}, {}] };
    expect(streamProblems(good, timeline, 3)).toEqual([]);
    expect(streamProblems({ ...good, format: { duration: String(timeline.total + 1) } }, timeline, 3)[0]).toContain("within 0.5 s");
  });

  it("SPEC-002-R12 writes one chapter per step and one caption per line", () => {
    expect(chapters(timeline, ["a", "b", "c"]).match(/\[CHAPTER\]/g)).toHaveLength(3);
    expect(chapters(timeline, ["a=b", "b", "c"])).toContain("title=a b");
    expect(captions(timeline, ["one", "two", "three"]).split("\n").slice(0, 3)).toEqual(["1", "00:00:00,400 --> 00:00:01,400", "one"]);
    expect(build).toContain('"-map_chapters"');
  });

  it("SPEC-002-R13 page-only writes the page from saved inputs and runs no command", () => {
    const branch = build.slice(build.indexOf('argv.includes("--page-only")'), build.indexOf('argv.includes("--frames")'));
    expect(branch).toContain("writePage(PAGE_OUT");
    expect(branch).not.toMatch(/\b(?:run|must)\(/);
  });

  it("SPEC-002-R14 takes a still 0.5 s after its line's voice starts", () => {
    expect(stillAt(timeline, 1)).toBe(timeline.entries[1]!.voice_at + 0.1 + 0.5);
    expect(() => stillAt(timeline, 9)).toThrow(KitError);
  });

  it("SPEC-002-R15 runs the video workflow read-only, without secrets, caches or AWS, uploading even on failure", () => {
    const wf = read(".github/workflows/video.yml");
    expect(wf).toMatch(/^cache-mode: none$/m);
    expect(wf).toContain("      contents: read\n");
    expect(wf).not.toMatch(/secrets\.|id-token|aws-actions/);
    for (const uses of wf.match(/uses: \S+/g) ?? []) expect(uses).toMatch(/@[0-9a-f]{40}$/);
    expect(wf).toMatch(/if: always\(\)\n\s+uses: actions\/upload-artifact/);
  });

  it("SPEC-002-R16 keeps the kit outside the product", () => {
    for (const f of ["video/build.ts", "video/kit.ts", "video/record/record.cjs", "video/record/smoke.cjs"]) expect(importsAwsSdk(read(f))).toBe(false);
    expect(importsAwsSdk('import { S3 } from "@aws-sdk/client-s3";')).toBe(true);
    expect(read(".github/workflows/pipeline.yml")).toContain("cp dist/src/*.js dist/function/");
  });

  it("SPEC-002-R10 reads a 16-bit mono WAV's length and lead-in silence", () => {
    const dir = mkdtempSync(join(tmpdir(), "wav-"));
    const rate = 1000, samples = new Int16Array(rate);
    samples.fill(2000, 250);
    const data = Buffer.from(samples.buffer);
    const header = Buffer.alloc(44);
    header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVEfmt ", 8); header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28);
    header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(data.length, 40);
    writeFileSync(join(dir, "a.wav"), Buffer.concat([header, data]));
    expect(wavInfo(join(dir, "a.wav"))).toEqual({ seconds: 1, leadIn: 0.25 });
  });
});
