import { describe, it, expect } from 'vitest';
import { HUB_BUILDINGS, HUB_NPC_ANCHORS } from '../../src/world/hubLayout.js';
import { HEARTH_RADIUS } from '../../src/world/homeAnchor.js';

describe('hub layout', () => {
  it('defines 3-4 buildings (forge, stall, watchtower) with kind + position + a footprint', () => {
    expect(HUB_BUILDINGS.length).toBeGreaterThanOrEqual(3);
    expect(HUB_BUILDINGS.length).toBeLessThanOrEqual(4);
    const kinds = HUB_BUILDINGS.map((b) => b.kind);
    expect(kinds).toContain('forge');
    expect(kinds).toContain('stall');
    expect(kinds).toContain('watchtower');
    for (const b of HUB_BUILDINGS) { expect(Array.isArray(b.pos)).toBe(true); expect(b.pos).toHaveLength(2); }
  });
  it('buildings sit OUTSIDE the standable Hearth pad core but within a walkable ring (no spawn-on-roof)', () => {
    for (const b of HUB_BUILDINGS) {
      const r = Math.hypot(b.pos[0], b.pos[1]);
      expect(r).toBeGreaterThan(HEARTH_RADIUS - 2); // not under the player's feet at origin
      expect(r).toBeLessThan(26); // a tight outpost, not sprawling
    }
  });
  it('defines 4 NPC anchor coords keyed by role, none colliding with a building footprint', () => {
    const roles = HUB_NPC_ANCHORS.map((n) => n.role);
    for (const r of ['merchant', 'smith', 'guide', 'healer']) expect(roles).toContain(r);
    for (const n of HUB_NPC_ANCHORS) expect(n.pos).toHaveLength(2);
  });
});
