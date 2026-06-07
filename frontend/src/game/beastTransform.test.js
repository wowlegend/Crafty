import { describe, it, expect } from 'vitest';
import {
  makeTransformState, decideTransform,
  ANTICIPATION_SEC, FORM_DURATION_SEC, COOLDOWN_SEC,
} from './beastTransform.js';

// S2-B1-M3: the beast-transform state machine is a PURE reducer (no React/store/Rapier) so the
// roar charge -> anticipation -> commit -> duration -> exit -> cooldown logic is unit-testable.
// Components.jsx holds the state in a ref + applies the returned action (enter/exitBeastForm).

const base = (over = {}) => ({
  isBeast: false, roar: false, roarEdge: false, active: true, alive: true, now: 100, canEnter: true, ...over,
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
  it('held THROUGH the window + canEnter -> enter (sets activeUntil)', () => {
    const now = 100 + ANTICIPATION_SEC;
    const { sm, action } = decideTransform(charging(), base({ roar: true, now }));
    expect(action).toBe('enter');
    expect(sm.charging).toBe(false);
    expect(sm.activeUntil).toBe(now + FORM_DURATION_SEC);
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
  const active = (over = {}) => ({ ...makeTransformState(), activeUntil: 200, ...over });
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

describe('constants are sane', () => {
  it('positive + ordered', () => {
    expect(ANTICIPATION_SEC).toBeGreaterThan(0);
    expect(FORM_DURATION_SEC).toBeGreaterThan(ANTICIPATION_SEC);
    expect(COOLDOWN_SEC).toBeGreaterThan(0);
  });
});
