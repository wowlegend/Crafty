import { describe, it, expect } from 'vitest';
import { makeVoidhandState, decideVoidhand, GRAB_CHARGE_SEC, MAX_HOLD_SEC, GRAB_COOLDOWN_SEC, PHANTOM_BLOCK_COLORS } from './voidhand.js';
import { HURL_TTL_SEC } from './hurl.js';

// S2-B2-M1: the VOIDHAND grab SM (pure reducer). Twin of beastTransform.js. The store owns `held`
// (ctx.held); this SM owns charge + hold/cooldown timers. IDLE -> CHARGING -> HELD -> hurl/slam/drop.

const base = { held: false, grabEdge: false, attack: false, cast: false, active: true, alive: true, now: 0, canGrab: true, canPay: true };

describe('IDLE -> startGrab gate', () => {
  it('a fresh grab press (off cooldown, alive, active, bank ok) starts the charge', () => {
    const { sm, action } = decideVoidhand(makeVoidhandState(), { ...base, grabEdge: true, now: 1 });
    expect(action).toBe('startGrab');
    expect(sm.charging).toBe(true);
    expect(sm.chargeStart).toBe(1);
  });
  it('is BLOCKED with no edge / no bank / dead / menu-open', () => {
    expect(decideVoidhand(makeVoidhandState(), { ...base, grabEdge: false }).action).toBe('none');
    expect(decideVoidhand(makeVoidhandState(), { ...base, grabEdge: true, canGrab: false }).action).toBe('none');
    expect(decideVoidhand(makeVoidhandState(), { ...base, grabEdge: true, alive: false }).action).toBe('none');
    expect(decideVoidhand(makeVoidhandState(), { ...base, grabEdge: true, active: false }).action).toBe('none');
  });
  it('is BLOCKED during cooldown', () => {
    const sm = { ...makeVoidhandState(), cooldownUntil: 5 };
    expect(decideVoidhand(sm, { ...base, grabEdge: true, now: 4 }).action).toBe('none'); // still cooling
    expect(decideVoidhand(sm, { ...base, grabEdge: true, now: 5 }).action).toBe('startGrab'); // cooldown elapsed
  });
});

describe('CHARGING -> commit / cancel', () => {
  const charging = { ...makeVoidhandState(), charging: true, chargeStart: 0 };
  it('stays NONE before the charge window elapses', () => {
    expect(decideVoidhand(charging, { ...base, now: GRAB_CHARGE_SEC * 0.5 }).action).toBe('none');
  });
  it('COMMITS to grab after the window (bank ok) — sets the max-hold timer', () => {
    const { sm, action } = decideVoidhand(charging, { ...base, now: GRAB_CHARGE_SEC, canGrab: true });
    expect(action).toBe('grab');
    expect(sm.charging).toBe(false);
    expect(sm.heldUntil).toBe(GRAB_CHARGE_SEC + MAX_HOLD_SEC);
  });
  it('CANCELS after the window if the bank emptied, or mid-charge on death / menu', () => {
    expect(decideVoidhand(charging, { ...base, now: GRAB_CHARGE_SEC, canGrab: false }).action).toBe('cancel');
    expect(decideVoidhand(charging, { ...base, now: 0.1, alive: false }).action).toBe('cancel');
    expect(decideVoidhand(charging, { ...base, now: 0.1, active: false }).action).toBe('cancel');
  });
});

describe('HELD -> hurl / slam / drop', () => {
  const held = { ...makeVoidhandState(), heldUntil: 100 };
  it('the attack intent re-skins to HURL, cast to SLAM (each sets cooldown)', () => {
    const hurl = decideVoidhand(held, { ...base, held: true, attack: true, now: 1 });
    expect(hurl.action).toBe('hurl');
    expect(hurl.sm.cooldownUntil).toBe(1 + GRAB_COOLDOWN_SEC);
    expect(decideVoidhand(held, { ...base, held: true, cast: true, now: 1 }).action).toBe('slam');
  });
  it('auto-DROPS at the max-hold timer, and on death', () => {
    expect(decideVoidhand(held, { ...base, held: true, now: 100 }).action).toBe('drop'); // now>=heldUntil
    expect(decideVoidhand(held, { ...base, held: true, now: 5, alive: false }).action).toBe('drop');
  });
  it('a re-press of grab RELEASES the held block (drop)', () => {
    expect(decideVoidhand(held, { ...base, held: true, grabEdge: true, now: 5 }).action).toBe('drop');
  });
  it('holds (NONE) while idle within the window', () => {
    expect(decideVoidhand(held, { ...base, held: true, now: 5 }).action).toBe('none');
  });
});

describe('S2-B2-M8: phantom tint content enumeration', () => {
  it('covers the FULL worker block-type space (1-9) with distinct, readable tints', () => {
    const keys = Object.keys(PHANTOM_BLOCK_COLORS).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]); // 9 types >= the spec's "8+"
    const values = Object.values(PHANTOM_BLOCK_COLORS);
    expect(new Set(values).size).toBe(values.length); // every tint distinct
    for (const v of values) expect(v).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

// The grab's price, decided where the press is: 'short' for a press only the price refuses, 'unpaid' for a charge whose
// price another verb spent before it committed. Neither starts anything or arms a cooldown.
describe('the price', () => {
  it('a press that would start the charge but for the price -> short: nothing starts', () => {
    const { sm, action } = decideVoidhand(makeVoidhandState(), { ...base, grabEdge: true, canPay: false });
    expect(action, 'a grab the bar cannot pay for was refused in silence, or started').toBe('short');
    expect(sm.charging).toBe(false);
    expect(sm.cooldownUntil).toBe(0);
  });
  it('a press that would not start the charge at any price is not short', () => {
    for (const [why, over, sm] of [
      ['no edge', { grabEdge: false }],
      ['dead', { grabEdge: true, alive: false }],
      ['input released', { grabEdge: true, active: false }],
      ['no talent', { grabEdge: true, canGrab: false }],
      ['in the cooldown', { grabEdge: true, now: 4 }, { ...makeVoidhandState(), cooldownUntil: 5 }],
      ['holding a block (a release)', { grabEdge: true, held: true, now: 5 }, { ...makeVoidhandState(), heldUntil: 100 }],
    ]) {
      const { action } = decideVoidhand(sm || makeVoidhandState(), { ...base, canPay: false, ...over });
      expect(action, `${why} blamed the bar`).not.toBe('short');
    }
  });
  it('a charge whose price another verb spent before it committed -> unpaid, not grab, and no cooldown', () => {
    const charging = { ...makeVoidhandState(), charging: true, chargeStart: 0 };
    const { sm, action } = decideVoidhand(charging, { ...base, now: GRAB_CHARGE_SEC, canPay: false });
    expect(action, 'an unpaid grab committed, or ended silently').toBe('unpaid');
    expect(sm.charging).toBe(false);
    expect(sm.cooldownUntil).toBe(0);
  });
});

// Twin Grasp and Lodestone (DECISIONS 2026-10-28 W1-H item 6, game/verbMods.js grabThrows): a grab that holds two blocks
// hurls or slams the first and keeps the second in hand; Long Hold and Event Horizon (holdSec) lengthen the hold.
describe('a grab that holds more than one block', () => {
  const charging = { ...makeVoidhandState(), charging: true, chargeStart: 0 };
  const commit = (ctx) => decideVoidhand(charging, { ...base, now: GRAB_CHARGE_SEC, ...ctx });

  it('commits with the throws and the hold it is given, and defaults to one throw and MAX_HOLD_SEC', () => {
    expect(commit({}).sm).toMatchObject({ throwsLeft: 1, heldUntil: GRAB_CHARGE_SEC + MAX_HOLD_SEC });
    expect(commit({ throws: 2, holdSec: 12 }).sm).toMatchObject({ throwsLeft: 2, heldUntil: GRAB_CHARGE_SEC + 12 });
    expect(commit({ throws: NaN, holdSec: undefined }).sm).toMatchObject({ throwsLeft: 1, heldUntil: GRAB_CHARGE_SEC + MAX_HOLD_SEC });
  });

  it('hurls the first block and keeps the second held, with no cooldown, then releases on the second throw', () => {
    const held = commit({ throws: 2 }).sm;
    const first = decideVoidhand(held, { ...base, held: true, attack: true, now: 1 });
    expect(first.action).toBe('hurl');
    expect(first.keep, 'the second block left the hand with the first').toBe(true);
    expect(first.sm.cooldownUntil, 'a kept block armed the release cooldown').toBe(held.cooldownUntil);
    expect(first.sm.heldUntil).toBe(held.heldUntil);
    // The hurl system flies one block at a time: the kept block waits out the first one's flight.
    expect(decideVoidhand(first.sm, { ...base, held: true, cast: true, now: 1 + HURL_TTL_SEC - 0.01 }).action, 'a throw inside the first one\'s flight went out').toBe('none');
    const t2 = 1 + HURL_TTL_SEC;
    const second = decideVoidhand(first.sm, { ...base, held: true, cast: true, now: t2 });
    expect(second.action).toBe('slam');
    expect(second.keep).toBeUndefined();
    expect(second.sm.cooldownUntil).toBe(t2 + GRAB_COOLDOWN_SEC);
  });

  it('a one-throw grab releases on its first throw, as before', () => {
    const held = commit({ throws: 1 }).sm;
    const r = decideVoidhand(held, { ...base, held: true, attack: true, now: 1 });
    expect(r.action).toBe('hurl');
    expect(r.keep).toBeUndefined();
  });

  it('a held block still drops at its hold timer, on death, and on a re-press, with throws left', () => {
    const held = commit({ throws: 3, holdSec: 4 }).sm;
    expect(decideVoidhand(held, { ...base, held: true, now: GRAB_CHARGE_SEC + 4 }).action).toBe('drop');
    expect(decideVoidhand(held, { ...base, held: true, now: 1, alive: false }).action).toBe('drop');
    expect(decideVoidhand(held, { ...base, held: true, now: 1, grabEdge: true }).action).toBe('drop');
  });
});
