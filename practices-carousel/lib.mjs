// Shared by render.mjs and verify.mjs: the content, the font pins and the one way the page is opened, so the
// checks measure the same layout the PDF is printed from.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { printReceipt } from './receipt-proof.mjs';

export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(DIR, '..');
export const OUT = path.join(DIR, 'out');
export const FONT_DIR = path.join(DIR, 'fonts');
export const PDF = path.join(OUT, 'who-gets-the-keys-carousel.pdf');
export const POSTER_PDF = path.join(OUT, 'poster.pdf');
export const POSTER_PNG = path.join(OUT, 'poster.png');
export const POSTER_BACK_PNG = path.join(OUT, 'poster-back.png');
export const WIDTH = 1080;
export const HEIGHT = 1350;
/** The one-page poster: the same content on one page, laid out like the factory. */
export const POSTER = { file: 'poster.html', width: 2400, height: 2200 };
const CAROUSEL = { file: 'carousel.html', width: WIDTH, height: HEIGHT };
export const pageUrl = (file) => pathToFileURL(path.join(DIR, file)).href;

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** carousel.yaml as text and as data. Throws when it does not parse. */
export function loadCarousel() {
  const text = fs.readFileSync(path.join(DIR, 'carousel.yaml'), 'utf8');
  const doc = YAML.parse(text, { prettyErrors: true, uniqueKeys: true });
  return { text, doc };
}

export function loadFonts() {
  return JSON.parse(fs.readFileSync(path.join(DIR, 'fonts.json'), 'utf8'));
}

/** Every row of every section, with the section it sits on. */
export function rowsOf(doc) {
  const sections = Array.isArray(doc?.sections) ? doc.sections : [];
  return sections.flatMap((s, i) => (Array.isArray(s?.rows) ? s.rows : []).map((row) => ({ section: i, name: s.name, row })));
}

/** Pages: cover, factory map, one per section, humans, close, and the receipt of a real run. */
export const pageCount = (doc) => 5 + (Array.isArray(doc?.sections) ? doc.sections.length : 0);

/**
 * Opens a template (carousel.html unless `template` names poster.html's) in a fresh context under print media, with
 * the content and the font list injected before any page script runs, and waits until the page has loaded its fonts,
 * fitted itself and drawn its lines. Every request, page error and console error is collected in `log`.
 */
let printed;
/** The receipt receipt-proof.mjs prints, once per process. */
export const printedReceipt = () => (printed ??= printReceipt());

export async function openCarousel(browser, doc, template = CAROUSEL, deviceScaleFactor = 1) {
  const { fonts } = loadFonts();
  const data = {
    doc,
    count: rowsOf(doc).length,
    pages: pageCount(doc),
    fonts: fonts.map((f) => ({ family: f.family, weight: f.weight, stretch: f.stretch, file: f.file })),
    // Page 11's lines, printed from verified evidence: the template shows them as they are.
    receipt: printedReceipt(),
  };
  const ctx = await browser.newContext({ viewport: { width: template.width, height: template.height }, deviceScaleFactor });
  await ctx.addInitScript((d) => {
    window.__CAROUSEL__ = d;
  }, data);
  const page = await ctx.newPage();
  const url = pageUrl(template.file);
  const log = { page: url, requests: [], errors: [], console: [] };
  page.on('request', (r) => log.requests.push(r.url()));
  page.on('requestfailed', (r) => log.errors.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('pageerror', (e) => log.errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') log.console.push(m.text());
  });
  await page.emulateMedia({ media: 'print' });
  await page.goto(url, { waitUntil: 'load' });
  const ready = await page.waitForFunction(() => window.__CAROUSEL_READY__, null, { timeout: 30000 }).then((h) => h.jsonValue());
  if (!ready.ok) log.errors.push(`page: ${ready.error}`);
  return { ctx, page, log, ready };
}

/** A non-file:// request, a page error or a console error. */
export function offlineProblems(log) {
  return [...log.requests.filter((u) => !u.startsWith('file://')).map((u) => `request ${u}`), ...log.errors, ...log.console];
}
