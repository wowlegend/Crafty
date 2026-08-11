import { describe, it, expect } from 'vitest';
import { _statsOr, _numOr } from '../../src/QuestSystem.jsx';

// A GUARD THAT CHECKED THE BOX AND TRUSTED EVERYTHING IN IT.
//
// The save-data guards' own comment says persisted questState "may be corrupt / tampered /
// version-mismatched", and `_objOr` shape-checked the CONTAINER: any non-array object passed, `{}`
// included, and was installed wholesale by setStats. Then `prev.kills + 1` on an absent field is NaN, and
// `NaN >= target` is false for EVERY threshold -- so Warrior, Serial Slayer and Centurion become
// permanently unreachable with no error at all, while the achievements panel renders the string "NaN".
//
// No producer inside the app writes a partial blob today (the mirror effect writes the full shape on every
// change), so this is a validation gap rather than a live bug -- which is exactly the kind that waits for
// a schema change or a hand-edited save and then presents as "achievements are broken".
describe('_statsOr — coerce the FIELDS, not just the container', () => {
  it('fills every counter an empty object is missing', () => {
    const s = _statsOr({});
    for (const k of ['kills', 'spells', 'blocks_placed', 'blocks_broken', 'chests', 'distance', 'deaths']) {
      expect(s[k], `${k} came back non-numeric`).toBe(0);
    }
    expect(s.level, 'level 0 would make "Reach Level 5" read as regression').toBe(1);
    expect(s.kills_by_type).toEqual({});
  });

  it('increments cleanly afterwards — the actual failure was one addition later', () => {
    const s = _statsOr({});
    expect(s.kills + 1).toBe(1);
    expect(Number.isNaN(s.kills + 1)).toBe(false);
  });

  it('PRESERVES real values rather than resetting a valid save', () => {
    const s = _statsOr({ kills: 42, level: 7, kills_by_type: { zombie: 3 }, spells: 9 });
    expect(s.kills).toBe(42);
    expect(s.level).toBe(7);
    expect(s.spells).toBe(9);
    expect(s.kills_by_type).toEqual({ zombie: 3 });
  });

  it('keeps unknown keys, so a newer save loaded by older code loses nothing', () => {
    expect(_statsOr({ kills: 1, futureStat: 5 }).futureStat).toBe(5);
  });

  it('rejects every non-number a tampered save can carry', () => {
    for (const bad of [undefined, null, NaN, Infinity, -Infinity, '12', {}, [], true]) {
      expect(_numOr(bad), `${String(bad)} was accepted as a counter`).toBe(0);
    }
    expect(_numOr(0)).toBe(0);
    expect(_numOr(-3), 'a legitimate negative was clobbered').toBe(-3);
  });

  it('survives a stats value that is not an object at all', () => {
    for (const bad of [null, undefined, 5, 'stats', []]) {
      expect(() => _statsOr(bad)).not.toThrow();
      expect(_statsOr(bad).kills).toBe(0);
    }
  });

  it('an ARRAY kills_by_type is replaced, not spread into a numeric mess', () => {
    expect(_statsOr({ kills_by_type: ['zombie'] }).kills_by_type).toEqual({});
  });
});
