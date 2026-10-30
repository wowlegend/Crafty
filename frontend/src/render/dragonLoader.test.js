import { describe, it, expect, vi } from 'vitest';
import { makeDragonLoader, shouldPreloadAtMount } from './dragonLoader.js';

// THE DRAGON'S CHUNK LOADER (DECISIONS 2026-10-30 item 121): the code of the fight downloads once a fight is due, at
// most once while that load is pending or has succeeded, and again after a failure (offline, a CDN hiccup, a tab left
// open across a deploy), never stuck on the failure.
//
// Mutation-Proof: via scripts/dev/mutate.sh, each observed RED, with an identity mutant (a comment edit) GREEN:
//   L1 makeDragonLoader without onceRetrying (a bare importer() per call) -> "loads once while pending or loaded"
//   L2 onceRetrying keeps a rejected promise -> "a rejected load is retried by the next call"
//   P1 shouldPreloadAtMount ignores the store -> "a fight restored by a reload preloads at mount"
describe('makeDragonLoader', () => {
  it('loads once while pending or loaded', async () => {
    const importer = vi.fn(() => Promise.resolve({ BossEntity: 'X' }));
    const L = makeDragonLoader(importer);
    L.preload(); L.preload(); await L.load();
    expect(importer).toHaveBeenCalledTimes(1);
    expect(L.loaded()).toEqual({ BossEntity: 'X' });
  });

  it('a rejected load is retried by the next call', async () => {
    const importer = vi.fn().mockRejectedValueOnce(new Error('404')).mockResolvedValue({ BossEntity: 'X' });
    const L = makeDragonLoader(importer);
    await expect(L.load()).rejects.toThrow('404');
    expect(L.loaded()).toBeNull();
    await expect(L.load()).resolves.toEqual({ BossEntity: 'X' });
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it('loaded() is null until the import resolves', () => {
    expect(makeDragonLoader(() => new Promise(() => {})).loaded()).toBeNull();
  });

  it('a failed preload is silent (no unhandled rejection), and the next load retries', async () => {
    const importer = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ BossEntity: 'X' });
    const L = makeDragonLoader(importer);
    L.preload();
    await new Promise((r) => setTimeout(r, 0));
    await expect(L.load()).resolves.toEqual({ BossEntity: 'X' });
    expect(importer).toHaveBeenCalledTimes(2);
  });
});

describe('shouldPreloadAtMount', () => {
  it('a fight restored by a reload preloads at mount; no fight does not', () => {
    expect(shouldPreloadAtMount({ bossActive: true })).toBe(true);
    expect(shouldPreloadAtMount({ bossActive: false })).toBe(false);
    expect(shouldPreloadAtMount(null)).toBe(false);
  });
});
