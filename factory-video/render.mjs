#!/usr/bin/env node
/*
 * render.mjs: Playwright frame stepper.
 *
 *   node render.mjs <html> <outDir> <fps>              frames f_0000.png ... for one loop, or for
 *                                                     the whole video if the page sets
 *                                                     window.DURATION_SECONDS (guided.html), at
 *                                                     window.FRAME_SIZE if set; writes shots.json
 *                                                     when the page has GUIDED_SHOTS
 *   node render.mjs <html> <outDir> --poster [--log f] poster.png (3840x2160) + poster.pdf
 *   node render.mjs <html> <outDir> --sheet [--log f]  contact-sheet.png: 6 frames of one loop
 *
 * Frames: Chromium at viewport 2400x1125, deviceScaleFactor 1. window.__RENDER_MODE__
 * is set before any page script runs. After document.fonts.ready, each frame calls
 * render(i / fps) and takes a screenshot.
 *
 * Every request and error is logged to <outDir>/render-log.json (or --log). The run
 * fails if the page made any non-file:// request or raised any error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from './playwright.mjs';

function usage() {
  console.error('usage: node render.mjs <html> <outDir> <fps>\n       node render.mjs <html> <outDir> --poster|--sheet [--log <file>]');
  process.exit(2);
}

async function open(browser, url, viewport, dsf, log) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf });
  await ctx.addInitScript(() => {
    window.__RENDER_MODE__ = true;
  });
  const page = await ctx.newPage();
  page.on('request', (r) => log.requests.push(r.url()));
  page.on('pageerror', (e) => log.errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') log.console.push(m.text());
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}

async function renderFrames(browser, url, outDir, fps, log) {
  for (const f of fs.readdirSync(outDir)) if (/^f_\d+\.png$/.test(f)) fs.unlinkSync(path.join(outDir, f));
  const { ctx, page } = await open(browser, url, { width: 2400, height: 1125 }, 1, log);
  const loop = await page.evaluate(() => window.DURATION_SECONDS || window.LOOP_SECONDS);
  if (!loop) throw new Error('page exposes neither window.DURATION_SECONDS nor window.LOOP_SECONDS');
  // A page can ask for a taller frame (guided.html adds a caption strip below the scene).
  const size = await page.evaluate(() => window.FRAME_SIZE || null);
  if (size) await page.setViewportSize(size);
  // The guided page's shot timings, for narrate.py's soundtrack mix.
  const shots = await page.evaluate(() => (window.GUIDED_SHOTS ? { duration: window.DURATION_SECONDS, shots: window.GUIDED_SHOTS } : null));
  if (shots) fs.writeFileSync(path.join(outDir, 'shots.json'), JSON.stringify(shots, null, 1));
  const n = Math.round(loop * fps);
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.render(t), i / fps);
    await page.screenshot({ path: path.join(outDir, `f_${String(i).padStart(4, '0')}.png`) });
  }
  await ctx.close();
  console.log(`${n} frames at ${fps} fps -> ${outDir} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

async function renderPoster(browser, url, outDir, log) {
  const shot = await open(browser, url, { width: 2400, height: 1350 }, 1.6, log);
  await shot.page.screenshot({ path: path.join(outDir, 'poster.png') });
  await shot.ctx.close();
  const doc = await open(browser, url, { width: 2400, height: 1350 }, 1, log);
  await doc.page.emulateMedia({ media: 'screen' });
  await doc.page.pdf({
    path: path.join(outDir, 'poster.pdf'),
    width: '2400px',
    height: '1350px',
    printBackground: true,
    pageRanges: '1',
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  await doc.ctx.close();
  console.log(`poster.png (3840x2160) + poster.pdf -> ${outDir}`);
}

// Contact sheet: six frames of one loop with what each shows. The tiles are written
// next to the log file and laid out by a small local page, so nothing is fetched.
const SHEET = [
  [0, 'T-0044 in the checks of record; T-0043 queued at the intake'],
  [3, "T-0042's patch heads to in-run checks; T-0044 heads for promote"],
  [6, 'T-0043 enters the Agent; a human takes issue #4821'],
  [9, 'SPEC-118 rev 2 queues; T-0042 heads for promote'],
  [12, 'T-0042 deployed: the key turned, Production opened'],
  [15, 'T-0043 deployed; trusted signal T-0044 starts'],
];
async function renderSheet(browser, url, outDir, tilesDir, log) {
  fs.mkdirSync(tilesDir, { recursive: true });
  const { ctx, page } = await open(browser, url, { width: 2400, height: 1125 }, 1, log);
  for (const [t] of SHEET) {
    await page.evaluate((tt) => window.render(tt), t);
    await page.screenshot({ path: path.join(tilesDir, `t-${String(t).padStart(2, '0')}.png`) });
  }
  await ctx.close();
  const tile = { w: 960, h: 450, cap: 56, gap: 24 };
  const W = 3 * tile.w + 4 * tile.gap;
  const H = 2 * (tile.h + tile.cap) + 3 * tile.gap;
  const cells = SHEET.map(([t, cap], i) => {
    const x = tile.gap + (i % 3) * (tile.w + tile.gap);
    const y = tile.gap + Math.floor(i / 3) * (tile.h + tile.cap + tile.gap);
    return `<figure style="left:${x}px;top:${y}px"><img src="t-${String(t).padStart(2, '0')}.png" width="${tile.w}" height="${tile.h}"><figcaption><b>${t} s</b> ${cap}</figcaption></figure>`;
  }).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;background:#f4f1ea;font-family:'Liberation Sans',Arial,sans-serif}
    figure{position:absolute;margin:0;width:${tile.w}px}
    img{display:block;border:2px solid #d9d2c3;box-sizing:border-box}
    figcaption{height:${tile.cap}px;line-height:${tile.cap}px;font-size:24px;color:#6e675b;white-space:nowrap}
    b{color:#b53322;margin-right:10px}</style><body>${cells}</body>`;
  const sheetHtml = path.join(tilesDir, 'sheet.html');
  fs.writeFileSync(sheetHtml, html);
  const sheet = await open(browser, pathToFileURL(sheetHtml).href, { width: W, height: H }, 1, log);
  await sheet.page.screenshot({ path: path.join(outDir, 'contact-sheet.png') });
  await sheet.ctx.close();
  console.log(`contact-sheet.png (${W}x${H}, frames at ${SHEET.map(([t]) => t).join(', ')} s) -> ${outDir}`);
}

async function main() {
  const args = process.argv.slice(2);
  const [html, outDir, mode] = args;
  if (!html || !outDir || !mode) usage();
  const poster = mode === '--poster';
  const sheet = mode === '--sheet';
  const fps = poster || sheet ? 0 : Number(mode);
  if (!poster && !sheet && !(fps > 0)) usage();
  const li = args.indexOf('--log');
  const logFile = li >= 0 ? args[li + 1] : path.join(outDir, poster ? 'poster-log.json' : sheet ? 'sheet-log.json' : 'render-log.json');
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.dirname(logFile), { recursive: true });

  const url = pathToFileURL(path.resolve(html)).href;
  const log = { page: url, requests: [], errors: [], console: [] };
  const browser = await chromium.launch();
  try {
    if (poster) await renderPoster(browser, url, outDir, log);
    else if (sheet) await renderSheet(browser, url, outDir, path.join(path.dirname(logFile), 'sheet'), log);
    else await renderFrames(browser, url, outDir, fps, log);
  } finally {
    await browser.close();
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
  }
  const net = log.requests.filter((u) => !u.startsWith('file://'));
  if (net.length || log.errors.length || log.console.length) {
    console.error('render failed:', JSON.stringify({ network: net, errors: log.errors, console: log.console }, null, 2));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
