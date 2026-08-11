import { describe, it, expect } from 'vitest';
import { tapVerdict, assertBaseline, waitForStableFrame, intraPageVerdict } from '../../scripts/visual/_probe.mjs';

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
    // The reading these verdicts were built from: the old ringLayout(4,78)[1] = {x:78,y:0} -> `right:
    // 26 - 78` = -52, the whole 52x52 past the right edge. That LAYOUT is fixed (fanLayout, which cannot
    // produce a negative offset); this stays because the PROBE must still refuse to call such a reading a
    // tap. A fixed layout is not a reason to let the instrument go blind.
    const v = tapVerdict('touch-aspect-grab', { x: 390, y: 595, w: 52, h: 52, hitIsSelf: true, hitLabel: '' }, VIEWPORT);
    expect(v.ok).toBe(false);
    expect(v.why).toContain('outside the 390x844 viewport');
    // it must say WHERE it actually is — a probe that cannot say why is how a layout defect gets
    // recorded as a behavioural one
    expect(v.why).toContain('390,595');
  });

  it('REJECTS a sector sitting underneath the spell toggle (THE bug that produced two false findings)', () => {
    // The other half of the same layout bug: aspect sector 0 = {x:0,y:-78} -> bottom 104+78 = 182 =
    // touch-spells' own anchor. Same 52x52 box; the
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

// waitForStableFrame — the fix for capture's fixed `delay(2500)`. It replaced a timeout that stood in for
// a condition, after S8 (947748f) proved the timeout was tuned to a frame cost that any commit can change:
// explore-day's run-to-run self-diff went 0.075% -> 1.646% against a pre-S8 control, and the pixels that
// moved were the distant treeline, not the grass. `sleep` is injected so these run in microseconds.
describe('waitForStableFrame — waits on the frame, and proves it can see a difference first', () => {
  const noSleep = () => Promise.resolve();
  // frames: an array of buffers handed out in order; the last one repeats forever
  const pageOf = (frames) => {
    let i = 0;
    return { screenshot: async () => frames[Math.min(i++, frames.length - 1)] };
  };
  const F = (byte) => Buffer.alloc(4096, byte); // above minBytes, so the blank-frame guard does not fire

  it('returns as soon as the frame has held still for needStable polls', async () => {
    const r = await waitForStableFrame(pageOf([F(1)]), { sleep: noSleep, needStable: 3 });
    expect(r.settled).toBe(true);
    expect(r.polls).toBe(2); // 3rd identical read breaks the loop
  });

  it('keeps waiting while the frame is still changing, then settles', async () => {
    // four distinct frames (a mesh still swapping in), then stable
    const p = pageOf([F(1), F(2), F(3), F(4), F(9)]);
    const r = await waitForStableFrame(p, { sleep: noSleep, needStable: 3 });
    expect(r.settled).toBe(true);
    expect(r.sawChange).toBe(true);
    expect(r.polls).toBeGreaterThan(3); // it did NOT return during the churn
  });

  it('reports NOT settled when the frame never stops moving, instead of screenshotting anyway', async () => {
    // every read differs -> nothing is ever stable
    let n = 0;
    const page = { screenshot: async () => Buffer.alloc(4096, n++ % 251) };
    const r = await waitForStableFrame(page, { sleep: noSleep, max: 12 });
    expect(r.settled).toBe(false);
    expect(r.polls).toBe(12); // denominator: it really did look 12 times
  });

  it('THROWS on a blank/failed screenshot — the realistic dead instrument, which is perfectly stable', async () => {
    // This is the case that can actually happen: screenshot() starts returning an empty or error frame.
    // Every comparison then matches, the loop exits on its first look, and capture writes that frame as
    // a baseline. A settled world and a dead camera produce the same reading, so size is checked first.
    const page = { screenshot: async () => Buffer.alloc(10, 0) };
    await expect(waitForStableFrame(page, { sleep: noSleep })).rejects.toThrow(/blank or failed|screenshot is/i);
  });

  it('THROWS if the byte comparator itself cannot discriminate', async () => {
    const realEquals = Buffer.prototype.equals;
    Buffer.prototype.equals = () => true; // a comparator that can only ever say "identical"
    try {
      const page = { screenshot: async () => Buffer.alloc(4096, 7) };
      await expect(waitForStableFrame(page, { sleep: noSleep })).rejects.toThrow(/dead/i);
    } finally {
      Buffer.prototype.equals = realEquals;
    }
  });
});

describe('intraPageVerdict — the metamorphic invariant, and proof it can say NO', () => {
  // Two shots of the SAME settled page must be byte-identical. Measured 2026-08-08: three shots from one
  // page agree exactly while two separate PROCESSES differ by 0.36-0.98%. That contrast is what ruled out
  // renderer nondeterminism and pointed the whole investigation at cross-process state.
  //
  // A comparator that always answers "identical" is indistinguishable from a deterministic harness, which
  // is precisely the vacuity that made the i18n classifier report 0 dead keys. So every NEGATIVE shape is
  // asserted reachable before the positive verdict is trusted.
  const buf = (...bytes) => Uint8Array.from(bytes);

  it('accepts two byte-identical shots', () => {
    const v = intraPageVerdict(buf(1, 2, 3, 4), buf(1, 2, 3, 4));
    expect(v.ok).toBe(true);
    expect(v.bytes).toBe(4);
  });

  it('rejects a single differing byte, and says where', () => {
    const v = intraPageVerdict(buf(1, 2, 3, 4), buf(1, 2, 9, 4));
    expect(v.ok).toBe(false);
    expect(v.why).toMatch(/offset 2/);
  });

  it('rejects shots of different encoded size', () => {
    const v = intraPageVerdict(buf(1, 2, 3), buf(1, 2, 3, 4));
    expect(v.ok).toBe(false);
    expect(v.why).toMatch(/sizes differ/);
  });

  it('rejects an EMPTY shot rather than calling it a match', () => {
    // A failed screenshot returns nothing, and nothing equals nothing. Without this the invariant would
    // report its strongest possible PASS at the exact moment the instrument stopped working.
    expect(intraPageVerdict(buf(), buf()).ok).toBe(false);
    expect(intraPageVerdict(null, buf(1)).ok).toBe(false);
    expect(intraPageVerdict(buf(1), undefined).ok).toBe(false);
  });
});
