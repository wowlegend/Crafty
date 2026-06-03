/**
 * worldSaves.js — thin localStorage layer for world-slot persistence (local-first).
 * Index at `crafty_world_saves` (array of {id,name,created_at,is_owner}); each world blob
 * at `crafty_world_save_<id>`; active world id at `crafty_active_world`. All ops guarded
 * (quota / parse / private-mode). No React/store imports.
 */
const INDEX_KEY = 'crafty_world_saves';
const BLOB_PREFIX = 'crafty_world_save_';
export const ACTIVE_WORLD_KEY = 'crafty_active_world';

const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const safeRemove = (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

export function listWorlds() {
  const raw = safeGet(INDEX_KEY);
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

function saveIndex(list) { safeSet(INDEX_KEY, JSON.stringify(list)); }

export function readWorld(id) {
  const raw = safeGet(BLOB_PREFIX + id);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function writeWorld(id, meta, saveData) {
  const list = listWorlds().filter((w) => w.id !== id);
  list.unshift({ id, ...meta });
  saveIndex(list);
  safeSet(BLOB_PREFIX + id, JSON.stringify({ id, ...meta, ...saveData }));
}

export function deleteWorld(id) {
  saveIndex(listWorlds().filter((w) => w.id !== id));
  safeRemove(BLOB_PREFIX + id);
  if (getActiveWorldId() === id) setActiveWorldId(null);
}

export function getActiveWorldId() { return safeGet(ACTIVE_WORLD_KEY); }
export function setActiveWorldId(id) { if (id) safeSet(ACTIVE_WORLD_KEY, id); else safeRemove(ACTIVE_WORLD_KEY); }
