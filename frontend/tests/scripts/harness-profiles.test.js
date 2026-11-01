// THE HARNESS PROFILES (first-minute D11, the W3-A task script's U0b; DECISIONS 2026-11-01 (W3-A PR C) item 481): who
// the player is when a harness opens the game, one table in scripts/visual/_profile.mjs. A returning player by default,
// so a spec about something else never meets the first-session beats (today the goal-loop toasts; once W3-A D2 lands,
// the cold Hearth); `fresh` opts out and seeds nothing.
//
// WHY tests/scripts/: the subject is a harness helper's exported behaviour, driven against a fake storage; it reads no
// source text. That the e2e fixture really hands the page this seed is tests/e2e/harness-profiles.spec.js, which reads
// the storage the page saw before any of its own scripts ran.
//
// Mutation-Proof: via scripts/dev/mutate.sh, 4 tests, each observed RED:
//   P1 the returning profile seeds nothing -> "a returning player is onboarded"
//   P2 plausible-wrong: the flag seeded as 'true' (the app tests presence, a reader of the value would differ) -> the same
//   P3 the default turned to fresh -> "the default is the returning player"
//   P4 an unknown name falls back to returning -> "an unknown profile is refused by name"
//   P5 seedStorage writes only the first key -> "every key of a seed is written"
//   I0 identity (a comment edit in _profile.mjs) SURVIVED.
import { describe, it, expect } from 'vitest';
import { PROFILES, DEFAULT_PROFILE, profileSeed, seedStorage } from '../../scripts/visual/_profile.mjs';
import { initArgs, initScript } from '../../scripts/visual/_lookbookPage.mjs';

/** A storage that records every write, the instrument the absences below are read from. */
function fakeStorage() {
  const writes = [];
  return { writes, setItem: (k, v) => writes.push([k, String(v)]) };
}
const seeded = (seed) => {
  const s = fakeStorage();
  const prev = globalThis.localStorage;
  globalThis.localStorage = s;
  try { seedStorage(seed); } finally { globalThis.localStorage = prev; }
  return s.writes;
};

describe('the harness profiles', () => {
  it('the default is the returning player', () => {
    expect(DEFAULT_PROFILE).toBe('returning');
    expect(Object.keys(PROFILES).sort(), 'the profiles a spec can name').toEqual(['fresh', 'returning']);
  });

  it('a returning player is onboarded, and a fresh one is seeded nothing (the same recorder saw the write)', () => {
    expect(seeded(profileSeed('returning')), 'a returning player is onboarded').toEqual([['crafty_onboarded', '1']]);
    expect(seeded(profileSeed('fresh')), 'a fresh player got a write').toEqual([]);
  });

  it('every key of a seed is written, in order', () => {
    expect(seeded({ a: '1', b: '2', c: '3' })).toEqual([['a', '1'], ['b', '2'], ['c', '3']]);
  });

  it('an unknown profile is refused by name', () => {
    expect(() => profileSeed('veteran')).toThrow(/unknown profile "veteran".*fresh, returning/);
  });
});

// The lookbook's and the media pipeline's init script (scripts/visual/_lookbookPage.mjs) takes its seed from initArgs, a
// returning player unless the caller names another, and refuses an argument with no seed: its default used to be an
// empty seed, the fresh profile, under a contract that says returning (DECISIONS 2026-11-01 (W3-A PR C) item 492).
//
// Mutation-Proof: via scripts/dev/mutate.sh, 2 tests, each observed RED:
//   S1 initArgs defaults to fresh -> "initArgs seeds a returning player unless told otherwise"
//   S2 initScript's refusal dropped (a missing seed writes nothing, the old default) -> "an init script with no seed is refused"
//   I0 identity (a comment edit in _lookbookPage.mjs) SURVIVED.
describe('the lookbook init script', () => {
  it('initArgs seeds a returning player unless told otherwise', () => {
    expect(initArgs()).toEqual({ touch: false, firstSession: false, seed: PROFILES.returning });
    expect(initArgs({ touch: true, profile: 'fresh' })).toEqual({ touch: true, firstSession: false, seed: PROFILES.fresh });
  });

  it('an init script with no seed is refused, and one with a seed writes it', () => {
    const s = fakeStorage();
    const prev = globalThis.localStorage;
    globalThis.localStorage = s;
    try {
      expect(() => initScript({ touch: false }), 'an init script with no seed is refused').toThrow(/no profile seed/);
      expect(s.writes, 'a refused init script wrote').toEqual([]);
      initScript(initArgs());
      expect(s.writes, 'the returning seed, then the controls panel marked opened').toEqual([['crafty_onboarded', '1'], ['crafty_controls_seen', '1']]);
    } finally {
      globalThis.localStorage = prev;
    }
  });
});
