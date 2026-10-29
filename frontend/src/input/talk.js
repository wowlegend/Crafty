// talk.js — the talk verb: G on a keyboard, the tray's Talk button on touch (ui/touchTray.js). One routine for both, so a
// tablet reaches every villager a keyboard does.
import { mobsQuery } from '../ecs/world.js';
import { notifyDenied } from '../ui/denyToast.js';

/** How near a villager must stand, in metres on the ground plane, to be talked to. */
export const TALK_RANGE = 4;

/** The nearest living villager within TALK_RANGE of (x, z), read live from the ECS, or null. */
export function nearestVillager(x, z) {
  let nearest = null;
  let best = TALK_RANGE;
  for (const e of mobsQuery.entities) {
    if (e.type !== 'villager' || !(e.health > 0)) continue;
    const d = Math.hypot(e.position.x - x, e.position.z - z);
    if (d < best) { nearest = e; best = d; }
  }
  return nearest;
}

/**
 * Talk to the nearest villager, routed by role: the smith opens Mara's Forge, the healer heals on the spot, the warden
 * gives a hint, and the merchant (and any role-less villager) opens trading. With nobody in range it opens a chest
 * beside the player instead. Returns what happened: 'forge' | 'trade' (a panel opened) | 'heal' | 'hint' | 'chest' |
 * null (nothing near).
 */
export function talkToNearest(store) {
  const cam = store.gameCamera;
  const villager = cam ? nearestVillager(cam.position.x, cam.position.z) : null;
  if (!villager) return store.openNearbyChest?.() ? 'chest' : null;
  const p = villager.position;
  // A snapshot, not the live entity: the selection is store state, and the entity's fields are the frame loop's.
  store.setSelectedVillager({ id: villager.id, type: villager.type, role: villager.role, npcName: villager.npcName, position: [p.x, p.y, p.z] });
  const who = villager.npcName || 'The villager';
  if (villager.role === 'smith') {
    store.setShowForge(true);
    return 'forge';
  }
  if (villager.role === 'healer') {
    store.healPlayer?.(store.maxHealth || 100);
    store.restoreMana?.(store.maxMana || 100);
    store.addNotification?.(`${who} mends your wounds — health and mana restored.`, 'reward');
    return 'heal';
  }
  if (villager.role === 'guide') {
    store.addNotification?.(`${who}: the frontier shrine lies ahead — follow the light on the horizon.`, 'quest');
    return 'hint';
  }
  store.setShowTradingInterface(true);
  return 'trade';
}

/** Did talking open a panel (so the caller yields input to it)? */
export const talkOpenedPanel = (result) => result === 'forge' || result === 'trade';

/** The talk verb as a player presses it: talkToNearest, and a notice when nobody and nothing was in reach. */
export function talk(store) {
  const result = talkToNearest(store);
  if (!result) notifyDenied('no-talk');
  return result;
}
