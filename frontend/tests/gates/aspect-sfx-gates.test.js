import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip, carriersOf } from './_srcWalk.js';
import { VOICES } from '../../src/audio/synthVoices.js';

const read = (rel) => strip(readFileSync(resolve(SRC, rel), 'utf8'));

/**
 * Aspect verb SFX — every named sound is REGISTERED and CALLED. WILDHEART once shipped audio-silent.
 *
 * REWRITTEN 2026-09-22, selected by `gate-census.mjs` at 0/5. The registry half was a regex per name
 * (`new RegExp(name + ': make')`) over `synthVoices.js` as text — which answers "the file contains that
 * string", not "the registry has that entry". `VOICES` is a plain exported object, so the claim is
 * drivable: read the key, check the value is callable. A registry entry that exists and is not a
 * function is the shape a text match cannot distinguish from a working one.
 *
 * Headless jsdom has no WebAudio, so nothing here can HEAR anything — that limit is real and is why the
 * call-site half stays a source assertion. But it is now anchored to the call FORM and searched
 * repo-wide rather than in two hand-named files, because a verb's sound moving to a different module is
 * exactly what a two-file check absorbs silently.
 *
 * BLIND SPOT, stated (R7): nothing here plays a sound, and nothing proves the call site is REACHED in a
 * running game. That second gap is this repo's most-repeated defect — four features in one day shipped
 * compiling, gated green and never reached — and it applies directly: `playSpatialSound('roar')` can sit
 * behind a condition that never fires. What is proven is that every named voice exists, is callable, and
 * is invoked somewhere in src.
 *
 * Mutation-Proof: 4 mutations, recorded on the commit.
 */
const NAMES = ['roar', 'grab', 'hurl', 'slam', 'anvilHit', 'bind'];

describe('Aspect SFX wiring gates', () => {
  it('the name list is non-empty and pinned — every case below quantifies over it', () => {
    expect(NAMES).toHaveLength(6);
    expect(new Set(NAMES).size, 'a duplicated name silently halves the denominator').toBe(NAMES.length);
  });

  it('every Aspect SFX is a CALLABLE entry in the voice registry — driven, not matched', () => {
    // `Object.keys(VOICES)` is the registry itself. A regex over the source would pass on a commented
    // entry, a string, or a name mentioned in a docblock.
    const missing = NAMES.filter((n) => typeof VOICES[n] !== 'function');
    expect(missing, 'a named Aspect sound has no callable generator in VOICES').toEqual([]);
    // And the registry is substantial, so the check above is not passing over a near-empty object.
    expect(Object.keys(VOICES).length, 'the voice registry collapsed').toBeGreaterThan(20);
  });

  it('SoundManager still LOOPS the one registry, so the buffers actually load', () => {
    // A registry nothing iterates is a registry nothing plays. This is the single line that turns the
    // object above into audio.
    expect(read('SoundManager.jsx'), 'nothing iterates VOICES — no generated buffer ever loads')
      .toMatch(/Object\.entries\(VOICES\)/);
  });

  it('every Aspect verb SOUNDS somewhere in src — repo-wide, not in two named files', () => {
    const silent = NAMES.filter((n) => carriersOf(new RegExp(`playSpatialSound\\('${n}'`)).length === 0);
    expect(silent, 'an Aspect verb has no call site — it would ship audio-silent, as WILDHEART did')
      .toEqual([]);
  });

  it('the roar sounds at the beast-enter site specifically — the owed B1 backfill', () => {
    // This one IS a claim about a location, so it names the file deliberately rather than searching.
    expect(read('Components.jsx'), 'the beast transform is silent again').toMatch(/playSpatialSound\('roar'/);
  });
});
