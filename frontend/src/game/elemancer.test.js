import { describe, it, expect } from 'vitest';
import { makeImbueState, decideImbue } from './elemancer';

const base = { imbueEdge: false, castFired: false, active: true, alive: true, canIgnite: true };

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
  it('cast while NOT armed -> none (normal casts unaffected)', () => {
    expect(decideImbue(makeImbueState(), { ...base, castFired: true }).action).toBe('none');
  });
  it('death/menu while armed -> disarm (no dangling latch)', () => {
    const armed = decideImbue(makeImbueState(), { ...base, imbueEdge: true }).sm;
    expect(decideImbue(armed, { ...base, alive: false }).action).toBe('disarm');
    expect(decideImbue(armed, { ...base, active: false }).action).toBe('disarm');
  });
});

describe('S2-B4-M5: KIND_BY_SPELL (the element->zone mapping)', () => {
  it('maps all four spells to their zone kinds', async () => {
    const { KIND_BY_SPELL } = await import('./elemancer');
    expect(KIND_BY_SPELL).toEqual({ fireball: 'burning', iceball: 'frozen', lightning: 'conductive', arcane: 'resonant' });
  });
});
