import * as THREE from 'three';
import { HUB_NPC_ANCHORS } from './hubLayout.js';

// The frontier-outpost NPC roster. Each maps to a HUB_NPC_ANCHORS coord by role. These are STATIC
// ecs entities (isNPC+isStatic) the AI/movement tick skips — they stand at their post and interact
// via the existing G-seam (merchant -> TradingInterface; others -> their panels). Named + flavored to
// the solo-frontier fiction (a tiny outpost at the edge of the Blight). They reuse type:'villager' so
// the existing MobModel villager render (green eyes + nose), the type==='villager' npcEntities minimap
// mirror, and the G-interact all work unchanged; isStatic is the new AI-skip gate.
export const HUB_NPCS = [
  { role: 'merchant', name: 'Bram the Trader', color: '#8b5a2b', glyph: '?' },
  { role: 'smith', name: 'Mara the Smith', color: '#7A5230', glyph: '!' },
  { role: 'guide', name: 'Old Pike the Warden', color: '#6B5A3A', glyph: '!' },
  { role: 'healer', name: 'Sister Wren', color: '#9A6A4A', glyph: '+' },
];

export function anchorFor(role) {
  return HUB_NPC_ANCHORS.find((a) => a.role === role) || { pos: [0, 6], facing: 0 };
}

export function makeNpcEntity(npc, id, groundY) {
  const a = anchorFor(npc.role);
  return {
    isMob: true,        // reuse the MobModel render + mobsQuery; the AI tick gates on !isStatic
    isNPC: true,
    isStatic: true,
    id,
    type: 'villager',   // reuse the villager body/eyes/nose render + the npcEntities minimap mirror
    role: npc.role,
    npcName: npc.name,
    glyph: npc.glyph,
    position: new THREE.Vector3(a.pos[0], groundY, a.pos[1]),
    color: npc.color,
    health: 200, maxHealth: 200,
    speed: 0, passive: true, damage: 0, xp: 0,
    rotation: a.facing,
    targetX: a.pos[0], targetZ: a.pos[1], // shape parity with spawnMob (unused while isStatic)
    homeX: a.pos[0], homeZ: a.pos[1],
    moveTimer: 0, isMoving: false, isAggro: false, lastAttackTime: 0, knockback: null, lastHit: 0,
  };
}
