// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import React, { Suspense } from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { makeLazyPanels } from '../../src/ui/panels/lazyPanels.js';

/**
 * A LAZY PANEL, RENDERED (QUEUE R9.1 + R9.4, review #8). Both defects live in React.lazy itself, verified in React
 * 19.2.8's lazyInitializer before this was written:
 *   R9.4 an uninitialised lazy ALWAYS throws its thenable on the first render — its `.then` marks it resolved a
 *        microtask later — so a panel whose chunk the idle prefetch had ALREADY loaded still suspended on first open
 *        (a blank beat, which React may hold ~300 ms after a fallback).
 *   R9.1 a rejected lazy keeps `_status = 2` and rethrows its error on EVERY render, and the nearest boundary was the
 *        app-wide one: a panel opened while its chunk failed (offline; a stale tab after a deploy) replaced the game
 *        with the reload screen, and onceRetrying's retry never reached the wrapper.
 * Driven through makeLazyPanels with a fake chunk, so the loader's timing and failure are set here, not inherited.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   L1 the loaded-module fast path removed (always the lazy) -> "suspended after the chunk had loaded"
 *   L2 the panel boundary removed -> the failure reaches the outer boundary
 *   L3 plausible-wrong: the boundary kept, but the failed lazy NOT dropped -> the re-open stays blank
 */
afterEach(cleanup);

const chunk = { Box: ({ label }) => <div data-testid="box">{label}</div> };

class Outer extends React.Component {
  state = { crashed: null };
  static getDerivedStateFromError(e) { return { crashed: String(e?.message || e) }; }
  render() { return this.state.crashed ? <div data-testid="crashed">{this.state.crashed}</div> : this.props.children; }
}
const mount = (Panel) => render(
  <Outer><Suspense fallback={<div data-testid="fallback" />}><Panel label="inv" /></Suspense></Outer>
);

describe('a panel whose chunk is already loaded renders on the FIRST commit (R9.4)', () => {
  it('no fallback frame once loadPanels has resolved', async () => {
    const { loadPanels, lazyPanel } = makeLazyPanels(() => Promise.resolve(chunk));
    const Box = lazyPanel('Box');
    await loadPanels();
    mount(Box); // synchronous render: whatever is on screen now is the first commit
    expect(screen.queryByTestId('fallback'), 'suspended after the chunk had loaded').toBeNull();
    expect(screen.getByTestId('box').textContent).toBe('inv');
  });
  it('CONTROL: before the chunk has loaded, the first commit IS the fallback, then the panel', async () => {
    let release;
    const { lazyPanel } = makeLazyPanels(() => new Promise((r) => { release = () => r(chunk); }));
    const Box = lazyPanel('Box');
    mount(Box);
    expect(screen.getByTestId('fallback')).toBeTruthy();
    await act(async () => { release(); });
    expect(screen.getByTestId('box').textContent).toBe('inv');
  });
});

describe('a panel whose chunk FAILS does not take the game down, and the next open retries (R9.1)', () => {
  it('the failure stays inside the panel; a re-open after the network returns renders it', async () => {
    let calls = 0;
    const { lazyPanel } = makeLazyPanels(() => (++calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve(chunk)));
    const Box = lazyPanel('Box');
    const first = mount(Box);
    await act(async () => {});
    expect(screen.queryByTestId('crashed'), 'the chunk failure reached the app-wide boundary').toBeNull();
    expect(screen.queryByTestId('box')).toBeNull();
    first.unmount(); // the player closes the panel...
    mount(Box); // ...and opens it again
    await act(async () => {});
    expect(calls, 'the re-open did not retry the load').toBe(2);
    expect(screen.getByTestId('box').textContent, 'the re-open stayed blank').toBe('inv');
  });

  // Review #8 #1 (MED) = ultrareview U2, 2026-10-27: the boundary rendered null and stopped there. The panel's OPEN
  // FLAG stayed set, and its onClose — the only thing that clears it and gives the game back (enterPlay) — lives in
  // the panel UI that never rendered: the player sat in panel-open mode with nothing on screen (worst on touch).
  it('a failed chunk CLOSES the panel and tells the player, once each', async () => {
    let closed = 0, told = 0;
    const { lazyPanel } = makeLazyPanels(() => Promise.reject(new Error('offline')), { onChunkFail: () => { told++; } });
    const Box = lazyPanel('Box');
    render(<Outer><Suspense fallback={null}><Box label="inv" onClose={() => { closed++; }} /></Suspense></Outer>);
    await act(async () => {});
    expect(screen.queryByTestId('crashed'), 'the chunk failure reached the app-wide boundary').toBeNull();
    expect(closed, 'the panel was left open with nothing on screen').toBe(1);
    expect(told, 'the player was not told why the panel did not open').toBe(1);
  });

  // The bake-off's candidate "the boundary swallows EVERY render error", checked and REFUTED (2026-10-27): this was
  // green before any change. A panel that suspends on its first mount is never committed; React discards it and mounts
  // it again once the chunk resolves, and by then `loaded` is set, so it renders on the direct path with no
  // PanelBoundary around it. The boundary only ever stands around a pending or REJECTED lazy, so every error it sees
  // is a load failure. Kept as a PIN: if the fast path or React's remount ever changes, a render bug would start to
  // vanish silently, and this goes red.
  it('a panel that LOADS but throws while rendering is NOT swallowed: it reaches the app-wide boundary', async () => {
    let closed = 0;
    const Broken = () => { throw new Error('render bug'); };
    const { lazyPanel } = makeLazyPanels(() => Promise.resolve({ Broken }));
    const P = lazyPanel('Broken');
    render(<Outer><Suspense fallback={null}><P onClose={() => { closed++; }} /></Suspense></Outer>);
    await act(async () => {});
    expect(screen.getByTestId('crashed').textContent, 'a render bug was hidden as if it were a failed load').toMatch(/render bug/);
    expect(closed, 'a render bug was treated as a load failure').toBe(0);
  });
});
