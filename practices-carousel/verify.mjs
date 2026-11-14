#!/usr/bin/env node
/*
 * verify.mjs: the checks for the practices carousel. Prints one PASS or FAIL row per check, writes the same table
 * and the report below it to out/report.md, and exits nonzero on any FAIL.
 *
 *   node verify.mjs                  every check; render.mjs must have written out/ first
 *   node verify.mjs --only schema,practices,phrasing,receipt
 *
 * Schema, Practices and Phrasing read only carousel.yaml and practices.yaml, so they need no browser; nor does Receipt,
 * which runs receipt-proof.mjs, the printer of page 11's lines, against git and evidence/. The others need
 * Chromium (Playwright from factory-video/playwright.mjs), pdfinfo, pdffonts and pdftotext. Fonts, Offline, Count and
 * Text cover the poster too, and Poster checks its layout. A check that throws is reported as a FAIL.
 *
 * The report also lists the coverage practices.yaml records for each row's IDs. Like the factory video, the carousel
 * is the target: a practice the repository does not demonstrate yet is a gap to report, and the check still passes.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { RECEIPT, RECEIPT_ROWS } from './receipt-proof.mjs';
import { DIR, FONT_DIR, HEIGHT, OUT, PDF, POSTER, POSTER_PDF, ROOT, WIDTH, loadCarousel, loadFonts, offlineProblems, openCarousel, pageCount, printedReceipt, rowsOf, sha256 } from './lib.mjs';

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: String(detail).replace(/\|/g, '/').replace(/\n/g, ' ') });
}
const report = [];

const args = process.argv.slice(2);
const onlyAt = args.indexOf('--only');
const CHECKS = ['schema', 'practices', 'phrasing', 'receipt', 'fit', 'map', 'poster', 'fonts', 'offline', 'count', 'pages', 'text'];
const ONLY = onlyAt >= 0 ? new Set(String(args[onlyAt + 1] || '').split(',').filter(Boolean)) : null;
if (ONLY && (!ONLY.size || [...ONLY].some((k) => !CHECKS.includes(k)))) {
  console.error(`--only takes a comma-separated list of: ${CHECKS.join(', ')}`);
  process.exit(2);
}
const want = (k) => !ONLY || ONLY.has(k);
// A check that throws is a failure with the error as its detail, so the table always prints.
function safely(name, fn) {
  try {
    return fn();
  } catch (e) {
    record(name, false, `the check itself failed: ${String(e.message || e).split('\n')[0]}`);
    return undefined;
  }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim() !== '';
const list = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const short = (s, n = 48) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
const hasTool = (cmd) => spawnSync(cmd, ['-v'], { stdio: 'ignore' }).error === undefined;

// ------------------------------------------------------------------ content
let parsed;
try {
  parsed = { ...loadCarousel(), error: null };
} catch (e) {
  parsed = { text: '', doc: null, error: String(e.message || e).split('\n')[0] };
}
const { doc } = parsed;
const PAGES = pageCount(doc);
const ROWS = rowsOf(doc);

// Schema: the fields the template reads, the keys rows name, https tool links and real page numbers.
function schemaCheck() {
  if (parsed.error) return record('Schema', false, `carousel.yaml does not parse: ${parsed.error}`);
  const bad = [];
  const need = (obj, keys, where) => {
    if (!isObj(obj)) return bad.push(`${where} is missing`);
    for (const k of keys) if (!isText(obj[k])) bad.push(`${where}.${k} is missing`);
  };
  need(doc.meta, ['title', 'thesis_key', 'thesis_rest', 'subtitle', 'byline', 'close_line_plain', 'close_line_key'], 'meta');
  if (isObj(doc.meta) && !String(doc.meta.subtitle || '').includes('{count}')) bad.push('meta.subtitle has no {count}');
  if (isObj(doc.meta) && !(Array.isArray(doc.meta.sites) && doc.meta.sites.every(isText))) bad.push('meta.sites is not a list of names');
  need(doc.windows, ['before', 'seconds', 'minutes', 'hours', 'always'], 'windows');
  if (!isObj(doc.where) || !Object.values(doc.where).every((v) => typeof v === 'string')) bad.push('where is not a map of labels');
  need(doc.legend, ['windows', 'untagged', 'diy', 'tools', 'owasp'], 'legend');
  need(doc.labels, ['diy', 'ref', 'page', 'pages'], 'labels');
  need(doc.poster, ['view', 'count', 'back', 'back_count'], 'poster');
  if (isObj(doc.poster) && !String(doc.poster.count || '').includes('{count}')) bad.push('poster.count has no {count}');
  if (isObj(doc.poster) && !String(doc.poster.back_count || '').includes('{count}')) bad.push('poster.back_count has no {count}');
  need(doc.factory, ['heading', 'lede', 'account'], 'factory');
  const boxes = [
    ...list(doc.factory?.flow).map((b, i) => [`factory.flow[${i}]`, b]),
    ...list(doc.factory?.around).map((b, i) => [`factory.around[${i}]`, b]),
  ];
  if (list(doc.factory?.flow).length !== 4) bad.push('factory.flow needs four boxes: spec, sandbox, pipeline, production');
  if (list(doc.factory?.around).length !== 3) bad.push('factory.around needs three boxes: policy, inspector, humans');
  for (const [where, b] of boxes) {
    need(b, ['name', 'text'], where);
    const pages = list(b?.page);
    if (!pages.length) bad.push(`${where}.page is missing`);
    for (const p of pages) if (!Number.isInteger(p) || p < 1 || p > PAGES) bad.push(`${where}.page ${p} is not a page from 1 to ${PAGES}`);
  }
  // Ten pages and the poster's layout both place sections by position: three columns, then three bands.
  if (!Array.isArray(doc.sections) || doc.sections.length !== 6) bad.push(`sections needs six entries, not ${list(doc.sections).length}`);
  for (const [i, s] of list(doc.sections).entries()) {
    need(s, ['name', 'tag', 'blurb'], `sections[${i}]`);
    if (!list(s?.rows).length) bad.push(`sections[${i}] has no rows`);
  }
  const windows = isObj(doc.windows) ? Object.keys(doc.windows) : [];
  const wheres = isObj(doc.where) ? Object.keys(doc.where) : [];
  for (const { row, name } of ROWS) {
    const at = `${name}: "${short(row?.text ?? '?', 40)}"`;
    if (!isObj(row)) {
      bad.push(`${at} is not a row`);
      continue;
    }
    for (const k of ['text', 'when', 'where', 'tools']) if (!(k in row)) bad.push(`${at} lacks ${k}`);
    if ('text' in row && !isText(row.text)) bad.push(`${at} has an empty text`);
    if ('when' in row) {
      if (!Array.isArray(row.when) || !row.when.length) bad.push(`${at} when is not a list`);
      for (const w of list(row.when)) if (!windows.includes(w)) bad.push(`${at} when names ${w}, which windows does not define`);
    }
    if ('where' in row && !wheres.includes(row.where)) bad.push(`${at} where names ${row.where}, which where does not define`);
    if ('tools' in row && !Array.isArray(row.tools)) bad.push(`${at} tools is not a list`);
    for (const t of list(row.tools)) {
      if (!isText(t?.name)) bad.push(`${at} has a tool with no name`);
      if (!/^https:\/\/[^\s/]+\.[^\s]*$/.test(String(t?.url ?? ''))) bad.push(`${at} tool ${t?.name} url is not https://: ${t?.url}`);
    }
    for (const k of ['lead', 'ref']) if (k in row && !isText(row[k])) bad.push(`${at} ${k} is empty`);
    if ('diy' in row && typeof row.diy !== 'boolean') bad.push(`${at} diy is not true or false`);
    if (!Array.isArray(row.practices)) bad.push(`${at} practices is not a list`);
  }
  need(doc.humans, ['heading'], 'humans');
  for (const [i, h] of list(doc.humans?.rows).entries()) need(h, ['label', 'text', 'note'], `humans.rows[${i}]`);
  need(doc.humans?.day_one, ['heading', 'end'], 'humans.day_one');
  if (!list(doc.humans?.day_one?.items).every(isText) || !list(doc.humans?.day_one?.items).length) bad.push('humans.day_one.items is empty');
  // Page 11: the wording around the printed receipt. Its templates name only values the printer proves, and hold no
  // digit of their own, so no number on the receipt comes from carousel.yaml.
  const r = doc.receipt;
  need(r, ['title', 'source', 'gaps_heading', 'total', 'result', 'count', 'motto', 'under'], 'receipt');
  need(r?.stub, ['scenario', 'text', 'line', 'result'], 'receipt.stub');
  for (const k of ['title', 'source', 'gaps_heading', 'total', 'result']) {
    const t = String(r?.[k] ?? '');
    for (const name of t.match(/\{(\w+)\}/g) ?? []) if (!['{ref}', '{run}', '{date}', '{deployed}'].includes(name)) bad.push(`receipt.${k} names ${name}, which the printer does not prove`);
    if (/\d/.test(t.replace(/\{\w+\}/g, ''))) bad.push(`receipt.${k} holds a digit of its own`);
  }
  for (const k of ['commit', 'spec_commit', 'lines', 'gaps', 'quotes', 'evidence', 'proofs']) if (isObj(r) && k in r) bad.push(`receipt.${k} belongs to receipt-proof.mjs, which prints the receipt`);
  if (!list(r?.stub?.quotes).length) bad.push('receipt.stub.quotes is empty');
  list(r?.stub?.quotes).forEach((e, j) => {
    if (!isObj(e) || !isText(e.quote) || !isText(e.git)) bad.push(`receipt.stub.quotes[${j}] needs git and a quote`);
  });
  if (isObj(r) && !['{shown}', '{partly}', '{count}'].every((x) => String(r.count).includes(x))) bad.push('receipt.count lacks {shown}, {partly} or {count}');
  need(doc.close, ['heading'], 'close');
  for (const [i, c] of list(doc.close?.items).entries()) need(c, ['verb', 'what', 'how'], `close.items[${i}]`);
  record('Schema', !bad.length, bad.length ? `${bad.length} problem(s): ${bad.slice(0, 6).join('; ')}` : `${ROWS.length} rows in ${list(doc.sections).length} sections, 7 factory boxes, every key defined, every tool link https://`);
}

// Practices: every row cites IDs that practices.yaml defines, or none with source: qa.
let PRACTICES = new Map();
function practicesCheck() {
  try {
    const p = YAML.parse(fs.readFileSync(path.join(ROOT, 'practices.yaml'), 'utf8'));
    PRACTICES = new Map(list(p.practices).map((x) => [x.id, x]));
  } catch (e) {
    return record('Practices', false, `practices.yaml does not parse: ${e.message}`);
  }
  if (!doc) return record('Practices', false, 'carousel.yaml does not parse');
  const bad = [];
  const cited = new Set();
  const sources = { qa: 0, dpra: 0, 'pipeline-view': 0 };
  for (const { row, name } of ROWS) {
    const ids = list(row?.practices);
    for (const id of ids) {
      cited.add(id);
      if (!PRACTICES.has(id)) bad.push(`${name}: "${short(row.text, 40)}" cites ${id}, which practices.yaml does not define`);
    }
    // A row that cites no practice names where it comes from: the deck's Q&A slides, the AWS Deployment Pipeline
    // Reference Architecture, which the deck takes as given, or the owner's "Pipeline view" poster.
    if (!ids.length && !(row?.source in sources)) bad.push(`${name}: "${short(row?.text, 40)}" cites no practice and is not source: qa, dpra or pipeline-view`);
    if (!ids.length && row?.source in sources) sources[row.source]++;
    if (ids.length && row?.source) bad.push(`${name}: "${short(row?.text, 40)}" cites practices and also names source: ${row.source}`);
  }
  const uncited = [...PRACTICES.keys()].filter((id) => !cited.has(id));
  report.push('## Practices no row cites', '', uncited.length ? `${uncited.join(', ')}: in practices.yaml, on no carousel row. This is reported, and does not fail the check.` : 'None.', '');
  record('Practices', !bad.length, bad.length ? bad.slice(0, 4).join('; ') : `${cited.size} of ${PRACTICES.size} practices.yaml IDs cited; ${sources.qa} row(s) from the deck's Q&A, ${sources.dpra} from the DPRA and ${sources['pipeline-view']} from the pipeline-view poster, citing none; not cited: ${uncited.join(', ') || 'none'}`);
}

// Phrasing: the patterns the owner rejects, in every string and comment of carousel.yaml except tool URLs.
const PHRASING = [
  ['em dash', /—/],
  // "--" anywhere, except a command-line flag in a tool's name, such as "pip --require-hashes".
  ['double hyphen', /--(?![a-z])|(?<=\S)--/],
  ['"not just"', /\bnot just\b/i],
  ['comma then "not"', /,\s*not\b/i],
  ['sentence starting "Not"', /(^|[.!?]["')\]]?\s+)Not\b/],
  ['"never"', /\bnever\b/i],
  // A reader outside git takes "patch" for a bug fix; the carousel says "proposed change" (owner, 2026-11-14).
  ['"patch"', /\bpatch(es)?\b/i],
  ['"Here\'s"', /\bhere['’]s\b/i],
  ['stock word', /\b(delve|unlock|harness|robust|crucial|pivotal|landscape|ecosystem|transformative|cutting-edge|game-changer|seamless)\b/i],
];
function phrasingCheck() {
  if (parsed.error) return record('Phrasing', false, 'carousel.yaml does not parse');
  const texts = [];
  const pdoc = YAML.parseDocument(parsed.text);
  for (const c of [pdoc.commentBefore, pdoc.comment]) if (c) texts.push(['comment', c]);
  // A tool's url is skipped and its name may hold a command-line flag; only under a row's tools list.
  const underTools = (pathTo) => pathTo.some((n) => YAML.isPair(n) && n.key?.value === 'tools');
  YAML.visit(pdoc, (_, node, pathTo) => {
    for (const c of [node?.commentBefore, node?.comment]) if (c) texts.push(['comment', c]);
    if (YAML.isPair(node)) {
      const key = node.key?.value;
      const tool = underTools(pathTo);
      if (typeof key === 'string') texts.push(['key', key]);
      // A receipt quote is verbatim text from git or a log, so it is skipped too.
      if (YAML.isScalar(node.value) && typeof node.value.value === 'string' && !(tool && key === 'url') && key !== 'quote') texts.push([tool && key === 'name' ? 'tool name' : key, node.value.value]);
    }
    if (YAML.isScalar(node) && YAML.isSeq(pathTo[pathTo.length - 1]) && typeof node.value === 'string') texts.push(['item', node.value]);
  });
  const hits = [];
  for (const [where, t] of texts) {
    for (const [label, re] of PHRASING) {
      const strict = label === 'double hyphen' && where !== 'tool name' ? /--/ : re;
      if (strict.test(t)) hits.push(`${label} in ${where}: "${short(t, 50)}"`);
    }
  }
  const unique = [...new Set(hits)];
  record('Phrasing', !unique.length, unique.length ? unique.slice(0, 5).join('; ') : `${texts.length} strings, keys and comments read; none matches the ${PHRASING.length} rejected patterns`);
}

// ------------------------------------------------------------------ PDF
// Receipt: page 11's lines are what receipt-proof.mjs prints from verified evidence, so the check is that every proof
// passed and every row a line claims is a row carousel.yaml has. The stub, the one part carousel.yaml writes, must
// quote its line and its numbers from git at a pinned commit, and match its scenario.
function hasNumber(pool, n) {
  for (let i = pool.indexOf(n); i >= 0; i = pool.indexOf(n, i + 1)) {
    if (!/[\d.]/.test(pool[i - 1] ?? '') && !/\d/.test(pool[i + n.length] ?? '')) return true;
  }
  return false;
}
function receiptTally(lines) {
  const shown = new Set(lines.flatMap((l) => list(l?.shows)));
  const partly = new Set(lines.flatMap((l) => list(l?.partly)).filter((t) => !shown.has(t)));
  return { shown: shown.size, partly: partly.size };
}
function receiptCheck() {
  const r = doc.receipt;
  const printed = printedReceipt();
  const bad = [...printed.problems];
  const rowTexts = new Set(ROWS.map(({ row }) => row?.text));
  for (const [key, rows] of Object.entries(RECEIPT_ROWS)) for (const t of [...rows.shows, ...rows.partly]) if (!rowTexts.has(t)) bad.push(`${key} claims "${short(t, 40)}", which is no row's text`);
  if (printed.lines.some((l) => !l || l.value === 'NOT VERIFIED')) bad.push('a receipt line is NOT VERIFIED');
  // The stub: its whole line and its numbers in its quotes, each quote in git at its pinned commit.
  const quoted = [];
  for (const [i, e] of list(r.stub.quotes).entries()) {
    const at = String(e.git).indexOf(':');
    const rev = String(e.git).slice(0, at);
    try {
      if (!/^[0-9a-f]{40}$/.test(rev)) throw new Error('does not pin a full commit SHA');
      const text = execFileSync('git', ['-C', ROOT, 'show', `${rev}:${String(e.git).slice(at + 1)}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      if (!text.includes(e.quote)) throw new Error(`is not in ${e.git}`);
      quoted.push(e.quote);
    } catch (err) {
      bad.push(`stub quote ${i + 1} ${String(err.message || err).split('\n')[0]}`);
    }
  }
  const pool = quoted.join('\n');
  if (!pool.includes(r.stub.line)) bad.push("no stub quote holds the stub's whole line");
  for (const n of `${r.stub.text} ${r.stub.result}`.match(/\d+(?:[.:-]\d+)*/g) ?? []) if (!hasNumber(pool, n)) bad.push(`the stub's "${n}" is in none of its quotes`);
  const scenarios = YAML.parse(fs.readFileSync(path.join(ROOT, 'scenarios/scenarios.yaml'), 'utf8'));
  const sc = list(scenarios?.scenarios ?? scenarios).find((x) => x?.id === r.stub.scenario);
  if (!sc) bad.push(`scenario ${r.stub.scenario} is not in scenarios/scenarios.yaml`);
  else if (!String(r.stub.line).startsWith(sc.expect)) bad.push(`the stub's line does not start with ${r.stub.scenario}'s expected "${sc.expect}"`);
  const t = receiptTally(printed.lines);
  record('Receipt', !bad.length, bad.length ? `${bad.length} problem(s): ${bad.slice(0, 4).join('; ')}` : `${printed.lines.length} lines printed from verified evidence: the approver's SSH signature on ${RECEIPT.specCommit.slice(0, 7)}; two DSSE signatures, their Fulcio chains to the pinned root and the pinned identity; two Rekor entries' timestamps, inclusion proofs, UUIDs and checkpoints; the diff and deploy hashes recomputed. Evidence for ${t.shown} rows in full and ${t.partly} in part; ${printed.gaps.length} gaps`);
}

function pdfText(page, file = PDF) {
  return execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-raw', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8' });
}
const norm = (s) =>
  String(s)
    .replace(/[‘’]/g, "'")
    .replace(/­/g, '')
    .replace(/\s+/g, ' ')
    .replace(/-\s+/g, '-')
    .trim()
    .toLowerCase();

function pagesCheck() {
  if (!fs.existsSync(PDF)) return record('Pages', false, `missing ${path.relative(DIR, PDF)}; run render.mjs first`);
  if (!hasTool('pdfinfo')) return record('Pages', false, 'pdfinfo not installed (poppler-utils)');
  const info = execFileSync('pdfinfo', ['-f', '1', '-l', '999', PDF], { encoding: 'utf8' });
  const pages = Number((info.match(/^Pages:\s+(\d+)/m) || [])[1]);
  const sizes = [...info.matchAll(/^Page\s+(\d+) size:\s+([\d.]+) x ([\d.]+) pts/gm)].map((m) => [Number(m[1]), m[2], m[3]]);
  const wrong = sizes.filter(([, w, h]) => w !== '810' || h !== '1013.04').map(([n, w, h]) => `page ${n} is ${w} x ${h}`);
  // Cover, map, six sections, humans, close and the receipt of a real run (the owner added page 11 on 2026-11-14).
  const ok = pages === 11 && sizes.length === 11 && !wrong.length;
  record('Pages', ok, `${pages} pages${pages === 11 ? '' : ', not 11'}; ${wrong.length ? wrong.join(', ') : `each 810 x 1013.04 pt, which is ${WIDTH} x ${HEIGHT} px as Chromium rounds it`}`);
}

// The PostScript name (name ID 6) of a TrueType file, as a PDF names an embedded font.
function postscriptName(buf) {
  const tables = buf.readUInt16BE(4);
  for (let i = 0; i < tables; i++) {
    const at = 12 + 16 * i;
    if (buf.toString('latin1', at, at + 4) !== 'name') continue;
    const base = buf.readUInt32BE(at + 8);
    const count = buf.readUInt16BE(base + 2);
    const strings = base + buf.readUInt16BE(base + 4);
    for (let j = 0; j < count; j++) {
      const rec = base + 6 + 12 * j;
      const [platform, , , id, len, off] = [0, 2, 4, 6, 8, 10].map((o) => buf.readUInt16BE(rec + o));
      if (id !== 6) continue;
      const bytes = buf.subarray(strings + off, strings + off + len);
      return platform === 3 || platform === 0 ? Buffer.from(bytes).swap16().toString('utf16le') : bytes.toString('latin1');
    }
  }
  return null;
}

function fontsCheck(readies) {
  const bad = [];
  let pins;
  try {
    pins = loadFonts();
  } catch (e) {
    return record('Fonts', false, `fonts.json does not parse: ${e.message}`);
  }
  for (const s of list(pins.sources)) if (!/^https:\/\//.test(String(s.licence_url)) || !/Open Font License/.test(String(s.licence))) bad.push(`source ${s.name} names no OFL licence URL`);
  const pinned = new Set();
  for (const f of list(pins.fonts)) {
    if (!/^https:\/\/.*\/[0-9a-f]{40}\//.test(String(f.url))) bad.push(`${f.file}: url is not pinned to a commit`);
    if (!/^[0-9a-f]{64}$/.test(String(f.sha256))) bad.push(`${f.file}: sha256 is not 64 hex digits`);
    const file = path.join(FONT_DIR, String(f.file));
    if (!fs.existsSync(file)) bad.push(`${f.file}: not downloaded`);
    else {
      const buf = fs.readFileSync(file);
      if (sha256(buf) !== f.sha256) bad.push(`${f.file}: SHA-256 differs from fonts.json`);
      else pinned.add(postscriptName(buf));
    }
  }
  for (const ready of readies) {
    const notLoaded = list(ready?.fonts).filter((s) => !/: loaded$/.test(s));
    if (notLoaded.length || !list(ready?.fonts).length) bad.push(`not loaded in the page: ${notLoaded.join(', ') || 'none reported'}`);
  }
  const counts = [];
  for (const file of [PDF, POSTER_PDF]) {
    const label = path.basename(file);
    if (!fs.existsSync(file)) {
      bad.push(`no ${label}`);
      continue;
    }
    if (!hasTool('pdffonts')) {
      bad.push('pdffonts not installed (poppler-utils)');
      break;
    }
    const rows = execFileSync('pdffonts', [file], { encoding: 'utf8' }).trim().split('\n').slice(2);
    const names = rows.map((l) => l.split(/\s+/)[0].replace(/^[A-Z]{6}\+/, ''));
    rows.forEach((l, i) => {
      if (!/\s+yes\s+(yes|no)\s+(yes|no)\s+\d+\s+\d+\s*$/.test(l)) bad.push(`${label}: ${names[i]} is not embedded`);
    });
    for (const fam of ['Archivo', 'IBMPlexSans', 'IBMPlexMono']) if (!names.some((n) => n.startsWith(fam))) bad.push(`${label}: ${fam} is missing`);
    const stray = names.filter((n) => !pinned.has(n));
    if (stray.length) bad.push(`${label}: fonts that fonts.json does not pin: ${stray.join(', ')}`);
    counts.push(`${label}: ${names.length} (${names.join(', ')})`);
  }
  record('Fonts', !bad.length, bad.length ? bad.slice(0, 5).join('; ') : `${list(pins.fonts).length} files match fonts.json; every font in both PDFs embedded and one of the pinned files by its PostScript name. ${counts.join('; ')}`);
}

// ------------------------------------------------------------------ browser
// Measures every page in a fresh copy of the page that render.mjs printed, through the same lib.mjs path.
function measure() {
  const rect = (e) => e.getBoundingClientRect();
  const meet = (a, b, eps = 0.5) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > eps && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > eps;
  const inside = (a, b, eps = 1) => a.left >= b.left - eps && a.right <= b.right + eps && a.top >= b.top - eps && a.bottom <= b.bottom + eps;
  const out = { pages: [], meta: [], map: null, count: null, rowsShown: 0, poster: null };
  for (const s of document.querySelectorAll('.slide, .poster')) {
    const r = rect(s);
    const cs = getComputedStyle(s);
    const poster = s.classList.contains('poster');
    // The poster has no padding of its own. Its margin is 64 px at each side, which only the full-width boxes of the
    // header, legend, body and footer may cross; their text may not.
    const content = poster
      ? { left: r.left + 64, right: r.right - 64, top: r.top, bottom: r.bottom }
      : { left: r.left + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.paddingRight), top: r.top + parseFloat(cs.paddingTop), bottom: r.bottom - parseFloat(cs.paddingBottom) };
    const bleed = (e) => e.closest('.wires') || (poster && e.matches('.ph, .legend, .body, .pf'));
    const outside = [];
    // The wires may reach into the margins, never past the page. A marker's shape has no
    // box of its own (0 x 0 at the document's origin), so empty boxes are skipped.
    const name = (e) => `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className ? `.${e.className}` : ''} "${(e.textContent || '').trim().slice(0, 30)}"`;
    for (const e of s.querySelectorAll('*')) {
      const b = rect(e);
      if (b.width === 0 && b.height === 0) continue;
      if (!inside(b, bleed(e) ? r : content)) outside.push(name(e));
    }
    // Text too: a word too long for its line runs out of its box, and the box alone does not show it.
    const walker = document.createTreeWalker(s, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const bound = n.parentElement.closest('.wires') ? r : content;
      const lines = [...range.getClientRects()];
      if (lines.some((b) => !inside(b, bound, 2))) outside.push(`text "${n.textContent.trim().slice(0, 30)}"`);
      // And inside its own box, across: a word wider than a heading or an arrow's box runs out of it, or is clipped.
      let box = n.parentElement;
      while (box && /^(inline|contents)$/.test(getComputedStyle(box).display)) box = box.parentElement;
      const own = box ? rect(box) : r;
      if (lines.some((b) => b.left < own.left - 1.5 || b.right > own.right + 1.5)) outside.push(`text "${n.textContent.trim().slice(0, 30)}" runs out of its box`);
    }
    const back = s.classList.contains('back');
    const page = { n: back ? 'poster back' : poster ? 'poster' : Number(s.dataset.page), kind: back ? 'back' : poster ? 'poster' : s.dataset.kind, k: s.style.getPropertyValue(back ? '--bk' : poster ? '--pk' : '--k') || null, scroll: s.scrollHeight > s.clientHeight || s.scrollWidth > s.clientWidth, outside: [...new Set(outside)].slice(0, 3), rowsAboveLegend: true };
    if (poster) {
      const body = s.querySelector('.body');
      const last = rect(body.lastElementChild);
      page.rowsAboveLegend = body.scrollHeight <= body.clientHeight && last.bottom <= rect(body).bottom - parseFloat(getComputedStyle(body).paddingBottom) + 0.5;
    }
    const rows = s.querySelector('.rows');
    const legend = s.querySelector('.legend');
    if (rows && legend) page.rowsAboveLegend = rect(rows).bottom <= rect(legend).top - 6;
    out.pages.push(page);
    for (const m of s.querySelectorAll('.meta')) {
      const t = m.querySelector('.tools');
      const tags = [...m.querySelectorAll('.diy, .who, .track')].map(rect);
      const range = document.createRange();
      range.selectNodeContents(t);
      const lines = [...range.getClientRects()];
      const under = lines.some((l) => tags.some((g) => meet(l, g)));
      out.meta.push({ page: page.n, row: (m.parentElement.querySelector('.p')?.textContent || '').slice(0, 40), wide: t.scrollWidth > t.clientWidth + 1, under });
    }
  }
  out.rowsShown = document.querySelectorAll('.sectionpage .rows > li').length;
  const map = document.querySelector('.fmap');
  if (map) {
    const boxes = Object.fromEntries([...map.querySelectorAll('.fbox')].map((b) => [b.dataset.box, { r: rect(b), on: b.querySelector('.on')?.textContent, mark: b.querySelector('.mark')?.textContent || null }]));
    const sizes = [];
    const walker = document.createTreeWalker(map, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (n.textContent.trim()) sizes.push([parseFloat(getComputedStyle(n.parentElement).fontSize), n.textContent.trim().slice(0, 24)]);
    }
    const names = Object.keys(boxes);
    const overlaps = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (meet(boxes[names[i]].r, boxes[names[j]].r)) overlaps.push(`${names[i]} x ${names[j]}`);
    const area = Object.fromEntries(names.map((n) => [n, Math.round(boxes[n].r.width * boxes[n].r.height)]));
    out.map = {
      area,
      on: Object.fromEntries(names.map((n) => [n, boxes[n].on])),
      mark: boxes.pipeline?.mark,
      minSize: sizes.reduce((m, [s]) => Math.min(m, s), Infinity),
      smallest: sizes.filter(([s]) => s < 26).map(([s, t]) => `${s}px "${t}"`).slice(0, 3),
      // The security account's frame: a dashed outline on the inspector's box alone, with its label.
      framed: [...map.querySelectorAll('.fbox')].filter((b) => getComputedStyle(b).outlineStyle === 'dashed').map((b) => b.dataset.box),
      account: map.querySelector('.fb-inspector .acct')?.textContent ?? null,
      overlaps,
      wires: map.querySelectorAll('.wires > path').length,
      // The flow runs top to bottom; policy sits beside the pipeline and humans beside the spec.
      flowDown: ['spec', 'sandbox', 'pipeline', 'production'].every((n, i, a) => !i || (boxes[a[i - 1]] && boxes[n] && boxes[a[i - 1]].r.bottom <= boxes[n].r.top)),
      besidePipeline: !!(boxes.policy && boxes.pipeline) && Math.min(boxes.policy.r.bottom, boxes.pipeline.r.bottom) - Math.max(boxes.policy.r.top, boxes.pipeline.r.top) > 0 && boxes.policy.r.left >= boxes.pipeline.r.right,
      besideSpec: !!(boxes.humans && boxes.spec) && Math.min(boxes.humans.r.bottom, boxes.spec.r.bottom) - Math.max(boxes.humans.r.top, boxes.spec.r.top) > 0 && boxes.humans.r.left >= boxes.spec.r.right,
    };
  }
  out.count = document.querySelector('.cover .count, .poster .count')?.textContent ?? null;
  const p = document.querySelector('.poster');
  if (p) {
    const zone = (sel) => p.querySelector(sel);
    const chevs = ['.chev.spec', '.chev.c0', '.chev.c1', '.chev.c2', '.chev.prod'].map((c) => rect(zone(c)).left);
    out.poster = {
      cards: [...p.querySelectorAll('.card')].map((c) => ({ row: c.dataset.row, section: Number(c.closest('[data-section]')?.dataset.section ?? -1) })),
      framed: [...p.querySelectorAll('.band, .col, .side, .chev')].filter((b) => getComputedStyle(b).outlineStyle === 'dashed').map((b) => b.dataset.section ?? b.className),
      account: zone('.band[data-section="4"] .acct')?.textContent ?? null,
      flowRight: chevs.every((x, i) => !i || chevs[i - 1] < x),
      keyline: zone('.keyline')?.textContent || '',
      cardText: [...p.querySelectorAll('.card')].map((c) => c.textContent),
    };
    // Each column sits under its own section's arrow; spec and production text under theirs; policy under the
    // columns; then the inspector, routing humans, pages 9 and 10 and the footer, top to bottom.
    const names = (window.__CAROUSEL__?.doc?.sections || []).map((x) => x.name);
    const under = (a, b) => { const A = rect(zone(a)); const B = rect(zone(b)); const cx = (A.left + A.right) / 2; return cx > B.left && cx < B.right; };
    const misplaced = [];
    [0, 1, 2].forEach((i) => {
      if (!under(`.col[data-section="${i}"]`, `.chev.c${i}`)) misplaced.push(`column ${i + 1} is not under its arrow`);
      if (zone(`.chev.c${i} .n`)?.textContent !== names[i]) misplaced.push(`arrow ${i + 2} does not name section ${i + 1}`);
    });
    if (!under('.spec-side', '.chev.spec')) misplaced.push('the spec text is not under its arrow');
    if (!under('.prod-side', '.chev.prod')) misplaced.push('the production text is not under its arrow');
    const colBottom = Math.max(...[0, 1, 2].map((i) => rect(zone(`.col[data-section="${i}"]`)).bottom));
    if (rect(zone('.band[data-section="3"]')).top < colBottom) misplaced.push('factory policy is not under the columns');
    const order = ['.factory', '.band[data-section="4"]', '.band[data-section="5"]', '.after', '.pf'].map((q) => rect(zone(q)));
    order.forEach((b, i) => {
      if (i && order[i - 1].bottom > b.top + 0.5) misplaced.push(`${['factory', 'inspector', 'routing humans', 'pages 9 and 10', 'footer'][i]} is not below what comes before it`);
    });
    out.poster.misplaced = misplaced;
    // The back: one box to tick per row, section by section in file order.
    const b = document.querySelector('.poster.back');
    out.poster.back = b
      ? {
          items: [...b.querySelectorAll('.ck')].map((li) => ({ row: li.dataset.row, section: Number(li.closest('.ck-sec')?.dataset.sec ?? -1), box: !!li.querySelector('.box'), text: li.textContent })),
          sections: [...b.querySelectorAll('.ck-sec h2')].map((h) => h.textContent),
          count: b.querySelector('.count')?.textContent ?? null,
        }
      : null;
  }
  return out;
}

function fitCheck(m, pm) {
  const bad = [];
  for (const p of [...m.pages, ...(pm?.pages ?? [])]) {
    if (p.scroll) bad.push(`page ${p.n} overflows`);
    if (p.outside.length) bad.push(`page ${p.n} has content outside its margins: ${p.outside.join(', ')}`);
    if (!p.rowsAboveLegend) bad.push(`page ${p.n}: rows run into the legend`);
    if (p.kind === 'section') {
      const k = Number(p.k);
      if (!(k >= 0.8 && k <= 1.5)) bad.push(`page ${p.n}: --k ${p.k} is outside 0.8 to 1.5`);
    }
    if (p.kind === 'receipt') {
      const k = Number(p.k);
      if (!(k >= 0.8 && k <= 1.3)) bad.push(`page ${p.n}: --k ${p.k} is outside 0.8 to 1.3`);
    }
    if (p.kind === 'poster') {
      const k = Number(p.k);
      if (!(k >= 0.8 && k <= 1.3)) bad.push(`poster: --pk ${p.k} is outside 0.8 to 1.3`);
    }
    if (p.kind === 'back') {
      const k = Number(p.k);
      if (!(k >= 0.8 && k <= 1.5)) bad.push(`poster back: --bk ${p.k} is outside 0.8 to 1.5`);
    }
  }
  if (!pm?.pages?.length) bad.push('the poster was not measured');
  for (const r of [...m.meta, ...(pm?.meta ?? [])]) if (r.wide || r.under) bad.push(`page ${r.page}: tools run under the tags on "${r.row}"`);
  const ks = m.pages.filter((p) => p.kind === 'section');
  const rk = m.pages.find((p) => p.kind === 'receipt')?.k;
  if (!rk) bad.push('the receipt page has no --k');
  const pk = pm?.pages?.find((p) => p.kind === 'poster')?.k;
  const bk = pm?.pages?.find((p) => p.kind === 'back')?.k;
  report.push('## Fit', '', '| Page | Section | --k |', '|---|---|---|', ...ks.map((p, i) => `| ${p.n} | ${doc.sections[i]?.name} | ${p.k} |`), `| ${PAGES} | receipt | ${rk} |`, `| poster front | all | ${pk} (--pk) |`, `| poster back | all | ${bk} (--bk) |`, '');
  if (!bk) bad.push('the poster has no back');
  record('Fit', !bad.length, `${bad.length ? `${bad.slice(0, 4).join('; ')}. ` : ''}--k: ${ks.map((p) => `p${p.n} ${p.k}`).join(', ')}, receipt p${PAGES} ${rk}; poster --pk ${pk}, back --bk ${bk}`);
}

function mapCheck(m) {
  const map = m.map;
  if (!map) return record('Map', false, 'page 2 has no factory map');
  const bad = [];
  const flowAt = { spec: 0, sandbox: 1, pipeline: 2, production: 3 };
  const label = (p) => `${list(p).length > 1 ? doc.labels.pages : doc.labels.page} ${list(p).join(', ')}`;
  const boxes = { ...Object.fromEntries(Object.entries(flowAt).map(([k, i]) => [k, doc.factory.flow[i]])), policy: doc.factory.around[0], inspector: doc.factory.around[1], humans: doc.factory.around[2] };
  for (const [k, b] of Object.entries(boxes)) if (map.on[k] !== label(b?.page)) bad.push(`${k} shows "${map.on[k]}", not "${label(b?.page)}"`);
  const biggest = Object.entries(map.area).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (biggest !== 'pipeline') bad.push(`the largest box is ${biggest}, not the pipeline`);
  if (map.mark !== doc.factory.flow[2]?.mark) bad.push('the pipeline is not marked with its mark');
  if (map.minSize < 26) bad.push(`text below 26 px: ${map.smallest.join(', ')}`);
  if (map.framed.join() !== 'inspector') bad.push(`framed as the security account: ${map.framed.join(', ') || 'nothing'}; want the inspector alone`);
  if (map.account !== doc.factory.account) bad.push('the frame does not carry its label');
  if (map.overlaps.length) bad.push(`boxes overlap: ${map.overlaps.join(', ')}`);
  if (map.wires !== 7) bad.push(`${map.wires} wires drawn, not 7`);
  if (!map.flowDown) bad.push('the flow does not run spec, sandbox, pipeline, production from top to bottom');
  if (!map.besidePipeline) bad.push('factory policy is not beside the pipeline');
  if (!map.besideSpec) bad.push('humans are not beside the spec');
  record('Map', !bad.length, bad.length ? bad.join('; ') : `7 boxes, none overlapping; spec, sandbox, pipeline and production top to bottom; the pipeline is the largest (${map.area.pipeline} px²) and marked; policy beside it, humans beside the spec and wired to the pipeline; the inspector alone framed as the security account; smallest map text ${map.minSize} px`);
}

function offlineCheck(logs) {
  let renderLog = null;
  try {
    renderLog = JSON.parse(fs.readFileSync(path.join(OUT, 'render-log.json'), 'utf8'));
  } catch {
    return record('Offline', false, 'missing out/render-log.json; run render.mjs first');
  }
  const problems = [...offlineProblems(renderLog).map((p) => `render: ${p}`), ...logs.flatMap((log) => offlineProblems(log).map((p) => `verify: ${p}`))];
  const n = renderLog.requests.length + logs.reduce((t, log) => t + log.requests.length, 0);
  record('Offline', !problems.length, problems.length ? problems.slice(0, 4).join('; ') : `${n} requests across render and verify, all file://; no page or console error, carousel and poster`);
}

// Count: the number on the cover and the poster equals the rows the pages actually show, counted in the page, and the
// PDFs print it where the subtitle and the poster's count put it.
function countCheck(m, pm) {
  const shown = m.rowsShown;
  const cards = pm?.poster?.cards.length ?? 0;
  const inText = (file, page, template) => {
    if (!fs.existsSync(file) || !hasTool('pdftotext')) return false;
    const [before, after] = String(template).split('{count}');
    return norm(pdfText(page, file)).includes(norm(`${before}${shown}${after}`));
  };
  const coverPdf = inText(PDF, 1, doc.meta.subtitle);
  const posterPdf = inText(POSTER_PDF, 1, doc.poster.count);
  // The receipt's count, computed here from its lines' rows, is what page 11 prints.
  const tally = receiptTally(printedReceipt().lines);
  const receiptText = String(doc.receipt?.count ?? '').replace('{shown}', String(tally.shown)).replace('{partly}', String(tally.partly)).replace('{count}', String(shown));
  const receiptPdf = fs.existsSync(PDF) && hasTool('pdftotext') && norm(pdfText(PAGES, PDF)).includes(norm(receiptText));
  const items = pm?.poster?.back?.items.length ?? 0;
  const backCount = pm?.poster?.back?.count;
  const backPdf = inText(POSTER_PDF, 2, doc.poster.back_count);
  const ok = shown === ROWS.length && m.count === String(shown) && pm?.count === String(shown) && cards === shown && items === shown && backCount === String(shown) && coverPdf && posterPdf && backPdf && receiptPdf;
  record('Count', ok, `${shown} rows on pages 3 to 8, ${cards} cards on the poster's front and ${items} boxes on its back, of ${ROWS.length} in carousel.yaml; the back says ${backCount ?? 'nothing'}${backPdf ? ', as its PDF text does' : ', and its PDF text differs'}; the cover says ${m.count ?? 'nothing'}${coverPdf ? ', as its PDF text does' : ', and its PDF text differs'}; the poster says ${pm?.count ?? 'nothing'}${posterPdf ? ', as its PDF text does' : ', and its PDF text differs'}; the receipt ${receiptPdf ? `says "${receiptText}"` : `does not say "${receiptText}"`}`);
}

// Poster: one page; every row exactly once, in its section's column or band; the factory flows left to right; the
// inspector's band alone is framed as the security account, with its label; nor the spec, production,
// the inspector and routing humans.
function posterCheck(pm) {
  const bad = [];
  const P = pm?.poster;
  if (!P) return record('Poster', false, 'the poster page did not build');
  const want = ROWS.map(({ row, section }) => `${section}\u0000${row.text}`).sort();
  const got = P.cards.map((c) => `${c.section}\u0000${c.row}`).sort();
  if (want.join('\n') !== got.join('\n')) bad.push(`cards differ from the rows: ${want.length} rows, ${got.length} cards, ${got.filter((g, i) => g !== want[i]).length} out of place`);
  if (!P.flowRight) bad.push('the flow does not run spec, sandbox, checks, evidence, production from left to right');
  if (P.framed.join() !== '4') bad.push(`framed as the security account: ${P.framed.join(', ') || 'nothing'}; want the inspector's band alone`);
  if (P.account !== doc.factory.account) bad.push("the inspector's frame does not carry its label");
  if (!P.keyline.includes(String(doc.factory.flow[2]?.mark))) bad.push('the pipeline is not marked with its mark');
  bad.push(...P.misplaced);
  // Each card holds its own row's words, so a word shown on another card cannot stand in for it.
  const cardByRow = new Map(P.cards.map((c, i) => [c.row, norm(P.cardText[i])]));
  const thin = ROWS.filter(({ row }) => {
    const t = cardByRow.get(row.text) || '';
    const words = [row.text, row.lead, row.ref && `${doc.labels.ref} ${row.ref}`, ...list(row.tools).map((x) => x.name), doc.where[row.where], row.diy && doc.labels.diy].filter(Boolean);
    return words.some((w) => !t.includes(norm(w)));
  });
  if (thin.length) bad.push(`${thin.length} card(s) lack their row's words: "${short(thin[0].row.text, 40)}"`);
  let pages = 0;
  let size = '';
  if (!fs.existsSync(POSTER_PDF)) bad.push('missing out/poster.pdf');
  else if (hasTool('pdfinfo')) {
    const info = execFileSync('pdfinfo', [POSTER_PDF], { encoding: 'utf8' });
    pages = Number((info.match(/^Pages:\s+(\d+)/m) || [])[1]);
    size = (info.match(/^Page size:\s+([\d.]+ x [\d.]+)/m) || [])[1] || '';
    const [w, h] = size.split(' x ').map(Number);
    if (pages !== 2) bad.push(`poster.pdf has ${pages} pages, not 2: the front and the back`);
    if (Math.abs(w - POSTER.width * 0.75) > 1 || Math.abs(h - POSTER.height * 0.75) > 1) bad.push(`poster.pdf is ${size} pt`);
  }
  for (const f of ['poster.png', 'poster-back.png']) if (!fs.existsSync(path.join(OUT, f))) bad.push(`missing out/${f}`);
  // The back: every row once, in file order, each with its box, under its own section's heading.
  const B = P.back;
  if (!B) bad.push('the poster has no back');
  else {
    const order = ROWS.map(({ row, section }) => `${section}\u0000${row.text}`);
    const listed = B.items.map((it) => `${it.section}\u0000${it.row}`);
    if (order.join('\n') !== listed.join('\n')) bad.push(`the back's checklist differs from the rows: ${order.length} rows, ${listed.length} items`);
    if (B.items.some((it) => !it.box)) bad.push('an item on the back has no box to tick');
    const missingWords = ROWS.filter(({ row }, i) => !norm(B.items[i]?.text || '').includes(norm(row.text)) || (row.lead && !norm(B.items[i]?.text || '').includes(norm(row.lead))));
    if (missingWords.length) bad.push(`${missingWords.length} item(s) on the back lack their row's words`);
    if (B.sections.join('\n') !== doc.sections.map((x) => x.name).join('\n')) bad.push("the back's section headings differ from the sections");
  }
  record('Poster', !bad.length, bad.length ? bad.join('; ') : `2 pages of ${size} pt. Front: all ${got.length} rows once each, each card with its row's words, in their sections' places; each column under its arrow, the bands in order; flow left to right; the inspector's band alone framed as the security account. Back: a box to tick for each of the ${B.items.length} rows, in order, under its section`);
}

// Text: every string carousel.yaml puts on a page is in that page of the PDF, as pdftotext reads it.
function textCheck() {
  if (!fs.existsSync(PDF) || !hasTool('pdftotext')) return record('Text', false, 'no PDF, or pdftotext not installed');
  const m = doc.meta;
  const f = doc.factory;
  const expect = {
    1: [m.title, `${m.thesis_key} ${m.thesis_rest}`, String(m.subtitle).replace('{count}', String(ROWS.length)), doc.legend.owasp, m.byline, ...['before', 'seconds', 'minutes', 'hours'].map((k) => doc.windows[k])],
    2: [f.heading, f.lede, f.account, ...[...f.flow, ...f.around].flatMap((b) => [b.name, b.text, b.mark].filter(Boolean))],
  };
  doc.sections.forEach((s, i) => {
    expect[i + 3] = [s.name, s.tag, s.blurb, doc.legend.windows, doc.windows.always, doc.legend.untagged, doc.legend.diy, doc.legend.tools, ...s.rows.flatMap((r) => [r.text, r.lead, r.ref, ...list(r.tools).map((t) => t.name), doc.where[r.where]].filter(Boolean))];
  });
  const h = doc.humans;
  expect[PAGES - 2] = [h.heading, ...h.rows.flatMap((r) => [r.label, r.text, r.note]), h.day_one.heading, ...h.day_one.items, h.day_one.end];
  const c = doc.close;
  expect[PAGES - 1] = [c.heading, ...c.items.flatMap((i) => [i.verb, i.what, i.how]), `${m.close_line_plain} ${m.close_line_key}`, m.byline, ...m.sites];
  const r = doc.receipt;
  const pr = printedReceipt();
  const fill = (t) => String(t).replace(/\{(ref|run|date|deployed)\}/g, (_, k) => pr.vars[k]);
  expect[PAGES] = [r.title, fill(r.source), ...pr.lines.filter(Boolean).flatMap((l) => [l.key, l.value, l.sig, l.note].filter(Boolean)), `${r.gaps_heading}: ${pr.gaps.join(' · ')}`, r.total, fill(r.result), r.stub.text, r.stub.line, r.stub.result, r.motto, r.under];
  // The poster holds every row, the title, thesis and windows of page 1, the headings and lines of pages 9 and 10, and
  // the spec, pipeline and production boxes of page 2. It leaves out the cover's subtitle, each section's blurb, page
  // 9's notes, the other boxes' text on page 2 and the seconds and minutes window labels.
  const poster = [m.title, doc.poster.view, `${m.thesis_key} ${m.thesis_rest}`, String(doc.poster.count).replace('{count}', String(ROWS.length)), m.byline,
    doc.legend.windows, doc.windows.always, doc.legend.untagged, doc.legend.diy, doc.legend.tools, doc.legend.owasp, f.account, f.flow[0].name, f.flow[0].text, f.flow[2].name, f.flow[2].mark, f.flow[3].name, f.flow[3].text,
    ...doc.sections.flatMap((s) => [s.name, s.tag, ...s.rows.flatMap((r) => [r.text, r.lead, r.ref, ...list(r.tools).map((t) => t.name), doc.where[r.where]].filter(Boolean))]),
    h.heading, ...h.rows.flatMap((r) => [r.label, r.text]), h.day_one.heading, ...h.day_one.items, h.day_one.end,
    c.heading, ...c.items.flatMap((i) => [i.verb, i.what, i.how]), `${m.close_line_plain} ${m.close_line_key}`, ...m.sites];
  const missing = [];
  let n = 0;
  // Page 11's hashes and signatures wrap anywhere, so its text is compared with every space and line break removed.
  const look = (file, page, strings, label) => {
    const tight = file === PDF && Number(page) === PAGES;
    const squeeze = (t) => (tight ? norm(t).replace(/\s+/g, '') : norm(t));
    const text = squeeze(pdfText(Number(page), file));
    for (const s of strings) {
      n++;
      if (!text.includes(squeeze(s))) missing.push(`${label}: "${short(s, 40)}"`);
    }
  };
  for (const [page, strings] of Object.entries(expect)) look(PDF, page, strings, `page ${page}`);
  const back = [m.title, doc.poster.back, String(doc.poster.back_count).replace('{count}', String(ROWS.length)), doc.legend.windows, doc.windows.always, doc.legend.owasp,
    ...doc.sections.flatMap((x) => [x.name, x.tag, ...x.rows.flatMap((r) => [r.text, r.lead].filter(Boolean))]), `${m.close_line_plain} ${m.close_line_key}`, ...m.sites];
  if (fs.existsSync(POSTER_PDF)) {
    look(POSTER_PDF, 1, poster, 'poster front');
    look(POSTER_PDF, 2, back, 'poster back');
  } else missing.push('no out/poster.pdf');
  record('Text', !missing.length, missing.length ? `${missing.length} string(s) not in the PDF: ${missing.slice(0, 4).join('; ')}` : `all ${n} strings carousel.yaml puts on the 11 pages and both sides of the poster are in the PDF text`);
}

// ------------------------------------------------------------------ coverage report
function coverageReport() {
  if (!doc || !PRACTICES.size) return;
  const tally = {};
  const lines = ['## What the repository demonstrates', '', 'Coverage as `practices.yaml` records it for each row\'s practices. The carousel is the target, so a gap is reported here and fails nothing.', '', '| Page | Row | Practices | Coverage |', '|---|---|---|---|'];
  for (const { section, row } of ROWS) {
    const ids = list(row.practices);
    const cov = ids.map((id) => `${id} ${PRACTICES.get(id)?.coverage ?? 'unknown'}`);
    const kinds = new Set(ids.map((id) => PRACTICES.get(id)?.coverage));
    const verdict = !ids.length ? ({ dpra: 'DPRA, not in the deck', 'pipeline-view': 'pipeline view, not in the deck' }[row.source] || 'Q&A only') : [...kinds].every((k) => k === 'good+bad' || k === 'good-only') ? 'shown' : [...kinds].every((k) => k === 'not-shown') ? 'not shown' : 'partly shown';
    tally[verdict] = (tally[verdict] || 0) + 1;
    lines.push(`| ${section + 3} | ${short(row.lead ? `${row.lead}: ${row.text}` : row.text, 70)} | ${ids.join(', ') || 'none'} | ${cov.join(', ') || `none (source: ${row.source})`} |`);
  }
  report.push(
    ...lines,
    '',
    `Rows: ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ')}, of ${ROWS.length}. "Shown" means every cited practice is \`good+bad\` or \`good-only\`; "partly shown" means at least one is \`partial\` or \`not-shown\`.`,
    '',
  );
}

// ------------------------------------------------------------------ main
const NAME = Object.fromEntries(CHECKS.map((k) => [k, k.charAt(0).toUpperCase() + k.slice(1)]));
const unparsed = (k) => record(NAME[k], false, 'carousel.yaml does not parse');
if (want('schema')) safely('Schema', schemaCheck);
if (want('practices')) safely('Practices', practicesCheck);
else if (doc) {
  try {
    practicesCheck();
    results.pop(); // only the report's coverage needs it
  } catch {
    /* the report goes without coverage */
  }
}
if (want('phrasing')) safely('Phrasing', phrasingCheck);
if (want('receipt')) {
  if (doc) safely('Receipt', receiptCheck);
  else unparsed('receipt');
}
const BROWSER = ['fit', 'map', 'poster', 'fonts', 'offline', 'count'].filter(want);
if (BROWSER.length && !doc) BROWSER.forEach(unparsed);
else if (BROWSER.length) {
  let browser;
  try {
    const { chromium } = await import('../factory-video/playwright.mjs');
    browser = await chromium.launch();
    const carousel = await openCarousel(browser, doc);
    const m = await carousel.page.evaluate(measure);
    const poster = await openCarousel(browser, doc, POSTER);
    const pm = await poster.page.evaluate(measure);
    if (want('fit')) safely('Fit', () => fitCheck(m, pm));
    if (want('map')) safely('Map', () => mapCheck(m));
    if (want('poster')) safely('Poster', () => posterCheck(pm));
    if (want('fonts')) safely('Fonts', () => fontsCheck([carousel.ready, poster.ready]));
    if (want('offline')) safely('Offline', () => offlineCheck([carousel.log, poster.log]));
    if (want('count')) safely('Count', () => countCheck(m, pm));
  } catch (e) {
    const done = new Set(results.map((r) => r.name));
    for (const k of BROWSER) if (!done.has(NAME[k])) record(NAME[k], false, `the browser failed: ${String(e.message || e).split('\n')[0]}`);
  } finally {
    await browser?.close();
  }
}
for (const [k, fn] of [['pages', pagesCheck], ['text', textCheck]]) {
  if (!want(k)) continue;
  if (doc) safely(NAME[k], fn);
  else unparsed(k);
}
try {
  coverageReport();
} catch (e) {
  report.push(`The coverage report failed: ${e.message}`, '');
}
if (!results.length) record('Checks', false, 'no check ran');

const pad = (s, n) => String(s).padEnd(n);
const w = Math.max(...results.map((r) => r.name.length), 5);
const table = [`| ${pad('Check', w)} | Result | Detail |`, `|${'-'.repeat(w + 2)}|--------|--------|`, ...results.map((r) => `| ${pad(r.name, w)} | ${r.pass ? 'PASS  ' : 'FAIL  '} | ${r.detail} |`)];
const failed = results.filter((r) => !r.pass).length;
const summary = `${results.length - failed}/${results.length} checks passed.`;
console.log(`\n${table.join('\n')}\n\n${summary}`);
if (!ONLY) {
  fs.mkdirSync(OUT, { recursive: true });
  const head = ['# Practices carousel: check report', '', 'Written by `practices-carousel/verify.mjs` from `carousel.yaml` and `practices.yaml`.', '', '## Checks', '', ...table, '', summary, ''];
  fs.writeFileSync(path.join(OUT, 'report.md'), [...head, ...report].join('\n'));
}
process.exit(failed ? 1 : 0);
