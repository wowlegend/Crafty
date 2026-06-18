import { describe, it, expect } from 'vitest';
import { HUB_NPCS, makeNpcEntity } from '../../src/world/npcSpawn.js';

describe('hub NPCs', () => {
  it('defines merchant + smith + guide + healer with name + role + color', () => {
    const roles = HUB_NPCS.map((n) => n.role);
    for (const r of ['merchant', 'smith', 'guide', 'healer']) expect(roles).toContain(r);
    for (const n of HUB_NPCS) { expect(n.name).toBeTruthy(); expect(n.color).toMatch(/^#/); }
  });
  it('makeNpcEntity stamps a STATIC, non-hostile, AI-skipped entity at the anchor', () => {
    const e = makeNpcEntity(HUB_NPCS[0], 42, 56.5);
    expect(e.isNPC).toBe(true);
    expect(e.isStatic).toBe(true);
    expect(e.passive).toBe(true);
    expect(e.damage).toBe(0);
    expect(e.id).toBe(42);
    expect(e.npcName).toBe(HUB_NPCS[0].name);
    expect(e.role).toBe(HUB_NPCS[0].role);
    expect(e.position.y).toBeCloseTo(56.5);
  });
});
