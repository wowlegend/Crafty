// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

// WHERE THE NOTICES SHOW (DECISIONS 2026-10-29 item 92), rendered through the HUD's own components at each layout. In the
// encounter column (a phone, a phone on its side: ui/hudLayout.js toastsInEncounter) one notice shows at a time, the
// dragon's one-off call before any other and its attack calls after every other: inside the boss bar's own line while
// the bar is up, else as the one toast. Where the stack stands on its own, a keyboard holds every notice and a tall
// touch screen the newest it has room for (ui/hudLayout.js tallToastPlace), standing left of the right fans' column on
// its side.
//
// NOT CHECKED HERE: where anything lands (jsdom has no layout; tests/e2e/hud-at-rest.spec.js reads the rects at the eight
// viewports), and the dragon's attack calls from render/BossEntity.jsx, which raise only while the world runs (the line
// through a whole fight: tests/gates/boss-attack-line-gates.test.js).
vi.mock('../../src/input/touchDevice', () => ({ isTouchUIMode: vi.fn(() => false), isTouchDevice: vi.fn(() => false) }));
import { isTouchUIMode } from '../../src/input/touchDevice';
import { Encounter, PlacedToasts } from '../../src/HUD.jsx';
import { toNotification } from '../../src/ui/notifications.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';

const at = (w, h, touch) => {
  isTouchUIMode.mockReturnValue(touch);
  window.innerWidth = w;
  window.innerHeight = h;
};
afterEach(() => { cleanup(); at(1024, 768, false); useGameStore.setState({ locale: 'en' }); });

const plain = (id, key) => ({ id, ...toNotification(key, 'warn') });
const call = (id, key) => ({ id, ...toNotification(key, 'danger', { vars: { boss: { key: 'boss.dragon' } }, boss: true }) });
// Oldest first, as the channel keeps them: a plain notice, the dragon's call, and a plain notice newer than the call.
const LIVE = [plain(1, 'notice.dusk'), call(2, 'notice.bossAwakens'), plain(3, 'notice.dawn')];
const boss = (bossActive) => ({ bossActive, bossHealth: 500, bossMaxHealth: 700, bossPhase: 0, bossTier: 0 });
const toastKeys = () => [...document.querySelectorAll('[data-testid="notification"]')].map((el) => el.getAttribute('data-notification-key'));

describe('the encounter column holds one notice at a time', () => {
  it.each([['phone 390x664', 390, 664], ['phone 375x667', 375, 667], ['phone on its side 844x390', 844, 390]])(
    '%s: the dragon\'s call in the boss bar\'s own line, before the newer notice, and no toast', (_n, w, h) => {
      at(w, h, true);
      render(<Encounter bossSystem={boss(true)} notifications={LIVE} />);
      const bar = screen.getByTestId('boss-health-bar');
      const line = screen.getByTestId('boss-call');
      expect(bar.contains(line), 'the call is not inside the boss bar').toBe(true);
      expect(line.getAttribute('data-notification-key')).toBe('notice.bossAwakens');
      expect(line.textContent).toBe('The Blight Heart stirs -- the Shadow Dragon awakens! [Climax]');
      expect(toastKeys(), 'a toast stands beside the boss bar').toEqual([]);
    });

  it('with no call up the newest notice takes the line, in the player\'s language', () => {
    at(390, 664, true);
    useGameStore.setState({ locale: 'zh-CN' });
    render(<Encounter bossSystem={boss(true)} notifications={[LIVE[0], LIVE[2]]} />);
    const line = screen.getByTestId('boss-call');
    expect(line.getAttribute('data-notification-key')).toBe('notice.dawn');
    expect(line.textContent).toBe('黎明破晓！你熬过了这一夜！');
  });

  it('with the bar down, the one toast: the dragon\'s call first; when it leaves, the newest, never the two at once', async () => {
    at(390, 664, true);
    const { rerender } = render(<Encounter bossSystem={boss(false)} notifications={LIVE} />);
    expect(screen.queryByTestId('boss-call')).toBeNull();
    expect(toastKeys()).toEqual(['notice.bossAwakens']);
    rerender(<Encounter bossSystem={boss(false)} notifications={[LIVE[0], LIVE[2]]} />);
    // waitFor reads on every DOM change and every 50 ms, so `most` is the largest count the transition rendered.
    let most = 0;
    await waitFor(() => {
      const keys = toastKeys();
      most = Math.max(most, keys.length);
      expect(keys).toEqual(['notice.dawn']);
    }, { timeout: 3000 });
    expect(most, 'two toasts at once in a column sized for one').toBe(1);
  });

  it('an attack call yields the bar\'s line to a plain notice, older or newer, and takes it when no other is up', () => {
    at(390, 664, true);
    const fire = { id: 4, ...toNotification('notice.bossFireball', 'warning', { attack: true }) };
    const lineKey = () => screen.getByTestId('boss-call').getAttribute('data-notification-key');
    const { rerender } = render(<Encounter bossSystem={boss(true)} notifications={[fire, LIVE[2]]} />);
    expect(lineKey(), 'a newer notice raised while the attack call shows').toBe('notice.dawn');
    rerender(<Encounter bossSystem={boss(true)} notifications={[LIVE[2], fire]} />);
    expect(lineKey(), 'an attack call raised while a notice shows').toBe('notice.dawn');
    rerender(<Encounter bossSystem={boss(true)} notifications={[fire]} />);
    expect(lineKey(), 'the attack call alone').toBe('notice.bossFireball');
  });

  it('the bar\'s name stands in its line when no notice is up: the tier\'s name, in the player\'s language', () => {
    at(390, 664, true);
    const { rerender } = render(<Encounter bossSystem={boss(true)} notifications={[]} />);
    expect(screen.queryByTestId('boss-call')).toBeNull();
    expect(screen.getByTestId('boss-health-bar').textContent).toBe('Shadow Dragon');
    rerender(<Encounter bossSystem={{ ...boss(true), bossTier: 2 }} notifications={[]} />);
    expect(screen.getByTestId('boss-health-bar').textContent).toBe('Shadow Dragon Risen II');
    useGameStore.setState({ locale: 'zh-CN' });
    rerender(<Encounter bossSystem={{ ...boss(true), bossTier: 2 }} notifications={[]} />);
    expect(screen.getByTestId('boss-health-bar').textContent).toBe('复苏的暗影巨龙（第 2 次）');
  });

});

describe('where the stack stands on its own', () => {
  it.each([['iPad 1180x820', 1180, 820], ['iPad 820x1180', 820, 1180], ['desktop 1280x800', 1280, 800]])(
    '%s: the encounter holds no notice and the boss bar no line', (_n, w, h) => {
      at(w, h, w !== 1280);
      render(<Encounter bossSystem={boss(true)} notifications={LIVE} />);
      expect(screen.getByTestId('boss-health-bar')).toBeTruthy();
      expect(screen.queryByTestId('boss-call')).toBeNull();
      expect(toastKeys()).toEqual([]);
    });

  it('a keyboard holds every notice up; the landscape iPad the newest two, left of the fans; the upright iPad all three at the edge', () => {
    at(1280, 800, false);
    const { unmount } = render(<PlacedToasts notifications={LIVE} />);
    expect(toastKeys()).toEqual(['notice.dusk', 'notice.bossAwakens', 'notice.dawn']);
    unmount();
    at(1180, 820, true);
    const ipad = render(<PlacedToasts notifications={LIVE} />);
    expect(toastKeys()).toEqual(['notice.bossAwakens', 'notice.dawn']);
    expect(screen.getByTestId('notification-stack').style.right).toBe('86px');
    ipad.unmount();
    at(820, 1180, true);
    render(<PlacedToasts notifications={LIVE} />);
    expect(toastKeys()).toEqual(['notice.dusk', 'notice.bossAwakens', 'notice.dawn']);
    expect(screen.getByTestId('notification-stack').style.right).toBe('16px');
  });

  it('a keyboard\'s stack narrows to the room the boss bar leaves on its right while the bar is up, and keeps 320 px with it down', () => {
    at(1024, 768, false);
    const stack = () => screen.getByTestId('notification-stack').style;
    const { rerender } = render(<PlacedToasts notifications={LIVE} bossUp />);
    expect([stack().maxWidth, stack().right], 'the bar up at 1024 px: 450 px wide, its right edge at 737 px').toEqual(['263px', '16px']);
    expect(toastKeys(), 'the narrowed stack dropped a notice').toEqual(['notice.dusk', 'notice.bossAwakens', 'notice.dawn']);
    rerender(<PlacedToasts notifications={LIVE} bossUp={false} />);
    expect(stack().maxWidth).toBe('320px');
  });

  it('a phone draws no stack of its own: the encounter column holds its notices', () => {
    at(390, 664, true);
    render(<PlacedToasts notifications={LIVE} />);
    expect(screen.queryByTestId('notification-stack')).toBeNull();
  });
});

describe('the boss bar\'s words', () => {
  it('the full bar\'s phase line and numbers read in the player\'s language', () => {
    at(1180, 820, true);
    useGameStore.setState({ locale: 'zh-CN' });
    render(<Encounter bossSystem={{ ...boss(true), bossPhase: 2 }} notifications={[]} />);
    const bar = screen.getByTestId('boss-health-bar').textContent;
    expect(bar).toContain('第三阶段：狂暴炼狱（熔岩圈与召唤）');
    expect(bar).toContain('生命 500 / 700');
    expect(bar).toContain('剩余 71%');
  });
});
