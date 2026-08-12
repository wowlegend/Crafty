import { describe, it, expect } from 'vitest';
import { TRAY_PANELS, togglePanel } from '../../src/ui/touchTray.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';

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

  it('togglePanel refuses an unwired opener instead of silently doing nothing', () => {
    // The negative case the old grep could not express at all: a renamed setter must be REPORTED,
    // not absorbed. Without this, the loop above could pass over a registry that had quietly emptied.
    expect(togglePanel({ action: 'setShowNothingAtAll', show: 'showNothingAtAll' }, useGameStore.getState())).toBe(false);
    expect(togglePanel(null, useGameStore.getState())).toBe(false);
    expect(togglePanel(TRAY_PANELS[0], null)).toBe(false);
  });
});
