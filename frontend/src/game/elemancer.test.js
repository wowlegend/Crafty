import { describe, it, expect } from 'vitest';
import { makeImbueState, decideImbue } from './elemancer';

const base = { imbueEdge: false, castFired: false, active: true, alive: true, canIgnite: true, canPay: true };

describe('S2-B4-M2: the imbue LATCH (simpler than every prior SM — armed until cast or cancel)', () => {
  it('Z with bank+talent (ctx.canIgnite) -> arm; Z again -> disarm (a toggle)', () => {
    const armed = decideImbue(makeImbueState(), { ...base, imbueEdge: true });
    expect(armed.action).toBe('arm');
    expect(armed.sm.armed).toBe(true);
    const off = decideImbue(armed.sm, { ...base, imbueEdge: true });
    expect(off.action).toBe('disarm');
    expect(off.sm.armed).toBe(false);
  });
  it('Z without canIgnite -> none (the bank/talent gate)', () => {
    expect(decideImbue(makeImbueState(), { ...base, imbueEdge: true, canIgnite: false }).action).toBe('none');
  });
  it('cast while armed -> consume (the apply-site spends + tags the projectile) + the latch clears', () => {
    const armed = decideImbue(makeImbueState(), { ...base, imbueEdge: true }).sm;
    const used = decideImbue(armed, { ...base, castFired: true });
    expect(used.action).toBe('consume');
    expect(used.sm.armed).toBe(false);
  });
  // One bar pays every verb, so the price vetted at the arm may be gone by the cast (a grab or a bind spent it). The cast
  // still goes out, plain: the stance ends and nothing is spent, and the caller says why the imbue did not ride it.
  it('cast while armed with the price gone -> unpaid: the latch clears and nothing is consumed', () => {
    const armed = decideImbue(makeImbueState(), { ...base, imbueEdge: true }).sm;
    const used = decideImbue(armed, { ...base, castFired: true, canPay: false });
    expect(used.action, 'an imbue the bar no longer pays for was consumed').toBe('unpaid');
    expect(used.sm.armed).toBe(false);
  });
  it('cast while NOT armed -> none (normal casts unaffected)', () => {
    expect(decideImbue(makeImbueState(), { ...base, castFired: true }).action).toBe('none');
  });
  it('death/menu while armed -> disarm (no dangling latch)', () => {
    const armed = decideImbue(makeImbueState(), { ...base, imbueEdge: true }).sm;
    expect(decideImbue(armed, { ...base, alive: false }).action).toBe('disarm');
    expect(decideImbue(armed, { ...base, active: false }).action).toBe('disarm');
  });
});

describe('the imbue\'s price at the arm', () => {
  it('Z with the talent but the price short -> short: the stance does not arm', () => {
    const { sm, action } = decideImbue(makeImbueState(), { ...base, imbueEdge: true, canPay: false });
    expect(action, 'an imbue the bar cannot pay for was refused in silence, or armed').toBe('short');
    expect(sm.armed).toBe(false);
  });
  it('a Z that would not arm at any price, or that disarms, is not short', () => {
    const armed = decideImbue(makeImbueState(), { ...base, imbueEdge: true }).sm;
    for (const [why, sm, over] of [
      ['no talent', makeImbueState(), { canIgnite: false }],
      ['dead', makeImbueState(), { alive: false }],
      ['input released', makeImbueState(), { active: false }],
      ['armed (a release)', armed, {}],
    ]) {
      expect(decideImbue(sm, { ...base, imbueEdge: true, canPay: false, ...over }).action, `${why} blamed the bar`).not.toBe('short');
    }
    expect(decideImbue(armed, { ...base, imbueEdge: true, canPay: false }).action).toBe('disarm');
  });
});

describe('S2-B4-M5: KIND_BY_SPELL (the element->zone mapping)', () => {
  it('maps all four spells to their zone kinds', async () => {
    const { KIND_BY_SPELL } = await import('./elemancer');
    expect(KIND_BY_SPELL).toEqual({ fireball: 'burning', iceball: 'frozen', lightning: 'conductive', arcane: 'resonant' });
  });
});
