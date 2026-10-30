// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { installMotionSampler, restorePageClock, judgeMotion } from '../e2e/_motionSample.js';
import { MotionProvider } from '../../src/ui/MotionProvider.jsx';
import { SpellUpgradePanel } from '../../src/ui/SpellUpgradePanel.jsx';

// THE E2E'S SAMPLER AND ITS VERDICT, DRIVEN HERE (W2-L; tests/e2e/lazy-motion.spec.js runs them in Chromium on CI).
//
// An e2e that cannot run locally is a gate nobody has seen go red, so its two halves are exercised where they can be.
// The SAMPLER is installed into jsdom and the real talents panel mounted under the app's provider: it must find the
// panel's card and dialog at insertion, read the initial scale and opacity there, follow the transition on every frame
// and stop once settled. The VERDICT is run on series whose answer is known by construction: a spring-shaped one, the
// series CI drew on its first attempt (the spring over between two frames, the slowed fade caught mid-way), a jump from
// start to end, one frozen at its start, one too short to judge, ones whose first sample is not the initial state.
// The CI FAILURE is reproduced: the thread is blocked between frames so that they land 600 ms apart, as they did on the
// runner, and the same panel reads as a jump at normal pace and as an animation at the sampler's slowed clock.
//
// WHAT THIS DOES NOT CHECK: Chromium. The sampler reads the inline `transform` framer-motion writes and the dialog's
// computed opacity, the same in jsdom and in a browser, but jsdom has no Web Animations API (framer-motion fades opacity
// from JavaScript here) and no CDP, so that the slowed document timeline stretches the real fade, whether a real browser
// draws frames dense enough on a CI runner, and that the talents tab opens by a real click, are the spec's. jsdom has no
// compositor, so nothing here says the transition looks right.
//
// Mutation-Proof: see the commit trailer.

afterEach(() => { cleanup(); restorePageClock(); delete window.__motionSamples; });

const SCALE = [0.9, 0.9, 0.93, 0.97, 1.01, 1.0, 1.0, 1.0];
const OPACITY = [0, 0, 0.3, 0.7, 1, 1, 1, 1];
/** Frames from scale and opacity lists; y follows scale (30 px at 0.9, 0 at 1). */
const series = (scales, opacities = scales.map((s) => (s === 0.9 ? 0 : 1))) => scales.map((scale, i) => ({
  t: i * 16, scale, opacity: opacities[i], y: scale >= 1 ? 0 : Math.round((1 - scale) * 300),
}));

describe('judgeMotion: the verdict on a sampled transition', () => {
  it('a transition whose scale and opacity both move passes, counting each in-between sample', () => {
    const v = judgeMotion(series(SCALE, OPACITY));
    expect(v.kind, v.why).toBe('ok');
    expect(v.why, 'the denominator is not printed').toMatch(/8 samples; strictly between the ends: scale on 2, y on 2, opacity on 2/);
  });

  it('the series CI drew first: the spring over between two frames, the slowed fade caught mid-way, passes on the fade', () => {
    // Frames 300 to 600 ms apart: scale reads 0.9, 0.9, 1, 1, 1 (a spring that ran its course between the 2nd and 3rd), and
    // the fade, slowed to a twentieth, is caught at 0.18 and 0.55 on the way.
    const v = judgeMotion(series([0.9, 0.9, 1, 1, 1, 1], [0, 0, 0.18, 0.55, 1, 1]));
    expect(v.kind, v.why).toBe('ok');
    expect(v.why).toMatch(/scale on 0, y on 0, opacity on 2/);
  });

  it('a jump from start to end with nothing between on either fails: the panel does not animate', () => {
    const v = judgeMotion(series([0.9, 1, 1, 1, 1], [0, 1, 1, 1, 1]));
    expect(v.kind).toBe('fail');
    expect(v.why).toMatch(/none of scale .*, y .* and opacity .* took a value between/);
  });

  it('a y that is caught on the way passes, though the scale and opacity jumped: it is the longest-lived value', () => {
    const frames = series([0.9, 1, 1, 1, 1], [0, 1, 1, 1, 1]).map((f, i) => (i === 1 ? { ...f, y: 11 } : f));
    const v = judgeMotion(frames);
    expect(v.kind, v.why).toBe('ok');
    expect(v.why).toMatch(/scale on 0, y on 1, opacity on 0/);
  });

  it('a panel frozen at its initial state fails: the features never loaded', () => {
    const v = judgeMotion(series([0.9, 0.9, 0.9, 0.9, 0.9, 0.9], [0, 0, 0, 0, 0, 0]));
    expect(v.kind).toBe('fail');
    expect(v.why).toMatch(/never reached its end/);
  });

  it('a fade that stops half way is not an end, however the scale finished', () => {
    const v = judgeMotion(series(SCALE, [0, 0, 0.2, 0.4, 0.5, 0.5, 0.5, 0.5]));
    expect(v.kind).toBe('fail');
    expect(v.why).toMatch(/opacity 0\.5/);
  });

  it('a y that never lands is not an end: the scale alone does not settle it', () => {
    const frames = series(SCALE, OPACITY).map((f, i, all) => (i === all.length - 1 ? { ...f, y: 12 } : f));
    expect(judgeMotion(frames).kind).toBe('fail');
  });

  it('too few samples is a setup problem, not a verdict', () => {
    expect(judgeMotion(series([0.9, 0.95, 1], [0, 0.5, 1])).kind).toBe('setup');
    expect(judgeMotion([]).kind).toBe('setup');
  });

  it('a first sample that is not the initial scale is a setup problem: the wrong element was sampled', () => {
    const v = judgeMotion(series([1, 1, 1, 1, 1], [0, 1, 1, 1, 1]));
    expect(v.kind).toBe('setup');
    expect(v.why).toMatch(/first sample.*scale/);
  });

  it('a first sample whose y is not the initial y is a setup problem', () => {
    const frames = series(SCALE, OPACITY).map((f, i) => (i === 0 ? { ...f, y: 0 } : f));
    const v = judgeMotion(frames);
    expect(v.kind).toBe('setup');
    expect(v.why).toMatch(/first sample.*y 0/);
  });

  it('a first sample that is not the initial opacity, or that has none, is a setup problem: no dialog was found', () => {
    expect(judgeMotion(series(SCALE, [1, 1, 1, 1, 1, 1, 1, 1])).kind).toBe('setup');
    const v = judgeMotion(series(SCALE, SCALE.map(() => NaN)));
    expect(v.kind).toBe('setup');
    expect(v.why).toMatch(/first sample.*opacity/);
  });
});

describe('installMotionSampler: the real talents panel, mounted under the app provider', () => {
  it('finds the card and the dialog at insertion, reads their initial state, follows the transition and settles', async () => {
    // At a tenth of real time, as the e2e reads it at a fiftieth: at normal pace a frame that stalls for a few hundred
    // milliseconds steps over the 350 ms spring and the verdict reads a jump (the case below reproduces that on purpose).
    // The deadline and the poll run on Date.now(): performance.now is the slowed clock from the panel's insertion.
    installMotionSampler({ testid: 'progression-panel', deadlineMs: 25000, clockFactor: 0.1 });
    const out = window.__motionSamples;
    expect(out.frames.length, 'SETUP: the sampler recorded before anything was mounted').toBe(0);
    render(<SpellUpgradePanel onClose={() => {}} />, { wrapper: MotionProvider });
    const deadline = Date.now() + 25000;
    while (!out.done && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(out.done, `the sampler never finished: ${out.frames.length} samples`).toBe(true);
    expect(out.target, 'the sampler did not say which elements it followed').toMatch(/^card div\..*, dialog div\./);
    expect(out.frames[0], 'the insertion sample is not the initial state').toMatchObject({ scale: 0.9, y: 30, opacity: 0 });
    const v = judgeMotion(out.frames);
    expect(v.kind, `${v.why} :: ${JSON.stringify(out.frames.slice(0, 8))}`).toBe('ok');
    expect(out.frames.some((f) => f.opacity > 0 && f.opacity < 1), 'the dialog\'s opacity was never read between its ends').toBe(true);
  }, 40000);

  it('without the provider the same panel is frozen at its initial state, and the verdict says so', async () => {
    // The control that makes the case above mean something: the sampler reads a frozen panel as one, not as a pass.
    installMotionSampler({ testid: 'progression-panel', deadlineMs: 1500 });
    const out = window.__motionSamples;
    render(<SpellUpgradePanel onClose={() => {}} />);
    const deadline = performance.now() + 4000;
    while (!out.done && performance.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(out.frames.length, 'SETUP: the panel was never sampled').toBeGreaterThan(3);
    const v = judgeMotion(out.frames);
    expect(v.kind, v.why).toBe('fail');
    expect(v.why).toMatch(/never reached its end/);
  });

  it('the sampler waits for the slowest property: neither the slowed fade nor the spring\'s y at rest is skipped', async () => {
    // What the spec's slowed timeline does in a browser: the spring is over in 350 ms and the fade lasts seconds. Driven by
    // hand here, so it holds without Chromium: the sampler must keep sampling until the opacity arrives too.
    installMotionSampler({ testid: 'lag-panel', deadlineMs: 8000 });
    const out = window.__motionSamples;
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.style.opacity = '0';
    const card = document.createElement('div');
    card.style.transform = 'translateY(30px) scale(0.9)';
    const panel = document.createElement('div');
    panel.setAttribute('data-testid', 'lag-panel');
    card.appendChild(panel);
    dialog.appendChild(card);
    document.body.appendChild(dialog);
    try {
      const frames = (n) => new Promise((r) => { let left = n; const tick = () => (--left <= 0 ? r() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });
      await frames(2);
      card.style.transform = ''; // the spring has landed
      dialog.style.opacity = '0.4'; // the fade has not
      await frames(8);
      expect(out.frames.length, 'SETUP: the sampler took no frames').toBeGreaterThan(5);
      expect(out.done, 'the sampler settled with the fade still at 0.4: it would hand the verdict a panel mid-fade').toBe(false);
      dialog.style.opacity = '1';
      card.style.transform = 'translateY(-2px)'; // the fade is in, and the spring is still overshooting its y
      await frames(8);
      expect(out.done, 'the sampler settled with y still at -2: it would hand the verdict a card that has not landed').toBe(false);
      card.style.transform = '';
      const deadline = performance.now() + 3000;
      while (!out.done && performance.now() < deadline) await new Promise((r) => setTimeout(r, 20));
      expect(out.done, 'the sampler never settled once everything was at its end').toBe(true);
      expect(out.frames[out.frames.length - 1]).toMatchObject({ scale: 1, y: 0, opacity: 1 });
    } finally {
      dialog.remove();
    }
  });

  it('a sampler that never sees the panel finishes with no frames, which the verdict calls setup', async () => {
    installMotionSampler({ testid: 'no-such-panel', deadlineMs: 200 });
    const out = window.__motionSamples;
    const deadline = performance.now() + 2000;
    while (!out.done && performance.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(out.done, 'the sampler did not give up at its deadline').toBe(true);
    expect(judgeMotion(out.frames).kind).toBe('setup');
  });
});

describe('the slowed clock: frames 600 ms apart, as on the CI runner', () => {
  // Blocks the thread 600 ms in every frame, ahead of the other frame callbacks (it registers first), so the sampler's
  // frames and framer-motion's land 600 ms apart. Atomics.wait sleeps without burning a core.
  const stretchFrames = (ms) => {
    let on = true;
    const block = () => {
      if (!on) return;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
      requestAnimationFrame(block);
    };
    requestAnimationFrame(block);
    return () => { on = false; };
  };
  const hasClockOverride = () => Object.prototype.hasOwnProperty.call(performance, 'now');
  const untilDone = async (out, ms) => {
    const deadline = Date.now() + ms;
    while (!out.done && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  };

  it('at normal pace the spring is over between two frames and the verdict calls it a jump: the first CI failure, reproduced', async () => {
    installMotionSampler({ testid: 'progression-panel', deadlineMs: 20000 });
    const out = window.__motionSamples;
    const stop = stretchFrames(600);
    try {
      render(<SpellUpgradePanel onClose={() => {}} />, { wrapper: MotionProvider });
      await untilDone(out, 15000);
    } finally { stop(); }
    expect(out.done, `SETUP: the sampler never finished (${out.frames.length} samples)`).toBe(true);
    expect(out.frames.length, 'SETUP: too few frames to be the CI series').toBeGreaterThan(3);
    const gaps = out.frames.slice(1).map((f, i) => f.t - out.frames[i].t).filter((g) => g > 100);
    expect(gaps.length, `SETUP: the frames were not stretched (t ${JSON.stringify(out.frames.map((f) => f.t))})`).toBeGreaterThan(1);
    const v = judgeMotion(out.frames);
    expect(v.kind, v.why).toBe('fail');
    expect(v.why).toMatch(/none of scale .*, y .* and opacity .* took a value between/);
  });

  it('with the clock slowed the same frames show the spring on the way, and the clock is slow while it is sampled and whole after', async () => {
    installMotionSampler({ testid: 'progression-panel', deadlineMs: 60000, clockFactor: 0.05 });
    const out = window.__motionSamples;
    expect(hasClockOverride(), 'SETUP: the clock was slowed before the panel appeared').toBe(false);
    const stop = stretchFrames(600);
    let slowDuring = false;
    let atSwitch = null;
    const before = performance.now();
    try {
      render(<SpellUpgradePanel onClose={() => {}} />, { wrapper: MotionProvider });
      const deadline = Date.now() + 50000;
      while (!out.done && Date.now() < deadline) {
        if (out.frames.length >= 2 && !out.done) slowDuring = slowDuring || hasClockOverride();
        if (atSwitch === null && hasClockOverride()) atSwitch = performance.now();
        await new Promise((r) => setTimeout(r, 25));
      }
    } finally { stop(); }
    expect(out.done, `SETUP: the sampler never finished (${out.frames.length} samples)`).toBe(true);
    expect(slowDuring, 'the clock was not slowed while the panel was being sampled').toBe(true);
    expect(atSwitch, `the slowed clock started behind the real one (${atSwitch} after ${before}): every timer the page reads would run backwards at the switch`).toBeGreaterThanOrEqual(before);
    expect(hasClockOverride(), 'the sampler left the clock slowed after it finished').toBe(false);
    const v = judgeMotion(out.frames);
    expect(v.kind, `${v.why} :: t ${JSON.stringify(out.frames.map((f) => f.t))}`).toBe('ok');
    const yMid = out.frames.filter((f) => f.y > 0.05 && f.y < 29.95).length;
    expect(yMid, `no frame showed the y spring between its ends`).toBeGreaterThan(0);
  }, 80000);

  it('restorePageClock puts the clock back and says nothing is left over', () => {
    const real = performance.now.bind(performance);
    performance.now = () => real() / 2;
    expect(hasClockOverride(), 'SETUP: the override did not take').toBe(true);
    expect(restorePageClock(), 'an override remains after restorePageClock').toBe(false);
    expect(hasClockOverride()).toBe(false);
    expect(Math.abs(performance.now() - real())).toBeLessThan(50);
  });
});
