import { describe, it, expect } from 'vitest';
import { makeVoidhandState, decideVoidhand, GRAB_CHARGE_SEC, MAX_HOLD_SEC, GRAB_COOLDOWN_SEC, PHANTOM_BLOCK_COLORS } from './voidhand.js';

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
    expect(sm.heldSince).toBe(GRAB_CHARGE_SEC);
  });
  it('CANCELS after the window if the bank emptied, or mid-charge on death / menu', () => {
    expect(decideVoidhand(charging, { ...base, now: GRAB_CHARGE_SEC, canGrab: false }).action).toBe('cancel');
    expect(decideVoidhand(charging, { ...base, now: 0.1, alive: false }).action).toBe('cancel');
    expect(decideVoidhand(charging, { ...base, now: 0.1, active: false }).action).toBe('cancel');
  });
});

describe('HELD -> hurl / slam / drop', () => {
  const held = { ...makeVoidhandState(), heldSince: 100 - MAX_HOLD_SEC };
  it('the attack intent re-skins to HURL, cast to SLAM (each sets cooldown)', () => {
    const hurl = decideVoidhand(held, { ...base, held: true, attack: true, now: 1 });
    expect(hurl.action).toBe('hurl');
    expect(hurl.sm.cooldownUntil).toBe(1 + GRAB_COOLDOWN_SEC);
    expect(decideVoidhand(held, { ...base, held: true, cast: true, now: 1 }).action).toBe('slam');
  });
  it('auto-DROPS at the max-hold timer, and on death', () => {
    expect(decideVoidhand(held, { ...base, held: true, now: 100 - 0.01 }).action).toBe('none');
    expect(decideVoidhand(held, { ...base, held: true, now: 100 }).action).toBe('drop'); // MAX_HOLD_SEC after heldSince
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
      ['holding a block (a release)', { grabEdge: true, held: true, now: 5 }, { ...makeVoidhandState(), heldSince: 4 }],
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
// hurls or slams the first and keeps the second in hand; Long Hold and Event Horizon (holdSec) lengthen the hold. Both
// numbers are read every tick, as the build stands then.
describe('a grab that holds more than one block', () => {
  const charging = { ...makeVoidhandState(), charging: true, chargeStart: 0 };
  const commit = (ctx) => decideVoidhand(charging, { ...base, now: GRAB_CHARGE_SEC, ...ctx });

  it('a commit starts the hold and the count of blocks thrown', () => {
    expect(commit({}).sm).toMatchObject({ heldSince: GRAB_CHARGE_SEC, thrown: 0 });
  });

  it('hurls the first block and keeps the second held, with no cooldown, then releases on the second throw', () => {
    const held = commit({ throws: 2 }).sm;
    const first = decideVoidhand(held, { ...base, held: true, attack: true, now: 1, throws: 2 });
    expect(first.action).toBe('hurl');
    expect(first.keep, 'the second block left the hand with the first').toBe(true);
    expect(first.sm.cooldownUntil, 'a kept block armed the release cooldown').toBe(held.cooldownUntil);
    expect(first.sm.heldSince).toBe(held.heldSince);
    // The kept block goes on the next click, while the first is still in the air (world/HurlSystem.jsx flies both).
    const t2 = 1 + 1 / 60;
    const second = decideVoidhand(first.sm, { ...base, held: true, cast: true, now: t2, throws: 2 });
    expect(second.action, 'the kept block waited for the first one to land').toBe('slam');
    expect(second.keep).toBeUndefined();
    expect(second.sm.cooldownUntil).toBe(t2 + GRAB_COOLDOWN_SEC);
  });

  it('a kept block can be hurled straight after a hurl, and a slam straight after a slam', () => {
    for (const verb of ['attack', 'cast']) {
      const held = commit({ throws: 2 }).sm;
      const first = decideVoidhand(held, { ...base, held: true, [verb]: true, now: 1, throws: 2 });
      const second = decideVoidhand(first.sm, { ...base, held: true, [verb]: true, now: 1 + 1 / 60, throws: 2 });
      expect(second.action, `a second ${verb} a frame later did nothing`).toBe(verb === 'attack' ? 'hurl' : 'slam');
    }
  });

  it('three throws keep two blocks, and a junk or missing count is one throw', () => {
    let sm = commit({ throws: 3 }).sm;
    const keeps = [];
    for (let i = 0; i < 3; i++) {
      const r = decideVoidhand(sm, { ...base, held: true, attack: true, now: 1 + i / 60, throws: 3 });
      keeps.push(r.keep === true);
      sm = r.sm;
    }
    expect(keeps).toEqual([true, true, false]);
    for (const throws of [undefined, NaN, 0, 1]) {
      const r = decideVoidhand(commit({}).sm, { ...base, held: true, attack: true, now: 1, throws });
      expect(r.keep, `throws ${throws} kept a block`).toBeUndefined();
    }
  });

  it('a relic taken off mid-hold takes its block with it, and the hold is the one the build has now', () => {
    // Grabbed with Lodestone (two throws); the slot changed before the first throw: one throw, so it releases.
    const held = commit({ throws: 2 }).sm;
    const r = decideVoidhand(held, { ...base, held: true, attack: true, now: 1, throws: 1 });
    expect(r.keep, 'the grab kept a block a relic no longer in the slot had given').toBeUndefined();
    expect(r.sm.cooldownUntil).toBe(1 + GRAB_COOLDOWN_SEC);
    // Long Hold's seconds count while held: past the base hold the block stays with holdSec 12, and drops without it.
    const t = GRAB_CHARGE_SEC + MAX_HOLD_SEC + 1;
    expect(decideVoidhand(held, { ...base, held: true, now: t, holdSec: 12 }).action).toBe('none');
    expect(decideVoidhand(held, { ...base, held: true, now: t }).action).toBe('drop');
  });

  it('a held block still drops at its hold timer, on death, and on a re-press, with throws left', () => {
    const held = commit({ throws: 3, holdSec: 4 }).sm;
    expect(decideVoidhand(held, { ...base, held: true, now: GRAB_CHARGE_SEC + 4 - 0.01, throws: 3, holdSec: 4 }).action).toBe('none');
    expect(decideVoidhand(held, { ...base, held: true, now: GRAB_CHARGE_SEC + 4 + 1e-9, throws: 3, holdSec: 4 }).action).toBe('drop');
    expect(decideVoidhand(held, { ...base, held: true, now: 1, alive: false, throws: 3 }).action).toBe('drop');
    expect(decideVoidhand(held, { ...base, held: true, now: 1, grabEdge: true, throws: 3 }).action).toBe('drop');
  });
});
