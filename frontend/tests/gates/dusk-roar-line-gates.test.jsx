// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import DuskWarning from '../../src/ui/DuskWarning.jsx';
import { HALF_CYCLE_UNITS } from '../../src/game/dayNight.js';
import { KEY_MAP } from '../../src/game/keyMap.js';
import { STRINGS } from '../../src/i18n/strings.js';
import { tIn } from '../../src/i18n/i18n.js';

// THE DUSK WARNING NAMES THE ROAR ONCE IT IS UNLOCKED (registry REVIEW:w2f:ember-bar-no-readiness; game/ember.js
// duskNotice). The warning polls once a second and raises one notice on the rising edge into the dusk window
// (ui/DuskWarning.jsx); this mounts it with the store's addNotification stood in, puts the clock 0.9 of the way through a
// day half, and reads what it raised, with the roar's talent and without.
//
// WHAT THIS DOES NOT CHECK: the toast on screen (tests/e2e/dusk-warning.spec.js reads the plain line in en and zh-CN).

const ROAR = KEY_MAP.find((r) => r.verb === 'roar');
let raised;
beforeEach(() => {
  vi.useFakeTimers();
  raised = [];
  useGameStore.setState({ isDay: true, gameTime: HALF_CYCLE_UNITS * 0.9, addNotification: (...a) => raised.push(a) });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useGameStore.setState(useGameStore.getInitialState(), true);
});

describe('the dusk warning', () => {
  it('without the roar unlocked raises the plain line', () => {
    useGameStore.setState({ unlockedTalents: { voidhand_grasp: 1 } });
    render(<DuskWarning />);
    vi.advanceTimersByTime(1000);
    expect(raised.map(([k]) => k), 'SETUP: the warning raised nothing in the dusk window').toEqual(['notice.dusk']);
  });

  it('with the roar unlocked says a full bar wakes the beast, on the roar\'s own key, in both languages', () => {
    useGameStore.setState({ unlockedTalents: { [ROAR.talent]: 1 } });
    render(<DuskWarning />);
    vi.advanceTimersByTime(1000);
    expect(raised, 'the warning did not raise the roar\'s line on its key').toEqual([['notice.dusk.roar', 'warn', { vars: { key: ROAR.key } }]]);
    const en = tIn('en', 'notice.dusk.roar', { key: ROAR.key });
    const zh = tIn('zh-CN', 'notice.dusk.roar', { key: ROAR.key });
    expect(en, 'the English line does not name the roar\'s key').toContain(`(${ROAR.key})`);
    expect(zh, 'the Chinese line does not name the roar\'s key').toContain(`（${ROAR.key}）`);
    expect(en.startsWith(STRINGS.en['notice.dusk']), 'the English line lost the plain warning').toBe(true);
    expect(zh.startsWith(STRINGS['zh-CN']['notice.dusk']), 'the Chinese line lost the plain warning').toBe(true);
  });
});
