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

function saveIndex(list) { safeSet(INDEX_KEY, JSON.stringify(list)); }

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
  saveIndex(list);
  return true;
}

export function deleteWorld(id) {
  saveIndex(listWorlds().filter((w) => w.id !== id));
  safeRemove(BLOB_PREFIX + id);
  if (getActiveWorldId() === id) setActiveWorldId(null);
}

export function getActiveWorldId() { return safeGet(ACTIVE_WORLD_KEY); }
export function setActiveWorldId(id) { if (id) safeSet(ACTIVE_WORLD_KEY, id); else safeRemove(ACTIVE_WORLD_KEY); }
