// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import DuskWarning from '../../src/ui/DuskWarning.jsx';
import { HALF_CYCLE_UNITS } from '../../src/game/dayNight.js';
import { KEY_MAP } from '../../src/game/keyMap.js';
import { STRINGS } from '../../src/i18n/strings.js';
import { tIn } from '../../src/i18n/i18n.js';
import { toNotification, notificationText } from '../../src/ui/notifications.js';

// THE DUSK WARNING NAMES THE ROAR ONCE IT IS UNLOCKED, AND ITS KEY ONLY WHERE THERE IS A KEYBOARD (game/ember.js
// duskNotice). The warning polls once a second and raises one notice on the rising edge into the dusk window
// (ui/DuskWarning.jsx); this mounts it with the store's addNotification stood in, puts the clock 0.9 of the way through a
// day half, and reads the words the toast shows (ui/notifications.js, as QuestSystem renders it) in en and zh-CN, with
// the roar's talent and without, on a desktop and on touch (the touch UI's own predicate, input/touchDevice.js).
//
// WHAT THIS DOES NOT CHECK: the toast on screen (tests/e2e/dusk-warning.spec.js reads the plain line in en and zh-CN).

const h = vi.hoisted(() => ({ touch: false }));
vi.mock('../../src/input/touchDevice', () => ({ isTouchUIMode: () => h.touch, isTouchDevice: () => h.touch }));

const ROAR = KEY_MAP.find((r) => r.verb === 'roar');
let raised;
beforeEach(() => {
  vi.useFakeTimers();
  raised = [];
  h.touch = false;
  useGameStore.setState({ isDay: true, gameTime: HALF_CYCLE_UNITS * 0.9, addNotification: (...a) => raised.push(a) });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useGameStore.setState(useGameStore.getInitialState(), true);
});

/** The one notice the warning raised, as the toast shows it in each language. */
function shown() {
  render(<DuskWarning />);
  vi.advanceTimersByTime(1000);
  expect(raised.length, `SETUP: the warning raised ${raised.length} notices in the dusk window, not one`).toBe(1);
  const n = toNotification(...raised[0]);
  return { key: n.key, en: notificationText(n, (k, v) => tIn('en', k, v)), zh: notificationText(n, (k, v) => tIn('zh-CN', k, v)) };
}

describe('the dusk warning', () => {
  it('without the roar unlocked raises the plain line', () => {
    useGameStore.setState({ unlockedTalents: { voidhand_grasp: 1 } });
    const s = shown();
    expect(s.key).toBe('notice.dusk');
    expect([s.en, s.zh]).toEqual([STRINGS.en['notice.dusk'], STRINGS['zh-CN']['notice.dusk']]);
  });

  it('with the roar unlocked on a desktop says a full bar wakes the beast, on the roar\'s own key, in both languages', () => {
    useGameStore.setState({ unlockedTalents: { [ROAR.talent]: 1 } });
    const s = shown();
    expect(s.en.startsWith(`${STRINGS.en['notice.dusk']} `), 'the English line lost the plain warning').toBe(true);
    expect(s.zh.startsWith(STRINGS['zh-CN']['notice.dusk']), 'the Chinese line lost the plain warning').toBe(true);
    expect(s.en, 'the English line does not say a full bar wakes the beast on the roar\'s key').toContain(`wakes the beast (${ROAR.key}).`);
    expect(s.zh, 'the Chinese line does not name the roar\'s key').toContain(`唤醒野兽（${ROAR.key}）。`);
  });

  it('with the roar unlocked on touch says a full bar wakes the beast and names no key', () => {
    h.touch = true;
    useGameStore.setState({ unlockedTalents: { [ROAR.talent]: 1 } });
    const s = shown();
    expect(s.en, 'the touch line does not say a full bar wakes the beast').toContain('A full ember bar wakes the beast.');
    expect(s.zh, 'the Chinese touch line does not say a full bar wakes the beast').toContain('余烬攒满，即可唤醒野兽。');
    for (const line of [s.en, s.zh]) {
      expect(line, `the touch line names a key: ${line}`).not.toMatch(/[(（]\s*[A-Z0-9]{1,2}\s*[)）]/);
      expect(line, `the touch line leaves a placeholder: ${line}`).not.toMatch(/[{}]/);
    }
  });
});
