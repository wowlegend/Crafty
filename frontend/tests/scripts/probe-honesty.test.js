import { describe, it, expect } from 'vitest';
import { tapVerdict, assertBaseline } from '../../scripts/visual/_probe.mjs';

// The regression fixtures below are the ACTUAL measurements from 2026-08-05, when touch-probe.mjs reported
// success over taps it never landed and two registry lines were written from the result. Every near-miss
// that fooled the instrument becomes a permanent fixture, so the instrument can never be fooled that way
// again — the same discipline the i18n dead-key traps got after they fooled a grep four times.

describe('tapVerdict — a tap is only honest if it can REACH the thing it names', () => {
  const VIEWPORT = { w: 390, h: 844 }; // iPhone 13, what touch-probe emulates

  it('accepts a target that is on screen and on top', () => {
    const v = tapVerdict('touch-action', { x: 100, y: 700, w: 52, h: 52, hitIsSelf: true, hitLabel: '' }, VIEWPORT);
    expect(v.ok).toBe(true);
    expect(v).toMatchObject({ x: 126, y: 726 });
  });

  it('REJECTS the off-screen Aspect sector (touch-aspect-grab @390,595 — the real 2026-08-05 reading)', () => {
    // ringLayout(4,78)[1] = {x:78,y:0} -> `right: 26 - 78` = -52 -> the whole 52x52 sits past the right edge.
    const v = tapVerdict('touch-aspect-grab', { x: 390, y: 595, w: 52, h: 52, hitIsSelf: true, hitLabel: '' }, VIEWPORT);
    expect(v.ok).toBe(false);
    expect(v.why).toContain('outside the 390x844 viewport');
    // it must say WHERE it actually is — a probe that cannot say why is how a layout defect gets
    // recorded as a behavioural one
    expect(v.why).toContain('390,595');
  });

  it('REJECTS a sector sitting underneath the spell toggle (THE bug that produced two false findings)', () => {
    // aspect sector 0 = {x:0,y:-78} -> bottom 104+78 = 182 = touch-spells' own anchor. Same 52x52 box; the
    // spell toggle renders later in the DOM, so it takes the tap and the ring never hears about it.
    const v = tapVerdict('touch-aspect-roar',
      { x: 312, y: 517, w: 52, h: 52, hitIsSelf: false, hitLabel: '[data-testid="touch-spells"]' }, VIEWPORT);
    expect(v.ok).toBe(false);
    expect(v.why).toContain('lands on [data-testid="touch-spells"] instead');
    // the old helper returned TRUE here, which is how "the ring does not close" got written down
  });

  it('REJECTS a missing element and a zero-size element, distinguishably', () => {
    expect(tapVerdict('nope', null, VIEWPORT)).toMatchObject({ ok: false });
    expect(tapVerdict('nope', null, VIEWPORT).why).toContain('no element');
    const zero = tapVerdict('collapsed', { x: 10, y: 10, w: 0, h: 0, hitIsSelf: true, hitLabel: '' }, VIEWPORT);
    expect(zero.ok).toBe(false);
    expect(zero.why).toContain('zero size');
  });

  it('rejects a centre exactly ON the boundary — a 390-wide viewport has pixels 0..389, not 390', () => {
    // x=364 + w/2=26 -> centre x = 390, one past the last addressable column.
    const off = tapVerdict('edge', { x: 364, y: 100, w: 52, h: 52, hitIsSelf: true, hitLabel: '' }, VIEWPORT);
    expect(off.ok).toBe(false);
    expect(off.why).toContain('outside');
    // one pixel further in is reachable — pinning the boundary from BOTH sides, because a bound asserted
    // from one side only is satisfied by a check that rejects everything.
    const on = tapVerdict('edge', { x: 362, y: 100, w: 52, h: 52, hitIsSelf: true, hitLabel: '' }, VIEWPORT);
    expect(on).toMatchObject({ ok: true, x: 388 });
  });
});

describe('assertBaseline — an absence means nothing until the instrument has seen a presence', () => {
  it('passes once the measurement clears the floor, and reports the value it saw', async () => {
    let n = 0;
    const r = await assertBaseline(async () => (++n >= 3 ? 5.22 : 0), { label: 'movement', gapMs: 0 });
    expect(r.ok).toBe(true);
    expect(r.value).toBe(5.22);
    expect(n).toBe(3); // it retried — the real probe needed 3 attempts while terrain streamed in
  });

  it('FAILS loudly when the instrument never observes anything, and says the result is uninterpretable', async () => {
    const r = await assertBaseline(async () => 0, { label: 'movement', gapMs: 0, attempts: 2 });
    expect(r.ok).toBe(false);
    expect(r.why).toContain('UNINTERPRETABLE');
  });

  it('treats a null measurement as a failure, not as a zero it can reason about', async () => {
    const r = await assertBaseline(async () => null, { label: 'camera', gapMs: 0, attempts: 1 });
    expect(r.ok).toBe(false);
  });
});
