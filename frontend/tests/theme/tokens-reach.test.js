import { describe, it, expect } from 'vitest';
import { UI } from '../../src/theme/tokens.js';
import { CSS_VAR_MAP, TW_COLORS, TW_SCALES } from '../../src/theme/cssVars.js';
import twConfig from '../../tailwind.config.cjs';

// TOKENS THAT REACHED NOTHING.
//
// The design language declares ONE source-of-truth chain: tokens.js -> cssVars.js -> tailwind.config.cjs.
// Three groups were not on it. `color.gray` (an 8-value neutral ramp commented "kept") was absent from
// COLOR_VARS, so unlike every sibling colour it was never even emitted as a CSS var. `space` (a 5-value
// spacing scale) reached neither TW_SCALES nor the config, while every component uses Tailwind's own
// spacing. `motion` (durations + easings) was read by exactly one test assertion and nothing that renders.
//
// A token nothing reads is not a design system, it is a second opinion nobody consults -- and the whole
// point of that file is to be the ONE opinion. gray and space were deleted; motion was wired, because a
// transition scale is precisely the kind of value that otherwise gets retyped per component.
//
// THIS GATE IS THE DURABLE HALF. Deleting three orphans does not stop a fourth; a gate that fails on any
// unreached group does. Its exception list is explicit and must carry a reason, because an allowlist
// without one is how a gate quietly becomes a rubber stamp.
const EXTEND = twConfig.theme.extend;

/** Groups that legitimately do not reach Tailwind, each with the reason it does not. */
const NOT_TAILWIND = {
  // Emitted as CSS custom properties by applyThemeVars and consumed through rgb(var(--ui-*)); the config
  // references those vars rather than the raw values, which is the point of the indirection.
  color: 'emitted as --ui-* CSS vars (COLOR_VARS), which the config then references',
  // The raw px numbers behind borderRadius/borderWidth in TW_SCALES; the derived scale is what ships.
  radius: 'consumed by TW_SCALES.borderRadius',
  border: 'consumed by TW_SCALES.borderWidth',
  elevation: 'consumed by TW_SCALES.boxShadow',
  type: 'consumed by TW_SCALES.fontFamily + fontSize',
  z: 'consumed by TW_SCALES.zIndex',
  motion: 'consumed by TW_SCALES.transitionDuration + transitionTimingFunction',
};

/** Everything TW_SCALES is built from, as a flat set of source-group names it consumes. */
const CONSUMED_BY_SCALES = new Set(['radius', 'border', 'elevation', 'type', 'z', 'motion']);

describe('tokens — every group reaches the chain', () => {
  it('enumerates a real token set', () => {
    expect(Object.keys(UI).length, 'the token file is empty, so everything below is vacuous').toBeGreaterThan(4);
  });

  it('NO group is an orphan — reached by CSS vars, by TW_SCALES, or explicitly excepted with a reason', () => {
    const orphans = [];
    for (const group of Object.keys(UI)) {
      const reachesVars = group === 'color';
      const reachesScales = CONSUMED_BY_SCALES.has(group);
      const excepted = typeof NOT_TAILWIND[group] === 'string' && NOT_TAILWIND[group].length > 10;
      if (!reachesVars && !reachesScales && !excepted) orphans.push(group);
    }
    expect(orphans, 'these token groups reach nothing — add them to the chain or delete them').toEqual([]);
  });

  it('every exception carries a REASON, not just a name', () => {
    for (const [k, why] of Object.entries(NOT_TAILWIND)) {
      expect(typeof why, `${k} has no reason`).toBe('string');
      expect(why.length, `${k}'s reason is too thin to audit`).toBeGreaterThan(10);
    }
  });

  it('the exception list names only groups that actually exist', () => {
    // An exception for a deleted group is dead weight that makes the list look more considered than it is.
    const stale = Object.keys(NOT_TAILWIND).filter((k) => !(k in UI));
    expect(stale, 'the exception list names a token group that no longer exists').toEqual([]);
  });

  it('the deleted orphans stay deleted', () => {
    expect(UI.space, 'the unused spacing scale is back').toBeUndefined();
    expect(UI.color.gray, 'the unconsumed neutral ramp is back').toBeUndefined();
  });

  it('motion actually reaches Tailwind now, in BOTH copies', () => {
    // The wiring half. TW_SCALES alone is not enough: the CJS config cannot import it, so the config's
    // own mirror is what generates classes, and it must agree.
    expect(TW_SCALES.transitionDuration).toBeTruthy();
    expect(EXTEND.transitionDuration, 'the config never got the duration scale').toEqual(TW_SCALES.transitionDuration);
    expect(EXTEND.transitionTimingFunction).toEqual(TW_SCALES.transitionTimingFunction);
    expect(TW_SCALES.transitionDuration.base).toBe(`${UI.motion.duration.base}ms`);
  });

  it('the colour chain is still intact — the control for the orphan rule', () => {
    expect(Object.keys(TW_COLORS).length).toBeGreaterThan(10);
    expect(Object.keys(CSS_VAR_MAP).length).toBeGreaterThan(10);
  });
});
