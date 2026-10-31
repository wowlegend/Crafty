/**
 * worldSaves.js — thin localStorage layer for world-slot persistence (local-first).
 * Index at `crafty_world_saves` (array of {id,name,created_at,is_owner}); each world blob
 * at `crafty_world_save_<id>`; active world id at `crafty_active_world`. All ops guarded
 * (quota / parse / private-mode). No React/store imports.
 */
const INDEX_KEY = 'crafty_world_saves';
const BLOB_PREFIX = 'crafty_world_save_';
const ACTIVE_WORLD_KEY = 'crafty_active_world';

const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const safeRemove = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

export function listWorlds() {
  const raw = safeGet(INDEX_KEY);
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

function saveIndex(list) { return safeSet(INDEX_KEY, JSON.stringify(list)); }

/**
 * Mint a world id that CANNOT collide with an existing one.
 *
 * B2a: the old inline `'local_' + Date.now()` was minted in two places. Two worlds created inside the
 * same millisecond get the same id — and "the same id" means "silently write on top of the other one",
 * which is the exact class of bug this whole slice exists to kill. Checked against the live index; the
 * suffix only grows on an actual collision, so the common id stays readable.
 */
export function mintWorldId() {
  const taken = new Set(listWorlds().map((w) => w.id));
  const base = 'local_' + Date.now();
  if (!taken.has(base) && !safeGet(BLOB_PREFIX + base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`) || safeGet(BLOB_PREFIX + `${base}_${n}`)) n++;
  return `${base}_${n}`;
}

export function readWorld(id) {
  const raw = safeGet(BLOB_PREFIX + id);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function writeWorld(id, meta, saveData) {
  // write the blob FIRST and confirm it landed; only then update the index — a quota failure must
  // not leave a dangling index entry pointing at a missing blob. Returns success.
  const ok = safeSet(BLOB_PREFIX + id, JSON.stringify({ id, ...meta, ...saveData }));
  if (!ok) return false;
  const list = listWorlds().filter((w) => w.id !== id);
  list.unshift({ id, ...meta });
  // propagate the index write result — a quota failure here orphans the blob, and the caller must
  // know the save did not fully land rather than seeing a false success.
  return saveIndex(list);
}

/** The most worlds nobody named and nothing was earned in that a browser keeps (pruneEmptySlots). */
export const KEEP_EMPTY_SLOTS = 3;

// A world an autosave minted and the player never named: the `Save_<time>` placeholder (saveSchema.js buildSaveData).
const placeholderName = (w) => !!w && typeof w.name === 'string' && w.name.startsWith('Save_');
const count = (v) => (Array.isArray(v) ? v.length : 0);
// Nothing earned in it: level 1, no XP, no coins, no block edited, no chest, not won, no quest claimed, no shrine reached
// (reaching one grants nothing, store reachShrine). A save with no progression slice is from before the slice, and what
// it holds cannot be read off it, so it is never empty. (`|| {}` and not `?.`: this build lowers each `?.` to longer code,
// and the index chunk has a byte ceiling, scripts/ci/bundle-budget.mjs.)
function holdsNothing(data) {
  const p = data && data.progression;
  if (!p || typeof p !== 'object') return false;
  const g = data.game_state || {};
  return !(p.level > 1) && !(p.totalXP > 0) && !(p.coins > 0) && !count((data.world_data || {}).blocks) && !count(data.chests)
    && !g.gameWon && !count((data.questState || {}).completedQuestIds) && !count((g.shrines || {}).reached);
}

/** A world nobody named and nothing was earned in: one a plain visit passes over for an earned one (game/worldBoot.js). */
export const emptyPlaceholder = (entry, data) => placeholderName(entry) && holdsNothing(data);

/**
 * Delete the empty placeholder worlds beyond the `keep` newest (a placeholder name, nothing earned in it). `keepId`, the
 * world a page plays, is never deleted, and counts among those kept. Until lane L2 every visit minted one of these and
 * nothing deleted one; each costs storage, and at the quota every save stops. Returns the ids deleted.
 * @param {string|null} [keepId]
 * @param {number} [keep]
 */
export function pruneEmptySlots(keepId = null, keep = KEEP_EMPTY_SLOTS) {
  const gone = [];
  let kept = 0;
  for (const w of listWorlds()) {
    if (!placeholderName(w) || !holdsNothing(readWorld(w.id))) continue;
    if (w.id === keepId || kept < keep) kept++;
    else gone.push(w.id);
  }
  // The index first, and the saves only once it has landed: a refused index write must not leave it naming saves that
  // are gone (a storage that refuses every write still removes).
  if (!gone.length || !saveIndex(listWorlds().filter((w) => !gone.includes(w.id)))) return [];
  for (const id of gone) safeRemove(BLOB_PREFIX + id);
  return gone;
}

export function deleteWorld(id) {
  saveIndex(listWorlds().filter((w) => w.id !== id));
  safeRemove(BLOB_PREFIX + id);
  if (getActiveWorldId() === id) setActiveWorldId(null);
}

export function getActiveWorldId() { return safeGet(ACTIVE_WORLD_KEY); }
export function setActiveWorldId(id) { if (id) safeSet(ACTIVE_WORLD_KEY, id); else safeRemove(ACTIVE_WORLD_KEY); }
