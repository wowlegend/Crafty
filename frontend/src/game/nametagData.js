import { MOB_TYPES } from './mobTypes.js';

// Pure nametag model: given an ECS entity + planar distance to the player, returns the billboard
// label model (text/color/health-bar). Hostiles show name+bar within ~30m; NPCs/passives show
// name-only; bound allies read jade (friendly). Keeps the render layer (render/Nametags.jsx) dumb.
const HOSTILE_RANGE = 30;
const NPC_RANGE = 24;

export function nametagFor(entity, dist) {
  if (!entity) return { visible: false };
  const cfg = MOB_TYPES[entity.type] || {};
  const isPassive = entity.passive ?? cfg.passive;
  const range = isPassive ? NPC_RANGE : HOSTILE_RANGE;
  const visible = dist <= range;
  const text = entity.npcName || cfg.displayName || (entity.type ? entity.type.charAt(0).toUpperCase() + entity.type.slice(1) : 'Unknown');
  if (entity.isAlly) return { visible, text, showBar: false, color: '#3DFFB0', hpFrac: 1 };
  if (isPassive) return { visible, text, showBar: false, color: '#E8E0C8', hpFrac: 1 };
  const hpFrac = Math.max(0, Math.min(1, (entity.health || 0) / (entity.maxHealth || 1)));
  const color = hpFrac > 0.5 ? '#F2F2F2' : hpFrac > 0.25 ? '#F5D76E' : '#FF6B6B';
  return { visible, text, showBar: true, color, hpFrac };
}
