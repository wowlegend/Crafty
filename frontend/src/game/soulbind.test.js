import { describe, it, expect } from 'vitest';
import { makeSoulbindState, decideSoulbind, SNARE_CHANNEL_SEC, SNARE_COOLDOWN_SEC } from './soulbind';

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
