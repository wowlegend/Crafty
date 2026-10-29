// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, render, screen, cleanup } from '@testing-library/react';
import { useQuestSystem, NotificationStack } from '../../src/QuestSystem.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { TOAST_MS } from '../../src/ui/notifications.js';
import DuskWarning from '../../src/ui/DuskWarning.jsx';
import { HALF_CYCLE_UNITS } from '../../src/game/dayNight.js';
import { useSurvivalMode } from '../../src/world/survivalSystem.js';

// ONE NOTIFICATION CHANNEL, driven through the REAL hook that publishes addNotification to the store (the HUD lane's
// task script, decision 5): the same news twice inside one toast's life shows once, and a dictionary key renders in the
// language the player has selected. The dusk warning is the subject that motivated it (STATUS G-ledger 38/a: an
// English-only toast), sent as `notice.dusk`; the nightfall and dawn notices travel the same way, with names inside a
// notice (a dawn's loot, the dragon) translated when it shows. The dragon's calls and the Aspect hint are driven through
// their own hooks in boss-entrance, boss-tier-loop, boss-persistence-hook and aspect-hint gates.
//
// NOT CHECKED HERE: the dusk edge itself in a running game, and where the toast lands against the dial
// (tests/e2e/dusk-warning.spec.js).
describe('the notification channel', () => {
  beforeEach(() => { useGameStore.setState({ questState: null, locale: 'en' }); vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] }); });
  afterEach(() => { cleanup(); vi.useRealTimers(); useGameStore.setState({ locale: 'en' }); });

  it('the dusk key twice inside the window shows one toast; after the window, a second', () => {
    const { result } = renderHook(() => useQuestSystem());
    const add = () => act(() => useGameStore.getState().addNotification('notice.dusk', 'warn'));
    add();
    add();
    const dusk = () => result.current.notifications.filter((n) => n.key === 'notice.dusk');
    expect(dusk(), 'a repeat inside the window made a second toast').toHaveLength(1);
    const first = dusk()[0].id;
    act(() => { vi.advanceTimersByTime(TOAST_MS); });
    expect(dusk(), 'the first toast did not expire with its life').toHaveLength(0);
    add();
    expect(dusk().map((n) => n.id), 'the same news after the window was dropped').toEqual([first + 1]);
  });

  it('different news inside the window both show, and a plain-text denial repeated at once shows twice', () => {
    // A denial (ui/denyToast.js) is plain text and answers each press; dropping the second would refuse a press in silence.
    const { result } = renderHook(() => useQuestSystem());
    act(() => {
      useGameStore.getState().addNotification('notice.dusk', 'warn');
      useGameStore.getState().addNotification('Not enough ember', 'warn');
      useGameStore.getState().addNotification('Not enough ember', 'warn');
    });
    expect(result.current.notifications.map((n) => n.key || n.text)).toEqual(['notice.dusk', 'Not enough ember', 'Not enough ember']);
  });

  it('a keyed toast reads in Chinese when zh-CN is selected, and in English when it is not', () => {
    const { result } = renderHook(() => useQuestSystem());
    act(() => useGameStore.getState().addNotification('notice.dusk', 'warn'));
    const { rerender } = render(<NotificationStack notifications={result.current.notifications} />);
    expect(screen.getByTestId('notification').textContent).toMatch(/^Dusk approaches/);
    expect(screen.getByTestId('notification').getAttribute('data-notification-key')).toBe('notice.dusk');
    act(() => useGameStore.setState({ locale: 'zh-CN' }));
    rerender(<NotificationStack notifications={result.current.notifications} />);
    expect(screen.getByTestId('notification').textContent).toBe('黄昏将至，夜幕即将降临，快做好防御！');
  });

  it('the dusk watcher sends the dusk KEY once on the edge, and again only after a night', () => {
    const sent = [];
    useGameStore.setState({ addNotification: (msg, type) => sent.push([msg, type]), gameTime: HALF_CYCLE_UNITS * 0.5, isDay: true });
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'Date'] });
    render(<DuskWarning />);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(sent, 'SETUP: the watcher warned in the middle of the day').toEqual([]);
    act(() => { useGameStore.setState({ gameTime: HALF_CYCLE_UNITS * 0.95 }); vi.advanceTimersByTime(5000); });
    expect(sent).toEqual([['notice.dusk', 'warn']]);
    act(() => { useGameStore.setState({ gameTime: HALF_CYCLE_UNITS * 1.5, isDay: false }); vi.advanceTimersByTime(2000); });
    act(() => { useGameStore.setState({ gameTime: HALF_CYCLE_UNITS * 2.95, isDay: true }); vi.advanceTimersByTime(2000); });
    expect(sent, 'the next dusk, after a night, did not warn again').toHaveLength(2);
  });

  it('nightfall sends the numbered siege key, and a dawn the dawn key: no banner of their own', () => {
    const sent = [];
    useGameStore.setState({ addNotification: (msg, type, o) => sent.push([msg, type, o?.vars]), nightCount: 3, lastRewardedNight: 3 });
    const { rerender } = renderHook(({ day }) => useSurvivalMode(day), { initialProps: { day: true } });
    rerender({ day: false });
    expect(sent).toEqual([['notice.siege.intensifies', 'danger', { n: 3 }]]);
    rerender({ day: true }); // night 3 already rewarded: the plain dawn notice
    expect(sent[1]).toEqual(['notice.dawn', 'warn', undefined]);
  });

  it('a name inside a notice is a key too, shown in the selected language', () => {
    const { result } = renderHook(() => useQuestSystem());
    act(() => useGameStore.getState().addNotification('notice.bossDefeated', 'danger', { vars: { boss: { key: 'boss.dragonRisen' }, xp: 900 } }));
    const { rerender } = render(<NotificationStack notifications={result.current.notifications} />);
    expect(screen.getByTestId('notification').textContent).toBe('BOSS DEFEATED! You have slain the Shadow Dragon Risen! +900 XP!');
    act(() => useGameStore.setState({ locale: 'zh-CN' }));
    rerender(<NotificationStack notifications={result.current.notifications} />);
    expect(screen.getByTestId('notification').textContent).toBe('首领已被击败！你击杀了复苏的暗影巨龙！+900 经验！');
  });
});
