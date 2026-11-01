import { describe, it, expect } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { loadNight, loadNightWhenBuilt } from '../../src/night/nightLoader.js';

/**
 * THE NIGHT'S CHUNK IS FETCHED ONCE THE WORLD IS BUILT (W3-A task script, unit U1; DECISIONS 2026-11-01 (W3-A PR C)
 * item 498). src/night/night.js is the root of the night's own chunk: the boot chunk carries only night/nightLoader.js,
 * which fetches it on the store's world-built flag (isSpawnChunkLoaded, which Terrain sets once the spawn chunk stands)
 * and installs it. scripts/ci/bundle-budget.mjs proves the split on the BUILT bundle (the chunk's marker absent from
 * the boot chunk, present in one lazy chunk); this proves the timing, on a store of the same shape driven by hand, and
 * that the real chunk installs.
 * Mutation-Proof: via scripts/dev/mutate.sh; the mutants and their reds are in the commit that adds this file.
 * NOT CHECKED HERE: the call in src/index.jsx (the boot's, run in the browser), and what later units install.
 */
const counting = () => { const load = () => { load.calls += 1; return Promise.resolve(); }; load.calls = 0; return load; };

describe('loadNightWhenBuilt', () => {
  it('fetches nothing while the world is unbuilt, then once when it is built, and not again', () => {
    const store = createStore(() => ({ isSpawnChunkLoaded: false, other: 0 }));
    const load = counting();
    loadNightWhenBuilt(store, load);
    store.setState({ other: 1 });
    expect(load.calls, 'the night was fetched before the world was built').toBe(0);
    store.setState({ isSpawnChunkLoaded: true });
    expect(load.calls, 'the world built and the night was not fetched').toBe(1);
    store.setState({ other: 2 });
    store.setState({ isSpawnChunkLoaded: true, other: 3 });
    expect(load.calls, 'the night was fetched again after the world was built').toBe(1);
  });

  it('fetches at once when the world is already built', () => {
    const store = createStore(() => ({ isSpawnChunkLoaded: true }));
    const load = counting();
    loadNightWhenBuilt(store, load);
    expect(load.calls, 'a world already built did not fetch the night').toBe(1);
  });

  // A failure left unhandled fails this run (vitest reports the rejection). The retry is onceRetrying's (lazy-panels gates).
  it('swallows a failed fetch: no unhandled rejection', async () => {
    const store = createStore(() => ({ isSpawnChunkLoaded: false }));
    let calls = 0;
    const failing = () => { calls += 1; return Promise.reject(new Error('offline')); };
    loadNightWhenBuilt(store, failing);
    store.setState({ isSpawnChunkLoaded: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls, 'SETUP: the failing fetch was not tried').toBe(1);
  });
});

describe('loadNight', () => {
  it('imports the real chunk and installs it once: the same handle every call', async () => {
    const a = await loadNight();
    const b = await loadNight();
    expect(a?.chunk, 'the night chunk did not install, or its handle lost its name').toBe('crafty:night-chunk');
    expect(b, 'a second call installed the chunk again').toBe(a);
  });
});
