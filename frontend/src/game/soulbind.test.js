import { describe, it, expect } from 'vitest';
import { makeSoulbindState, decideSoulbind, SNARE_CHANNEL_SEC, SNARE_COOLDOWN_SEC, makeFuseState, decideFuse, FUSE_CHANNEL_SEC } from './soulbind';

// The key of the pair a fuse braids (hybrids.js fuseKey over the two allies' ids).
const PAIR = '3+4';
const base = { snareEdge: false, active: true, alive: true, now: 10, canSnare: true, canPay: true, targetId: null };

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

// One bar pays every verb, so a price vetted when a channel started may be gone when it ends (a grab or an imbue spent
// it meanwhile). The refused verb did nothing, so it charges no cooldown: a press as soon as the bar is refilled works.
describe('a bind or a fuse the bar no longer pays for when its channel ends', () => {
  it('the bind is refused as unpaid: the channel ends with no cooldown, and a fresh press at once starts again', () => {
    const s = decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true, targetId: 7 }).sm;
    const end = 10 + SNARE_CHANNEL_SEC;
    const done = decideSoulbind(s, { ...base, now: end, targetId: 7, canPay: false });
    expect(done.action, 'an unpaid bind landed, or ended silently').toBe('unpaid');
    expect(done.sm.channeling).toBe(false);
    expect(done.sm.cooldownUntil, 'a refused bind charged its cooldown').toBe(0);
    expect(decideSoulbind(done.sm, { ...base, now: end + 0.1, snareEdge: true, targetId: 7 }).action).toBe('startChannel');
  });

  it('the fuse is refused the same way', () => {
    const f = { fuseEdge: true, active: true, alive: true, now: 10, canStart: true, canPay: true, pairKey: PAIR };
    const s = decideFuse(makeFuseState(), f).sm;
    const end = 10 + FUSE_CHANNEL_SEC;
    const done = decideFuse(s, { ...f, fuseEdge: false, now: end, canPay: false });
    expect(done.action, 'an unpaid fuse landed, or ended silently').toBe('unpaid');
    expect(done.sm.channeling).toBe(false);
    expect(done.sm.cooldownUntil, 'a refused fuse charged its cooldown').toBe(0);
    expect(decideFuse(done.sm, { ...f, now: end + 0.1 }).action).toBe('startFuse');
  });

  it('a paid bind and a paid fuse still charge it', () => {
    const s = decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true, targetId: 7 }).sm;
    expect(decideSoulbind(s, { ...base, now: 10 + SNARE_CHANNEL_SEC, targetId: 7 }).sm.cooldownUntil).toBeGreaterThan(10 + SNARE_CHANNEL_SEC);
    const f = { fuseEdge: true, active: true, alive: true, now: 10, canStart: true, canPay: true, pairKey: PAIR };
    const fs = decideFuse(makeFuseState(), f).sm;
    expect(decideFuse(fs, { ...f, fuseEdge: false, now: 10 + FUSE_CHANNEL_SEC }).sm.cooldownUntil).toBeGreaterThan(10 + FUSE_CHANNEL_SEC);
  });
});

describe('a snare the bar cannot pay for', () => {
  it('a press with a target in the aim and room in the squad but the price short -> short: no channel, no cooldown', () => {
    const { sm, action } = decideSoulbind(makeSoulbindState(), { ...base, snareEdge: true, targetId: 7, canPay: false });
    expect(action, 'a bind the bar cannot pay for was refused in silence, or started').toBe('short');
    expect(sm.channeling).toBe(false);
    expect(sm.cooldownUntil).toBe(0);
  });
  it('a press that would not start the channel at any price is not short', () => {
    const press = { ...base, snareEdge: true, targetId: 7, canPay: false };
    for (const [why, ctx] of [
      ['nothing to snare in the aim', { ...press, targetId: null }],
      ['a full squad or no talent', { ...press, canSnare: false }],
      ['no press', { ...press, snareEdge: false }],
      ['input released', { ...press, active: false }],
      ['dead', { ...press, alive: false }],
    ]) {
      expect(decideSoulbind(makeSoulbindState(), ctx).action, `${why} blamed the bar`).toBe('none');
    }
    expect(decideSoulbind({ ...makeSoulbindState(), cooldownUntil: 20 }, { ...press, now: 19 }).action, 'a press in the cooldown blamed the bar').toBe('none');
  });
});

describe('a fuse the bar cannot pay for', () => {
  // canStart: a pair near the player whose fusion has a recipe; canPay: the bar holds FUSE_COST.
  const press = { fuseEdge: true, active: true, alive: true, now: 10, canStart: true, canPay: false, pairKey: PAIR };

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
      ['no pair near', { ...press, pairKey: null }],
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
  const fbase = { fuseEdge: false, active: true, alive: true, now: 10, canStart: false, canPay: true, pairKey: null };
  it('arms ONLY when canStart and a pair is near (a recipe for the pair, both within FUSE_RADIUS)', () => {
    expect(decideFuse(makeFuseState(), { ...fbase, fuseEdge: true }).action).toBe('none');
    expect(decideFuse(makeFuseState(), { ...fbase, fuseEdge: true, canStart: true, pairKey: PAIR }).action).toBe('startFuse');
  });
  it('pair scatters mid-channel -> break (free); held to completion -> fuse + cooldown', () => {
    let s = decideFuse(makeFuseState(), { ...fbase, fuseEdge: true, canStart: true, pairKey: PAIR }).sm;
    const broke = decideFuse(s, { ...fbase, now: 10.5, pairKey: null });
    expect(broke.action).toBe('fuseBreak');
    expect(broke.sm.cooldownUntil).toBe(0); // breaks are free
    s = decideFuse(makeFuseState(), { ...fbase, fuseEdge: true, canStart: true, pairKey: PAIR }).sm;
    const done = decideFuse(s, { ...fbase, now: 10 + FUSE_CHANNEL_SEC, pairKey: PAIR });
    expect(done.action).toBe('fuse');
    expect(done.sm.cooldownUntil).toBeCloseTo(10 + FUSE_CHANNEL_SEC + SNARE_COOLDOWN_SEC);
  });
  // The channel braids the pair it started on. The pair is re-picked by distance every frame, and allies move, so a third
  // one can come nearer than one of the two; the thread would then join another pair, which may have no recipe at all.
  it('the channel holds the pair it started on: another nearest pair breaks it, free, and it never completes on that one', () => {
    const s = decideFuse(makeFuseState(), { ...fbase, fuseEdge: true, canStart: true, pairKey: PAIR }).sm;
    expect(s.pairKey, 'the channel did not record the pair it started on').toBe(PAIR);
    for (const now of [10.5, 10 + FUSE_CHANNEL_SEC]) {
      const other = decideFuse(s, { ...fbase, now, pairKey: '3+9' });
      expect(other.action, `another pair at ${now} did not break the channel`).toBe('fuseBreak');
      expect(other.sm.channeling).toBe(false);
      expect(other.sm.cooldownUntil, 'a broken fuse charged its cooldown').toBe(0);
    }
    expect(decideFuse(s, { ...fbase, now: 10 + FUSE_CHANNEL_SEC, pairKey: PAIR }).action, 'the same pair held to the end did not fuse').toBe('fuse');
  });
  it('death/menu cancels', () => {
    const s = decideFuse(makeFuseState(), { ...fbase, fuseEdge: true, canStart: true, pairKey: PAIR }).sm;
    expect(decideFuse(s, { ...fbase, now: 10.5, pairKey: PAIR, alive: false }).action).toBe('cancel');
  });
});
