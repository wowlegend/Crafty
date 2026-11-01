import { describe, it, expect } from 'vitest';
import { combatVerdict, litTurn, LIT_TURNS } from '../../scripts/visual/_lookbook.mjs';

// A COMBAT FRAME HOLDS ONLY WHAT THE STAGE PUT THERE (W3-A PR A round 2). Round 1's lookbook called a combat frame valid
// when no mob was left within 1 m of the stage, and both reviews found contaminated frames scored valid: a staged
// zombie at 40/100 under a damage number and an XP popup, spell spheres over the near mobs, a sphere and a disc hiding
// the zombie staged 14 m out, a staged captain still drawn in a cast frame after unstage(), and an unstaged Husk beside a
// projectile under a siege toast. Each is a fixture below, as the seam's frame() and the page report it, and each must
// come out invalid naming its cause; the clean frames must stay valid. The live run carries its own control (a zombie
// spawned beside the staged one, not by the stage, must be seen), so the instrument is shown able to see in the run
// that relies on it. litTurn picks the turn that puts one visible face of a staged mob in the key light's lit band and
// the other in its shadow band, the e2e's rule, for the lit hit frame.
//
// Mutation-Proof: via scripts/dev/mutate.sh against these 4 tests, each RED, an identity mutant SURVIVED:
//   K13a a hurt staged mob passes -> "the reviewers' contaminated frames"
//   K13b spells in view not counted -> "the reviewers' contaminated frames"
//   K13c a model with no live mob passes -> "the reviewers' contaminated frames"
//   K13d toasts ignored -> "the reviewers' contaminated frames"
//   K13e a passive NPC in view counted as a stray -> "clean frames stay valid"
//   K13f a turn's side face on the wrong side of the front -> "litTurn"
//   K13g an unread frame passes -> "a frame the seam could not read"

const after = { active: true, isAlive: true };
const zombie = (o = {}) => ({ entity: true, type: 'zombie', staged: true, hostile: true, health: 100, maxHealth: 100, ...o });
const wren = { entity: true, type: 'villager', staged: false, hostile: false, health: 120, maxHealth: 120 };

describe('combatVerdict: anything the stage did not put there makes the frame invalid', () => {
  const contaminated = [
    ['a staged zombie at 40/100 (a damage number and an XP popup over it)', { cast: false, frame: { mobs: [zombie({ health: 40 })], spells: 0 } }, /staged zombie is hurt: 40\/100/],
    ['spell spheres over the near mobs', { cast: false, frame: { mobs: [zombie()], spells: 2 } }, /2 spell\(s\) drawn in view; the stage put 0/],
    ['a sphere and a disc hiding the zombie staged 14 m out', { cast: false, frame: { mobs: [zombie()], spells: 2 } }, /spell\(s\) drawn in view/],
    ['the staged captain still drawn in a cast frame after unstage()', { cast: true, frame: { mobs: [{ entity: false, type: null, staged: false, hostile: null, health: null, maxHealth: null }], spells: 1 } }, /1 mob model\(s\) drawn in view with no live mob/],
    ['an unstaged Husk beside the projectile', { cast: true, frame: { mobs: [zombie({ staged: false })], spells: 1 } }, /unstaged hostile\(s\) in view: zombie/],
    ['a siege toast up', { cast: true, frame: { mobs: [], spells: 1 }, toasts: 1 }, /1 toast\(s\) up/],
    ['a staged cast still drawn after unstage()', { cast: true, frame: { mobs: [], spells: 1 }, spellsAfter: 1 }, /1 spell\(s\) still drawn after unstage/],
    ['a mob shot whose staged mob is not in view', { cast: false, frame: { mobs: [], spells: 0 } }, /staged mob is not drawn in view/],
    ['a staged mob left behind', { cast: false, frame: { mobs: [zombie()], spells: 0 }, left: ['zombie'] }, /left behind: zombie/],
  ];

  it('the reviewers\' contaminated frames: each invalid, naming its cause', () => {
    expect(contaminated.length, 'the denominator').toBe(9);
    for (const [name, c, cause] of contaminated) {
      const v = combatVerdict({ after, toasts: 0, spellsAfter: 0, ...c });
      expect(v.valid, `${name}: ${JSON.stringify(v.why)}`).toBe(false);
      expect(v.why.join('; '), name).toMatch(cause);
    }
  });

  it('clean frames stay valid: a staged mob at full health, a cast with its one spell, a settler at the Hearth', () => {
    const clean = [
      { cast: false, frame: { mobs: [zombie()], spells: 0 } },
      { cast: false, frame: { mobs: [zombie(), wren], spells: 0 } },
      { cast: true, frame: { mobs: [], spells: 1 } },
      { cast: true, frame: { mobs: [wren], spells: 1 } },
    ];
    for (const c of clean) {
      const v = combatVerdict({ after, toasts: 0, spellsAfter: 0, ...c });
      expect(v, JSON.stringify(c)).toEqual({ valid: true, why: [] });
    }
  });

  it('a frame the seam could not read, uncounted toasts, input not live or a dead player: invalid, said so', () => {
    const base = { cast: false, after, toasts: 0, spellsAfter: 0, frame: { mobs: [zombie()], spells: 0 } };
    expect(combatVerdict({ ...base, frame: { mobs: null, spells: null } }).why).toContain('frame contents not read');
    expect(combatVerdict({ ...base, toasts: undefined }).why).toContain('toasts not counted');
    expect(combatVerdict({ ...base, spellsAfter: null }).why).toContain('spells after unstage() not counted');
    expect(combatVerdict({ ...base, after: { active: false, isAlive: true } }).why).toContain('input not live');
    expect(combatVerdict({ ...base, after: { active: true, isAlive: false } }).why).toContain('player dead');
  });
});

describe('litTurn: one visible face lit, the other in shadow', () => {
  const DEG = Math.PI / 180;
  // The two faces a camera sees of a mob staged straight ahead and turned by `yaw`, as horizontal normals; the
  // horizontal lean of each toward the key light.
  const leans = (heading, yaw, key) => {
    const h = Math.hypot(key[0], key[2]);
    const lean = (r) => (Math.sin(r) * key[0] + Math.cos(r) * key[2]) / h;
    const front = (-heading + yaw) * DEG;
    const side = front + (yaw > 0 ? -90 : 90) * DEG;
    return [lean(front), lean(side)];
  };

  it('litTurn', () => {
    // A level eye looking north (-Z) at a mob facing it (+Z), the key light due east: a 45 degree turn either way shows
    // one face leaning 0.71 toward the light and the other 0.71 away.
    const east = [1, 0.5, 0];
    const t = litTurn(0, east);
    expect(Math.abs(t.yawDeg)).toBe(45);
    expect(t.split).toBeCloseTo(Math.SQRT1_2, 9);
    // Other headings with the light to one side (the 120 case is the lookbook's night key at cycle 0.75): the faces
    // really split around the light.
    for (const [heading, key] of [[0, east], [90, [0, 0.4, -1]], [120, [0.28, 0.53, -0.8]], [210, [-0.87, 0.5, -0.5]]]) {
      const best = litTurn(heading, key);
      const [f, s] = leans(heading, best.yawDeg, key);
      expect(LIT_TURNS).toContain(best.yawDeg);
      expect(Math.min(Math.max(f, s), -Math.min(f, s)), `heading ${heading}: the worse face's lean`).toBeCloseTo(best.split, 9);
      expect(best.split, `heading ${heading}: one face lit, one in shadow`).toBeGreaterThan(0.25);
      expect(Math.sign(f), `heading ${heading}: the faces on opposite sides of the light`).toBe(-Math.sign(s));
    }
    // The light straight behind the eye: every visible face leans toward it, so no turn splits them.
    expect(litTurn(0, [0, 0.5, 1]).split).toBeLessThanOrEqual(0);
    expect(litTurn(0, [0, 1, 0]), 'a light straight overhead has no side').toBeNull();
    expect(litTurn(0, null)).toBeNull();
  });
});
