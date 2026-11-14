#!/usr/bin/env node
/*
 * render.mjs: carousel.yaml in, the carousel out.
 *
 *   node render.mjs
 *
 * Opens carousel.html in Chromium with the content injected (lib.mjs), waits for the fonts, the fit step and the
 * factory map, then writes:
 *   out/who-gets-the-keys-carousel.pdf   ten 1080 x 1350 px pages
 *   out/pages/p01.png ... p10.png        each page at 1080 x 1350
 *   out/contact.png                      all ten pages on one sheet
 *   out/poster.png, out/poster.pdf       the one-page poster (poster.html), 2400 x 2200, the PNG at 2x
 *   out/render-log.json                  every request and error, and each section page's --k
 * It exits nonzero if the page asked for anything that is not file://, raised an error or logged one.
 * Playwright comes from video/record's pinned package, through factory-video/playwright.mjs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '../factory-video/playwright.mjs';
import { HEIGHT, OUT, PDF, POSTER, POSTER_PDF, POSTER_PNG, WIDTH, loadCarousel, offlineProblems, openCarousel, pageCount } from './lib.mjs';

const PAGES = path.join(OUT, 'pages');
const pad = (n) => String(n).padStart(2, '0');

// Five pages across, two down, each at 30 %.
async function contactSheet(browser, files, log) {
  const tile = { w: WIDTH * 0.3, h: HEIGHT * 0.3, gap: 24 };
  const cols = 5;
  const rows = Math.ceil(files.length / cols);
  const W = cols * tile.w + (cols + 1) * tile.gap;
  const H = rows * tile.h + (rows + 1) * tile.gap;
  const cells = files
    .map((f, i) => {
      const x = tile.gap + (i % cols) * (tile.w + tile.gap);
      const y = tile.gap + Math.floor(i / cols) * (tile.h + tile.gap);
      return `<img src="${pathToFileURL(f).href}" style="left:${x}px;top:${y}px" width="${tile.w}" height="${tile.h}">`;
    })
    .join('');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carousel-sheet-'));
  const sheet = path.join(dir, 'sheet.html');
  fs.writeFileSync(sheet, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#c9cfd5}img{position:absolute;display:block}</style><body>${cells}</body>`);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('request', (r) => log.requests.push(r.url()));
  page.on('pageerror', (e) => log.errors.push(String(e)));
  await page.goto(pathToFileURL(sheet).href, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(OUT, 'contact.png') });
  await ctx.close();
  fs.rmSync(dir, { recursive: true, force: true });
  return `${W}x${H}`;
}

async function main() {
  const { doc } = loadCarousel();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(PAGES, { recursive: true });
  const browser = await chromium.launch();
  let log = { requests: [], errors: [], console: [] };
  let ready = null;
  try {
    const opened = await openCarousel(browser, doc);
    log = opened.log;
    ready = opened.ready;
    const { page, ctx } = opened;
    const slides = page.locator('.slide');
    const n = await slides.count();
    if (n !== pageCount(doc)) log.errors.push(`expected ${pageCount(doc)} pages, the page built ${n}`);
    const files = [];
    for (let i = 0; i < n; i++) {
      const file = path.join(PAGES, `p${pad(i + 1)}.png`);
      await slides.nth(i).screenshot({ path: file });
      files.push(file);
    }
    await page.pdf({
      path: PDF,
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await ctx.close();
    const size = await contactSheet(browser, files, log);
    console.log(`${n} pages -> ${path.relative(process.cwd(), PDF)}, out/pages/p01.png to p${pad(n)}.png, out/contact.png (${size})`);
    console.log(`--k by section page: ${Object.entries(ready.k || {}).map(([p, k]) => `p${p} ${k}`).join(', ')}`);

    // The poster: a PNG at 2x for zooming in, and a one-page PDF.
    const poster = await openCarousel(browser, doc, POSTER, 2);
    log.requests.push(...poster.log.requests);
    log.errors.push(...poster.log.errors);
    log.console.push(...poster.log.console);
    ready = { ...ready, pk: poster.ready.pk };
    await poster.page.locator('.poster').screenshot({ path: POSTER_PNG });
    await poster.page.pdf({ path: POSTER_PDF, width: `${POSTER.width}px`, height: `${POSTER.height}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    await poster.ctx.close();
    console.log(`poster -> out/poster.png (${POSTER.width * 2}x${POSTER.height * 2}), out/poster.pdf; --pk ${poster.ready.pk}`);
  } finally {
    await browser.close();
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'render-log.json'), JSON.stringify({ ...log, ready }, null, 2));
  }
  const problems = offlineProblems(log);
  if (problems.length) {
    console.error(`render failed:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
