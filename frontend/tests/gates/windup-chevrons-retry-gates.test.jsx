// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';

/**
 * A CHEVRON CHUNK THAT FAILED IS ASKED FOR AGAIN, A BOUNDED NUMBER OF TIMES.
 *
 * The windup chevrons load as their own chunk (HUD.jsx WindupChevronsSlot). React.lazy keeps a rejection for good, so
 * one failed fetch at boot (an iPad on flaky Wi-Fi) used to drop the chevrons for the session, even after the network
 * came back. This mounts the REAL slot with the chevron module failing its first N loads (vitest runs a mock factory
 * again after it throws, so each load is a real new attempt), and drives time with fake timers.
 *
 * WHAT THIS DOES NOT CHECK: a real network in a browser, and the panels' own retry (tests/gates/lazy-panels-*).
 */
const h = vi.hoisted(() => ({ loads: 0, failFirst: 1 }));
vi.mock('../../src/ui/WindupChevrons', async () => {
  h.loads += 1;
  if (h.loads <= h.failFirst) throw new Error('SIMULATED chevron chunk failure');
  const { createElement } = await import('react');
  return { default: () => createElement('div', { 'data-testid': 'chevrons-loaded' }) };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const settle = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('the windup chevrons\' chunk after a failed load', () => {
  it('a chunk that keeps failing is asked for CHEVRON_RETRIES more times, then left alone', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    h.loads = 0; h.failFirst = Infinity;
    const { WindupChevronsSlot, CHEVRON_RETRIES } = await import('../../src/HUD.jsx');
    expect(CHEVRON_RETRIES, 'SETUP: no retry bound is exported').toBeGreaterThan(0);
    const { getByTestId } = render(<div data-testid="slot"><WindupChevronsSlot /></div>);
    await settle(0);
    for (let i = 0; i < 20; i++) await settle(60000);
    expect(h.loads, 'a chunk that 404s for good was asked for without bound, or never retried').toBe(1 + CHEVRON_RETRIES);
    expect(getByTestId('slot').childNodes.length, 'the failed slot rendered something').toBe(0);
    // a remount (the HUD mounted again) asks afresh
    cleanup();
    render(<div data-testid="slot"><WindupChevronsSlot /></div>);
    await settle(0);
    expect(h.loads, 'a remounted slot kept the failed load').toBe(2 + CHEVRON_RETRIES);
  });

  it('a load that failed once is retried, and the chevrons arrive within a minute without a reload', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    h.failFirst = h.loads + 1; // the next load fails, the one after succeeds
    const before = h.loads;
    const { WindupChevronsSlot } = await import('../../src/HUD.jsx');
    const { queryByTestId } = render(<div data-testid="slot"><WindupChevronsSlot /></div>);
    await settle(0);
    expect(h.loads - before, 'SETUP: the chunk was never asked for').toBe(1);
    expect(queryByTestId('chevrons-loaded'), 'SETUP: the failing first load rendered the chevrons').toBeNull();
    await settle(60000);
    expect(h.loads - before, 'the failed chunk was never asked for again').toBeGreaterThan(1);
    expect(queryByTestId('chevrons-loaded'), 'the chevrons never arrived after the network came back').not.toBeNull();
  });
});
