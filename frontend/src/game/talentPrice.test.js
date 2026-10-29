import { describe, it, expect, vi } from 'vitest';

// The talent panel's Kinetic Grasp tooltip states the grab's price, and the Aspect guide card beside it states the same
// price from GRAB_COST (aspectGuide.test.js). The tooltip must follow the constant too, or a retune leaves the two cards
// in one panel disagreeing. GRAB_COST is mocked to a value nobody would type, so only a tooltip built from it passes.
vi.mock('./ember.js', async (orig) => ({ ...(await orig()), GRAB_COST: 97 }));
const { ASPECT_TREES } = await import('./talentTree.js');

describe('the Kinetic Grasp tooltip', () => {
  it('states the grab\'s price from GRAB_COST', () => {
    const grasp = ASPECT_TREES.flatMap((t) => t.nodes).find((n) => n.id === 'voidhand_grasp');
    expect(grasp, 'SETUP: no voidhand_grasp node').toBeTruthy();
    expect(grasp.desc, 'the tooltip does not state the price GRAB_COST holds').toContain('(costs 97 ember)');
  });
});
