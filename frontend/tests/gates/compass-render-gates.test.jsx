// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { Compass } from '../../src/ui/Compass.jsx';

// A RE-RENDER OF THE COMPASS WRITES NOTHING UNDER ITS STRIP. Its props (the chests, the boss system) change identity
// with every App render, and when the slots were rendered inline each of those re-renders made React 19 re-apply the
// innerHTML of all 15 game-icon slots: tests/e2e/hud-churn.spec.js counted them on CI (run 40946709399: 15 identical
// childList writes on <g>, standing still). The slots are now a memoized child with a stable ref setter.
//
// NOT CHECKED HERE: the ticker's own writes (hud-churn in a browser reads those).
describe('the compass strip under a re-render', () => {
  it('re-rendering with new prop objects leaves every slot, icons included, untouched', async () => {
    const props = () => ({ treasureChests: { chests: [], openedChestIds: new Set() }, bossSystem: { bossActive: false } });
    const { container, rerender } = render(<Compass {...props()} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); }); // the game icons' chunk arrives
    const track = container.querySelector('[data-testid="compass-track"]');
    expect(track.querySelectorAll('[data-compass-label]').length, 'SETUP: the slot pool did not render').toBe(24);
    expect(track.querySelectorAll('[data-compass-label] svg g').length, 'SETUP: the game icons were never drawn').toBe(15);
    const records = [];
    const mo = new MutationObserver((rs) => records.push(...rs));
    mo.observe(track, { childList: true, subtree: true, attributes: true, characterData: true });
    for (let i = 0; i < 3; i++) rerender(<Compass {...props()} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    mo.disconnect();
    expect(records.map((r) => `${r.type} ${r.target.nodeName}`), 'a re-render wrote under the strip').toEqual([]);
  });
});
