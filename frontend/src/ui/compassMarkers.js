// compassMarkers.js — what the compass shows this frame (the HUD lane's task script, decision 4): the eight cardinals,
// the boss while one is up, HOME at the Hearth, the nearest shrine, the Blight Heart, the hub NPCs (villagers in the ECS
// mob query, read live, never a store copy) and unopened chests nearby. Each marker carries its bearing and its
// label through t(); compassLayout.js decides where it sits. Not React: ui/Compass.jsx calls it on the HUD ticker.
import { mobsQuery } from '../ecs/world';
import { nearestLandmark } from '../world/shrines.js';
import { blightHeartSite } from '../world/blightHeart.js';
import { t } from '../i18n/i18n.js';
import { bearingTo, npcShortName } from './compassLayout.js';

export const CARDINALS = [['compass.n', 0], ['compass.ne', 45], ['compass.e', 90], ['compass.se', 135], ['compass.s', 180],
  ['compass.sw', -135], ['compass.w', -90], ['compass.nw', -45]];
// Hide a destination while standing on it, and far chests and NPCs, which are not where the player is going.
const HIDE_WITHIN_M = { home: 6, shrine: 8, blight: 12 };
const CHEST_RANGE_M = 80;
const NPC_RANGE_M = 60;
export const NPC_SLOTS = 6;
export const CHEST_SLOTS = 6;
const SHRINE_SCAN_MS = 750; // nearestLandmark scans a chunk grid; the player cannot outrun a shrine in under a second

const EMPTY_SET = new Set();

/**
 * The markers to show this frame: [{ id, kind, bearing, text }]. `pp` is the player's position, `props` what the HUD
 * hands the compass ({ bossActive, chests, openedChestIds }), `shrineCache` an object the caller keeps between frames
 * (start it empty: the first call scans). Slot ids: `cardinal:<key>`, boss, home, shrine, blight, `npc:<n>`, `chest:<n>`.
 */
export function markersNow(state, pp, props, shrineCache) {
  const out = [];
  for (const [key, deg] of CARDINALS) out.push({ id: `cardinal:${key}`, kind: 'cardinal', bearing: (deg * Math.PI) / 180, text: t(key) });
  const dest = (id, x, z, key, hideWithin) => {
    const m = Math.round(Math.hypot(x - pp.x, z - pp.z));
    if (m > hideWithin) out.push({ id, kind: id, bearing: bearingTo(x, z, pp.x, pp.z), text: t(key, { m }) });
  };
  const bossPos = props.bossActive && state.getBossPosition ? state.getBossPosition() : null;
  if (bossPos) dest('boss', bossPos[0], bossPos[2], 'compass.boss', -1);
  dest('home', 0, 0, 'compass.home', HIDE_WITHIN_M.home);
  const now = performance.now();
  if (shrineCache.at === undefined || now - shrineCache.at > SHRINE_SCAN_MS) {
    shrineCache.at = now;
    shrineCache.shrine = nearestLandmark(pp.x, pp.z);
  }
  if (shrineCache.shrine) dest('shrine', shrineCache.shrine.worldX, shrineCache.shrine.worldZ, 'compass.shrine', HIDE_WITHIN_M.shrine);
  const bh = blightHeartSite();
  dest('blight', bh.x, bh.z, 'compass.blight', HIDE_WITHIN_M.blight);
  let npcs = 0;
  for (const e of mobsQuery.entities) {
    if (npcs >= NPC_SLOTS) break;
    if (e.type !== 'villager' || !(e.health > 0)) continue;
    const m = Math.round(Math.hypot(e.position.x - pp.x, e.position.z - pp.z));
    if (m > NPC_RANGE_M) continue;
    out.push({ id: `npc:${npcs}`, kind: 'npc', bearing: bearingTo(e.position.x, e.position.z, pp.x, pp.z),
      text: t('compass.npc', { name: npcShortName(e.npcName || t('compass.villager')), m }) });
    npcs += 1;
  }
  const opened = props.openedChestIds || EMPTY_SET;
  let chests = 0;
  for (const c of props.chests || []) {
    if (chests >= CHEST_SLOTS) break;
    if (opened instanceof Set ? opened.has(c.id) : opened.includes?.(c.id)) continue;
    const m = Math.round(Math.hypot(c.position[0] - pp.x, c.position[2] - pp.z));
    if (m > CHEST_RANGE_M) continue;
    out.push({ id: `chest:${chests}`, kind: 'chest', bearing: bearingTo(c.position[0], c.position[2], pp.x, pp.z), text: t('compass.chest', { m }) });
    chests += 1;
  }
  return out;
}

