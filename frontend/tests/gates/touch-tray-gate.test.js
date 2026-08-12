import { describe, it, expect } from 'vitest';
import { TRAY_PANELS, togglePanel } from '../../src/ui/touchTray.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { TRAY_ICON } from '../../src/ui/TouchControlsSurface.jsx';
import { LOCALES } from '../../src/i18n/i18n.js';
import { STRINGS } from '../../src/i18n/strings.js';

// EVERY TRAY OPENER IS DRIVEN, NOT GREPPED.
//
// This gate used to read useGameStore.jsx as TEXT and assert `<action>:` and `<show>:` appeared
// somewhere in it. Two things that buys nothing: a match anywhere in a 1100-line file is not proof the
// key belongs to the store's public surface (a local object literal, a comment, or an unrelated slice
// satisfies it), and a setter that EXISTS but does not flip its boolean passes just as cleanly. The
// tray's actual contract is "tapping this opener toggles that panel", and that is executable — the
// store imports fine under vitest and `togglePanel` is already the pure seam the surface calls.
//
// Converting it also removes a member from the frozen source-grep population, which may fall freely.
describe('touch tray openers drive the real store', () => {
  it('every TRAY_PANELS entry toggles its own panel through the real setter', () => {
    expect(TRAY_PANELS.length, 'the tray registry is empty — this test would assert nothing').toBeGreaterThan(0);

    for (const p of TRAY_PANELS) {
      const store = useGameStore.getState();
      expect(typeof store[p.action], `${p.id}: ${p.action} is not a function on the store`).toBe('function');
      expect(typeof store[p.show], `${p.id}: ${p.show} is not a boolean on the store`).toBe('boolean');

      const before = useGameStore.getState()[p.show];
      expect(togglePanel(p, useGameStore.getState()), `${p.id}: togglePanel reported the opener unwired`).toBe(true);
      expect(useGameStore.getState()[p.show], `${p.id}: ${p.action} ran but ${p.show} did not flip`).toBe(!before);

      // Put it back, so panel order cannot make one test depend on another.
      togglePanel(p, useGameStore.getState());
      expect(useGameStore.getState()[p.show]).toBe(before);
    }
  });

  it('every registry icon NAME resolves to a real glyph the surface can render', () => {
    // The `icon` field used to be vestigial: TouchControlsSurface kept its own id-keyed component map,
    // so a panel's glyph was declared in two places free to disagree, and touchTray.js's own field was
    // read by nothing. The surface now keys on this name, which makes an unmapped or misspelled name
    // render NO glyph at all — silently, since `{Icon && <Icon/>}` degrades to nothing.
    for (const p of TRAY_PANELS) {
      expect(typeof p.icon, `${p.id} has no icon name`).toBe('string');
      // lucide icons are forwardRef objects, not plain functions — assert what React can actually
      // RENDER rather than a typeof that happens to hold today.
      const glyph = TRAY_ICON[p.icon];
      expect(glyph, `${p.id}: icon "${p.icon}" resolves to no glyph, so the opener renders blank`).toBeTruthy();
      expect(
        typeof glyph === 'function' || typeof glyph === 'object',
        `${p.id}: icon "${p.icon}" is not a renderable component`
      ).toBe(true);
    }
    // And nothing unused sits in the map, which is how the two sources drifted apart before.
    const declared = new Set(TRAY_PANELS.map((p) => p.icon));
    for (const name of Object.keys(TRAY_ICON)) {
      expect(declared.has(name), `the surface maps "${name}" but no panel asks for it`).toBe(true);
    }
  });

  it('togglePanel refuses an unwired opener instead of silently doing nothing', () => {
    // The negative case the old grep could not express at all: a renamed setter must be REPORTED,
    // not absorbed. Without this, the loop above could pass over a registry that had quietly emptied.
    expect(togglePanel({ action: 'setShowNothingAtAll', show: 'showNothingAtAll' }, useGameStore.getState())).toBe(false);
    expect(togglePanel(null, useGameStore.getState())).toBe(false);
    expect(togglePanel(TRAY_PANELS[0], null)).toBe(false);
  });
});

// EVERY TRAY LABEL RESOLVES IN EVERY LOCALE, NOT JUST ENGLISH.
//
// The registry used to carry BOTH `label` (a raw English string) and `labelKey` (an i18n key).
// TouchControlsSurface rendered `t(p.labelKey)`; TouchControls rendered `p.label` — so the two surfaces
// showing the same tray disagreed, and the one a player actually taps on a phone announced English to a
// zh-CN player. Exactly the shape the vestigial `icon` field had before it was unified: two fields for
// one decision, free to drift, with only one of them wired to what ships.
//
// `label` is deleted. This is the property that replaces it — and it checks the STRING TABLE rather than
// the field's existence, since a labelKey pointing at a key nobody translated renders the raw key to the
// player, which is worse than English.
describe('tray labels are localised in every locale', () => {
  it('every panel labelKey resolves to a real string in EVERY locale', () => {
    expect(LOCALES.length, 'only one locale — this assertion cannot detect a missing translation').toBeGreaterThan(1);
    let checked = 0;
    for (const locale of LOCALES) {
      const table = STRINGS[locale];
      expect(table, `no string table for ${locale}`).toBeTruthy();
      for (const p of TRAY_PANELS) {
        const value = table[p.labelKey];
        expect(typeof value, `${p.id}: "${p.labelKey}" is missing from ${locale} — the raw key would render`).toBe('string');
        expect(value.length, `${p.id}: "${p.labelKey}" is empty in ${locale}`).toBeGreaterThan(0);
        checked++;
      }
    }
    expect(checked, 'the locale sweep collapsed').toBe(LOCALES.length * TRAY_PANELS.length);
  });

  it('the locales genuinely DIFFER — otherwise the sweep above proves only that a table exists', () => {
    // A zh-CN table that had silently fallen back to the English values would satisfy every assertion
    // above while shipping untranslated labels, which is the defect this gate exists for.
    const differing = TRAY_PANELS.filter((p) => STRINGS['zh-CN'][p.labelKey] !== STRINGS.en[p.labelKey]);
    expect(differing.length, 'no tray label differs between en and zh-CN — the translations are missing').toBe(TRAY_PANELS.length);
  });

  it('the raw English `label` field stays deleted', () => {
    // It was read by nothing once TouchControls moved to t(labelKey), and a second source for one string
    // is how the two surfaces disagreed in the first place.
    for (const p of TRAY_PANELS) {
      expect(p.label, `${p.id} carries a raw English label again`).toBeUndefined();
    }
  });
});
