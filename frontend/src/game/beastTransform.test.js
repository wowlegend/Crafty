import { describe, it, expect } from 'vitest';
import {
  makeTransformState, decideTransform,
  ANTICIPATION_SEC, FORM_DURATION_SEC, COOLDOWN_SEC, ENDURANCE_SEC_PER_RANK,
} from './beastTransform.js';

// S2-B1-M3: the beast-transform state machine is a PURE reducer (no React/store/Rapier) so the
// roar charge -> anticipation -> commit -> duration -> exit -> cooldown logic is unit-testable.
// Components.jsx holds the state in a ref + applies the returned action (enter/exitBeastForm).

const base = (over = {}) => ({
  isBeast: false, roar: false, roarEdge: false, active: true, alive: true, now: 100, canEnter: true, canPay: true, ...over,
});

describe('decideTransform — starting the charge (idle human)', () => {
  it('roar EDGE-press (all conditions) -> startCharge', () => {
    const { sm, action } = decideTransform(makeTransformState(), base({ roar: true, roarEdge: true, now: 100 }));
    expect(action).toBe('startCharge');
    expect(sm.charging).toBe(true);
    expect(sm.chargeStart).toBe(100);
  });
  it('roar HELD (not a fresh edge) does NOT start a charge', () => {
    const { action } = decideTransform(makeTransformState(), base({ roar: true, roarEdge: false }));
    expect(action).toBe('none');
  });
  it.each([['dead', { alive: false }], ['input not live', { active: false }], ['cannot enter', { canEnter: false }]])(
    'roar edge but %s -> none', (_label, over) => {
      const { action } = decideTransform(makeTransformState(), base({ roar: true, roarEdge: true, ...over }));
      expect(action).toBe('none');
    });
  it('roar edge while on cooldown -> none; after cooldown -> startCharge', () => {
    const sm = { ...makeTransformState(), cooldownUntil: 105 };
    expect(decideTransform(sm, base({ roar: true, roarEdge: true, now: 104 })).action).toBe('none');
    expect(decideTransform(sm, base({ roar: true, roarEdge: true, now: 105 })).action).toBe('startCharge');
  });
});

describe('decideTransform — the charge window (anticipation)', () => {
  const charging = (over = {}) => ({ ...makeTransformState(), charging: true, chargeStart: 100, ...over });
  it('held but BEFORE the anticipation window -> none (still charging)', () => {
    const { sm, action } = decideTransform(charging(), base({ roar: true, now: 100 + ANTICIPATION_SEC - 0.01 }));
    expect(action).toBe('none');
    expect(sm.charging).toBe(true);
  });
  it('held THROUGH the window + canEnter -> enter (starts the form\'s clock)', () => {
    const now = 100 + ANTICIPATION_SEC;
    const { sm, action } = decideTransform(charging(), base({ roar: true, now }));
    expect(action).toBe('enter');
    expect(sm.charging).toBe(false);
    expect(sm.activeSince).toBe(now);
  });
  it('released early -> cancel (no spend)', () => {
    const { sm, action } = decideTransform(charging(), base({ roar: false, now: 100 + ANTICIPATION_SEC + 1 }));
    expect(action).toBe('cancel');
    expect(sm.charging).toBe(false);
  });
  it('window completes but canEnter went false -> cancel, not enter', () => {
    const { action } = decideTransform(charging(), base({ roar: true, now: 100 + ANTICIPATION_SEC, canEnter: false }));
    expect(action).toBe('cancel');
  });
  it('dies mid-charge -> cancel', () => {
    const { action } = decideTransform(charging(), base({ roar: true, alive: false, now: 100.1 }));
    expect(action).toBe('cancel');
  });
});

describe('decideTransform — active (beast) -> exit', () => {
  const active = (over = {}) => ({ ...makeTransformState(), activeSince: 200 - FORM_DURATION_SEC, ...over });
  it('before the duration ends, no roar -> none', () => {
    expect(decideTransform(active(), base({ isBeast: true, now: 150 })).action).toBe('none');
  });
  it('duration elapsed -> exitTimer + sets cooldown', () => {
    const { sm, action } = decideTransform(active(), base({ isBeast: true, now: 200 }));
    expect(action).toBe('exitTimer');
    expect(sm.cooldownUntil).toBe(200 + COOLDOWN_SEC);
  });
  it('roar EDGE while active -> exitManual + sets cooldown', () => {
    const { sm, action } = decideTransform(active(), base({ isBeast: true, roar: true, roarEdge: true, now: 150 }));
    expect(action).toBe('exitManual');
    expect(sm.cooldownUntil).toBe(150 + COOLDOWN_SEC);
  });
  it('holding roar through the transform (not a fresh edge) does NOT instantly exit', () => {
    expect(decideTransform(active(), base({ isBeast: true, roar: true, roarEdge: false, now: 150 })).action).toBe('none');
  });
});

describe('B1 regression — a charge interrupted by DEATH must not auto-fire on respawn', () => {
  // The Components fix ticks the SM ABOVE the dead-window early-return, so it runs while dead and
  // cancels the in-flight charge via its own !alive guard (instead of the charge tunnelling through
  // the dead window and firing on respawn with R still held). This locks that frame sequence.
  it('cancels at the death frame, then stays HUMAN on respawn with roar still held (no fresh edge)', () => {
    let sm = makeTransformState();
    ({ sm } = decideTransform(sm, base({ roar: true, roarEdge: true, now: 100 })));        // start charge (alive)
    expect(sm.charging).toBe(true);
    let r = decideTransform(sm, base({ roar: true, roarEdge: false, alive: false, now: 100.2 })); // die mid-charge, SM ticked while dead
    sm = r.sm;
    expect(r.action).toBe('cancel');
    expect(sm.charging).toBe(false);
    r = decideTransform(sm, base({ roar: true, roarEdge: false, alive: true, now: 110 }));  // respawn seconds later, R still held
    expect(r.action).toBe('none');                                                          // must NOT auto-enter
  });
});

describe('constants are sane', () => {
  it('positive + ordered', () => {
    expect(ANTICIPATION_SEC).toBeGreaterThan(0);
    expect(FORM_DURATION_SEC).toBeGreaterThan(ANTICIPATION_SEC);
    expect(COOLDOWN_SEC).toBeGreaterThan(0);
  });
});

describe('a longer roar: the form lasts ctx.formDurationSec (game/verbMods.js roarSec), read every tick', () => {
  const since = 100;
  const inForm = { ...makeTransformState(), activeSince: since };
  const longer = FORM_DURATION_SEC + 2 * ENDURANCE_SEC_PER_RANK;

  it('a longer form is still on past the base length and ends at its own', () => {
    expect(decideTransform(inForm, base({ isBeast: true, now: since + FORM_DURATION_SEC, formDurationSec: longer })).action,
      'the longer form ended at the base length').toBe('none');
    expect(decideTransform(inForm, base({ isBeast: true, now: since + longer, formDurationSec: longer })).action).toBe('exitTimer');
  });

  it('without ctx.formDurationSec the form ends at the base length', () => {
    expect(decideTransform(inForm, base({ isBeast: true, now: since + FORM_DURATION_SEC - 0.01 })).action).toBe('none');
    expect(decideTransform(inForm, base({ isBeast: true, now: since + FORM_DURATION_SEC })).action).toBe('exitTimer');
  });

  it('a relic taken off mid-form takes its seconds with it: the same tick under the shorter length ends the form', () => {
    // Entered with Ember Fang (+4 s), then the slot changed: the length is the one the build has now.
    const withFang = FORM_DURATION_SEC + 4;
    const charging = { ...makeTransformState(), charging: true, chargeStart: since - ANTICIPATION_SEC };
    const entered = decideTransform(charging, base({ roar: true, now: since, formDurationSec: withFang }));
    expect(entered.action, 'SETUP: the roar did not enter').toBe('enter');
    const t = since + FORM_DURATION_SEC + 1;
    expect(decideTransform(entered.sm, base({ isBeast: true, now: t, formDurationSec: withFang })).action).toBe('none');
    expect(decideTransform(entered.sm, base({ isBeast: true, now: t, formDurationSec: FORM_DURATION_SEC })).action,
      'the form kept a relic\'s seconds after the relic left the slot').toBe('exitTimer');
  });
});

// One ember bar pays every Aspect verb, so the reducer is the one place that knows whether a press would have started
// the roar but for its price. 'short' and 'unpaid' start nothing and arm no cooldown; the caller says why.
describe('decideTransform — the price', () => {
  it('a roar edge that would start the charge but for the price -> short: nothing starts', () => {
    const { sm, action } = decideTransform(makeTransformState(), base({ roar: true, roarEdge: true, canPay: false }));
    expect(action, 'a roar the bar cannot pay for was refused in silence, or started').toBe('short');
    expect(sm.charging).toBe(false);
    expect(sm.cooldownUntil).toBe(0);
  });
  it('a press that would not start the charge at any price is not short', () => {
    for (const [why, over, sm] of [
      ['no edge (R held)', { roar: true, roarEdge: false }],
      ['dead', { roarEdge: true, alive: false }],
      ['input released', { roarEdge: true, active: false }],
      ['no talent', { roarEdge: true, canEnter: false }],
      ['in the cooldown', { roarEdge: true, now: 104 }, { ...makeTransformState(), cooldownUntil: 105 }],
      ['in a form (a release)', { roarEdge: true, isBeast: true }, { ...makeTransformState(), activeSince: 99 }],
    ]) {
      const { action } = decideTransform(sm || makeTransformState(), base({ roar: true, canPay: false, ...over }));
      expect(action, `${why} blamed the bar`).not.toBe('short');
    }
  });
  it('a charge whose price another verb spent before it committed -> unpaid, not enter, and no cooldown', () => {
    const charging = { ...makeTransformState(), charging: true, chargeStart: 100 };
    const { sm, action } = decideTransform(charging, base({ roar: true, now: 100 + ANTICIPATION_SEC, canPay: false }));
    expect(action, 'an unpaid roar entered, or ended silently').toBe('unpaid');
    expect(sm.charging).toBe(false);
    expect(sm.cooldownUntil).toBe(0);
  });
  it('a charge released, or with the talent gone, before it commits is a cancel, not unpaid, whatever the bar holds', () => {
    const charging = { ...makeTransformState(), charging: true, chargeStart: 100 };
    expect(decideTransform(charging, base({ roar: false, now: 100.1, canPay: false })).action).toBe('cancel');
    expect(decideTransform(charging, base({ roar: true, now: 100 + ANTICIPATION_SEC, canEnter: false, canPay: false })).action).toBe('cancel');
  });
});
