// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// Touch HUD declutter (2026-06-14): on a phone the QuestTracker (top-left, maxWidth 280) ate ~60% of the
// screen width AND its pointer-events-auto body covered the top-left of the move-joystick zone, and the
// claim button said "Press Q" (no keyboard on touch). Fix: collapse-by-default + narrower + a keyboard-free
// claim label, all gated on isTouchUIMode(). Desktop is unchanged. Behavioral test (real render, mocked
// touch mode) — the touch-probe is the live proof; this locks the regression cheaply on every commit.
vi.mock('../../src/input/touchDevice', () => ({ isTouchUIMode: vi.fn(() => false), isTouchDevice: vi.fn(() => false) }));
import { isTouchUIMode } from '../../src/input/touchDevice';
import { QuestTracker } from '../../src/QuestSystem.jsx';

const OPEN = [{ id: 'q1', title: 'First Blood', description: 'Defeat your first mob', icon: 'sword', progress: 0, target: 1, completed: false, claimed: false }];
const DONE = [{ id: 'q2', title: 'Hunter', description: 'Defeat 5 mobs', icon: 'sword', progress: 5, target: 5, completed: true, claimed: false }];

afterEach(cleanup);

describe('QuestTracker — touch HUD declutter', () => {
  it('on DESKTOP the quest log is expanded by default (body visible)', () => {
    isTouchUIMode.mockReturnValue(false);
    render(<QuestTracker quests={OPEN} onClaim={() => {}} />);
    expect(screen.getByText('First Blood')).toBeTruthy();
  });

  it('on TOUCH the quest log is COLLAPSED by default (header only — it no longer eats the phone HUD)', () => {
    isTouchUIMode.mockReturnValue(true);
    render(<QuestTracker quests={OPEN} onClaim={() => {}} />);
    expect(screen.getByText('Quests')).toBeTruthy();        // the tap-to-expand header chip stays
    expect(screen.queryByText('First Blood')).toBeNull();    // the body is hidden by default
  });

  it('the claim affordance is "Press Q" on desktop', () => {
    isTouchUIMode.mockReturnValue(false);
    render(<QuestTracker quests={DONE} onClaim={() => {}} />);
    expect(screen.getByText('Press Q')).toBeTruthy();
  });

  it('the claim affordance is keyboard-free ("Claim") on touch', () => {
    isTouchUIMode.mockReturnValue(true);
    render(<QuestTracker quests={DONE} onClaim={() => {}} />);
    fireEvent.click(screen.getByText('Quests')); // expand the collapsed-on-touch panel
    expect(screen.getByText('Claim')).toBeTruthy();
    expect(screen.queryByText('Press Q')).toBeNull();
  });
});
