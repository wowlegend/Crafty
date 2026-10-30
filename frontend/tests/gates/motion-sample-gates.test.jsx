// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { installMotionSampler, judgeMotion } from '../e2e/_motionSample.js';
import { MotionProvider } from '../../src/ui/MotionProvider.jsx';
import { SpellUpgradePanel } from '../../src/ui/SpellUpgradePanel.jsx';

// THE E2E'S SAMPLER AND ITS VERDICT, DRIVEN HERE (W2-L; tests/e2e/lazy-motion.spec.js runs them in Chromium on CI).
//
// An e2e that cannot run locally is a gate nobody has seen go red, so its two halves are exercised where they can be.
// The SAMPLER is installed into jsdom and the real talents panel mounted under the app's provider: it must find the
// panel's motion element at insertion, read the initial scale there, follow the spring on every frame and stop once
// settled. The VERDICT is run on series whose answer is known by construction: a spring-shaped one, a jump from start to
// end, one frozen at its start, one too short to judge, one whose first sample is not the initial value.
//
// WHAT THIS DOES NOT CHECK: Chromium. The sampler reads the inline `transform` framer-motion writes, which is the same
// string in jsdom and in a browser, but whether a real browser draws frames dense enough on a CI runner, and whether the
// talents tab opens by a real click, are the spec's. jsdom has no compositor, so nothing here says the transition looks right.
//
// Mutation-Proof: see the commit trailer.

afterEach(() => { cleanup(); delete window.__motionSamples; });

const SPRING = [0.9, 0.9, 0.93, 0.97, 1.01, 1.0, 1.0, 1.0];
const series = (scales) => scales.map((scale, i) => ({ t: i * 16, scale, y: Math.max(0, (1 - scale) * 300) < 0.05 ? 0 : Math.round((1 - scale) * 300) }));

describe('judgeMotion: the verdict on a sampled transition', () => {
  it('a spring from the initial value to the end passes, counting its in-between samples', () => {
    const v = judgeMotion(series(SPRING));
    expect(v.kind, v.why).toBe('ok');
    expect(v.why, 'the denominator is not printed').toMatch(/8 samples, 2 strictly between/);
  });

  it('a jump from start to end with nothing between fails: the panel does not animate', () => {
    const v = judgeMotion(series([0.9, 1, 1, 1, 1]));
    expect(v.kind).toBe('fail');
    expect(v.why).toMatch(/no value between/);
  });

  it('a panel frozen at its initial state fails: the features never loaded', () => {
    const v = judgeMotion(series([0.9, 0.9, 0.9, 0.9, 0.9, 0.9]));
    expect(v.kind).toBe('fail');
    expect(v.why).toMatch(/never reached its end/);
  });

  it('too few samples is a setup problem, not a verdict', () => {
    expect(judgeMotion(series([0.9, 0.95, 1])).kind).toBe('setup');
    expect(judgeMotion([]).kind).toBe('setup');
  });

  it('a first sample that is not the initial value is a setup problem: the wrong element was sampled', () => {
    const v = judgeMotion(series([1, 1, 1, 1, 1]));
    expect(v.kind).toBe('setup');
    expect(v.why).toMatch(/first sample/);
  });

  it('a y that never lands is not an end: the scale alone does not settle it', () => {
    const frames = series(SPRING).map((f, i, all) => (i === all.length - 1 ? { ...f, y: 12 } : f));
    expect(judgeMotion(frames).kind).toBe('fail');
  });
});

describe('installMotionSampler: the real talents panel, mounted under the app provider', () => {
  it('finds the panel at insertion, reads its initial scale, follows the spring and settles', async () => {
    installMotionSampler({ testid: 'progression-panel', deadlineMs: 8000 });
    const out = window.__motionSamples;
    expect(out.frames.length, 'SETUP: the sampler recorded before anything was mounted').toBe(0);
    render(<SpellUpgradePanel onClose={() => {}} />, { wrapper: MotionProvider });
    const deadline = performance.now() + 8000;
    while (!out.done && performance.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(out.done, `the sampler never finished: ${out.frames.length} samples`).toBe(true);
    expect(out.target, 'the sampler did not say which element it followed').toMatch(/^div\./);
    expect(out.frames[0], 'the insertion sample is not the initial state').toMatchObject({ scale: 0.9, y: 30 });
    const v = judgeMotion(out.frames);
    expect(v.kind, `${v.why} :: ${JSON.stringify(out.frames.slice(0, 8))}`).toBe('ok');
  });

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

  it('a sampler that never sees the panel finishes with no frames, which the verdict calls setup', async () => {
    installMotionSampler({ testid: 'no-such-panel', deadlineMs: 200 });
    const out = window.__motionSamples;
    const deadline = performance.now() + 2000;
    while (!out.done && performance.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(out.done, 'the sampler did not give up at its deadline').toBe(true);
    expect(judgeMotion(out.frames).kind).toBe('setup');
  });
});
