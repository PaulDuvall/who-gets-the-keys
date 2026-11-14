// Shared by render.mjs and verify.mjs: the content, the font pins and the one way the page is opened, so the
// checks measure the same layout the PDF is printed from.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';

export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(DIR, '..');
export const OUT = path.join(DIR, 'out');
export const FONT_DIR = path.join(DIR, 'fonts');
export const PDF = path.join(OUT, 'who-gets-the-keys-carousel.pdf');
export const PAGE_URL = pathToFileURL(path.join(DIR, 'carousel.html')).href;
export const WIDTH = 1080;
export const HEIGHT = 1350;

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

/** Pages: cover, factory map, one per section, humans, close. */
export const pageCount = (doc) => 4 + (Array.isArray(doc?.sections) ? doc.sections.length : 0);

/**
 * Opens carousel.html in a fresh context under print media, with the content and the font list injected before
 * any page script runs, and waits until the page has loaded its fonts, fitted each section page and drawn the map.
 * Every request, page error and console error is collected in `log`.
 */
export async function openCarousel(browser, doc) {
  const { fonts } = loadFonts();
  const data = {
    doc,
    count: rowsOf(doc).length,
    pages: pageCount(doc),
    fonts: fonts.map((f) => ({ family: f.family, weight: f.weight, stretch: f.stretch, file: f.file })),
  };
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await ctx.addInitScript((d) => {
    window.__CAROUSEL__ = d;
  }, data);
  const page = await ctx.newPage();
  const log = { page: PAGE_URL, requests: [], errors: [], console: [] };
  page.on('request', (r) => log.requests.push(r.url()));
  page.on('requestfailed', (r) => log.errors.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('pageerror', (e) => log.errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') log.console.push(m.text());
  });
  await page.emulateMedia({ media: 'print' });
  await page.goto(PAGE_URL, { waitUntil: 'load' });
  const ready = await page.waitForFunction(() => window.__CAROUSEL_READY__, null, { timeout: 30000 }).then((h) => h.jsonValue());
  if (!ready.ok) log.errors.push(`page: ${ready.error}`);
  return { ctx, page, log, ready };
}

/** A non-file:// request, a page error or a console error. */
export function offlineProblems(log) {
  return [...log.requests.filter((u) => !u.startsWith('file://')).map((u) => `request ${u}`), ...log.errors, ...log.console];
}
