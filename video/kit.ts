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
export const ONSET_REACH = 0.3;
export const MATCH_MIN = 0.8;
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

export interface ScenarioDef { id: string; title: string; patch?: string; fixture?: string; check: string; expect: string; requires?: string }
export interface ScenarioResult { id: string; status: string; line?: string }

// One line of a replayed run: a check that passed, the failure that stopped the change, a boundary that held, or a note.
export interface RunLine { text: string; kind: "pass" | "fail" | "held" | "note" }

export interface StepData {
  id: string;
  kind: "opening" | "practice" | "scenario" | "closing";
  head?: string;
  title: string;
  fields: Record<string, string>;
  rows: [string, string][];
  change?: string;
  changeLabel?: string;
  command?: string;
  run?: RunLine[];
  verdict?: string;
  say: string;
}

export interface TourInput {
  repo: string;
  commit: string;
  commitDate: string;
  checks: string[];
  mainRun: string[];
  practices: Practice[];
  scenarios: ScenarioDef[];
  results: ScenarioResult[];
  logs: Record<string, string[]>;
  commits: Record<string, string[]>;
  patches: Record<string, string>;
  fixtures: Record<string, string>;
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

const MAX_CHANGE = 14;

// The patch's changed lines under the name of the file they change.
export function changeExcerpt(patch: string, max = MAX_CHANGE): string {
  const out: string[] = [];
  for (const line of patch.split("\n")) {
    const file = /^diff --git a\/\S+ b\/(\S+)$/.exec(line);
    if (file) out.push(`▸ ${file[1]}`);
    else if (/^[+-](?![+-]{2} )/.test(line) && line.slice(1).trim() !== "") out.push(line);
  }
  return out.slice(0, max).join("\n");
}

const PASS = /^check (\S+) passed$/;

export function buildTour(input: TourInput): StepData[] {
  const results = new Map(input.results.map((r) => [r.id, r]));
  const say = (id: string, kind: string, fields: Record<string, string>): string => {
    const override = input.overrides[id];
    if (override !== undefined) return override.trim();
    const template = input.templates[kind];
    if (template === undefined) throw new KitError(`no narration template for ${kind}`);
    return fillTemplate(template, fields);
  };
  const passes = (lines: readonly string[]): RunLine[] => lines.filter((l) => PASS.test(l)).map((text) => ({ text, kind: "pass" }));
  const steps: StepData[] = [];
  const opening = { repo: input.repo, commit: input.commit, date: input.commitDate, check_count: String(input.checks.length) };
  const mainRun = passes(input.mainRun);
  if (mainRun.length !== input.checks.length) throw new KitError(`the check run on ${input.commit} shows ${mainRun.length} of ${input.checks.length} checks passing`);
  steps.push({ id: "opening", kind: "opening", title: input.repo, fields: opening, rows: [["Commit", input.commit], ["Date", input.commitDate]],
    command: "npm run checks", run: mainRun, verdict: `All ${input.checks.length} checks passed`, say: say("opening", "opening", opening) });

  const shown = input.practices.filter((p) => p.coverage === "good+bad" || p.coverage === "good-only");
  for (const p of shown) {
    const missing = p.files.find((f) => !input.existing(f));
    if (missing !== undefined) throw new KitError(`${p.id} lists ${missing}, which does not exist at this commit`);
  }
  const done = new Set<string>();
  for (const p of shown) {
    const fields = { id: p.id, practice: p.practice, slides: p.slides.join(", "), coverage: p.coverage, enforced: p.enforced_by.join(", ") || "none" };
    if (p.coverage === "good-only") {
      const checks = p.enforced_by.filter((e) => e.startsWith("check:")).map((e) => e.slice("check:".length));
      steps.push({ id: p.id, kind: "practice", head: `${p.id} · slides ${fields.slides}`, title: p.practice, fields, rows: [],
        command: "npm run checks", run: mainRun.filter((l) => checks.includes(PASS.exec(l.text)?.[1] ?? "")), verdict: `Holds on ${input.commit}`, say: say(p.id, "practice", fields) });
      continue;
    }
    const mine = input.scenarios.filter((x) => p.enforced_by.includes(x.id));
    if (mine.length === 0) throw new KitError(`${p.id} is good+bad but maps to no scenario`);
    for (const s of mine.filter((x) => !done.has(x.id))) {
      done.add(s.id);
      steps.push(scenarioStep(input, s, p, results.get(s.id), say));
    }
  }
  const gaps = input.practices.filter((p) => p.coverage === "partial" || p.coverage === "not-shown");
  const closing = { count: String(gaps.length) };
  steps.push({ id: "closing", kind: "closing", title: "Partial and not shown", fields: closing,
    rows: gaps.map((p): [string, string] => [`${p.id} (${p.coverage})`, `${p.practice}: ${p.reason ?? ""}`]), say: say("closing", "closing", closing) });
  return steps;
}

type Say = (id: string, kind: string, fields: Record<string, string>) => string;

function scenarioStep(input: TourInput, s: ScenarioDef, p: Practice, result: ScenarioResult | undefined, say: Say): StepData {
  const position = input.checks.indexOf(s.check);
  let command: string, run: RunLine[], verdict: string | undefined, line: string, outcome = `Stopped by the ${s.check} check`;
  if (s.requires) {
    const held = input.onDemand.filter((l) => l.startsWith(s.expect));
    command = s.requires === "github-actions" ? "scenarios/b9-replay.sh   (GitHub Actions, triage token and egress)" : "scenarios/on-demand.sh   (sandbox account)";
    if (held.length) {
      run = held.map((text) => ({ text, kind: "held" }));
      verdict = held.length > 1 ? `All ${held.length} injected actions denied` : "Denied";
      line = held.join("; ");
    } else {
      line = `Not recorded: ${s.id} needs ${s.requires === "github-actions" ? "the GitHub Actions B9 replay job" : "the sandbox account"}.`;
      run = [{ text: line, kind: "note" }];
      verdict = undefined;
      outcome = line.replace(/\.$/, "");
    }
  } else {
    if (result?.status !== "pass" || result.line === undefined || !result.line.startsWith(s.expect)) {
      throw new KitError(`${s.id} captured "${result?.line ?? "nothing"}", expected "${s.expect}"`);
    }
    line = result.line;
    const before = position < 0 ? [] : (input.logs[s.id] ?? []).filter((l) => input.checks.indexOf(PASS.exec(l)?.[1] ?? "") >= 0);
    run = [...before.map((text): RunLine => ({ text, kind: "pass" })), { text: line, kind: "fail" }];
    command = position < 0 ? `node scripts/checks.ts ${s.check} dist/function.zip   (deploy job)` : "npm run checks";
    verdict = position < 0 ? "Deploy stopped before any AWS call" : `Stopped at check ${position + 1} of ${input.checks.length}. Not deployed`;
  }
  const commit = (input.commits[s.id] ?? []).map((m, i) => (i === 0 ? `$ git commit -m "${m}"` : `             -m "${m}"`));
  if (s.id === "B3") commit.push("  (no Spec: trailer)");
  const body = s.fixture ? `▸ ${s.fixture}\n${(input.fixtures[s.id] ?? "").trim()}` : changeExcerpt(input.patches[s.id] ?? "");
  const change = [...(s.patch ? commit : []), body].filter(Boolean).join("\n");
  const fields = { id: s.id, title: s.title, check: s.check, expect: s.expect, line, outcome, practice: p.practice, practice_id: p.id };
  return { id: s.id, kind: "scenario", head: `${p.id} · ${p.practice}`, title: `${s.id}: ${s.title}`, fields, rows: [],
    change, changeLabel: s.fixture ? "The poisoned input" : "The agent's change", command, run, ...(verdict === undefined ? {} : { verdict }), say: say(s.id, "scenario", fields) };
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

export interface Voice { samples: Int16Array; rate: number }

/** RMS level, 0 to 1, of each whole millisecond of 16-bit samples, so clips and soundtrack compare at any sample rate. */
export function envelope(voice: Voice): Float64Array {
  const out = new Float64Array(Math.floor((voice.samples.length * 1000) / voice.rate));
  for (let k = 0; k < out.length; k++) {
    const a = Math.floor((k * voice.rate) / 1000), b = Math.max(a + 1, Math.floor(((k + 1) * voice.rate) / 1000));
    let sum = 0;
    for (let i = a; i < b; i++) sum += (voice.samples[i] ?? 0) ** 2;
    out[k] = Math.sqrt(sum / (b - a)) / 32768;
  }
  return out;
}

/** The millisecond within `reach` of `from` where `clip` lines up best with `mix`, scored by cosine similarity (1 is a perfect match). */
export function bestMatch(clip: Float64Array, mix: Float64Array, from: number, reach: number): { at: number; score: number } {
  let clipEnergy = 0;
  for (const v of clip) clipEnergy += v * v;
  let best = { at: from, score: 0 };
  for (let at = Math.max(0, from - reach); at <= from + reach; at++) {
    let dot = 0, energy = 0;
    for (let k = 0; k < clip.length; k++) {
      const m = mix[at + k] ?? 0;
      dot += (clip[k] ?? 0) * m;
      energy += m * m;
    }
    const score = dot > 0 ? dot / Math.sqrt(clipEnergy * energy) : 0;
    if (score > best.score) best = { at, score };
  }
  return best;
}

// A voice starts where its clip sits in the delivered soundtrack plus the clip's own lead-in. The clip is found by its loudness
// envelope, which loudness normalisation scales but does not move; a fixed -40 dB crossing moves with that gain and with AAC.
export function onsetResults(timeline: Timeline, clips: readonly Voice[], soundtrack: Voice, soundtrackStart = 0) {
  const base = timeline.entries[0]?.start ?? 0;
  const mix = envelope(soundtrack);
  return timeline.entries.map((e) => {
    const expected = r3(e.voice_at - base + e.lead_in);
    const clip = clips[e.index];
    const match = clip ? bestMatch(envelope(clip), mix, Math.round((e.voice_at - base - soundtrackStart) * 1000), Math.round(ONSET_REACH * 1000)) : { at: 0, score: 0 };
    const measured = match.score >= MATCH_MIN ? r3(soundtrackStart + match.at / 1000 + e.lead_in) : null;
    return { line: e.index + 1, expected, measured, match: r3(match.score), ok: measured !== null && Math.abs(measured - expected) <= ONSET_TOLERANCE + 1e-9 };
  });
}

export function onsetProblems(onsets: readonly ReturnType<typeof onsetResults>[number][]): string[] {
  return onsets.filter((o) => !o.ok).map((o) => o.measured === null
    ? `line ${o.line}: voice not found within ${ONSET_REACH} s of ${o.expected} s (best match ${o.match}, needs ${MATCH_MIN})`
    : `line ${o.line}: voice starts at ${o.measured} s, expected ${o.expected} s within ${ONSET_TOLERANCE} s`);
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

interface Probe { streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string; start_time?: string }[]; format?: { duration?: string }; chapters?: unknown[] }

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
