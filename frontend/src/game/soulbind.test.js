import { describe, it, expect } from 'vitest';
import { makeSoulbindState, decideSoulbind, SNARE_CHANNEL_SEC, SNARE_COOLDOWN_SEC, makeFuseState, decideFuse, FUSE_CHANNEL_SEC } from './soulbind';

const base = { snareEdge: false, active: true, alive: true, now: 10, canSnare: true, targetId: null };

describe('S2-B3-M2: the snare-channel SM (voidhand twin, CHANNEL-shaped)', () => {
  it('idle + snareEdge + a valid target + canSnare -> startChannel (locks targetId)', () => {
    const { sm, action } = decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true, targetId: 7 });
    expect(action).toBe('startChannel');
    expect(sm.channeling).toBe(true);
    expect(sm.targetId).toBe(7);
  });
  it('idle + snareEdge but NO valid target -> none (aim is the gate)', () => {
    expect(decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true }).action).toBe('none');
  });
  it('idle + snareEdge but !canSnare -> none (the bank gates)', () => {
    expect(decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true, targetId: 7, canSnare: false }).action).toBe('none');
  });
  it('channeling: target validity loss (null or DIFFERENT id) -> channelBreak, no cooldown penalty', () => {
    let s = decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true, targetId: 7 }).sm;
    const broke = decideSoulbind(s, { ...base, now: 10.5, targetId: null });
    expect(broke.action).toBe('channelBreak');
    expect(broke.sm.channeling).toBe(false);
    expect(broke.sm.cooldownUntil).toBe(0); // broken channels cost nothing (design §2)
    s = decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true, targetId: 7 }).sm;
    expect(decideSoulbind(s, { ...base, now: 10.5, targetId: 9 }).action).toBe('channelBreak');
  });
  it('channeling: menu-close / death -> cancel', () => {
    const s = decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true, targetId: 7 }).sm;
    expect(decideSoulbind(s, { ...base, now: 10.5, targetId: 7, active: false }).action).toBe('cancel');
    expect(decideSoulbind(s, { ...base, now: 10.5, targetId: 7, alive: false }).action).toBe('cancel');
  });
  it('channeling: held to completion -> bind + cooldown armed', () => {
    const s = decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true, targetId: 7 }).sm;
    const done = decideSoulbind(s, { ...base, now: 10 + SNARE_CHANNEL_SEC, targetId: 7 });
    expect(done.action).toBe('bind');
    expect(done.sm.channeling).toBe(false);
    expect(done.sm.cooldownUntil).toBeCloseTo(10 + SNARE_CHANNEL_SEC + SNARE_COOLDOWN_SEC);
  });
  it('cooldown blocks a fresh channel', () => {
    const s = { ...makeSoulbindState(), cooldownUntil: 20 };
    expect(decideSoulbind(s, { ...base, now: 19, snareEdge: true, targetId: 7 }).action).toBe('none');
  });
});

describe('S2-B3-M4: the bind action preserves targetId for the apply-site', () => {
  it('bind returns sm.targetId intact (only break/cancel null it)', () => {
    const s = decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true, targetId: 7 }).sm;
    const done = decideSoulbind(s, { ...base, now: 10 + SNARE_CHANNEL_SEC, targetId: 7 });
    expect(done.action).toBe('bind');
    expect(done.sm.targetId).toBe(7); // Components reads ssm.targetId to captureMob the RIGHT entity
  });
});

describe('a fuse the bar cannot pay for', () => {
  // canStart: a pair near the player whose fusion has a recipe; canPay: the bar holds FUSE_COST.
  const press = { fuseEdge: true, active: true, alive: true, now: 10, canStart: true, canPay: false, pairNear: true };

  it('a press that would start the channel but for the price is short: nothing starts and no cooldown is charged', () => {
    const { sm, action } = decideFuse(makeFuseState(), press);
    expect(action, 'a fuse the bar cannot pay for was refused in silence, or started').toBe('short');
    expect(sm.channeling).toBe(false);
    expect(sm.cooldownUntil).toBe(0);
  });

  it('the same press with the price in the bar starts the channel', () => {
    expect(decideFuse(makeFuseState(), { ...press, canPay: true }).action).toBe('startFuse');
  });

  it('a press that would not start the channel whatever the bar holds is not short', () => {
    for (const [why, ctx] of [
      ['a pair with no recipe', { ...press, canStart: false }],
      ['no pair near', { ...press, pairNear: false }],
      ['no press', { ...press, fuseEdge: false }],
      ['input released', { ...press, active: false }],
      ['dead', { ...press, alive: false }],
    ]) {
      expect(decideFuse(makeFuseState(), ctx).action, `${why} blamed the bar`).toBe('none');
    }
    expect(decideFuse({ ...makeFuseState(), cooldownUntil: 20 }, { ...press, now: 19 }).action, 'a press in the cooldown blamed the bar').toBe('none');
  });
});

describe('S2-B3-M6: the FUSE channel (the snare reducer twin)', () => {
  const fbase = { fuseEdge: false, active: true, alive: true, now: 10, canStart: false, canPay: true, pairNear: false };
  it('arms ONLY when canStart && pairNear (bank + roster entry + proximity all pre-vetted)', () => {
    expect(decideFuse(makeFuseState(), { ...fbase, fuseEdge: true }).action).toBe('none');
    expect(decideFuse(makeFuseState(), { ...fbase, fuseEdge: true, canStart: true, pairNear: true }).action).toBe('startFuse');
  });
  it('pair scatters mid-channel -> break (free); held to completion -> fuse + cooldown', () => {
    let s = decideFuse(makeFuseState(), { ...fbase, fuseEdge: true, canStart: true, pairNear: true }).sm;
    const broke = decideFuse(s, { ...fbase, now: 10.5, pairNear: false });
    expect(broke.action).toBe('fuseBreak');
    expect(broke.sm.cooldownUntil).toBe(0); // breaks are free
    s = decideFuse(makeFuseState(), { ...fbase, fuseEdge: true, canStart: true, pairNear: true }).sm;
    const done = decideFuse(s, { ...fbase, now: 10 + FUSE_CHANNEL_SEC, pairNear: true });
    expect(done.action).toBe('fuse');
    expect(done.sm.cooldownUntil).toBeCloseTo(10 + FUSE_CHANNEL_SEC + SNARE_COOLDOWN_SEC);
  });
  it('death/menu cancels', () => {
    const s = decideFuse(makeFuseState(), { ...fbase, fuseEdge: true, canStart: true, pairNear: true }).sm;
    expect(decideFuse(s, { ...fbase, now: 10.5, pairNear: true, alive: false }).action).toBe('cancel');
  });
});
