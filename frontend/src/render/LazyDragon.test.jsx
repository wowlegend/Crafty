// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { Suspense, useLayoutEffect, useState, useEffect } from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { makeDragonLoader, makeLazyDragon, DRAGON_RETRIES, DRAGON_RETRY_MS } from './dragonLoader.js';

// THE LAZY DRAGON INSIDE THE WORLD'S BOUNDARY (DECISIONS 2026-10-30 item 121). GameScene mounts it inside the one
// <Suspense> that also wraps <Physics>, the world, the Player and the post passes. A lazy child that suspends in an
// already-revealed boundary on a non-transition update (the arrival poll's encounter write runs in a setInterval) hides
// its siblings (display: none) and runs their layout-effect cleanups, and R3F's useFrame subscribes in a layout effect:
// the whole world would vanish and stop while the chunk loads. Each case renders a sibling that logs its layout effect
// beside the dragon, and turns the dragon on from a setTimeout, as the poll does.
//
// Mutation-Proof: via scripts/dev/mutate.sh, each observed RED, with an identity mutant (a comment edit) GREEN:
//   L5 the inner <Suspense> removed from the lazy dragon -> "a pending dragon hides no sibling"
//   L6 DragonBoundary never calls onGiveUp -> "after the last retry it gives up, once"
//   L7 the remount reuses the failed lazy -> "a retry after a failure renders the dragon"
afterEach(() => { cleanup(); vi.useRealTimers(); });

const Dragon = () => <span data-testid="dragon">dragon</span>;

function harness(Lazy) {
  const log = [];
  let turnOn;
  const Sibling = () => {
    useLayoutEffect(() => { log.push('sub'); return () => log.push('UNSUB'); }, []);
    return <span data-testid="world">world</span>;
  };
  const Scene = () => {
    const [on, setOn] = useState(false);
    useEffect(() => { turnOn = () => setTimeout(() => setOn(true), 0); }, []);
    return <Suspense fallback={null}><Sibling />{on && <Lazy />}</Suspense>;
  };
  const r = render(<Scene />);
  return { ...r, log, turnOn: () => turnOn() };
}

const worldHidden = (container) => container.querySelector('[data-testid="world"]')?.style.display === 'none';

describe('a pending dragon hides only itself', () => {
  it('PRESENCE: without its own boundary, a pending dragon hides the sibling and unsubscribes it', async () => {
    const Lazy = makeLazyDragon(makeDragonLoader(() => new Promise(() => {})), { bare: true });
    const h = harness(Lazy);
    await act(async () => { h.turnOn(); await new Promise((r) => setTimeout(r, 5)); });
    expect(worldHidden(h.container), 'the instrument cannot see a hidden sibling').toBe(true);
    expect(h.log).toContain('UNSUB');
  });

  it('a pending dragon hides no sibling', async () => {
    const Lazy = makeLazyDragon(makeDragonLoader(() => new Promise(() => {})));
    const h = harness(Lazy);
    await act(async () => { h.turnOn(); await new Promise((r) => setTimeout(r, 5)); });
    expect(worldHidden(h.container), 'the world was hidden while the dragon loaded').toBe(false);
    expect(h.log).toEqual(['sub']);
  });
});

describe('a failed dragon chunk', () => {
  it('a rejected dragon renders null and notifies, and the sibling stays', async () => {
    const notify = vi.fn();
    const Lazy = makeLazyDragon(makeDragonLoader(() => Promise.reject(new Error('404'))), { notify, onGiveUp: vi.fn() });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const h = harness(Lazy);
    await act(async () => { h.turnOn(); await new Promise((r) => setTimeout(r, 20)); });
    err.mockRestore();
    expect(h.queryByTestId('dragon')).toBeNull();
    expect(worldHidden(h.container)).toBe(false);
    expect(notify.mock.calls).toEqual([['notice.dragonLoadFailed']]);
  });

  it('a retry after a failure renders the dragon', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const Lazy = makeLazyDragon(makeDragonLoader(() => (++calls === 1 ? Promise.reject(new Error('404')) : Promise.resolve({ BossEntity: Dragon }))),
      { notify: vi.fn(), onGiveUp: vi.fn() });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const h = harness(Lazy);
    await act(async () => { h.turnOn(); await vi.advanceTimersByTimeAsync(10); });
    expect(h.queryByTestId('dragon')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(DRAGON_RETRY_MS + 10); });
    err.mockRestore();
    expect(calls).toBe(2);
    expect(h.getByTestId('dragon').textContent).toBe('dragon');
  });

  it('after the last retry it gives up, once', async () => {
    vi.useFakeTimers();
    const importer = vi.fn(() => Promise.reject(new Error('404')));
    const notify = vi.fn();
    const onGiveUp = vi.fn();
    const Lazy = makeLazyDragon(makeDragonLoader(importer), { notify, onGiveUp });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const h = harness(Lazy);
    await act(async () => { h.turnOn(); await vi.advanceTimersByTimeAsync(10); });
    for (let i = 0; i < DRAGON_RETRIES + 2; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(DRAGON_RETRY_MS + 10); });
    }
    err.mockRestore();
    // The first load and DRAGON_RETRIES retries, and no import after the give-up.
    expect(importer).toHaveBeenCalledTimes(1 + DRAGON_RETRIES);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls.filter(([k]) => k === 'notice.dragonLoadFailed')).toHaveLength(DRAGON_RETRIES);
    expect(notify.mock.calls.at(-1)).toEqual(['notice.dragonLoadGaveUp']);
    expect(worldHidden(h.container)).toBe(false);
  });
});

describe('a loaded dragon', () => {
  it('renders on its first commit once the chunk is in', async () => {
    const loader = makeDragonLoader(() => Promise.resolve({ BossEntity: Dragon }));
    await loader.load();
    const Lazy = makeLazyDragon(loader);
    const r = render(<Lazy />);
    expect(r.getByTestId('dragon').textContent).toBe('dragon');
  });
});
