// Pure parts of the walkthrough kit (SPEC-002): tour, narration, timeline, captions, chapters and checks.
// Ported from tools/explainer.py in an earlier private repository at 469f0fd; thresholds unchanged.
import { createHash } from "node:crypto";

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const FPS = 30;
export const ONSET_TOLERANCE = 0.05;
export const LENGTH_TOLERANCE = 0.5;
export const SLIDE_TOLERANCE = 0.25;
export const SLIDE_WINDOW = 1.0;
export const SLIDE_MIN_SCORE = 0.03;
export const SILENCE_DB = -40;
export const SILENCE_MIN = 0.3;
export const LEAD = 0.4;
export const TAIL = 0.55;
export const MIN_HOLD = 3.0;
export const STILL_OFFSET = 0.5;
export const PREREQUISITES = ["node", "npm", "ffmpeg", "ffprobe", "Xvfb", "uv"] as const;

export interface Practice {
  id: string;
  practice: string;
  area: string;
  slides: (number | string)[];
  coverage: "good+bad" | "good-only" | "partial" | "not-shown";
  enforced_by: string[];
  files: string[];
  reason?: string;
}

export interface ScenarioDef { id: string; title: string; patch?: string; gate: string; expect: string; requires?: string }
export interface ScenarioResult { id: string; status: string; line?: string }

export interface StepData {
  id: string;
  kind: "opening" | "practice" | "scenario" | "closing";
  title: string;
  fields: Record<string, string>;
  rows: [string, string][];
  code?: string;
  say: string;
}

export interface TourInput {
  repo: string;
  commit: string;
  commitDate: string;
  gatesPassed: string[];
  practices: Practice[];
  scenarios: ScenarioDef[];
  results: ScenarioResult[];
  patches: Record<string, string>;
  onDemand: string[];
  existing: (path: string) => boolean;
  templates: Record<string, string>;
  overrides: Record<string, string>;
}

export class KitError extends Error {}

export function fillTemplate(template: string, fields: Readonly<Record<string, string>>): string {
  return template.replace(/\{([a-z_]+)\}/g, (whole, key: string) => {
    const value = fields[key];
    if (value === undefined) throw new KitError(`template field {${key}} has no value`);
    return value;
  });
}

const DIGITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const spellDigits = (digits: string): string => [...digits].map((d) => DIGITS[Number(d)] ?? d).join(" ");
const spellLetters = (letters: string): string => [...letters.toUpperCase()].join(" ");

// Spoken forms: identifier shapes are rewritten here; plain words come from video/spoken-forms.yaml.
export function spoken(text: string, words: Readonly<Record<string, string>> = {}): string {
  let out = text
    .replace(/\bGHSA(?:-[a-z0-9]{4}){3}\b/g, "a GitHub security advisory")
    .replace(/\bSPEC-(\d{3})-R(\d+)\b/g, (_m, s: string, r: string) => `spec ${Number(s)} requirement ${r}`)
    .replace(/\b([BP])(\d{1,2})([ab]?)\b/g, (_m, p: string, n: string, x: string) => `${p} ${Number(n)}${x ? ` ${x.toUpperCase()}` : ""}`)
    .replace(/\b[0-9a-f]{7,40}\b/g, (sha) => spellLetters(sha.slice(0, 7)).replace(/\d/g, (d) => spellDigits(d)))
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const [word, say] of Object.entries(words)) out = out.split(word).join(say);
  return out;
}

const excerpt = (patch: string, max = 12): string =>
  patch.split("\n").filter((l) => /^[+-](?![+-]{2} )/.test(l)).slice(0, max).join("\n");

export function buildTour(input: TourInput): StepData[] {
  const results = new Map(input.results.map((r) => [r.id, r]));
  const say = (id: string, kind: string, fields: Record<string, string>): string => {
    const override = input.overrides[id];
    if (override !== undefined) return override.trim();
    const template = input.templates[kind];
    if (template === undefined) throw new KitError(`no narration template for ${kind}`);
    return fillTemplate(template, fields);
  };
  const steps: StepData[] = [];
  const opening = { repo: input.repo, commit: input.commit, date: input.commitDate, gate_count: String(input.gatesPassed.length) };
  steps.push({ id: "opening", kind: "opening", title: input.repo, fields: opening,
    rows: [["Commit", input.commit], ["Date", input.commitDate], ["Gates passed", input.gatesPassed.join(" → ")]], say: say("opening", "opening", opening) });
  for (const p of input.practices.filter((x) => x.coverage === "good+bad" || x.coverage === "good-only")) {
    const missing = p.files.find((f) => !input.existing(f));
    if (missing !== undefined) throw new KitError(`${p.id} lists ${missing}, which does not exist at this commit`);
    const fields = { id: p.id, practice: p.practice, slides: p.slides.join(", "), coverage: p.coverage, enforced: p.enforced_by.join(", ") || "none" };
    steps.push({ id: p.id, kind: "practice", title: p.practice, fields,
      rows: [["Slides", fields.slides], ["Coverage", p.coverage], ["Enforced by", fields.enforced], ["Files", p.files.join(", ")]], say: say(p.id, "practice", fields) });
    for (const s of input.scenarios.filter((x) => p.enforced_by.includes(x.id))) {
      const result = results.get(s.id);
      const logged = input.onDemand.find((l) => l.startsWith(s.expect));
      let line: string;
      if (s.requires) {
        line = logged ?? `Not recorded: ${s.id} needs ${s.requires === "github-actions" ? "the GitHub Actions B9 replay job" : "the sandbox account"}.`;
      } else {
        if (result?.status !== "pass" || result.line === undefined || !result.line.startsWith(s.expect)) {
          throw new KitError(`${s.id} captured "${result?.line ?? "nothing"}", expected "${s.expect}"`);
        }
        line = result.line;
      }
      const sf = { id: s.id, title: s.title, gate: s.gate, expect: s.expect, line };
      steps.push({ id: s.id, kind: "scenario", title: `${s.id}: ${s.title}`, fields: sf,
        rows: [["Gate", s.gate], ["Captured", line]], code: excerpt(input.patches[s.id] ?? ""), say: say(s.id, "scenario", sf) });
    }
  }
  const gaps = input.practices.filter((p) => p.coverage === "partial" || p.coverage === "not-shown");
  const closing = { count: String(gaps.length) };
  steps.push({ id: "closing", kind: "closing", title: "Partial and not shown", fields: closing,
    rows: gaps.map((p): [string, string] => [`${p.id} (${p.coverage})`, `${p.practice}: ${p.reason ?? ""}`]), say: say("closing", "closing", closing) });
  return steps;
}

export interface Entry { index: number; start: number; hold: number; voice_at: number; clip: string; clip_len: number; lead_in: number; spoken: string }
export interface Timeline { entries: Entry[]; total: number }

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

export function planTimeline(spokenLines: readonly string[], lengths: readonly number[], leadIns: readonly number[]): Timeline {
  if (spokenLines.length === 0) throw new KitError("the tour has no lines");
  if (lengths.length !== spokenLines.length || leadIns.length !== spokenLines.length) throw new KitError("one clip per line");
  let t = 0;
  const entries = spokenLines.map((line, index): Entry => {
    const length = lengths[index] ?? 0;
    const hold = Math.max(MIN_HOLD, LEAD + length + TAIL);
    const entry = { index, start: r3(t), hold: r3(hold), voice_at: r3(t + LEAD), clip: `clip_${String(index).padStart(3, "0")}.wav`, clip_len: r3(length), lead_in: r3(leadIns[index] ?? 0), spoken: line };
    t += hold;
    return entry;
  });
  return { entries, total: r3(t + 1.0) };
}

export function srtTime(seconds: number): string {
  let ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000); ms -= h * 3_600_000;
  const m = Math.floor(ms / 60_000); ms -= m * 60_000;
  const s = Math.floor(ms / 1000); ms -= s * 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function captions(timeline: Timeline, written: readonly string[]): string {
  const base = timeline.entries[0]?.start ?? 0;
  return timeline.entries.map((e) => {
    const begin = e.voice_at - base;
    return `${e.index + 1}\n${srtTime(begin)} --> ${srtTime(begin + e.clip_len)}\n${written[e.index] ?? ""}\n`;
  }).join("\n");
}

export function chapters(timeline: Timeline, titles: readonly string[]): string {
  const base = timeline.entries[0]?.start ?? 0;
  const end = (i: number) => Math.round(((timeline.entries[i + 1]?.start ?? timeline.total) - base) * 1000);
  const blocks = timeline.entries.map((e, i) =>
    `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round((e.start - base) * 1000)}\nEND=${end(i)}\ntitle=${(titles[i] ?? "").replace(/[=;#\\\n]/g, " ")}`);
  return `;FFMETADATA1\n${blocks.join("\n")}\n`;
}

export function stillAt(timeline: Timeline, index: number): number {
  const e = timeline.entries[index];
  if (!e) throw new KitError(`no timeline entry ${index}`);
  return r3(e.voice_at - (timeline.entries[0]?.start ?? 0) + e.lead_in + STILL_OFFSET);
}

export const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

export function pinProblem(name: string, expected: string, actual: string): string | undefined {
  return expected === actual ? undefined : `${name}: SHA-256 ${actual} does not match its pin ${expected}`;
}

export function silenceEnds(stderr: string): number[] {
  return [...stderr.matchAll(/silence_end: ([0-9.]+)/g)].map((m) => Number(m[1]));
}

export function onsetResults(timeline: Timeline, ends: readonly number[]) {
  const base = timeline.entries[0]?.start ?? 0;
  return timeline.entries.map((e) => {
    const expected = r3(e.voice_at - base + e.lead_in);
    const measured = ends.length ? ends.reduce((a, b) => (Math.abs(b - expected) < Math.abs(a - expected) ? b : a)) : null;
    return { line: e.index + 1, expected, measured, ok: measured !== null && Math.abs(measured - expected) <= ONSET_TOLERANCE };
  });
}

export function sceneScores(stderr: string): [number, number][] {
  const out: [number, number][] = [];
  let at: number | null = null;
  for (const m of stderr.matchAll(/pts_time:(-?[0-9.]+)|lavfi\.scene_score=([0-9.]+)/g)) {
    if (m[1] !== undefined) at = Number(m[1]);
    else if (at !== null) { out.push([at, Number(m[2])]); at = null; }
  }
  return out;
}

export function slideResults(timeline: Timeline, scores: readonly [number, number][]) {
  const base = timeline.entries[0]?.start ?? 0;
  return timeline.entries.slice(1).map((e) => {
    const expected = r3(e.start - base);
    const window = scores.filter(([at, score]) => Math.abs(at - expected) <= SLIDE_WINDOW && score >= SLIDE_MIN_SCORE);
    const best = window.reduce<[number, number] | null>((b, s) => (b === null || s[1] > b[1] ? s : b), null);
    const measured = best ? best[0] : null;
    return { line: e.index + 1, expected, measured, ok: measured !== null && Math.abs(measured - expected) <= SLIDE_TOLERANCE };
  });
}

interface Probe { streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string }[]; format?: { duration?: string }; chapters?: unknown[] }

export function streamProblems(probe: Probe, timeline: Timeline, chapterCount: number): string[] {
  const streams = probe.streams ?? [];
  const video = streams.filter((s) => s.codec_type === "video");
  const audio = streams.filter((s) => s.codec_type === "audio");
  const problems: string[] = [];
  const v = video[0];
  if (video.length !== 1 || !v) problems.push(`expected one video stream, found ${video.length}`);
  else {
    if (v.width !== WIDTH || v.height !== HEIGHT) problems.push(`video is ${v.width}x${v.height}, expected ${WIDTH}x${HEIGHT}`);
    if (v.r_frame_rate !== `${FPS}/1`) problems.push(`video runs at ${v.r_frame_rate}, expected ${FPS}/1`);
    if (v.codec_name !== "h264") problems.push(`video codec is ${v.codec_name}, expected h264`);
  }
  if (audio.length !== 1) problems.push(`expected one audio stream, found ${audio.length}`);
  else if (audio[0]?.codec_name !== "aac") problems.push(`audio codec is ${audio[0]?.codec_name}, expected aac`);
  const expected = timeline.total - (timeline.entries[0]?.start ?? 0);
  const length = Number(probe.format?.duration ?? Number.NaN);
  if (!(Math.abs(length - expected) <= LENGTH_TOLERANCE)) problems.push(`video is ${length} s long, expected ${expected.toFixed(3)} s within ${LENGTH_TOLERANCE} s`);
  if ((probe.chapters ?? []).length !== chapterCount) problems.push(`video has ${(probe.chapters ?? []).length} chapters, expected ${chapterCount}`);
  return problems;
}

export function blackEnd(stderr: string): number {
  const m = /black_end:([0-9.]+)/.exec(stderr);
  if (!m) throw new KitError("the capture has no black cover at its start");
  return Number(m[1]);
}

export function preflight(porcelain: string, missing: readonly string[]): string | undefined {
  if (porcelain.trim() !== "") return "the working tree is dirty";
  return missing.length ? `not on PATH: ${missing.join(", ")}` : undefined;
}

export function missingTools(which: (tool: string) => boolean): string[] {
  return PREREQUISITES.filter((t) => !which(t));
}

export function importsAwsSdk(source: string): boolean {
  return /from\s+["'](?:@aws-sdk\/|aws-sdk)|require\(\s*["'](?:@aws-sdk\/|aws-sdk)/.test(source);
}
