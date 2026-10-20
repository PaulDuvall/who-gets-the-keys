// Headless check of the built page, and the guided tour's narration lines (reused from an earlier private repository 469f0fd; docs/decisions/0001 here).
// usage: node smoke.cjs <page.html> <out_dir>
// Writes out_dir/preview.html, out_dir/tour.json, a screenshot at each width and one of each step wider
// than its width (overflow-<width>-<tab>-<step>.png), and prints one JSON
// line: {"errors": [...], "overflow": [...], "tour_entries": n, "browser": version}. Exits 1 if the page
// raised an error.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [PAGE, OUT] = process.argv.slice(2);
const WRAPPER_HEAD = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>[hidden]{display:none!important}body{margin:0}</style></head><body>";

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const preview = path.join(OUT, 'preview.html');
  // A fixed navigation target; the generated page is served to it (Semgrep playwright-goto-injection).
  const serve = async (page) => {
    await page.route('http://walkthrough.invalid/', (route) => route.fulfill({ contentType: 'text/html', body: fs.readFileSync(preview, 'utf8') }));
    await page.goto('http://walkthrough.invalid/');
  };
  fs.writeFileSync(preview, WRAPPER_HEAD + fs.readFileSync(PAGE, 'utf8') + '</body></html>');
  const browser = await chromium.launch();
  const errors = [];
  const overflow = [];
  try {
    for (const [width, height, scheme] of [[1280, 1300, 'light'], [400, 2600, 'dark']]) {
      const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${width}px: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`${width}px: ${m.text()}`); });
      await serve(page);
      await page.evaluate(() => window.walkthrough.pause());
      const tabs = await page.$$eval('.tab', (x) => x.map((t) => t.id));
      for (const id of tabs) {
        await page.evaluate((i) => document.getElementById(i).click(), id);
        const steps = await page.$$eval('.pip', (p) => p.length);
        for (let k = 0; k < steps; k++) {
          await page.evaluate((kk) => document.querySelector(`.pip[data-k="${kk}"]`).click(), k);
          const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          if (scrollWidth > width) {
            const shot = `overflow-${width}-${id}-${k + 1}.png`;
            await page.screenshot({ path: path.join(OUT, shot) });
            overflow.push(`${width}px ${id} step ${k + 1}: ${scrollWidth}px wide (${shot})`);
          }
        }
      }
      await page.evaluate(() => window.walkthrough.go(2));
      await page.screenshot({ path: path.join(OUT, `page-${width}.png`) });
      await ctx.close();
    }
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await serve(page);
    const tour = await page.evaluate(() => window.walkthrough.tour());
    await ctx.close();
    fs.writeFileSync(path.join(OUT, 'tour.json'), JSON.stringify(tour, null, 1));
    console.log(JSON.stringify({ errors, overflow, tour_entries: tour.length, browser: browser.version() }));
  } finally {
    await browser.close();
  }
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
