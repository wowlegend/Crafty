import { describe, it, expect } from 'vitest';
import { buildCooldownMirror } from '../../src/game/cooldownMirror.js';
import { makeVoidhandState, decideVoidhand } from '../../src/game/voidhand.js';
import { makeSoulbindState, decideSoulbind } from '../../src/game/soulbind.js';
import { makeTransformState, decideTransform } from '../../src/game/beastTransform.js';

/**
 * ONE FACT, ONE CONSTANT: HOW LONG IS THE COOLDOWN? (AUDIT:ultra:ultra-game-logic-6)
 *
 * The ability bar's radial sweep (HUD, through game/cooldownMirror.js) divides the time left by a `duration`; the real
 * gate is the state machine's `cooldownUntil = now + <constant>`. The mirror typed the durations as literals (0.6, 1.5,
 * 1.5) beside Kevin-tunable constants (GRAB_COOLDOWN_SEC, SNARE_COOLDOWN_SEC, COOLDOWN_SEC), so a retune would leave
 * the sweep starting at the wrong fraction and ending at the wrong moment while the gate it draws opens when it opens.
 *
 * This drives each REAL state machine through the transition that arms its cooldown, then reads the mirror the HUD
 * would draw on that same frame: a cooldown that has just been armed is the whole of its duration. It passes when the
 * mirror and the machine agree, and goes red the moment either constant moves without the other, which is the retune
 * the literals could not follow. The gate holds today's values only through the machines: it names no number.
 *
 * NOT CHECKED: the dodge (its cooldown lives in the Player loop's own state, which the mirror is handed) and the
 * imbue (resource-gated, no cooldown); the sweep's rendering.
 *
 * Mutation-Proof: see the commit trailer.
 */

const T = 1234.5; // the game clock, away from 0 so a missing offset shows

/** Each verb: the real machine, the transition that arms its cooldown, and where the mirror reads it. */
const VERBS = [
  {
    verb: 'grab', action: 'drop',
    arm: () => decideVoidhand({ ...makeVoidhandState(), heldSince: T - 1 }, { held: true, grabEdge: true, attack: false, cast: false, alive: true, active: true, now: T }),
    mirror: (sm) => ({ voidhand: sm }),
  },
  {
    verb: 'snare', action: 'bind',
    arm: () => decideSoulbind({ ...makeSoulbindState(), channeling: true, channelStart: T - 5, targetId: 'mob-1' }, { targetId: 'mob-1', alive: true, active: true, canPay: true, now: T }),
    mirror: (sm) => ({ soulbind: sm }),
  },
  {
    verb: 'roar', action: 'exitTimer',
    arm: () => decideTransform({ ...makeTransformState(), activeSince: T - 100 }, { isBeast: true, roarEdge: false, alive: true, active: true, now: T }),
    mirror: (sm) => ({ beast: sm }),
  },
];

describe('the ability bar draws the cooldown the state machines arm', () => {
  it.each(VERBS)('$verb: a cooldown the machine has just armed is the whole of the mirror\'s duration', ({ verb, action, arm, mirror }) => {
    const { sm, action: did } = arm();
    expect(did, `SETUP: the ${verb} machine did not take the transition that arms its cooldown`).toBe(action);
    expect(sm.cooldownUntil, `SETUP: the ${verb} machine armed no cooldown`).toBeGreaterThan(T);
    const slot = buildCooldownMirror({ now: T, ...mirror(sm), owned: { grab: 1, snare: 1, roar: 1 } })[verb];
    expect(slot.ready, `${verb}: the mirror shows a freshly armed cooldown as ready`).toBe(false);
    expect(slot.remaining, `${verb}: the sweep starts at ${slot.remaining} s of a ${slot.duration} s duration`).toBeCloseTo(slot.duration, 6);
  });

  it('every machine-backed slot the mirror carries is driven above (a fourth slot must be driven too)', () => {
    // imbue is resource-gated and dodge keeps its cooldown in the Player loop's own state: neither has a machine here.
    const slots = Object.keys(buildCooldownMirror({ now: T, owned: {} })).filter((k) => k !== 'imbue' && k !== 'dodge');
    expect(slots.sort()).toEqual(VERBS.map((v) => v.verb).sort());
  });
});
