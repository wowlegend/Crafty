import { describe, it, expect } from 'vitest';
import { makeVoidhandState, decideVoidhand, GRAB_CHARGE_SEC, MAX_HOLD_SEC, GRAB_COOLDOWN_SEC } from './voidhand.js';

// S2-B2-M1: the VOIDHAND grab SM (pure reducer). Twin of beastTransform.js. The store owns `held`
// (ctx.held); this SM owns charge + hold/cooldown timers. IDLE -> CHARGING -> HELD -> hurl/slam/drop.

const base = { held: false, grabEdge: false, attack: false, cast: false, active: true, alive: true, now: 0, canGrab: true };

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
