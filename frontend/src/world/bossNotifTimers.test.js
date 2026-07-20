import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeNotifClearTracker } from './bossNotifTimers.js';

// V1 gate-triage: this REPLACES the vacuous `tests/gates/boss-notif-timer-gates.test.js`, which only
// readFileSync + regex'd bossSystem.js for the strings `scheduleNotifClear(` / `clearTimeout(...)` -- it
// proved the CODE EXISTED, never that the timers actually get cleared. The real regression (2026-06-28
// audit): the boss-notification auto-clear timeouts must NOT fire setBossNotification AFTER unmount (a
// setState-after-unmount leak). This tests that behaviour on the extracted, pure tracker.
//
// MUTATION-PROOF: make clearAll() a no-op in bossNotifTimers.js and the "not called after unmount" case
// goes RED (the pending timer fires setNotification(null)).

describe('makeNotifClearTracker — boss notif auto-clear timers (behavioral)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a scheduled clear fires setNotification(null) after its delay', () => {
    const setNotification = vi.fn();
    const tr = makeNotifClearTracker(setNotification);
    tr.schedule(6000);
    expect(setNotification).not.toHaveBeenCalled();
    vi.advanceTimersByTime(6000);
    expect(setNotification).toHaveBeenCalledWith(null);
  });

  it('clearAll() cancels pending timers so setNotification is NOT called after unmount (the leak guard)', () => {
    const setNotification = vi.fn();
    const tr = makeNotifClearTracker(setNotification);
    tr.schedule(6000);
    tr.schedule(5000);
    expect(tr.size).toBe(2);
    tr.clearAll(); // simulates the unmount cleanup effect
    vi.advanceTimersByTime(10000);
    expect(setNotification).not.toHaveBeenCalled(); // RED if clearAll doesn't clear -> setState-after-unmount
    expect(tr.size).toBe(0);
  });

  it('a fired timer removes itself from the tracked set (no unbounded growth)', () => {
    const tr = makeNotifClearTracker(vi.fn());
    tr.schedule(100);
    expect(tr.size).toBe(1);
    vi.advanceTimersByTime(100);
    expect(tr.size).toBe(0);
  });
});
