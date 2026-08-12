import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeExpressVerb, EXPRESS_VERBS } from '../../src/input/expressVerbs.js';
import { KEY_MAP } from '../../src/game/keyMap.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(HERE, '../../src', rel), 'utf8');

// F CASTS, T MELEES (Kevin, 2026-06-28: magic is the marquee feature, so the prime key gets it).
//
// This gate used to pin the binding with a windowed source regex:
//
//     /code === 'KeyF'\)\s*\{[\s\S]{0,120}triggerSpellCast\(\)/
//
// It asserts two tokens appear within 120 characters of each other in a 1380-line file. A
// commented-out call satisfies it; a reformat, a longer guard, or an added comment breaks it — and its
// own comment admitted the window was hand-tuned to stop the F block bleeding into the adjacent T block,
// which is a gate whose correctness depends on the line spacing of the code beneath it.
//
// The thing worth protecting is a MAPPING with exactly one dangerous confusion in it — F firing melee
// instead of cast — and a mapping is a function. It lives in input/expressVerbs.js now, so this asks it
// directly. What no pure test can see (that Components calls it, and dispatches each verb to the right
// trigger) stays textual and is anchored to the call form rather than to a proximity window.
const LIVE = { active: true, isAlive: true };

describe('the express bindings route the right verb', () => {
  it('F casts, and specifically does NOT melee', () => {
    // The confusion the binding change exists to prevent, stated in both directions.
    expect(routeExpressVerb('KeyF', LIVE)).toBe('cast');
    expect(routeExpressVerb('KeyF', LIVE), 'F fires melee — the 2026-06-28 binding is inverted').not.toBe('melee');
  });

  it('T melees, and specifically does NOT cast', () => {
    expect(routeExpressVerb('KeyT', LIVE)).toBe('melee');
    expect(routeExpressVerb('KeyT', LIVE)).not.toBe('cast');
  });

  it('every other key routes to NOTHING', () => {
    // The denominator. A router that returned a verb for anything would satisfy both tests above while
    // making every keystroke in the game swing a sword.
    let checked = 0;
    for (const code of ['KeyG', 'KeyR', 'KeyV', 'KeyX', 'KeyZ', 'KeyW', 'Space', 'Escape', 'Digit1', 'ShiftLeft', '', null, undefined]) {
      expect(routeExpressVerb(code, LIVE), `"${code}" fired an express verb`).toBeNull();
      checked++;
    }
    expect(checked).toBe(13);
  });
});

describe('the liveness gate is inside the router, not left to the caller', () => {
  it('a DEAD player fires nothing', () => {
    // Kevin was once killed by being input-dead with no way back (8e68425); firing verbs from a corpse
    // is the mirror of that. Both express verbs, since one gated and the other not is the available bug.
    for (const code of Object.keys(EXPRESS_VERBS)) {
      expect(routeExpressVerb(code, { active: true, isAlive: false }), `${code} fires while dead`).toBeNull();
    }
  });

  it('an INACTIVE input (paused, or a panel open) fires nothing', () => {
    for (const code of Object.keys(EXPRESS_VERBS)) {
      expect(routeExpressVerb(code, { active: false, isAlive: true }), `${code} fires while paused`).toBeNull();
      expect(routeExpressVerb(code, { active: false, isAlive: false })).toBeNull();
    }
  });

  it('a missing context fires nothing rather than throwing', () => {
    expect(routeExpressVerb('KeyF', null)).toBeNull();
    expect(routeExpressVerb('KeyF', {})).toBeNull();
  });

  it('and the gate is really load-bearing — the LIVE case still fires', () => {
    // Without this, a router hardwired to null passes every assertion in this block.
    expect(routeExpressVerb('KeyF', LIVE)).toBe('cast');
    expect(routeExpressVerb('KeyT', LIVE)).toBe('melee');
  });
});

describe('the router is WIRED, and each verb reaches its own trigger', () => {
  it('Components routes its keydown through it', () => {
    // The one edge a pure test cannot reach: that the component consults this rather than keeping its own
    // inline copy of the mapping. Anchored to the call form, not a proximity window.
    const comp = read('Components.jsx');
    expect(comp, 'Components no longer calls routeExpressVerb — it has its own copy of the binding')
      .toMatch(/routeExpressVerb\(e\.code,\s*\{[^}]*active:[^}]*isAlive:[^}]*\}\)/);
  });

  it('cast dispatches the spell trigger and melee dispatches the melee trigger', () => {
    // The crossover is the defect that matters: routing correctly and then calling the wrong function
    // reproduces the exact bug the binding change fixed, one layer further down.
    const comp = read('Components.jsx');
    expect(comp).toMatch(/express === 'cast'\)\s*triggerSpellCast\(\)/);
    expect(comp).toMatch(/express === 'melee'\)\s*triggerMeleeAttack\(\)/);
    expect(/express === 'cast'\)\s*triggerMeleeAttack\(\)/.test(comp), 'cast is wired to the melee trigger').toBe(false);
    expect(/express === 'melee'\)\s*triggerSpellCast\(\)/.test(comp), 'melee is wired to the cast trigger').toBe(false);
  });
});

describe('both keys are ADVERTISED, so a player can find them', () => {
  it('keyMap teaches F = Cast and T = Melee', () => {
    // Driven off the real table rather than grepped out of its source. Two live keybinds once shipped
    // advertised nowhere at all (8a5e008); the keyMap suite gates that correspondence in both directions,
    // and this pins the two rows this binding change created.
    const byCode = Object.fromEntries(KEY_MAP.filter((r) => r.code).map((r) => [r.code, r]));
    expect(byCode.KeyF, 'F is not advertised').toBeTruthy();
    expect(byCode.KeyT, 'T is not advertised').toBeTruthy();
    expect(byCode.KeyF.label, `F is advertised as "${byCode.KeyF?.label}"`).toMatch(/cast/i);
    expect(byCode.KeyT.label, `T is advertised as "${byCode.KeyT?.label}"`).toMatch(/melee/i);
  });

  it('the advertisement matches what the router actually does', () => {
    // The two could drift: a label saying Cast beside a router returning melee teaches a lie. This is the
    // pair the old gate checked in two unrelated files with two unrelated regexes.
    const byCode = Object.fromEntries(KEY_MAP.filter((r) => r.code).map((r) => [r.code, r]));
    for (const [code, verb] of Object.entries(EXPRESS_VERBS)) {
      expect(byCode[code], `${code} routes to "${verb}" but is advertised nowhere`).toBeTruthy();
      expect(byCode[code].label.toLowerCase(),
        `${code} routes to "${verb}" but is advertised as "${byCode[code].label}"`).toContain(verb);
    }
  });
});
