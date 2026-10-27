// contextRecovery — the way back from a lost WebGL context (plan docs/superpowers/plans/2026-10-27-crafty-steady-cool.md,
// item e; masterpiece 0f).
//
// iOS Safari drops a WebGL context under memory pressure, and browsers drop one after a GPU reset. GameScene marked the
// store's isWebGLContextLost and nothing read it: the player was left with a black canvas under a live HUD, mobs still
// swinging, and no way back but a reload they had to think of themselves — losing whatever the debounced autosave had
// not written yet. A restored context is not reliable either (every GPU resource is gone, and three re-creates them
// lazily, if the context comes back at all), so the recovery is a reload: save first, then reload INTO THE SAME WORLD.
//
// Why a session-scoped breadcrumb: nothing resumes a save at boot (a reload lands on the title, and the session's world
// id is deliberately in-memory only — useGameStore saveActiveWorld's B2a note). sessionStorage survives a reload of the
// same tab and dies with it, which is exactly "resume what this tab was playing" and nothing more.

/** The sessionStorage key holding the world this tab was playing when its context was lost. */
export const RESUME_WORLD_KEY = 'crafty.resumeWorldId';

/**
 * Save the live world, leave a breadcrumb naming it, then reload. Order matters: the save must land before the reload.
 * @param {{ getState: () => object, storage: Storage, reload: () => void }} deps
 * @returns {string|null} the world id the breadcrumb names
 */
export function recoverFromContextLoss({ getState, storage, reload }) {
  const st = getState();
  const rb = st.playerRigidBodyRef && st.playerRigidBodyRef.current;
  const t = rb && rb.translation ? rb.translation() : null;
  st.saveActiveWorld(t ? { x: t.x, y: t.y, z: t.z } : st.playerPosition);
  const id = getState()._sessionWorldId || null; // saveActiveWorld mints one if the session owned none
  try {
    if (id) storage.setItem(RESUME_WORLD_KEY, id);
  } catch { /* storage refused (private mode): the reload still recovers the graphics; the world is in the list */ }
  reload();
  return id;
}

/**
 * At boot: take the breadcrumb (once — it is removed whether or not the world still exists) and return that world's
 * save, or null. The caller loads it; the player still presses Start, a gesture the browser needs anyway.
 * @param {{ storage: Storage, readWorld: (id: string) => object|null }} deps
 */
export function consumeResumeWorld({ storage, readWorld }) {
  let id = null;
  try {
    id = storage.getItem(RESUME_WORLD_KEY);
    if (id) storage.removeItem(RESUME_WORLD_KEY);
  } catch {
    return null;
  }
  if (!id) return null;
  return readWorld(id) || null;
}
