/**
 * spellPicker.js — PURE registry for the touch spell picker (STATUS §E-bis X2b).
 *
 * WHY THIS EXISTS. `setActiveSpell` was called from **exactly one place** in the whole codebase:
 * `InputManager.jsx:131-134`, on Digit1-4. There is no keyboard on a tablet, so a touch player cast
 * `fireball` — the store default (`useGameStore.jsx:561`) — **forever**, and three of the four spells were
 * unreachable on the stated iPad target. Same shape as X1 (the Aspect verbs), not a missing convenience:
 * a voxel action-RPG whose magic system is three-quarters inaccessible on half its platforms.
 *
 * DERIVED FROM `SPELL_TYPES`, NEVER RETYPED. `src/game/spells.js` is the roster of record — the module the
 * projectile, damage, targeting and VFX paths all read. Ordering off `Object.keys` means a fifth spell
 * appears in the picker the moment it exists, with no second list to forget.
 *
 * NO UNLOCK GATE, deliberately — unlike the Aspect ring. Digit1-4 is ungated on desktop, so gating the
 * touch path would make touch STRICTER than keyboard, which is the opposite of the bug being fixed. If
 * spells ever gain unlocks, this is where the filter goes, and `unlockedAspectVerbs` in aspectWheel.js is
 * the shape to copy.
 *
 * Same purity contract as `touchMath.js` / `aspectWheel.js`: no React, no DOM, no Three.
 */
import { SPELL_TYPES } from '../game/spells.js';

/** Spell ids in roster order — the same order Digit1-4 selects them in. */
export const SPELL_ORDER = Object.keys(SPELL_TYPES);

/**
 * The i18n suffix differs from the spell id for two of the four: the roster calls them `fireball` and
 * `iceball` while the string tables call them `spell.fire` and `spell.ice`. That mismatch predates this
 * module, so it is mapped here explicitly rather than papered over with a `.replace('ball','')` — a string
 * transform masquerading as a contract is exactly how a rename ships a blank button. Anything absent from
 * this map falls through to its own id, and `spellPicker.test.js` asserts every entry resolves to a real
 * key in BOTH locales, so a new spell fails the suite instead of rendering an empty label.
 */
const LABEL_SUFFIX = { fireball: 'fire', iceball: 'ice' };

/** i18n key for a spell's display name, e.g. `fireball` -> `spell.fire`. */
export function spellLabelKey(id) {
  return `spell.${LABEL_SUFFIX[id] ?? id}`;
}

/**
 * The element tint a picker button should carry, straight from the roster's own colour field so the
 * picker cannot drift from the projectile the player will actually see. `null` for an unknown id rather
 * than a fallback colour — a silently-wrong colour is worse than an obviously-missing one.
 */
export function spellAccent(id) {
  return SPELL_TYPES[id]?.color ?? null;
}
