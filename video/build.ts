// Walkthrough build (SPEC-002). Usage: node video/build.ts [--page-only | --still <step ID> | --frames] [--on-demand-log <path>]
// Full build writes build/video/: walkthrough.html, walkthrough.mp4, captions.srt, report.json.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parse } from "yaml";
import { commitMessage, type Scenario } from "../scenarios/run.ts";
import {
  FPS, HEIGHT, KitError, preflight, SILENCE_DB, WIDTH, blackEnd, buildTour, captions, chapters, missingTools,
  onsetProblems, onsetResults, pinProblem, planTimeline, sceneScores, sha256, slideResults, spoken, stillAt, streamProblems,
  type Practice, type ScenarioResult, type StepData, type Timeline, type Voice,
} from "./kit.ts";

const ROOT = resolve(import.meta.dirname, "..");
const KIT = join(ROOT, "video");
const OUT = join(ROOT, "build", "video");
const PAGE_OUT = join(ROOT, "build", "video-page");
const STEP_TIMEOUT = 600;
const STOP_GRACE = 5;
const RECORD_MARGIN = 300;
const AUDIO_RATE = 48000;
const ORDER = ["secrets", "allowlist", "workflows", "install", "lint", "typecheck", "iac", "sast", "sca", "trace", "ratchet", "signatures", "slides", "test", "mutation"];

interface Done { status: number; stdout: string; stderr: string }
let running: ReturnType<typeof spawn> | undefined;

const report: Record<string, unknown> = { passed: false, problems: ["the build did not finish"] };
const writeReport = () => { mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, "report.json"), `${JSON.stringify(report, null, 1)}\n`); };

function stopGroup(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((done) => {
    const kill = (sig: NodeJS.Signals) => { try { if (child.pid) process.kill(-child.pid, sig); } catch { /* group already gone */ } };
    kill("SIGTERM");
    const hard = setTimeout(() => kill("SIGKILL"), STOP_GRACE * 1000);
    const give = setTimeout(done, 2 * STOP_GRACE * 1000);
    child.once("close", () => { clearTimeout(hard); clearTimeout(give); done(); });
  });
}

// One step in its own process group, stopped with SIGTERM then SIGKILL at its limit (SPEC-002-R2).
export function run(argv: readonly string[], opts: { timeout?: number; input?: string; env?: NodeJS.ProcessEnv; cwd?: string } = {}): Promise<Done> {
  const [file, ...args] = argv;
  return new Promise((done) => {
    const child = spawn(file ?? "", args, { cwd: opts.cwd ?? ROOT, env: opts.env ?? process.env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
    running = child;
    let stdout = "", stderr = "", timedOut = false;
    child.stdout.on("data", (d: Buffer) => { stdout += d; });
    child.stderr.on("data", (d: Buffer) => { stderr += d; });
    child.on("error", (e) => { stderr += String(e); });
    child.stdin.on("error", () => { /* a command that exits before reading its input closes the pipe; its status reports the failure */ });
    child.stdin.end(opts.input ?? "");
    const timer = setTimeout(() => { timedOut = true; void stopGroup(child); }, (opts.timeout ?? STEP_TIMEOUT) * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      running = undefined;
      try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch { /* nothing left in the group */ }
      done({ status: timedOut ? 124 : (code ?? 1), stdout, stderr: timedOut ? `${stderr}\nstill running after its limit, so it was stopped` : stderr });
    });
  });
}

async function must(what: string, argv: readonly string[], opts: Parameters<typeof run>[1] = {}): Promise<Done> {
  const r = await run(argv, opts);
  const failure = /^CHECK \S+ FAILED.*$/m.exec(r.stdout)?.[0];
  if (r.status !== 0) throw new KitError(`${what} failed with exit status ${r.status}: ${failure ?? (r.stderr || r.stdout).trim().split("\n").slice(-5).join(" | ")}`);
  return r;
}

function stopOnSignals(): void {
  for (const [sig, n] of [["SIGINT", 2], ["SIGTERM", 15], ["SIGHUP", 1]] as const) {
    process.once(sig, () => {
    void (async () => {
      if (running) await stopGroup(running);
      report.problems = ["the build did not finish"];
      writeReport();
      process.exit(128 + n);
    })();
    });
  }
}

const git = (...args: string[]) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" }).stdout.trim();
const yaml = <T>(path: string): T => parse(readFileSync(join(ROOT, path), "utf8")) as T;
const which = (tool: string) => spawnSync("sh", ["-c", `command -v "$0"`, tool]).status === 0;

interface Captured { commit: string; checks: string[]; mainRun: string[]; results: ScenarioResult[]; logs: Record<string, string[]>; onDemand: string[] }

// Keep only the lines the tour replays: check passes, check failures and boundary results.
const replayable = (text: string): string[] => text.split("\n").map((l) => l.trim()).filter((l) => /^(check \S+ passed|CHECK \S+ FAILED|BOUNDARY HELD)/.test(l));

function tourInputs(c: Captured) {
  const scenarios = yaml<{ scenarios: Scenario[] }>("scenarios/scenarios.yaml").scenarios;
  const overridesDir = join(KIT, "narration");
  const overrides = Object.fromEntries(readdirSync(overridesDir).filter((f) => f.endsWith(".md")).map((f) => [basename(f, ".md"), readFileSync(join(overridesDir, f), "utf8")]));
  const read = (path: string | undefined) => (path ? readFileSync(join(ROOT, path), "utf8") : "");
  return buildTour({
    repo: "who-gets-the-keys", commit: git("rev-parse", "--short", "HEAD"), commitDate: git("log", "-1", "--format=%cs"),
    checks: c.checks, mainRun: c.mainRun, results: c.results, logs: c.logs, onDemand: c.onDemand, overrides,
    practices: yaml<{ practices: Practice[] }>("practices.yaml").practices, scenarios,
    commits: Object.fromEntries(scenarios.map((s) => [s.id, commitMessage(s)])),
    patches: Object.fromEntries(scenarios.map((s) => [s.id, read(s.patch)])),
    fixtures: Object.fromEntries(scenarios.map((s) => [s.id, read(s.fixture)])),
    existing: (p) => existsSync(join(ROOT, p)), templates: yaml<Record<string, string>>("video/narration-templates.yaml"),
  });
}

function writePage(dir: string, steps: StepData[]): string {
  mkdirSync(dir, { recursive: true });
  const data = JSON.stringify({ repo: "who-gets-the-keys", commit: git("rev-parse", "--short", "HEAD"), steps }).replace(/</g, "\\u003c");
  const page = readFileSync(join(KIT, "page", "template.html"), "utf8").replace("/*TOUR*/", () => data);
  const path = join(dir, "walkthrough.html");
  writeFileSync(path, page);
  return path;
}

export function readWav(path: string): Voice {
  const b = readFileSync(path);
  let at = 12, rate = 22050, data = Buffer.alloc(0);
  while (at + 8 <= b.length) {
    const id = b.toString("ascii", at, at + 4), size = b.readUInt32LE(at + 4);
    if (id === "fmt ") { if (b.readUInt16LE(at + 10) !== 1 || b.readUInt16LE(at + 22) !== 16) throw new KitError(`${path}: expected 16-bit mono`); rate = b.readUInt32LE(at + 12); }
    if (id === "data") data = b.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  return { samples: pcm(data), rate };
}

function pcm(data: Buffer): Int16Array {
  const out = new Int16Array(Math.floor(data.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = data.readInt16LE(i * 2);
  return out;
}

export function wavInfo(path: string): { seconds: number; leadIn: number } {
  const { samples, rate } = readWav(path);
  const threshold = 32768 * 10 ** (SILENCE_DB / 20);
  const first = samples.findIndex((v) => Math.abs(v) > threshold);
  return { seconds: samples.length / rate, leadIn: (first < 0 ? samples.length : first) / rate };
}

async function fetchVoice(dir: string): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const pins = JSON.parse(readFileSync(join(KIT, "narration", "voice.json"), "utf8")) as { files: { name: string; url: string; sha256: string }[] };
  for (const f of pins.files) {
    const path = join(dir, f.name);
    if (!existsSync(path)) await must(`downloading ${f.name}`, ["curl", "-sSfL", "--retry", "3", "--max-time", String(STEP_TIMEOUT), "-o", path, f.url]);
    const problem = pinProblem(f.name, f.sha256, sha256(readFileSync(path)));
    if (problem) { rmSync(path, { force: true }); throw new KitError(problem); }
  }
  return join(dir, pins.files[0]?.name ?? "");
}

async function full(onDemand: string[]): Promise<void> {
  const refused = preflight(git("status", "--porcelain"), missingTools(which));
  if (refused) throw new KitError(refused);
  for (const stale of ["walkthrough.html", "walkthrough.mp4", "captions.srt", "smoke", "narration", "record", "capture.mkv"]) rmSync(join(OUT, stale), { recursive: true, force: true });
  report.problems = ["the build did not finish"];
  writeReport();
  const checks = await must("running the checks", ["npm", "run", "checks"], { timeout: 3600 });
  const scen = await run(["node", "scenarios/run.ts"], { timeout: 7200 });
  const results = JSON.parse(readFileSync(join(ROOT, "build", "scenarios", "results.json"), "utf8")) as ScenarioResult[];
  if (scen.status !== 0) throw new KitError(`the scenario harness failed: ${scen.stdout.trim().split("\n").slice(-20).join(" | ")}`);
  const commit = git("rev-parse", "HEAD");
  const logs = Object.fromEntries(results.map((r) => {
    const path = join(ROOT, "build", "scenarios", `${r.id}.log`);
    return [r.id, existsSync(path) ? replayable(readFileSync(path, "utf8")) : []];
  }));
  const captured: Captured = { commit, checks: [...ORDER], mainRun: replayable(`${checks.stdout}\n${checks.stderr}`), results, logs, onDemand };
  writeFileSync(join(OUT, "inputs.json"), `${JSON.stringify(captured, null, 1)}\n`);
  const steps = tourInputs(captured);
  const page = writePage(OUT, steps);
  report.commit = commit;
  report.page_sha256 = sha256(readFileSync(page));
  report.tour_steps = steps.length;
  writeReport();
  const model = await fetchVoice(join(OUT, "voice"));
  const venv = join(ROOT, "build", "tts");
  if (!existsSync(join(venv, "bin", "piper"))) {
    await must("creating the narration environment", ["uv", "venv", "--quiet", "--python", "3.13", venv]);
    await must("installing the narration engine", ["uv", "pip", "install", "--quiet", "--require-hashes", "--python", join(venv, "bin", "python"), "-r", join(KIT, "narration", "requirements.txt")]);
  }
  const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(ROOT, "build", "browsers") };
  await must("installing the recorder", ["npm", "ci", "--prefix", join(KIT, "record"), "--ignore-scripts", "--no-audit", "--no-fund"], { env });
  await must("installing the recorder's browser", ["npx", "--no-install", "playwright", "install", "chromium"], { env, cwd: join(KIT, "record") });
  const smokeDir = join(OUT, "smoke");
  const smoke = JSON.parse((await must("checking the page", ["node", join(KIT, "record", "smoke.cjs"), page, smokeDir], { env })).stdout.trim().split("\n").pop() ?? "{}") as { overflow?: string[]; browser?: string };
  const tour = JSON.parse(readFileSync(join(smokeDir, "tour.json"), "utf8")) as { id: string; say: string }[];
  const words = yaml<Record<string, string>>("video/spoken-forms.yaml");
  const narration = join(OUT, "narration");
  mkdirSync(narration, { recursive: true });
  const lengths: number[] = [], leadIns: number[] = [], lines = tour.map((t) => spoken(t.say, words));
  for (const [i, line] of lines.entries()) {
    const clip = join(narration, `clip_${String(i).padStart(3, "0")}.wav`);
    await must(`narrating line ${i + 1}`, [join(venv, "bin", "piper"), "--model", model, "--output_file", clip, "--length-scale", "1.0", "--sentence-silence", "0.25"], { input: line });
    const info = wavInfo(clip);
    lengths.push(info.seconds);
    leadIns.push(info.leadIn);
  }
  const timeline = planTimeline(lines, lengths, leadIns);
  writeFileSync(join(narration, "timeline.json"), JSON.stringify(timeline, null, 1));
  writeFileSync(join(OUT, "captions.srt"), captions(timeline, tour.map((t) => t.say)));
  writeFileSync(join(narration, "chapters.txt"), chapters(timeline, steps.map((s) => s.title)));
  const raw = join(OUT, "capture.mkv");
  const display = `:${[...Array(100).keys()].map((n) => n + 97).find((n) => !existsSync(`/tmp/.X11-unix/X${n}`) && !existsSync(`/tmp/.X${n}-lock`)) ?? 97}`;
  const rec = await must("recording the tour", ["node", join(KIT, "record", "record.cjs"), "--page", page, "--timeline", join(narration, "timeline.json"), "--out", raw,
    "--workdir", join(OUT, "record"), "--width", String(WIDTH), "--height", String(HEIGHT), "--fps", String(FPS), "--display", display], { env, timeout: timeline.total + RECORD_MARGIN });
  const fit = JSON.parse(rec.stdout.trim().split("\n").pop() ?? "{}") as { zoom?: number; max_height?: number; time_zero?: number };
  if (typeof fit.time_zero !== "number") throw new KitError("the recorder reported no time zero");
  const start = Number((JSON.parse((await must("reading the capture's start", ["ffprobe", "-v", "error", "-show_entries", "format=start_time", "-of", "json", raw])).stdout) as { format: { start_time: string } }).format.start_time);
  const cover = blackEnd((await must("finding the cover's end", ["ffmpeg", "-hide_banner", "-i", raw, "-vf", "blackdetect=d=0.2:pix_th=0.05", "-an", "-f", "null", "-"])).stderr);
  const shift = start + cover - fit.time_zero;
  report.layout = { overflow: smoke.overflow ?? [], zoom: fit.zoom, tallest_step_px: fit.max_height, cover_end_after_time_zero: Math.round(shift * 1000) / 1000 };
  const video = join(OUT, "walkthrough.mp4");
  await must("adding the narration and chapters", muxCommand(raw, cover, shift, timeline, narration, video));
  await check(video, timeline, steps.length, smoke.browser ?? "unknown");
}

export function muxCommand(raw: string, cover: number, shift: number, t: Timeline, clips: string, out: string): string[] {
  const base = t.entries[0]?.start ?? 0;
  const inputs = t.entries.flatMap((e) => ["-i", join(clips, e.clip)]);
  const delays = t.entries.map((e, k) => `[${k + 1}:a]adelay=${Math.round((e.voice_at - base) * 1000)}:all=1[a${k}]`);
  const mix = `[0:v]setpts=PTS${shift >= 0 ? "+" : ""}${shift.toFixed(3)}/TB,fps=${FPS}:start_time=0[vout];${delays.join(";")};` +
    `${t.entries.map((_, k) => `[a${k}]`).join("")}amix=inputs=${t.entries.length}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`;
  return ["ffmpeg", "-y", "-loglevel", "error", "-ss", cover.toFixed(3), "-i", raw, ...inputs, "-i", join(clips, "chapters.txt"),
    "-filter_complex", mix, "-map", "[vout]", "-map", "[aout]", "-map_chapters", String(t.entries.length + 1), "-t", (t.total - base).toFixed(3),
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac", "-b:a", "160k", "-ar", String(AUDIO_RATE), "-movflags", "+faststart", out];
}

async function check(video: string, timeline: Timeline, chapterCount: number, browser: string): Promise<void> {
  const probe = JSON.parse((await must("reading the video's streams", ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-show_chapters", "-of", "json", video])).stdout) as Parameters<typeof streamProblems>[0];
  const narration = join(OUT, "narration"), soundtrack = join(narration, "soundtrack.s16");
  await must("decoding the soundtrack", ["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-vn", "-ac", "1", "-ar", String(AUDIO_RATE), "-f", "s16le", "-c:a", "pcm_s16le", soundtrack]);
  const decoded: Voice = { samples: pcm(readFileSync(soundtrack)), rate: AUDIO_RATE };
  rmSync(soundtrack, { force: true });
  const audioStart = Number(probe.streams?.find((s) => s.codec_type === "audio")?.start_time ?? 0);
  const scenes = await must("measuring the slide changes", ["ffmpeg", "-hide_banner", "-i", video, "-vf", "select='gte(scene,0)',metadata=print:key=lavfi.scene_score", "-an", "-f", "null", "-"]);
  const onsets = onsetResults(timeline, timeline.entries.map((e) => readWav(join(narration, e.clip))), decoded, Number.isFinite(audioStart) ? audioStart : 0);
  const slides = slideResults(timeline, sceneScores(scenes.stderr));
  const first = (s: string) => s.split("\n").find((l) => l.trim()) ?? "unknown";
  report.tools = { ffmpeg: first((await must("reading ffmpeg's version", ["ffmpeg", "-version"])).stdout), node: process.version, browser };
  report.onsets = onsets;
  report.slides = slides;
  report.video = { bytes: statSync(video).size, sha256: sha256(readFileSync(video)), seconds: Number(probe.format?.duration) };
  report.problems = [
    ...streamProblems(probe, timeline, chapterCount),
    ...onsetProblems(onsets),
    ...slides.filter((s) => !s.ok).map((s) => `line ${s.line}: slide change at ${s.measured} s, expected ${s.expected} s within 0.25 s`),
  ];
  report.passed = (report.problems as string[]).length === 0;
}

async function frames(only: string | undefined): Promise<void> {
  const timeline = JSON.parse(readFileSync(join(OUT, "narration", "timeline.json"), "utf8")) as Timeline;
  const tour = JSON.parse(readFileSync(join(OUT, "smoke", "tour.json"), "utf8")) as { id: string }[];
  for (const f of readdirSync(OUT).filter((n) => /^frame-.*\.png$/.test(n))) rmSync(join(OUT, f));
  const indexes = only === undefined ? tour.map((_, i) => i) : [tour.findIndex((t) => t.id === only)];
  if (indexes[0] === -1) throw new KitError(`no tour step ${only ?? ""}`);
  for (const i of indexes) {
    const name = only === undefined ? `frame-${String(i + 1).padStart(2, "0")}.png` : `still-${only}.png`;
    await must(`extracting ${name}`, ["ffmpeg", "-loglevel", "error", "-y", "-ss", stillAt(timeline, i).toFixed(2), "-i", join(OUT, "walkthrough.mp4"), "-frames:v", "1", join(OUT, name)]);
  }
}

async function main(argv: string[]): Promise<number> {
  const flag = (name: string) => { const i = argv.indexOf(name); return i < 0 ? undefined : (argv[i + 1] ?? ""); };
  const full_ = !argv.some((a) => ["--page-only", "--frames", "--still"].includes(a));
  const log = flag("--on-demand-log");
  const onDemand = log ? readFileSync(log, "utf8").split("\n").map((l) => l.trim()).filter((l) => /^(BOUNDARY HELD|CHECK \S+ FAILED)/.test(l)) : [];
  if (log) report.on_demand_log_sha256 = sha256(readFileSync(log));
  try {
    if (argv.includes("--page-only")) {
      const inputs = JSON.parse(readFileSync(join(OUT, "inputs.json"), "utf8")) as Captured;
      if (inputs.commit !== git("rev-parse", "HEAD")) throw new KitError("build/video/inputs.json is from another commit; run a full build first");
      const page = writePage(PAGE_OUT, tourInputs(inputs));
      console.log(`page written: ${page} sha256 ${sha256(readFileSync(page))}`);
      return 0;
    }
    if (argv.includes("--frames")) { await frames(undefined); return 0; }
    const still = flag("--still");
    if (still !== undefined) { await frames(still); return 0; }
    await full(onDemand);
  } catch (err) {
    if (!full_) { console.error(err instanceof Error ? err.message : String(err)); return 1; }
    report.passed = false;
    report.problems = [`the build stopped: ${err instanceof Error ? err.message : String(err)}`];
  }
  writeReport();
  for (const p of report.problems as string[]) console.error(p);
  console.log(`video build ${report.passed ? "passed" : "FAILED"}: ${OUT}`);
  return report.passed ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  stopOnSignals();
  process.exitCode = await main(process.argv.slice(2));
}
