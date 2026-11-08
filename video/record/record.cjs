// Records the page's guided tour under Xvfb, entry by entry on the narration timeline (docs/decisions/0001).
// usage: node record.cjs --page <page.html> --timeline <timeline.json> --out <capture.mkv> --workdir <dir>
//          --width 1920 --height 1080 --fps 30 --display :97
// video/build.ts passes every value. The capture starts on a black cover. It keeps each frame's wall-clock
// time, shifted by a whole number of seconds, and the last line of output reports time zero on that clock: the
// moment the tour's first entry has been shown without the cover. video/build.ts starts the video at the
// cover's end, places each frame at its time less time zero, and adds the voice clips (SPEC-002-R10).
// Starts and stops its own Xvfb and ffmpeg only, by process handle.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
for (const key of ['page', 'timeline', 'out', 'workdir', 'width', 'height', 'fps', 'display']) {
  if (!args[key]) { console.error(`missing --${key}`); process.exit(2); }
}
const W = Number(args.width), H = Number(args.height), FPS = Number(args.fps), DISPLAY = args.display;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const timeline = JSON.parse(fs.readFileSync(args.timeline, 'utf8'));
const entries = timeline.entries;
const base = entries[0].start;
const WRAPPER_HEAD = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>[hidden]{display:none!important}body{margin:0}</style></head><body>";

(async () => {
  fs.mkdirSync(args.workdir, { recursive: true });
  // One pixel larger than the frame: a kiosk window on an exact-size screen opens at 1919x1079 and leaves a black edge.
  const xvfb = spawn('Xvfb', [DISPLAY, '-screen', '0', `${W + 1}x${H + 1}x24`, '-nolisten', 'tcp'], { stdio: 'ignore' });
  await sleep(800);
  let ffmpeg = null;
  let ctx = null;
  try {
    const recordPage = path.join(args.workdir, 'record.html');
    fs.writeFileSync(recordPage, WRAPPER_HEAD + fs.readFileSync(args.page, 'utf8') +
      "<div id='rec-black' style='position:fixed;inset:0;background:#000;z-index:99999'></div></body></html>");
    const profile = path.join(args.workdir, 'chrome-profile');
    fs.rmSync(profile, { recursive: true, force: true });
    ctx = await chromium.launchPersistentContext(profile, { headless: false, viewport: null, colorScheme: 'light', reducedMotion: 'no-preference',
      ignoreDefaultArgs: ['--enable-automation'], env: { ...process.env, DISPLAY },
      args: ['--kiosk', `--window-size=${W},${H}`, '--window-position=0,0', '--no-first-run', '--disable-sync', '--hide-scrollbars', '--disable-infobars', '--test-type', '--disable-background-networking'] });
    const pg = ctx.pages()[0] || await ctx.newPage();
    const errors = [];
    pg.on('pageerror', (e) => errors.push(e.message));
    // A fixed navigation target; the generated page is served to it (Semgrep playwright-goto-injection).
    await pg.route('http://walkthrough.invalid/', (route) => route.fulfill({ contentType: 'text/html', body: fs.readFileSync(recordPage, 'utf8') }));
    await pg.goto('http://walkthrough.invalid/');
    await pg.evaluate(() => document.fonts.ready);
    await sleep(600);
    const vp = await pg.evaluate(() => [innerWidth, innerHeight]);
    if (vp[0] !== W || vp[1] !== H) throw new Error(`viewport ${vp.join('x')}, expected ${W}x${H}`);
    await pg.evaluate(() => { window.walkthrough.pause(); window.walkthrough.setRecording(true); });
    const n = await pg.evaluate(() => window.walkthrough.tour().length);
    if (n !== entries.length) throw new Error(`tour has ${n} entries, timeline has ${entries.length}`);
    // Measure the tallest entry, then zoom the page so every entry fits.
    let maxH = 0;
    for (let i = 0; i < n; i++) {
      await pg.evaluate((k) => window.walkthrough.go(k), i);
      await sleep(900);
      maxH = Math.max(maxH, await pg.evaluate(() => document.querySelector('.wrap').scrollHeight));
    }
    const MIN_ZOOM = 0.9;  // below this the page's text is too small to read in the video
    let zoom = Math.max(MIN_ZOOM, Math.min(1.2, (vp[1] - 4) / maxH));
    const tallest = async () => {
      let t = 0;
      for (let i = 0; i < n; i++) {
        await pg.evaluate((k) => window.walkthrough.go(k), i);
        await sleep(900);
        t = Math.max(t, await pg.evaluate(() => document.querySelector('.wrap').getBoundingClientRect().height));
      }
      return t;
    };
    // A zoomed .wrap is narrower in CSS px and rewraps: re-measure and step down until every entry fits.
    for (;;) {
      await pg.evaluate((z) => { document.querySelector('.wrap').style.zoom = String(z); }, zoom);
      const height = await tallest();
      if (height <= vp[1] - 4) break;
      if (zoom <= MIN_ZOOM) throw new Error(`the tallest step is ${Math.ceil(height)} px at zoom ${zoom.toFixed(2)}, more than the ${vp[1] - 4} px that fit`);
      zoom = Math.max(MIN_ZOOM, zoom - 0.01);
    }
    // Pin the caption to the bottom of the frame: .wrap fills the viewport and its last row is the caption.
    await pg.evaluate((z) => { document.querySelector('.wrap').style.minHeight = (innerHeight / z) + 'px'; }, zoom);
    const summary = { viewport: vp, max_height: maxH, zoom: Number(zoom.toFixed(3)) };
    await pg.evaluate(() => window.walkthrough.go(0));
    await pg.mouse.move(W - 2, H - 2);
    await sleep(1200);
    // The capture's clock: wall-clock seconds less a whole number of them, so its times and time zero stay small numbers.
    const offset = Math.floor(Date.now() / 1000);
    // Each frame keeps its grab's own time (passthrough, -copyts), to the millisecond (-enc_time_base 1:1000; without it the encoder
    // rounds every time to 1/30 s, and two grabs can share one): a constant-rate capture would fill a gap in the grabs with the
    // previous frame, and a gap as the cover goes would then move every slide. The fastest preset and a deep input queue keep the
    // grabs on time: with libx264's medium preset the encode competed with the browser and the X server for the CPU, and the capture
    // missed grabs for over 60 ms dozens of times a minute, and for up to about 0.3 s (t-135). The build encodes the final video again.
    ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-thread_queue_size', '128',
      '-f', 'x11grab', '-draw_mouse', '0', '-video_size', `${W}x${H}`, '-framerate', String(FPS), '-i', DISPLAY,
      '-fps_mode', 'passthrough', '-copyts', '-output_ts_offset', String(-offset), '-enc_time_base', '1:1000',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', args.out], { stdio: ['pipe', 'ignore', 'inherit'] });
    // Listen for the capture's exit at once: an ffmpeg that fails early must stop the recording, not hang it.
    const captured = new Promise((r) => ffmpeg.on('exit', (code, signal) => r(code === null ? signal : code)));
    // A capture that exits just before it is told to quit makes that write fail; the exit check reports it.
    ffmpeg.stdin.on('error', () => {});
    await sleep(2000);
    const ended = () => (ffmpeg.exitCode !== null ? `exit status ${ffmpeg.exitCode}` : ffmpeg.signalCode !== null ? `signal ${ffmpeg.signalCode}` : null);
    if (ended()) throw new Error(`the screen capture stopped at once, with ${ended()}`);
    // Time zero is when the first entry is shown without the cover, so the tour's schedule counts from the painted frame, not from
    // the request to remove the cover. Render entry 0 again under the cover and let the browser paint it, so removing the cover is
    // a cheap repaint. Then, in one task, restart entry 0's entrance animations, which began under the cover, and remove the cover,
    // so the entrance plays from the uncovered frame; and wait for that frame to be painted. Two animation frames is the usual sign
    // that a change has been painted. The build places frames by this time, not by where the cover ends in the capture.
    await pg.evaluate(() => window.walkthrough.go(0));
    await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await pg.evaluate(() => new Promise((r) => {
      document.querySelectorAll('#slide, #slide *').forEach((e) => e.getAnimations().forEach((a) => { a.currentTime = 0; }));
      document.getElementById('rec-black').remove();
      requestAnimationFrame(() => requestAnimationFrame(() => r()));
    }));
    const t0 = Date.now();
    summary.time_zero = Number((t0 / 1000 - offset).toFixed(3));
    const captureAlive = () => { if (ended()) throw new Error(`the screen capture stopped during the tour, with ${ended()}`); };
    for (let i = 1; i < n; i++) {
      const at = t0 + (entries[i].start - base) * 1000;
      while (Date.now() < at - 15) { captureAlive(); await sleep(10); }
      await pg.evaluate((k) => window.walkthrough.go(k), i);
    }
    const end = t0 + (timeline.total - base) * 1000;
    while (Date.now() < end) { captureAlive(); await sleep(20); }
    captureAlive();
    ffmpeg.stdin.write('q');
    ffmpeg.stdin.end();
    const status = await captured;
    ffmpeg = null;
    if (status !== 0) throw new Error(`the screen capture ended with exit status ${status}`);
    if (errors.length) throw new Error(`page errors while recording: ${JSON.stringify(errors)}`);
    console.log(JSON.stringify(summary));
  } finally {
    if (ffmpeg) ffmpeg.kill('SIGINT');
    if (ctx) await ctx.close().catch(() => {});
    xvfb.kill('SIGTERM');
  }
})().catch((e) => { console.error(e); process.exit(1); });
