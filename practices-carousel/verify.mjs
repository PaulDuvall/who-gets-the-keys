#!/usr/bin/env node
/*
 * verify.mjs: the checks for the practices carousel. Prints one PASS or FAIL row per check, writes the same table
 * and the report below it to out/report.md, and exits nonzero on any FAIL.
 *
 *   node verify.mjs                  every check; render.mjs must have written out/ first
 *   node verify.mjs --only schema,practices,phrasing
 *
 * Schema, Practices and Phrasing read only carousel.yaml and practices.yaml, so they need no browser. The others need
 * Chromium (Playwright from factory-video/playwright.mjs), pdfinfo, pdffonts and pdftotext.
 *
 * The report also lists the coverage practices.yaml records for each row's IDs. Like the factory video, the carousel
 * is the target: a practice the repository does not demonstrate yet is a gap to report, and the check still passes.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { DIR, FONT_DIR, HEIGHT, OUT, PDF, ROOT, WIDTH, loadCarousel, loadFonts, offlineProblems, openCarousel, pageCount, rowsOf, sha256 } from './lib.mjs';

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: String(detail).replace(/\|/g, '/').replace(/\n/g, ' ') });
}
const report = [];

const args = process.argv.slice(2);
const onlyAt = args.indexOf('--only');
const ONLY = onlyAt >= 0 ? new Set(String(args[onlyAt + 1] || '').split(',')) : null;
const want = (k) => !ONLY || ONLY.has(k);

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
  need(doc.legend, ['windows', 'untagged', 'diy'], 'legend');
  need(doc.factory, ['heading', 'lede', 'edge'], 'factory');
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
  if (!Array.isArray(doc.sections) || !doc.sections.length) bad.push('sections is missing');
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
  let qa = 0;
  for (const { row, name } of ROWS) {
    const ids = list(row?.practices);
    for (const id of ids) {
      cited.add(id);
      if (!PRACTICES.has(id)) bad.push(`${name}: "${short(row.text, 40)}" cites ${id}, which practices.yaml does not define`);
    }
    if (!ids.length && row?.source !== 'qa') bad.push(`${name}: "${short(row?.text, 40)}" cites no practice and is not source: qa`);
    if (!ids.length && row?.source === 'qa') qa++;
  }
  const uncited = [...PRACTICES.keys()].filter((id) => !cited.has(id));
  report.push('## Practices no row cites', '', uncited.length ? `${uncited.join(', ')}: in practices.yaml, on no carousel row. This is reported, and does not fail the check.` : 'None.', '');
  record('Practices', !bad.length, bad.length ? bad.slice(0, 4).join('; ') : `${cited.size} of ${PRACTICES.size} practices.yaml IDs cited; ${qa} row(s) from the Q&A only; not cited: ${uncited.join(', ') || 'none'}`);
}

// Phrasing: the patterns the owner rejects, in every string and comment of carousel.yaml except tool URLs.
const PHRASING = [
  ['em dash', /—/],
  // "--" used as a dash. A command-line flag, such as the tool name "pip --require-hashes", is not one.
  ['double hyphen', /--(?![a-z])|(?<=\S)--/],
  ['"not just"', /\bnot just\b/i],
  ['comma then "not"', /,\s*not\b/i],
  ['sentence starting "Not"', /(^|[.!?]["')\]]?\s+)Not\b/],
  ['"never"', /\bnever\b/i],
  ['"Here\'s"', /\bhere['’]s\b/i],
  ['stock word', /\b(delve|unlock|harness|robust|crucial|pivotal|landscape|ecosystem|transformative|cutting-edge|game-changer|seamless)\b/i],
];
function phrasingCheck() {
  if (parsed.error) return record('Phrasing', false, 'carousel.yaml does not parse');
  const texts = [];
  const pdoc = YAML.parseDocument(parsed.text);
  for (const c of [pdoc.commentBefore, pdoc.comment]) if (c) texts.push(['comment', c]);
  YAML.visit(pdoc, (_, node, pathTo) => {
    for (const c of [node?.commentBefore, node?.comment]) if (c) texts.push(['comment', c]);
    if (YAML.isPair(node)) {
      const key = node.key?.value;
      if (typeof key === 'string') texts.push(['key', key]);
      if (YAML.isScalar(node.value) && typeof node.value.value === 'string' && key !== 'url') texts.push([key, node.value.value]);
    }
    if (YAML.isScalar(node) && YAML.isSeq(pathTo[pathTo.length - 1]) && typeof node.value === 'string') texts.push(['item', node.value]);
  });
  const hits = [];
  for (const [where, t] of texts) for (const [label, re] of PHRASING) if (re.test(t)) hits.push(`${label} in ${where}: "${short(t, 50)}"`);
  const unique = [...new Set(hits)];
  record('Phrasing', !unique.length, unique.length ? unique.slice(0, 5).join('; ') : `${texts.length} strings, keys and comments read; none matches the ${PHRASING.length} rejected patterns`);
}

// ------------------------------------------------------------------ PDF
function pdfText(page) {
  return execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-raw', '-enc', 'UTF-8', PDF, '-'], { encoding: 'utf8' });
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
  const ok = pages === 10 && sizes.length === 10 && !wrong.length;
  record('Pages', ok, `${pages} pages${pages === 10 ? '' : ', not 10'}; ${wrong.length ? wrong.join(', ') : `each 810 x 1013.04 pt, which is ${WIDTH} x ${HEIGHT} px as Chromium rounds it`}`);
}

function fontsCheck(ready) {
  const bad = [];
  let pins;
  try {
    pins = loadFonts();
  } catch (e) {
    return record('Fonts', false, `fonts.json does not parse: ${e.message}`);
  }
  for (const s of list(pins.sources)) if (!/^https:\/\//.test(String(s.licence_url)) || !/Open Font License/.test(String(s.licence))) bad.push(`source ${s.name} names no OFL licence URL`);
  for (const f of list(pins.fonts)) {
    if (!/^https:\/\/.*\/[0-9a-f]{40}\//.test(String(f.url))) bad.push(`${f.file}: url is not pinned to a commit`);
    if (!/^[0-9a-f]{64}$/.test(String(f.sha256))) bad.push(`${f.file}: sha256 is not 64 hex digits`);
    const file = path.join(FONT_DIR, String(f.file));
    if (!fs.existsSync(file)) bad.push(`${f.file}: not downloaded`);
    else if (sha256(fs.readFileSync(file)) !== f.sha256) bad.push(`${f.file}: SHA-256 differs from fonts.json`);
  }
  const notLoaded = list(ready?.fonts).filter((s) => !/: loaded$/.test(s));
  if (notLoaded.length || !list(ready?.fonts).length) bad.push(`not loaded in the page: ${notLoaded.join(', ') || 'none reported'}`);
  let names = [];
  if (!fs.existsSync(PDF)) bad.push('no PDF');
  else if (!hasTool('pdffonts')) bad.push('pdffonts not installed (poppler-utils)');
  else {
    const rows = execFileSync('pdffonts', [PDF], { encoding: 'utf8' }).trim().split('\n').slice(2);
    names = rows.map((l) => l.split(/\s+/)[0].replace(/^[A-Z]{6}\+/, ''));
    rows.forEach((l, i) => {
      if (!/\s+yes\s+(yes|no)\s+(yes|no)\s+\d+\s+\d+\s*$/.test(l)) bad.push(`${names[i]} is not embedded`);
    });
    for (const fam of ['Archivo', 'IBMPlexSans', 'IBMPlexMono']) if (!names.some((n) => n.startsWith(fam))) bad.push(`${fam} is missing from the PDF`);
    const stray = names.filter((n) => !/^(Archivo|IBMPlex)/.test(n));
    if (stray.length) bad.push(`fonts that fonts.json does not pin: ${stray.join(', ')}`);
  }
  record('Fonts', !bad.length, bad.length ? bad.slice(0, 5).join('; ') : `${list(pins.fonts).length} files match fonts.json; ${names.length} fonts in the PDF, all embedded: ${names.join(', ')}`);
}

// ------------------------------------------------------------------ browser
// Measures every page in a fresh copy of the page that render.mjs printed, through the same lib.mjs path.
function measure() {
  const rect = (e) => e.getBoundingClientRect();
  const meet = (a, b, eps = 0.5) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > eps && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > eps;
  const inside = (a, b, eps = 1) => a.left >= b.left - eps && a.right <= b.right + eps && a.top >= b.top - eps && a.bottom <= b.bottom + eps;
  const out = { pages: [], meta: [], map: null, count: null };
  for (const s of document.querySelectorAll('.slide')) {
    const r = rect(s);
    const cs = getComputedStyle(s);
    const content = { left: r.left + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.paddingRight), top: r.top + parseFloat(cs.paddingTop), bottom: r.bottom - parseFloat(cs.paddingBottom) };
    const outside = [];
    // The factory's edge and the wires may reach into the margins, never past the page. A marker's shape has no
    // box of its own (0 x 0 at the document's origin), so empty boxes are skipped.
    const name = (e) => `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className ? `.${e.className}` : ''} "${(e.textContent || '').trim().slice(0, 30)}"`;
    for (const e of s.querySelectorAll('*')) {
      const b = rect(e);
      if (b.width === 0 && b.height === 0) continue;
      if (!inside(b, e.closest('.edge, .wires') ? r : content)) outside.push(name(e));
    }
    const page = { n: Number(s.dataset.page), kind: s.dataset.kind, k: s.style.getPropertyValue('--k') || null, scroll: s.scrollHeight > s.clientHeight || s.scrollWidth > s.clientWidth, outside: outside.slice(0, 3), rowsAboveLegend: true };
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
  const map = document.querySelector('.fmap');
  if (map) {
    const boxes = Object.fromEntries([...map.querySelectorAll('.fbox')].map((b) => [b.dataset.box, { r: rect(b), on: b.querySelector('.on')?.textContent, mark: b.querySelector('.mark')?.textContent || null }]));
    const edge = rect(map.querySelector('.edge'));
    const sizes = [];
    const walker = document.createTreeWalker(map, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (n.textContent.trim()) sizes.push([parseFloat(getComputedStyle(n.parentElement).fontSize), n.textContent.trim().slice(0, 24)]);
    }
    for (const n of [map.querySelector('.edge .label')]) if (n) sizes.push([parseFloat(getComputedStyle(n).fontSize), n.textContent]);
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
      inEdge: ['sandbox', 'pipeline', 'policy'].filter((n) => boxes[n] && inside(boxes[n].r, edge, 0)),
      outEdge: ['spec', 'production', 'humans', 'inspector'].filter((n) => boxes[n] && !meet(boxes[n].r, edge, 0)),
      overlaps,
      wires: map.querySelectorAll('.wires > path').length,
    };
  }
  out.count = document.querySelector('.cover .count')?.textContent ?? null;
  return out;
}

function fitCheck(m) {
  const bad = [];
  for (const p of m.pages) {
    if (p.scroll) bad.push(`page ${p.n} overflows`);
    if (p.outside.length) bad.push(`page ${p.n} has content outside its margins: ${p.outside.join(', ')}`);
    if (!p.rowsAboveLegend) bad.push(`page ${p.n}: rows run into the legend`);
    if (p.kind === 'section') {
      const k = Number(p.k);
      if (!(k >= 0.8 && k <= 1.5)) bad.push(`page ${p.n}: --k ${p.k} is outside 0.8 to 1.5`);
    }
  }
  for (const r of m.meta) if (r.wide || r.under) bad.push(`page ${r.page}: tools run under the tags on "${r.row}"`);
  const ks = m.pages.filter((p) => p.kind === 'section');
  report.push('## Fit', '', '| Page | Section | --k |', '|---|---|---|', ...ks.map((p, i) => `| ${p.n} | ${doc.sections[i]?.name} | ${p.k} |`), '');
  record('Fit', !bad.length, `${bad.length ? `${bad.slice(0, 4).join('; ')}. ` : ''}--k: ${ks.map((p) => `p${p.n} ${p.k}`).join(', ')}`);
}

function mapCheck(m) {
  const map = m.map;
  if (!map) return record('Map', false, 'page 2 has no factory map');
  const bad = [];
  const flowAt = { spec: 0, sandbox: 1, pipeline: 2, production: 3 };
  const label = (p) => `${list(p).length > 1 ? 'pp.' : 'p.'} ${list(p).join(', ')}`;
  const boxes = { ...Object.fromEntries(Object.entries(flowAt).map(([k, i]) => [k, doc.factory.flow[i]])), policy: doc.factory.around[0], inspector: doc.factory.around[1], humans: doc.factory.around[2] };
  for (const [k, b] of Object.entries(boxes)) if (map.on[k] !== label(b?.page)) bad.push(`${k} shows "${map.on[k]}", not "${label(b?.page)}"`);
  const biggest = Object.entries(map.area).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (biggest !== 'pipeline') bad.push(`the largest box is ${biggest}, not the pipeline`);
  if (map.mark !== doc.factory.flow[2]?.mark) bad.push('the pipeline is not marked with its mark');
  if (map.minSize < 26) bad.push(`text below 26 px: ${map.smallest.join(', ')}`);
  if (map.inEdge.length !== 3) bad.push(`inside the factory's edge: ${map.inEdge.join(', ')}; want sandbox, pipeline, policy`);
  if (map.outEdge.length !== 4) bad.push(`outside the factory's edge: ${map.outEdge.join(', ')}; want spec, production, humans, inspector`);
  if (map.overlaps.length) bad.push(`boxes overlap: ${map.overlaps.join(', ')}`);
  if (map.wires !== 7) bad.push(`${map.wires} wires drawn, not 7`);
  record('Map', !bad.length, bad.length ? bad.join('; ') : `7 boxes, none overlapping; the pipeline is the largest (${map.area.pipeline} px²) and marked; sandbox, pipeline and policy inside the edge, spec, production, humans and inspector outside; smallest map text ${map.minSize} px`);
}

function offlineCheck(log) {
  let renderLog = null;
  try {
    renderLog = JSON.parse(fs.readFileSync(path.join(OUT, 'render-log.json'), 'utf8'));
  } catch {
    return record('Offline', false, 'missing out/render-log.json; run render.mjs first');
  }
  const problems = [...offlineProblems(renderLog).map((p) => `render: ${p}`), ...offlineProblems(log).map((p) => `verify: ${p}`)];
  const n = renderLog.requests.length + log.requests.length;
  record('Offline', !problems.length, problems.length ? problems.slice(0, 4).join('; ') : `${n} requests across render and verify, all file://; no page or console error`);
}

function countCheck(m) {
  const rows = ROWS.length;
  const page1 = fs.existsSync(PDF) && hasTool('pdftotext') ? norm(pdfText(1)) : '';
  const ok = m.count === String(rows) && page1.includes(norm(`${rows} practices`));
  record('Count', ok, `${rows} rows in carousel.yaml; the cover says ${m.count ?? 'nothing'} in the page and ${page1.includes(norm(`${rows} practices`)) ? `"${rows} practices"` : 'something else'} in the PDF`);
}

// Text: every string carousel.yaml puts on a page is in that page of the PDF, as pdftotext reads it.
function textCheck() {
  if (!fs.existsSync(PDF) || !hasTool('pdftotext')) return record('Text', false, 'no PDF, or pdftotext not installed');
  const m = doc.meta;
  const f = doc.factory;
  const expect = {
    1: [m.title, `${m.thesis_key} ${m.thesis_rest}`, String(m.subtitle).replace('{count}', String(ROWS.length)), m.byline, ...['before', 'seconds', 'minutes', 'hours'].map((k) => doc.windows[k])],
    2: [f.heading, f.lede, f.edge, ...[...f.flow, ...f.around].flatMap((b) => [b.name, b.text, b.mark].filter(Boolean))],
  };
  doc.sections.forEach((s, i) => {
    expect[i + 3] = [s.name, s.tag, s.blurb, doc.legend.windows, doc.windows.always, doc.legend.untagged, doc.legend.diy, ...s.rows.flatMap((r) => [r.text, r.lead, r.ref, ...list(r.tools).map((t) => t.name), doc.where[r.where]].filter(Boolean))];
  });
  const h = doc.humans;
  expect[PAGES - 1] = [h.heading, ...h.rows.flatMap((r) => [r.label, r.text, r.note]), h.day_one.heading, ...h.day_one.items, h.day_one.end];
  const c = doc.close;
  expect[PAGES] = [c.heading, ...c.items.flatMap((i) => [i.verb, i.what, i.how]), `${m.close_line_plain} ${m.close_line_key}`, m.byline, ...m.sites];
  const missing = [];
  let n = 0;
  for (const [page, strings] of Object.entries(expect)) {
    const text = norm(pdfText(Number(page)));
    for (const s of strings) {
      n++;
      if (!text.includes(norm(s))) missing.push(`page ${page}: "${short(s, 40)}"`);
    }
  }
  record('Text', !missing.length, missing.length ? `${missing.length} string(s) not in the PDF: ${missing.slice(0, 4).join('; ')}` : `all ${n} strings carousel.yaml puts on the 10 pages are in the PDF text`);
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
    const verdict = !ids.length ? 'Q&A only' : [...kinds].every((k) => k === 'good+bad' || k === 'good-only') ? 'shown' : [...kinds].every((k) => k === 'not-shown') ? 'not shown' : 'partly shown';
    tally[verdict] = (tally[verdict] || 0) + 1;
    lines.push(`| ${section + 3} | ${short(row.lead ? `${row.lead}: ${row.text}` : row.text, 70)} | ${ids.join(', ') || 'none'} | ${cov.join(', ') || 'none (source: qa)'} |`);
  }
  report.push(
    ...lines,
    '',
    `Rows: ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ')}, of ${ROWS.length}. "Shown" means every cited practice is \`good+bad\` or \`good-only\`; "partly shown" means at least one is \`partial\` or \`not-shown\`.`,
    '',
  );
}

// ------------------------------------------------------------------ main
if (want('schema')) schemaCheck();
if (want('practices') || want('report')) practicesCheck();
if (want('phrasing')) phrasingCheck();
const BROWSER = ['fit', 'map', 'fonts', 'offline', 'count'];
if (doc && BROWSER.some(want)) {
  const { chromium } = await import('../factory-video/playwright.mjs');
  const browser = await chromium.launch();
  try {
    const { page, log, ready } = await openCarousel(browser, doc);
    const m = await page.evaluate(measure);
    if (want('fit')) fitCheck(m);
    if (want('map')) mapCheck(m);
    if (want('fonts')) fontsCheck(ready);
    if (want('offline')) offlineCheck(log);
    if (want('count')) countCheck(m);
  } finally {
    await browser.close();
  }
}
if (doc && want('pages')) pagesCheck();
if (doc && want('text')) textCheck();
coverageReport();

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
