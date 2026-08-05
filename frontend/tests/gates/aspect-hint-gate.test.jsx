// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { aspectUnlockHint } from '../../src/game/aspectHints.js';
import { TALENT_LIMITS } from '../../src/game/talentTree.js';
import AspectHintToast from '../../src/ui/AspectHintToast.jsx';

// WAS A SOURCE-GREP (test-vacuity finding, queue line 372). It asserted three literal substrings in
// useGameStore.jsx — `currentVal === 0 ? aspectUnlockHint(talentId)`, `aspectHint: hint || ...` — plus
// two in the toast. Every one of those is satisfied by the text existing, so the gate could not tell a
// working just-in-time hint from a broken one: rename a variable and it reds while the feature is fine;
// invert the `currentVal === 0` test and it stays green while the toast fires on every rank-up.
//
// The store is importable in node and the toast renders in jsdom, so both halves are checkable for real.
// This drives the ACTUAL invariant the feature promises — FIRST unlock teaches, later ranks stay quiet.

const ASPECT = 'wildheart_roar';

beforeEach(() => {
  useGameStore.setState({ talentPoints: 5, unlockedTalents: {}, aspectHint: null });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('just-in-time Aspect-unlock hint — behaviour, not source text', () => {
  it('the FIRST unlock of an Aspect verb-talent sets the hint', () => {
    useGameStore.getState().spendTalentPoint(ASPECT);
    const s = useGameStore.getState();
    expect(s.unlockedTalents[ASPECT]).toBe(1);
    // derived from KEY_MAP, not hardcoded — so rebinding the key updates the expectation with the code
    expect(s.aspectHint).toBe(aspectUnlockHint(ASPECT));
    expect(s.aspectHint).toMatch(/WILDHEART/);
  });

  // My first version of this test guarded the key assertion behind `if (limit > 1)`. Every
  // hint-producing talent has limit 1, so that block NEVER RAN and the test passed under a mutation
  // that broke rank progression outright. A conditional assertion is an assertion that might not exist.
  it('EVERY talent that produces a hint has limit 1 — so `currentVal === 0` cannot be re-entered', () => {
    const hinted = Object.keys(TALENT_LIMITS).filter((t) => aspectUnlockHint(t) !== null);
    expect(hinted.length).toBeGreaterThan(0); // denominator
    for (const t of hinted) expect(TALENT_LIMITS[t]).toBe(1);
    // Consequence worth stating: the `currentVal === 0` guard is REDUNDANT today, not load-bearing.
    // It becomes load-bearing the moment any hinted talent gets a limit above 1 — at which point this
    // assertion goes red and tells the next reader to test the re-fire path for real.
  });

  it('rank progression works past 1 on a multi-rank talent', () => {
    // Not decoration: this is what catches a mutation of `currentVal`, which the deleted source-grep
    // could not see at all (it asserted only that the text `currentVal === 0 ? ...` was present).
    const multi = Object.entries(TALENT_LIMITS).find(([, v]) => v > 1);
    expect(multi).toBeTruthy();
    const [id] = multi;
    useGameStore.getState().spendTalentPoint(id);
    useGameStore.getState().spendTalentPoint(id);
    expect(useGameStore.getState().unlockedTalents[id]).toBe(2);
  });

  it('refuses to spend past the limit, and refuses with no points', () => {
    useGameStore.getState().spendTalentPoint(ASPECT);
    useGameStore.getState().spendTalentPoint(ASPECT); // limit 1 — must be a no-op
    expect(useGameStore.getState().unlockedTalents[ASPECT]).toBe(1);
    useGameStore.setState({ talentPoints: 0, unlockedTalents: {}, aspectHint: null });
    useGameStore.getState().spendTalentPoint(ASPECT);
    expect(useGameStore.getState().unlockedTalents[ASPECT]).toBeUndefined();
    expect(useGameStore.getState().aspectHint).toBeNull();
  });

  it('a non-Aspect talent unlocks silently', () => {
    const plain = Object.keys(TALENT_LIMITS).find((t) => aspectUnlockHint(t) === null);
    expect(plain).toBeTruthy(); // denominator: there must BE a non-Aspect talent to test
    useGameStore.getState().spendTalentPoint(plain);
    expect(useGameStore.getState().unlockedTalents[plain]).toBe(1);
    expect(useGameStore.getState().aspectHint).toBeNull();
  });

  it('an existing hint is not clobbered by an unrelated unlock', () => {
    useGameStore.setState({ aspectHint: 'PRIOR' });
    const plain = Object.keys(TALENT_LIMITS).find((t) => aspectUnlockHint(t) === null);
    useGameStore.getState().spendTalentPoint(plain);
    expect(useGameStore.getState().aspectHint).toBe('PRIOR');
  });
});

describe('AspectHintToast — renders the hint and auto-clears it', () => {
  it('renders the store hint', () => {
    useGameStore.setState({ aspectHint: 'WILDHEART unlocked — press R to roar' });
    render(<AspectHintToast />);
    expect(screen.getByText(/WILDHEART unlocked/)).toBeTruthy();
  });

  it('renders NOTHING when there is no hint', () => {
    const { container } = render(<AspectHintToast />);
    expect(container.textContent).toBe('');
  });

  it('auto-clears the hint after its timeout — the store flag does not stick', () => {
    vi.useFakeTimers();
    useGameStore.setState({ aspectHint: 'WILDHEART unlocked — press R to roar' });
    render(<AspectHintToast />);
    expect(useGameStore.getState().aspectHint).not.toBeNull();
    act(() => { vi.advanceTimersByTime(6000); });
    expect(useGameStore.getState().aspectHint).toBeNull();
  });
});
