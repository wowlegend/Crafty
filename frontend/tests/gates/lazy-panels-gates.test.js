import { describe, it, expect } from 'vitest';
import { onceRetrying } from '../../src/ui/panels/lazyPanels.js';
import { carriersOf } from './_srcWalk.js';

/**
 * THE PANELS ARE ONE LAZY CHUNK (plan 2026-09-23-crafty-lazy-panels).
 *
 * The real proof is on the BUILT bundle: scripts/ci/bundle-budget.mjs asserts the panel markers are absent from the
 * boot chunk and present in exactly one other chunk. This file pins the two things a bundle cannot show: the load is
 * retried after a failure (Review Focus 4), and no source file but panelBundle.js imports a panel module statically
 * (the early, cheap signal of what would pull a panel back into the boot chunk).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   Z1 a rejected load cached forever (no retry)   Z2 plausible-wrong: every call re-imports (no memo)
 *   Z3 MenuSystem imports GamePanels statically again (structural)
 *   (bundle-budget.mjs, by hand after a build:) B1 MenuSystem's static GamePanels import restored -> "is in the BOOT
 *   chunk"; B2 a marker renamed away (the presence half) -> "found in 0 chunk(s)"
 *
 * BLIND SPOT: whether the first panel a player opens is ALREADY loaded (the idle prefetch) is timing, seen only in a
 * running game.
 */
describe('onceRetrying — one load while it lives, another after it fails', () => {
  it('two calls share one pending load; a success is kept', async () => {
    let calls = 0;
    const load = onceRetrying(() => { calls++; return Promise.resolve('panels'); });
    const a = load(), b = load();
    expect(a).toBe(b);
    expect(await a).toBe('panels');
    await load();
    expect(calls).toBe(1);
  });
  it('a FAILED load is forgotten: the next call tries again, and a later success is kept', async () => {
    let calls = 0;
    const load = onceRetrying(() => { calls++; return calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve('panels'); });
    await expect(load()).rejects.toThrow('offline');
    expect(await load()).toBe('panels');
    await load();
    expect(calls).toBe(2);
  });
});

describe('only panelBundle.js imports a panel module statically (weak, structural)', () => {
  it('each on-demand panel module has exactly one static importer: the lazy bundle', () => {
    for (const m of ['GamePanels', 'SpellUpgradePanel', 'CreditsScreen', 'WorldManager', 'TradingInterface', 'QuestLog', 'ChestInventoryPanel']) {
      const re = new RegExp(`from '(\\.{1,2}/)+(ui/)?${m}(\\.jsx?)?'`);
      expect(carriersOf(re), `${m} is statically imported outside the lazy bundle`).toEqual(['ui/panels/panelBundle.js']);
    }
    expect(carriersOf(/import\('\.\/panelBundle\.js'\)/)).toEqual(['ui/panels/lazyPanels.js']);
  });
});
