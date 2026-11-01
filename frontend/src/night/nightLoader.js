// nightLoader.js — the boot chunk's one door to the First Night's chunk (night/night.js, DECISIONS 2026-11-01 (W3-A PR C)
// item 498): fetched once the world is built, so a player on the title, or in the build before the first frame, never
// pays for it, and installed once.
import { useGameStore } from '../store/useGameStore';
import { onceRetrying } from '../ui/panels/lazyPanels.js';

/** The night's chunk, imported once (and again after a failure: onceRetrying) and installed when it arrives. */
export const loadNight = onceRetrying(() => import('./night.js').then((m) => m.installNight()));

/**
 * Fetch the night once the world is built (the store's isSpawnChunkLoaded, which Terrain sets when the spawn chunk
 * stands): at once when it already is, else on the first write that builds it. A failed fetch is silent here; a later
 * loadNight() call, from whatever needs the night, tries again. Returns the unsubscribe.
 */
export function loadNightWhenBuilt(store = useGameStore, load = loadNight) {
  const go = (s) => {
    if (s.isSpawnChunkLoaded) load().catch(() => {});
    return s.isSpawnChunkLoaded;
  };
  if (go(store.getState())) return () => {};
  const off = store.subscribe((s) => { if (go(s)) off(); });
  return off;
}
