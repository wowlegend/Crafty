// worldBoot.js — every world switch is a boot (DECISIONS 2026-10-30 items 200-203; deep audit lane L2).
//
// A world's state has owners the store cannot reset: hook state seeded at mount (the dragon fight, the quest log, the XP
// refs), hook refs (quest chests, shrines), the ECS (allies, mobs, orbs, loot) and the Rapier body. A load into a mounted
// game reached the store alone, and every other owner kept the world before it: the dragon chased a level-1 character
// into a new world, a resumed save lost its quest log, the old world's chests and orbs banked into the new one. So a
// switch saves the world in play, leaves a note in the tab and reloads, and the page loads the noted world into the store
// before React's first render (startGame.jsx): every owner then starts from that world.
//
// The store, the storage and the reload are handed in; the one module state it touches is the climate sampler's seed,
// which a failed load leaves set (world/climate.js seedClimate).
import { savePosition } from './saveSchema.js';
import { seedClimate } from '../world/climate.js';

/** The sessionStorage key of the note a world switch leaves for the reload. sessionStorage survives a reload of the tab
 *  and dies with it, which is exactly "the world this tab switches to" and nothing more. */
export const BOOT_NOTE_KEY = 'crafty.boot';

/**
 * Leave the note for the next load of this tab. `{ world: id }` loads that slot; `{ fresh: true }` starts a world that
 * owns no slot yet (its first save in play mints one); `{ fresh: true, world: id }` starts a new world in a slot already
 * written (the World Manager's Create). Returns whether the storage took it.
 * @param {Storage} storage
 * @param {{ world?: string, fresh?: boolean }} note
 */
export function writeBootNote(storage, note) {
  try {
    storage.setItem(BOOT_NOTE_KEY, JSON.stringify(note));
    return true;
  } catch {
    return false; // storage refused (private mode): the reload is a plain visit
  }
}

/**
 * Take the note: read it and remove it, whether or not it resolves, so a second load of the tab is a plain visit.
 * Returns `{ world }`, `{ fresh, world }` (world null when none) or null for no note, or one this build cannot read.
 * @param {Storage} storage
 */
export function takeBootNote(storage) {
  let raw = null;
  try {
    raw = storage.getItem(BOOT_NOTE_KEY);
    if (raw !== null) storage.removeItem(BOOT_NOTE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let note = null;
  try { note = JSON.parse(raw); } catch { return null; }
  if (!note || typeof note !== 'object') return null;
  const world = typeof note.world === 'string' && note.world ? note.world : null;
  if (note.fresh === true) return { fresh: true, world };
  return world ? { world } : null;
}

/**
 * The sessionStorage key of the boot's attempt at a world, `{ world: id }`: left when the boot loads a world, before the
 * first render, and taken back once that world has run a frame (systems/BootSettle.jsx). A plain visit that finds it
 * naming the world it would load knows the last page to load that world never ran it: a save that loads and then breaks
 * the world as it mounts, which the crash screen's Reload (a plain visit) would load again, and again.
 */
export const BOOT_ATTEMPT_KEY = 'crafty.bootAttempt';

function attemptedWorld(session) {
  try {
    const v = JSON.parse(session.getItem(BOOT_ATTEMPT_KEY) || 'null');
    return v && typeof v.world === 'string' ? v.world : null;
  } catch {
    return null;
  }
}

/**
 * The world this page loaded has run: take back the attempt its boot left (`id`, the store's `_bootAttempt`), and no
 * other. A page that held a world left the attempt it found, so a refresh of its title holds that world again.
 * @param {Storage|null} session
 * @param {string|null} id
 */
export function settleBoot(session, id) {
  if (!session || !id) return;
  try {
    if (attemptedWorld(session) === id) session.removeItem(BOOT_ATTEMPT_KEY);
  } catch { /* storage refused: the attempt stays, and the next plain visit holds the world on the title */ }
}

/** An index entry of a world this player owns: the World Manager's own "My Worlds" rule. */
const ownedEntry = (w) => !!w && typeof w.id === 'string' && (w.is_owner || w.id.startsWith('local_'));

/**
 * The world a plain visit continues: the first entry of the index whose save reads. writeWorld puts the world it wrote
 * first, so that is the most recently written world the player owns. A world nobody named and nothing was earned in
 * (saves.emptyPlaceholder) is passed over for an older one that holds something: until lane L2 every visit minted one,
 * so a player's newest world can be a fresh Start they abandoned before finding their own. With none earned or named,
 * the newest.
 * @param {{ listWorlds: () => object[], readWorld: (id: string) => object|null,
 *   emptyPlaceholder?: (entry: object, data: object) => boolean }} saves
 * @returns {{ entry: object, data: object }|null}
 */
export function latestOwnedWorld(saves) {
  let newest = null;
  for (const entry of saves.listWorlds()) {
    if (!ownedEntry(entry)) continue;
    const data = saves.readWorld(entry.id);
    if (!data) continue;
    if (!saves.emptyPlaceholder?.(entry, data)) return { entry, data };
    newest = newest || { entry, data };
  }
  return newest;
}

function notedWorld(saves, id) {
  const data = saves.readWorld(id);
  if (!data) return null;
  return { entry: saves.listWorlds().find((w) => w && w.id === id) || { id }, data };
}

/**
 * Load the world this page plays into the store, before the first render. A note decides; with none (or one naming a
 * world that is gone) the most recently written world the player owns; with none of those, the store's initial state.
 * The load claims its slot (loadWorldData sets `_sessionWorldId`), so the autosave writes back into it rather than
 * minting another. Its notices (a retired quest's reward, the Cut's respec) are held in `_bootNotices` until the quest
 * system publishes the channel. `continueWorld` tells the title what it is continuing. A save that throws on load leaves
 * the initial state, and `bootHeld` tells the title which world could not be opened: a page that never renders is worse
 * than a world that starts over beside the broken slot. A plain visit does not load a world whose last load never ran
 * (BOOT_ATTEMPT_KEY): the title says so and offers to open it anyway, which is a note, and a note loads its world.
 * The empty placeholder worlds past the few newest are deleted first (saves.pruneEmptySlots, when given).
 * @param {{ store: { getState: () => object, setState: (p: object, replace?: boolean) => void, getInitialState: () => object },
 *   session: Storage|null, saves: { listWorlds: () => object[], readWorld: (id: string) => object|null,
 *   pruneEmptySlots?: (keepId: string|null) => string[] } }} deps
 * @returns {{ kind: 'world'|'fresh'|'none'|'held', id?: string|null }}
 */
export function bootWorld({ store, session, saves }) {
  const note = session ? takeBootNote(session) : null;
  // Before the choice, so the world the page loads is never one it deletes (worldSaves.js pruneEmptySlots).
  saves.pruneEmptySlots?.(note && note.world);
  if (note && note.fresh) {
    store.getState().startNewWorld(note.world);
    return { kind: 'fresh', id: note.world };
  }
  const noted = note && note.world ? notedWorld(saves, note.world) : null;
  const found = noted || latestOwnedWorld(saves);
  if (!found) return { kind: 'none' };
  const { entry, data } = found;
  const name = entry.name || data.name || data.save_name || null;
  if (!noted && session && attemptedWorld(session) === entry.id) {
    store.setState({ bootHeld: { id: entry.id, name, reason: 'stopped' } });
    return { kind: 'held', id: entry.id };
  }
  const notices = [];
  const channel = store.getState().addNotification;
  store.setState({ addNotification: (...args) => { notices.push(args); } });
  let failed = null;
  try {
    store.getState().loadWorldData({ ...data, id: entry.id });
  } catch (err) {
    failed = err;
  } finally {
    store.setState({ addNotification: channel });
  }
  if (failed) {
    // Nothing of the failed load stays: its slot claim (the autosave would write the new world over the broken slot),
    // its notices and the climate's seed, which the load sets before its reducer runs.
    console.error(`worldBoot: the save ${entry.id} did not load; this page starts a new world`, failed);
    store.setState(store.getInitialState(), true);
    seedClimate(store.getState().worldSeed);
    store.setState({ bootHeld: { id: entry.id, name, reason: 'unreadable' } });
    return { kind: 'none' };
  }
  let attempt = null;
  if (session) {
    try {
      session.setItem(BOOT_ATTEMPT_KEY, JSON.stringify({ world: entry.id }));
      attempt = entry.id;
    } catch { /* storage refused: no hold on the next visit */ }
  }
  store.setState({ _bootNotices: notices, _bootAttempt: attempt });
  store.setState({
    continueWorld: {
      id: entry.id,
      name,
      level: store.getState().level,
      savedAt: entry.saved_at || data.saved_at || null,
    },
  });
  return { kind: 'world', id: entry.id };
}

/**
 * Save the world in play to its slot, at once: App's autosave, and the first step of every switch. Nothing before Start:
 * the title shows a world nobody has played since it loaded, and a save there minted a slot for an empty world or moved
 * a world's last played. Nothing under the visual-capture harness either.
 * @param {() => object} getState
 * @returns {boolean} whether it saved
 */
export function saveWorldInPlay(getState) {
  const st = getState();
  if (st.isCaptureMode || !st.gameStarted) return false;
  st.saveActiveWorld(savePosition(st));
  return true;
}

/** The note that brings this tab back to what it holds: its own slot, or a fresh world when it owns none yet. */
export function tabNote(state) {
  return state._sessionWorldId ? { world: state._sessionWorldId } : { fresh: true };
}

/**
 * Every world switch: save the world in play, leave the note, reload, in that order. The save is a synchronous
 * localStorage write, so it has landed before the note; the reload ends the page. A refused note reloads only when
 * `orPlainVisit` (the context-loss recovery: the plain visit continues the world just saved): otherwise the plain visit
 * would land back on the world being left, so the switch is not made and null is returned. `note` may be a function of
 * the state after the save (tabNote: the save mints the slot of a world that owned none).
 * @param {{ world?: string, fresh?: boolean } | ((state: object) => { world?: string, fresh?: boolean })} note
 * @param {{ getState: () => object, storage: Storage|null, reload: () => void, orPlainVisit?: boolean }} deps
 * @returns {{ world?: string, fresh?: boolean }|null} the note left, or null when the switch was not made
 */
export function switchWorld(note, { getState, storage, reload, orPlainVisit = false }) {
  saveWorldInPlay(getState);
  const left = typeof note === 'function' ? note(getState()) : note;
  if (!(storage && writeBootNote(storage, left)) && !orPlainVisit) return null;
  reload();
  return left;
}
