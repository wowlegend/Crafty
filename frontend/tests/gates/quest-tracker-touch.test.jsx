// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// THE QUEST TRACKER RESTS AS ONE LINE (the HUD lane's task script, decision 3). It was a 280 px panel of every active
// quest, open by default on desktop (collapsed on touch since 2026-06-14, when on a phone it ate ~60% of the width and
// covered the top-left of the move-joystick zone). Now every device rests on one line, the lead quest (the first not
// yet claimed) with its objective and count, and opens to the full list on a click, a tap or a hover. The claim stays
// one press away: "Press Q" on desktop, a keyboard-free "Claim" on touch.
vi.mock('../../src/input/touchDevice', () => ({ isTouchUIMode: vi.fn(() => false), isTouchDevice: vi.fn(() => false) }));
import { isTouchUIMode } from '../../src/input/touchDevice';
import { QuestTracker, leadQuest } from '../../src/QuestSystem.jsx';

const q = (id, title, more = {}) => ({ id, title, description: `Do ${title}`, icon: 'sword', progress: 0, target: 3, completed: false, claimed: false, ...more });
const THREE = [q('q1', 'First Blood'), q('q2', 'Hunter'), q('q3', 'Gatherer')];
const DONE = [q('q2', 'Hunter', { progress: 5, target: 5, completed: true })];

afterEach(cleanup);

describe.each([['desktop', false], ['touch', true]])('the quest tracker on %s', (_name, touch) => {
  it('rests as ONE objective line, the lead quest with its count; the other two only after it opens', () => {
    isTouchUIMode.mockReturnValue(touch);
    render(<QuestTracker quests={THREE} onClaim={() => {}} />);
    const line = screen.getByTestId('quest-tracker-line');
    expect(line.textContent, 'the line names the lead quest').toContain('First Blood');
    expect(line.textContent).toContain('0/3');
    expect(line.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Hunter'), 'a second quest shows at rest').toBeNull();
    expect(screen.queryByText('Gatherer'), 'a third quest shows at rest').toBeNull();
    fireEvent.click(line);
    expect(screen.getByTestId('quest-tracker-list')).toBeTruthy();
    expect(screen.getByText('Hunter')).toBeTruthy();
    expect(screen.getByText('Gatherer')).toBeTruthy();
  });

  it('opens while the pointer rests over it, and closes when it leaves', () => {
    isTouchUIMode.mockReturnValue(touch);
    render(<QuestTracker quests={THREE} onClaim={() => {}} />);
    fireEvent.mouseEnter(screen.getByTestId('quest-tracker'));
    expect(screen.getByText('Gatherer')).toBeTruthy();
    fireEvent.mouseLeave(screen.getByTestId('quest-tracker'));
    expect(screen.getByTestId('quest-tracker-line').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('the claim, one press from the line', () => {
  it('the lead is the first quest not yet claimed', () => {
    expect(leadQuest([q('a', 'A', { claimed: true }), q('b', 'B')]).id).toBe('b');
    expect(leadQuest([q('a', 'A', { claimed: true })])).toBeNull();
    expect(leadQuest(undefined)).toBeNull();
  });

  it('the claim affordance is "Press Q" on desktop, beside the line', () => {
    isTouchUIMode.mockReturnValue(false);
    const onClaim = vi.fn();
    render(<QuestTracker quests={DONE} onClaim={onClaim} />);
    fireEvent.click(screen.getByText('Press Q'));
    expect(onClaim).toHaveBeenCalledWith('q2');
  });

  it('the claim affordance is keyboard-free ("Claim") on touch', () => {
    isTouchUIMode.mockReturnValue(true);
    render(<QuestTracker quests={DONE} onClaim={() => {}} />);
    expect(screen.getByText('Claim')).toBeTruthy();
    expect(screen.queryByText('Press Q')).toBeNull();
  });
});
