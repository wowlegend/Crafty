import { describe, it, expect } from 'vitest';
import { litLights, isWarded, nearestLit, objectiveFor, WARD_RADIUS_M, OBJECTIVE_REACH_M } from './lights.js';
import { HEARTH_BRAZIER } from '../world/homeAnchor.js';

// THE LIGHTS (W3-A task script, unit L1; DECISIONS 2026-11-01 (W3-A PR C) item 499): one home for the 16 m ward, the
// light a fall rises at and the siege's objective. Pure: the lights are derived from the store's own fields.
const lit = { hearthLit: true, hearthFlame: 1, lanterns: [] };
const at = (x, z) => ({ kind: 'lantern', x, z });

describe('litLights', () => {
  it('holds the Hearth while it is lit with flame left, each placed lantern at its cell\'s centre, and the lit shrines', () => {
    expect(litLights(lit)).toEqual([{ kind: 'hearth', x: HEARTH_BRAZIER.x, z: HEARTH_BRAZIER.z }]);
    expect(litLights({ ...lit, hearthLit: false }), 'a cold Hearth is a light').toEqual([]);
    expect(litLights({ ...lit, hearthFlame: 0 }), 'a doused Hearth is a light').toEqual([]);
    expect(litLights({ ...lit, hearthFlame: 0.25 }).map((l) => l.kind), 'a low flame is no light').toEqual(['hearth']);
    expect(litLights({ ...lit, hearthLit: false, lanterns: [{ x: 10, y: 52, z: -3 }] }), 'a lantern is not at its cell\'s centre')
      .toEqual([{ kind: 'lantern', x: 10.5, z: -2.5 }]);
    expect(litLights({ ...lit, hearthLit: false }, [{ x: 160, z: 80 }]), 'a lit shrine is not a light').toEqual([{ kind: 'shrine', x: 160, z: 80 }]);
    expect(litLights({}), 'a state with no fields lights anything').toEqual([]);
  });
});

describe('isWarded', () => {
  it('wards 15.9 m from a light and not 16.1 m, on any bearing', () => {
    expect(WARD_RADIUS_M).toBe(16);
    let checked = 0;
    for (const a of [0, 0.7, Math.PI / 2, 2.4, Math.PI, 4.1, 5.5]) {
      const l = at(3, -7);
      const p = (r) => [l.x + r * Math.sin(a), l.z + r * Math.cos(a)];
      expect(isWarded(...p(15.9), [l]), `15.9 m on bearing ${a} is not warded`).toBe(true);
      expect(isWarded(...p(16.1), [l]), `16.1 m on bearing ${a} is warded`).toBe(false);
      checked += 1;
    }
    expect(checked).toBe(7);
  });

  it('wards the union of two lights, and nothing with no lights', () => {
    const two = [at(0, 0), at(40, 0)];
    expect(isWarded(-15, 0, two), 'the first light\'s side').toBe(true);
    expect(isWarded(55, 0, two), 'the second light\'s side').toBe(true);
    expect(isWarded(20, 0, two), 'the gap between them is warded').toBe(false);
    expect(isWarded(0, 0, []), 'nothing wards with no lights').toBe(false);
  });

  it('wards nothing about an unlit or doused Hearth', () => {
    const { x, z } = HEARTH_BRAZIER;
    expect(isWarded(x + 5, z, litLights(lit)), 'SETUP: the lit Hearth does not ward 5 m off').toBe(true);
    expect(isWarded(x + 5, z, litLights({ ...lit, hearthLit: false })), 'an unlit Hearth wards').toBe(false);
    expect(isWarded(x + 5, z, litLights({ ...lit, hearthFlame: 0 })), 'a doused Hearth wards').toBe(false);
  });

  it('takes another radius', () => {
    expect(isWarded(9, 0, [at(0, 0)], 10)).toBe(true);
    expect(isWarded(11, 0, [at(0, 0)], 10)).toBe(false);
  });
});

describe('nearestLit', () => {
  it('is the light nearest the point, and null with none', () => {
    const lights = [at(30, 0), at(-10, 2), at(0, 25)];
    expect(nearestLit(0, 0, lights)).toBe(lights[1]);
    expect(nearestLit(28, 1, lights)).toBe(lights[0]);
    expect(nearestLit(1, 20, lights)).toBe(lights[2]);
    expect(nearestLit(0, 0, [])).toBeNull();
  });
});

describe('objectiveFor', () => {
  it('is the lit light nearest the player within 32 m, else the player', () => {
    expect(OBJECTIVE_REACH_M).toBe(32);
    const player = { x: 0, z: 0 };
    expect(objectiveFor(player, []), 'with no lights the objective is not the player').toEqual({ kind: 'player', x: 0, z: 0 });
    const near = at(31.9, 0);
    expect(objectiveFor(player, [at(40, 40), near]), 'a light 31.9 m off is not the objective').toBe(near);
    expect(objectiveFor(player, [at(32.1, 0)]), 'a light 32.1 m off is the objective').toEqual({ kind: 'player', x: 0, z: 0 });
    const far = at(0, 50);
    expect(objectiveFor(player, [far], 60), 'a wider reach is not read').toBe(far);
  });
});
