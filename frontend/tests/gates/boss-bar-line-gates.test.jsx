// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

/**
 * NO NOTICE IS HANDED TO A BOSS BAR THAT IS NOT ON SCREEN (HUD.jsx Encounter, ui/BossHealthBar.jsx onDrawn; DECISIONS
 * 2026-11-01 (W3-A PR C) item 491). Where the encounter column holds the notices (a phone, a phone on its side), the one
 * it shows goes in the boss bar's own line while the bar is up. The bar is lazy since C0 (item 480), so a fight that
 * begins before the idle prefetch has the panel chunk mounts a bar that is still loading, or one whose chunk failed; the
 * column used to hand it the line anyway and show no toast, so every notice, the "could not load" one among them, showed
 * nowhere. Here the panel chunk is held, then fails: while it loads, and after it failed, the line stands as the toast.
 * That the drawn bar takes the line, with no toast beside it, is tests/gates/hud-notices-gates.test.jsx.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, 1 test, each observed RED:
 *   B1 HUD.jsx hands the line to the bar whenever a boss is up (the C0 shape: inBar = column && bossActive) -> "while the
 *      bar loads, the line stands as the toast"
 *   B2 the column assumes the bar drawn from its first render (barDrawn starts true) -> the same
 *   B3 (in hud-notices-gates) the bar never reports itself drawn -> the four column cases there: the drawn bar's line
 *   I0 identity (a comment edit in HUD.jsx) SURVIVED.
 *
 * NOT CHECKED HERE: where the toast lands (jsdom has no layout; tests/e2e/hud-at-rest.spec.js).
 */
const chunk = vi.hoisted(() => {
  let fail;
  const held = new Promise((_, reject) => { fail = reject; });
  held.catch(() => {});
  return { held, fail };
});
vi.mock('../../src/ui/panels/panelBundle.js', async () => {
  await chunk.held;
  return {};
});
vi.mock('../../src/input/touchDevice', () => ({ isTouchUIMode: vi.fn(() => true), isTouchDevice: vi.fn(() => true) }));
import { Encounter } from '../../src/HUD.jsx';
import { toNotification } from '../../src/ui/notifications.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';

const boss = { bossActive: true, bossHealth: 500, bossMaxHealth: 700, bossPhase: 0, bossTier: 0 };
const LIVE = [{ id: 1, ...toNotification('notice.dusk', 'warn') }];
const toastKeys = () => [...document.querySelectorAll('[data-testid="notification"]')].map((el) => el.getAttribute('data-notification-key'));
afterEach(cleanup);

describe('the boss bar\'s line', () => {
  it('while the bar loads, the line stands as the toast; after its chunk failed, it still does', async () => {
    window.innerWidth = 390;
    window.innerHeight = 664;
    const failures = [];
    useGameStore.setState({ addNotification: (msg) => failures.push(msg) });
    render(<Encounter bossSystem={boss} notifications={LIVE} />);
    expect(screen.queryByTestId('boss-health-bar'), 'presence: the bar is still loading').toBeNull();
    expect(toastKeys(), 'while the bar loads, the line stands as the toast').toEqual(['notice.dusk']);
    chunk.fail(new Error('the panel chunk 404s'));
    await waitFor(() => expect(failures.length, 'presence: the chunk\'s failure was not reported').toBeGreaterThan(0), { timeout: 5000 });
    expect(screen.queryByTestId('boss-health-bar')).toBeNull();
    expect(toastKeys(), 'after the bar\'s chunk failed, the line stands as the toast').toEqual(['notice.dusk']);
  });
});
