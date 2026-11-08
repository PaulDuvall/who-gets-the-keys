/*
 * loop.js: the 18 s factory loop, shared by slide.html and guided.html.
 * The factory model (decision 0004), one 18 s loop. Humans approve the intent and
 * the factory; the pipeline decides every change. Each human decision is always on
 * screen in the human colour; a pale halo marks the moment a spec is signed. A human
 * may also approve a deploy: optional, so it is dashed on the Production card and never
 * animates.
 *
 *   0-2 s    The approver signs SPEC-118 (key, then touch). It becomes task T-0042.
 *   2-5 s    The Agent returns a patch. In-run checks fail it once (RETRY 1/3); attempt 2 passes.
 *   3-9 s    Side lane: issue #4821 reaches Untrusted input and stops at the sandbox wall
 *            (NO RUN). A human turns it into a spec, signs it, and SPEC-118 rev 2 queues as T-0043.
 *   5-9 s    The checks of record: Build/test/scan, Scope, then Property, Mutation, Validator.
 *   9-10 s   The patch crosses "promote · out of reach" and becomes a promoted change.
 *   10-12 s  Deploy, the pipeline's last stage, verifies the receipt; the key turns; Production opens.
 *   12-18 s  Telemetry returns along HOURS; the alarm creates task T-0044 with no human.
 *
 * Three runs share the conveyor, staggered: T-0042 (the signed spec), T-0043 (last loop's
 * issue, via its rev-2 spec) and T-0044 (the trusted signal), which wraps into the next loop.
 *
 * render(t) is a pure function of t mod 18: no randomness, timers or clock reads.
 * Time is quantised to whole microseconds so t and t + 18 render identical SVG.
 */
(function () {
  'use strict';
  const { TIME, L, STATIONS, PANEL_ROWS, RECEIPTS, seg, ease, easeOut, lerp, mod, pointOnPath } = Scene;
  const LOOP = TIME.LOOP;
  const US_LOOP = Math.round(LOOP * 1e6);
  const X = L.stationX;
  const PIPE = L.pipeK;
  const DOT = Scene.DOT;

  const bump = (p, a, peak, b) => (p <= a || p >= b ? 0 : p < peak ? (p - a) / (peak - a) : 1 - (p - peak) / (b - peak));
  const loopTime = (t) => {
    let us = Math.round(mod(t, LOOP) * 1e6);
    if (us >= US_LOOP) us -= US_LOOP;
    return us / 1e6;
  };

  // ------------------------------------------------------------- runs
  // A standard run, from the moment its task reaches the Agent at t0.
  function standard(t0) {
    const at = (a, b) => [t0 + a, t0 + b];
    return [
      { k: 0, t: at(0, 0.8), agent: true, first: true },
      { move: [0, 1], t: at(0.8, 1.3) },
      { k: 1, t: at(1.3, 1.9) },
      { move: [1, 2], t: at(1.9, 2.4) },
      { k: 2, t: at(2.4, 4.0) },
      { move: [2, 3], t: at(4.0, 4.5) },
      { k: 3, t: at(4.5, 5.8) },
      { move: [3, 4], t: at(5.8, 6.8) },
      { k: 4, t: at(6.8, 8.2) },
      { move: [4, 5], t: at(8.2, 8.8) },
    ];
  }
  const RUNS = [
    {
      id: '#4822',
      task: 'T-0042',
      from: 'spec',
      start: 1.0,
      phases: [
        { k: 0, t: [2.0, 2.8], agent: true, first: true },
        { move: [0, 1], t: [2.8, 3.3] },
        { k: 1, t: [3.3, 3.9], fail: true }, // RETRY 1/3
        { move: [1, 0], t: [3.9, 4.3] },
        { k: 0, t: [4.3, 4.5], agent: true },
        { move: [0, 1], t: [4.5, 4.8] },
        { k: 1, t: [4.8, 5.1] },
        { move: [1, 2], t: [5.1, 5.6] },
        { k: 2, t: [5.6, 7.2] },
        { move: [2, 3], t: [7.2, 7.7] },
        { k: 3, t: [7.7, 9.0] },
        { move: [3, 4], t: [9.0, 10.0] },
        { k: 4, t: [10.0, 11.4] },
        { move: [4, 5], t: [11.4, 12.0] },
      ],
    },
    { id: '#4821 fix', task: 'T-0043', from: 'queue', start: 5.4, phases: standard(6.4) },
    // Starts 0.1 s before T-0043 slips behind Production, so the conveyor is never empty.
    { id: '#4823', task: 'T-0044', from: 'telemetry', start: 14.25, phases: standard(14.9) },
  ];
  for (const r of RUNS) {
    r.end = r.phases[r.phases.length - 1].t[1];
    r.prodMove = r.phases[r.phases.length - 1];
  }
  // A run's own clock: loop time, or loop time + 18 for the part that wraps.
  const runTime = (r, tt) => (tt >= r.start ? tt : tt + LOOP);
  const live = (r, u) => u >= r.start && u <= r.end;

  function phaseAt(r, u) {
    for (let i = 0; i < r.phases.length; i++) {
      const ph = r.phases[i];
      if (u >= ph.t[0] && u < ph.t[1]) return { ph, i, q: (u - ph.t[0]) / (ph.t[1] - ph.t[0]) };
    }
    return null;
  }
  // When the run passes each checking station (the dwell that does not fail).
  function passTime(r, k) {
    const ph = r.phases.filter((p) => p.k === k && !p.fail).pop();
    return ph ? ph.t[0] + 0.75 * (ph.t[1] - ph.t[0]) : Infinity;
  }
  // Scope lights at 62% of the Build, test, scan dwell.
  function scopeTime(r) {
    const ph = r.phases.find((p) => p.k === 2);
    return ph.t[0] + 0.62 * (ph.t[1] - ph.t[0]);
  }

  // -------------------------------------------------------------- items
  function itemFor(r, tt) {
    const u = runTime(r, tt);
    if (!live(r, u)) return null;
    const first = r.phases[0];
    if (u < first.t[0]) return null;
    const at = phaseAt(r, u) || { ph: r.prodMove, i: r.phases.length - 1, q: 1 };
    const { ph, q } = at;
    let x;
    if (ph.move) x = lerp(X(ph.move[0]), X(ph.move[1]), ease(q));
    else x = X(ph.k);
    let y = L.item.cy;
    let scale = 1;
    let alpha = 1;
    const fq = seg(u, first.t[0], first.t[1]);
    const d = seg(fq, 0.05, 0.5);
    if (d < 1) {
      const e = easeOut(d);
      y = lerp(L.item.dropFrom, L.item.cy, e);
      scale = lerp(0.35, 1, e);
      alpha = Math.min(1, d * 4);
    }
    // The patch becomes a promoted change only as it crosses the promote marker.
    const promotedMix = seg(x, L.promoteX - 30, L.promoteX + 30);
    const icons = [['patch', 1 - promotedMix], ['promoted', promotedMix]];
    const badges = [['bot', seg(fq, 0.35, 0.55)]];
    const lines = [];
    for (let i = 0; i < 3; i++) lines.push({ type: 'prov', a: seg(fq, 0.5 + 0.13 * i, 0.6 + 0.13 * i) });
    for (const k of L.checkStations) {
      const p = passTime(r, k);
      lines.push({ type: 'check', a: seg(u, p, p + 0.12) });
    }
    const pipe = r.phases.find((p) => p.k === PIPE);
    const pd = pipe.t[1] - pipe.t[0];
    lines.push({ type: 'sig', a: seg(u, pipe.t[0] + 0.2 * pd, pipe.t[0] + 0.25 * pd), draw: seg(u, pipe.t[0] + 0.2 * pd, pipe.t[0] + 0.45 * pd) });
    const seal = seg(u, pipe.t[0] + 0.08 * pd, pipe.t[0] + 0.18 * pd);
    let scan = null;
    if (!ph.move && ph.k >= 1 && ph.k <= 3) {
      const stop = ph.fail ? 0.5 : 0.62;
      scan = { dy: lerp(-35, 35, seg(q, 0.1, stop)), a: seg(q, 0.08, 0.12) * (1 - seg(q, stop - 0.02, stop + 0.04)), red: !!ph.fail };
    }
    let stamp = null;
    const fail = r.phases.find((p) => p.fail);
    if (fail) {
      const fd = fail.t[1] - fail.t[0];
      const a = seg(u, fail.t[0] + 0.5 * fd, fail.t[0] + 0.58 * fd) * (1 - seg(u, fail.t[1] + 0.1, fail.t[1] + 0.4));
      if (a > 0.001) stamp = { a, scale: 1.6 - 0.6 * easeOut(seg(u, fail.t[0] + 0.5 * fd, fail.t[0] + 0.7 * fd)), text: 'RETRY 1/3' };
    }
    alpha *= 1 - seg(x, L.prod.x - 10, L.prod.x + 70); // slides in behind Production
    if (alpha <= 0.001) return null;
    return {
      id: r.id,
      run: r,
      x,
      y,
      scale,
      alpha,
      icons,
      badges,
      seal,
      stamp,
      scan,
      receipt: { lines, red: 0 },
      scopePassed: u >= scopeTime(r),
      promoted: x > L.promoteX,
    };
  }

  // ----------------------------------------------------------- stations
  function stationState(k, tt) {
    const st = { circle: 'idle', red: 0, beam: null, chips: [0, 0, 0, 0, 0], key: 0, ring: null };
    for (const r of RUNS) {
      const u = runTime(r, tt);
      if (!live(r, u)) continue;
      for (let i = 0; i < r.phases.length; i++) {
        const ph = r.phases[i];
        if (ph.k !== k) continue;
        const [a, b] = ph.t;
        if (u >= a && u < b) {
          const q = (u - a) / (b - a);
          if (k === 0) {
            st.beam = { a: seg(q, 0, 0.15) * (1 - seg(q, 0.7, 0.9)) };
            st.circle = q < 0.08 ? 'idle' : q < 0.85 ? 'active' : 'pass';
          } else if (k === 1 && ph.fail) {
            st.beam = { a: seg(q, 0.04, 0.1) * (1 - seg(q, 0.8, 1)), red: q > 0.5 };
            st.circle = q < 0.06 ? 'idle' : q < 0.5 ? 'active' : 'red';
            st.red = seg(q, 0.5, 0.58);
            // The hook flags a test that asserts nothing: "Empty tests" lights, then turns red.
            st.chips = [seg(q, 0.12, 0.2), 0, 0, 0, 0];
            st.chipRed = [seg(q, 0.5, 0.56), 0];
          } else if (k === PIPE) {
            st.beam = { a: seg(q, 0.04, 0.1) * (1 - seg(q, 0.3, 0.4)), red: true }; // stamps the seal
            st.circle = q < 0.06 ? 'idle' : q < 0.55 ? 'active' : 'red';
            st.key = 90 * ease(seg(q, 0.55, 0.85));
          } else {
            st.beam = { a: seg(q, 0.04, 0.12) * (1 - seg(q, 0.75, 0.88)) };
            const passAt = k === 2 ? 0.82 : 0.75;
            st.circle = q < 0.06 ? 'idle' : q < passAt ? 'active' : 'pass';
            if (k === 1) st.chips = [0.15, 0.4].map((s0) => seg(q, s0, s0 + 0.08)).concat([0, 0, 0]);
            if (k === 2) st.chips = [0.1, 0.22, 0.34, 0.46, 0.62].map((s0) => seg(q, s0, s0 + 0.05));
            if (k === 3) st.chips = [0.12, 0.3, 0.48].map((s0) => seg(q, s0, s0 + 0.06)).concat([0, 0]);
          }
          return st;
        }
        const nx = r.phases[i + 1];
        if (nx && nx.move && nx.move[0] === k && u >= nx.t[0] && u < nx.t[1]) {
          const m = (u - nx.t[0]) / (nx.t[1] - nx.t[0]);
          if (k === 1 && ph.fail) {
            st.red = 1 - m;
            st.circle = m < 0.5 ? 'red' : 'idle';
            st.chips = [1 - m, 0, 0, 0, 0];
            st.chipRed = [1 - m, 0];
          } else if (k === PIPE) {
            st.circle = 'red'; // the key stays turned while the change passes into Production
            st.key = 90;
          } else {
            st.circle = m < 0.35 ? 'pass' : 'idle';
            if (k === 1) st.chips = [1, 1, 0, 0, 0].map((v) => v * (1 - m));
            if (k === 2) st.chips = [1, 1, 1, 1, 1].map((v) => v * (1 - m));
            if (k === 3) st.chips = [1, 1, 1, 0, 0].map((v) => v * (1 - m));
          }
          return st;
        }
        if (k === PIPE && nx && nx.move && u >= nx.t[1] && u < nx.t[1] + 0.3) {
          st.key = 90 * (1 - ease(seg(u, nx.t[1], nx.t[1] + 0.3))); // returns as the lock closes
          if (u < nx.t[1] + 0.15) st.circle = 'red';
          return st;
        }
      }
    }
    return st;
  }

  // --------------------------------------------------------- production
  function prodState(tt) {
    for (const r of RUNS) {
      const u = runTime(r, tt);
      const [a, b] = r.prodMove.t;
      if (u >= a && u < b) return { open: ease(seg(u, a, a + 0.08)), pulse: 0, entering: true, run: r };
      if (u >= b && u < b + 0.8) {
        return { open: 1 - ease(seg(u, b + 0.04, b + 0.28)), pulse: 1 - seg(u, b, b + 0.8), entering: u < b + 0.3, run: r };
      }
    }
    return { open: 0, pulse: 0, entering: false, run: null };
  }

  // -------------------------------------------------------------- panel
  function panelState(tt) {
    for (const r of RUNS) {
      const u = runTime(r, tt);
      const pipe = r.phases.find((p) => p.k === PIPE);
      if (u >= pipe.t[0] && u < pipe.t[1]) {
        const q = (u - pipe.t[0]) / (pipe.t[1] - pipe.t[0]);
        // Rows tick in sequence over the first 42% of the dwell, then the key turns at 45%.
        const ticks = PANEL_ROWS.map((_, i) => seg(q, 0.06 * (i + 1) - 0.035, 0.06 * (i + 1)));
        const done = q >= 0.45;
        return { id: r.id, values: RECEIPTS[r.id], ticks, status: done ? 'VERIFIED: key turns' : 'verifying evidence...', statusKind: done ? 'verified' : 'verifying' };
      }
      const [a, b] = r.prodMove.t;
      if (u >= a && u < b) return { id: r.id, values: RECEIPTS[r.id], ticks: PANEL_ROWS.map(() => 1), status: 'VERIFIED: key turns', statusKind: 'verified' };
    }
    // Otherwise: the change most recently deployed.
    let best = null;
    let since = Infinity;
    for (const r of RUNS) {
      const s = mod(tt - mod(r.end, LOOP), LOOP);
      if (s < since) {
        since = s;
        best = r;
      }
    }
    return { id: best.id, values: RECEIPTS[best.id], ticks: PANEL_ROWS.map(() => 1), status: 'deployed', statusKind: 'done' };
  }

  // -------------------------------------------------------------- tasks
  // A task card on its way into the Agent. From the signed spec, the queue, or telemetry.
  function taskFor(r, tt) {
    const u = runTime(r, tt);
    const t0 = r.phases[0].t[0];
    if (u < r.start || u >= t0) return null;
    const top = { x: L.specX, y: 364 };
    const bot = { x: L.specX, y: 455 };
    if (r.from === 'spec' || r.from === 'queue') {
      const appear = r.from === 'spec' ? r.start + 0.05 : r.start + 0.2;
      const go = appear + 0.3;
      const a = seg(u, appear, appear + 0.2) * (1 - seg(u, t0 - 0.25, t0));
      if (u < go) return { id: r.task, x: top.x, y: top.y, a };
      return { id: r.task, x: top.x, y: lerp(top.y, bot.y, ease(seg(u, go, t0))), a };
    }
    // Trusted signal: from the Telemetry card into the Agent's lower half. No human.
    const from = { x: 452, y: 672 };
    const to = { x: L.specX, y: 612 }; // the Agent card's empty lower half
    const m = ease(seg(u, r.start + 0.15, t0));
    return {
      id: r.task,
      x: lerp(from.x, to.x, m),
      y: lerp(from.y, to.y, m),
      a: seg(u, r.start, r.start + 0.15) * (1 - seg(u, t0 - 0.2, t0)),
      caption: 'trusted signal',
      captionA: 1 - seg(u, t0 - 0.2, t0 - 0.05),
    };
  }

  // ------------------------------------------------------- issue lane
  // Issue #4821 is untrusted text. It reaches Untrusted input, stops at the wall
  // (NO RUN), drops to the issue panel, and a human turns it into a signed spec.
  const ISSUE = { arrive: [3.0, 3.9], drop: [5.0, 5.8], shrink: [7.2, 7.4], route: [7.4, 8.8] };
  function issueState(tt) {
    if (tt < ISSUE.arrive[0] || tt > ISSUE.route[1] + 0.15) return null;
    const W = L.wall;
    let x = W.x;
    let y = W.stopY;
    let scale = 0.8;
    let alpha = 1;
    let icons = [['issue', 1]];
    let badges = [['bug', 1]];
    let seal = 0;
    if (tt < ISSUE.arrive[1]) {
      y = lerp(L.inputY[0] + 14, W.stopY, ease(seg(tt, ISSUE.arrive[0], ISSUE.arrive[1])));
      alpha = seg(tt, ISSUE.arrive[0], ISSUE.arrive[0] + 0.15);
    } else if (tt >= ISSUE.drop[0] && tt < ISSUE.drop[1]) {
      const m = seg(tt, ISSUE.drop[0], ISSUE.drop[1]);
      x = lerp(W.x, L.tray.slotX, ease(seg(m, 0, 0.5)));
      y = lerp(W.stopY, L.tray.slotY, ease(seg(m, 0.5, 1)));
    } else if (tt >= ISSUE.drop[1]) {
      x = L.tray.slotX;
      y = L.tray.slotY;
      // The human rewrites it as a spec change and signs it with the key.
      const c = seg(tt, 6.2, 6.5);
      icons = [['issue', 1 - c], ['doc', c]];
      const kb = seg(tt, 6.5, 6.8);
      badges = [['bug', 1 - kb], ['key', kb]];
      seal = seg(tt, 6.8, 7.0);
      if (tt >= ISSUE.shrink[0]) scale = lerp(0.8, 0.4, ease(seg(tt, ISSUE.shrink[0], ISSUE.shrink[1])));
      if (tt >= ISSUE.route[0]) {
        const [px, py] = pointOnPath(L.rev2Route, ease(seg(tt, ISSUE.route[0], ISSUE.route[1])));
        x = px;
        y = py;
        alpha = 1 - seg(tt, ISSUE.route[1], ISSUE.route[1] + 0.15);
        if (alpha <= 0.001) return null;
      }
    }
    const noRun = seg(tt, 3.95, 4.05) * (1 - seg(tt, 5.6, 5.9));
    const stamp = noRun > 0.001 ? { a: noRun, scale: 1.7 - 0.7 * easeOut(seg(tt, 3.95, 4.15)), text: 'NO RUN' } : null;
    // The seal is the human's signature on the spec, so it takes the human colour.
    return { id: '#4821', x, y, scale, alpha, icons, badges, seal, sealHuman: true, stamp, receipt: null };
  }

  // The queue at the intake: "SPEC-118 rev 2" arrives, then waits as "T-0043 · queued"
  // until the next loop's run picks it up.
  function queueState(tt) {
    if (tt >= 8.75 && tt < 9.5) {
      return { a: seg(tt, 8.75, 8.9), icon: 'doc', text: 'SPEC-118 rev 2', textA: seg(tt, 8.85, 9.0) * (1 - seg(tt, 9.35, 9.5)) };
    }
    if (tt >= 9.5 || tt < 5.55) {
      const textA = tt >= 9.5 ? seg(tt, 9.5, 9.65) : 1 - seg(tt, 5.4, 5.55);
      return { a: 1, icon: 'clipboard', text: `T-0043 ${DOT} queued`, textA };
    }
    if (tt < 5.7) return { a: 1 - seg(tt, 5.55, 5.7), icon: 'clipboard', text: '', textA: 0 };
    return null;
  }

  // ------------------------------------------------------------- state
  const TELE = { start: 12.0, arrive: 13.8 }; // after T-0042 enters Production at 12.0 s

  function stateAt(t) {
    const tt = loopTime(t);
    const S = Scene.idleState();
    S.tt = tt;
    S.tread = mod((tt * 2000) / LOOP, L.belt.tread); // 2000 units per loop: 80 treads
    S.stations = STATIONS.map((_, k) => stationState(k, tt));
    S.items = RUNS.map((r) => itemFor(r, tt)).filter(Boolean);
    S.tasks = RUNS.map((r) => taskFor(r, tt)).filter(Boolean);
    S.issue = issueState(tt);
    S.rev2 = { guide: seg(tt, 7.1, 7.4) * (1 - seg(tt, 8.8, 9.1)) };
    S.prod = prodState(tt);
    S.panel = panelState(tt);

    // The approver at the intake is always shown. human is the signing halo: key, then touch.
    S.intake = {
      human: seg(tt, 0, 0.3) * (1 - seg(tt, 1.9, 2.3)),
      key: { x: lerp(L.intake.humanX + 20, L.intake.specX + L.intake.specW - 22, ease(seg(tt, 0.3, 0.8))), a: seg(tt, 0.25, 0.4) * (1 - seg(tt, 1.0, 1.25)) },
      touch: tt >= 0.8 && tt <= 1.2 ? seg(tt, 0.8, 1.2) : null,
      seal: seg(tt, 0.95, 1.1) * (1 - seg(tt, 2.4, 2.8)),
      flash: bump(tt, 0.8, 0.95, 1.6),
      queue: queueState(tt),
    };
    S.tray = { human: seg(tt, 5.9, 6.1) * (1 - seg(tt, 7.1, 7.3)) };
    S.untrusted = { flash: bump(tt, 3.45, 3.6, 4.1), ring: tt > 3.5 && tt < 4.0 ? seg(tt, 3.5, 4.0) : null };
    S.wall = bump(tt, 3.85, 3.95, 4.8);

    // Telemetry returns along HOURS, then the alarm becomes a task with no human.
    S.tele = {
      dot: tt >= TELE.start && tt <= TELE.arrive ? seg(tt, TELE.start, TELE.arrive) : null,
      ring: tt > TELE.arrive && tt < TELE.arrive + 0.7 ? (tt - TELE.arrive) / 0.7 : null,
      alarm: bump(tt, 13.8, 13.95, 14.95),
      subA: tt < 13.8 || tt >= 15.1 ? 1 : (1 - seg(tt, 13.8, 13.95)) + seg(tt, 14.95, 15.1),
      altA: seg(tt, 13.95, 14.1) * (1 - seg(tt, 14.8, 14.95)),
    };
    return S;
  }

  // ------------------------------------------------------------- debug
  function receiptCounts(it) {
    const ls = it.receipt.lines;
    const c = (type) => ls.filter((l) => l.type === type && l.a >= 0.5).length;
    const sig = ls.find((l) => l.type === 'sig');
    return { provenance: c('prov'), checks: c('check'), signature: !!sig && sig.a >= 0.5 && sig.draw >= 0.99 };
  }
  const box = (x, y, half) => ({ x1: x - half, y1: y - half, x2: x + half, y2: y + half });
  const hits = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

  function debugAt(t) {
    const S = stateAt(t);
    const tt = S.tt;
    const sb = L.sandbox;
    const sandboxBox = { x1: sb.x, y1: sb.y, x2: sb.x + sb.w, y2: sb.y + sb.h };
    const agentBox = { x1: X(0) - L.agentW / 2, y1: L.cardTop, x2: X(0) + L.agentW / 2, y2: L.cardTop + L.cardH };
    const iss = S.issue;
    const issueBox = iss ? box(iss.x, iss.y, 35 * iss.scale) : null;
    // Every place a human decides, always on screen. signing: a spec is being signed there now.
    const humans = [
      { where: 'intake', signing: S.intake.human > 0.5 },
      { where: 'issue panel', signing: S.tray.human > 0.5 },
      { where: 'factory', signing: false },
      { where: 'rule', signing: false },
      { where: 'release', signing: false }, // the optional release sign-off: shown, never performed
    ];
    const badges = [...S.items, ...(iss ? [iss] : [])].flatMap((it) => it.badges.filter(([, a]) => a > 0.01).map(([b]) => b));
    const iconOf = (it) => it.icons.reduce((m, c) => (c[1] > m[1] ? c : m))[0];
    return {
      t,
      tt,
      stations: STATIONS.map((st, k) => ({ k, title: st.title, state: k === PIPE && S.stations[k].circle === 'red' ? 'pass' : S.stations[k].circle, chips: S.stations[k].chips })),
      items: S.items.map((it) => ({
        id: it.id,
        task: it.run.task,
        x: +it.x.toFixed(2),
        icon: iconOf(it),
        stamp: it.stamp ? { text: it.stamp.text, a: it.stamp.a } : null,
        scopePassed: it.scopePassed,
        promoted: it.promoted,
        atProduction: it.x > L.prod.x - 10,
        receipt: receiptCounts(it),
      })),
      tasks: S.tasks.map((k) => ({ id: k.id, caption: k.caption || null, a: k.a })),
      humans,
      badges,
      issue: iss
        ? { x: iss.x, y: iss.y, scale: iss.scale, icon: iconOf(iss), stamp: iss.stamp ? iss.stamp.text : null, stampA: iss.stamp ? iss.stamp.a : 0, inSandbox: hits(issueBox, sandboxBox), touchesAgent: hits(issueBox, agentBox) }
        : null,
      queue: S.intake.queue ? { text: S.intake.queue.text, textA: S.intake.queue.textA } : null,
      lock: S.prod.open > 0.5 ? 'open' : 'closed',
      lockAmount: S.prod.open,
      enteringProduction: S.prod.entering,
      entering: S.prod.run ? S.prod.run.id : null,
      panel: { id: S.panel.id, status: S.panel.status, ticked: S.panel.ticks.filter((v) => v >= 0.5).length, values: S.panel.values },
      untrustedFlash: S.untrusted.flash,
      telemetry: { dot: S.tele.dot, alarm: S.tele.altA },
    };
  }

  // ------------------------------------------------------------ wiring
  // guided.html sets window.__EMBED_LOOP__ and drives the loop with its own clock and camera.
  window.FactoryLoop = { LOOP, draw: (t) => Scene.drawScene(stateAt(t)), debugAt };
  if (window.__EMBED_LOOP__) return;

  const svg = document.getElementById('stage');
  window.LOOP_SECONDS = LOOP;
  // The scene's markup is well-formed SVG, so it is parsed as XML and swapped in, not assigned to
  // innerHTML. A parse error throws, which the render log records and the checks fail on.
  const parser = new DOMParser();
  window.render = function render(t) {
    const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${Scene.drawScene(stateAt(t))}</svg>`, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error(`scene markup is not well-formed at t=${t}`);
    svg.replaceChildren(...doc.documentElement.childNodes);
  };
  window.__debug = debugAt;

  if (window.__RENDER_MODE__) {
    document.documentElement.classList.add('render');
    window.render(0);
  } else {
    // Preview: ?t=3.2 freezes a frame; otherwise play with requestAnimationFrame.
    const q = new URLSearchParams(location.search).get('t');
    if (q !== null) window.render(parseFloat(q));
    else {
      let t0 = null;
      const tick = (now) => {
        if (t0 === null) t0 = now;
        window.render((now - t0) / 1000);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }
})();
