// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { getInput, setIntent, setActive, resetInput, INTENT_KEYS, subscribeActive, getActiveSnapshot } from './inputState.js';

describe('input intent module', () => {
  beforeEach(() => resetInput());
  it('defaults: all intents false, inactive', () => {
    const s = getInput();
    expect(s.active).toBe(false);
    for (const k of INTENT_KEYS) expect(s[k]).toBe(false);
  });
  it('setIntent flips a single intent; getInput reflects it', () => {
    setIntent('dodge', true);
    expect(getInput().dodge).toBe(true);
    expect(getInput().attack).toBe(false);
  });
  it('setActive gates the active flag (replaces pointer-lock checks)', () => {
    setActive(true); expect(getInput().active).toBe(true);
    setActive(false); expect(getInput().active).toBe(false);
  });
  it('getInput returns a STABLE reference (transient read, no per-call alloc)', () => {
    expect(getInput()).toBe(getInput());
  });
  it('rejects unknown intent keys (typo guard)', () => {
    expect(() => setIntent('jmup', true)).toThrow();
  });
  it('resetInput restores defaults', () => {
    setIntent('jump', true); setActive(true);
    resetInput();
    expect(getInput().jump).toBe(false);
    expect(getInput().active).toBe(false);
  });
});

describe('active subscribe/notify (reactive projection bridge)', () => {
  beforeEach(() => resetInput());

  it('subscribeActive fires the callback when setActive flips the value', () => {
    let calls = 0;
    const unsub = subscribeActive(() => { calls++; });
    setActive(true);
    expect(calls).toBe(1);
    setActive(false);
    expect(calls).toBe(2);
    unsub();
  });

  it('does NOT fire on a no-op same-value setActive', () => {
    setActive(false); // already false (post-reset) — no-op
    let calls = 0;
    const unsub = subscribeActive(() => { calls++; });
    setActive(false); // still false — must NOT notify
    expect(calls).toBe(0);
    setActive(true);  // changed — notifies
    expect(calls).toBe(1);
    setActive(true);  // same value — must NOT notify
    expect(calls).toBe(1);
    unsub();
  });

  it('unsubscribe stops further callbacks', () => {
    let calls = 0;
    const unsub = subscribeActive(() => { calls++; });
    setActive(true);
    expect(calls).toBe(1);
    unsub();
    setActive(false);
    expect(calls).toBe(1); // no further notification after unsubscribe
  });

  it('getActiveSnapshot reflects the current value', () => {
    expect(getActiveSnapshot()).toBe(false);
    setActive(true);
    expect(getActiveSnapshot()).toBe(true);
    setActive(false);
    expect(getActiveSnapshot()).toBe(false);
  });

  it('resetInput notifies subscribers and clears active', () => {
    setActive(true);
    let calls = 0;
    const unsub = subscribeActive(() => { calls++; });
    resetInput();
    expect(getActiveSnapshot()).toBe(false);
    expect(calls).toBe(1); // active changed true -> false -> notified
    unsub();
  });
});

describe('S2-B3-M4: the snare intent', () => {
  it("INTENT_KEYS carries 'snare' (the Aspect-verb row: roar, grab, snare)", () => {
    expect(INTENT_KEYS).toContain('snare');
  });
  it('snare sets, reads back, and resets like every intent', () => {
    setIntent('snare', true);
    expect(getInput().snare).toBe(true);
    resetInput();
    expect(getInput().snare).toBe(false);
  });
});
