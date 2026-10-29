// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { aspectUnlockHint } from '../../src/game/aspectHints.js';
import { TALENT_LIMITS, talentNode } from '../../src/game/talentTree.js';
import AspectHintToast from '../../src/ui/AspectHintToast.jsx';
import { tIn } from '../../src/i18n/i18n.js';

// WAS A SOURCE-GREP (test-vacuity finding, queue line 372). It asserted three literal substrings in
// useGameStore.jsx — `currentVal === 0 ? aspectUnlockHint(talentId)`, `aspectHint: hint || ...` — plus
// two in the toast. Every one of those is satisfied by the text existing, so the gate could not tell a
// working just-in-time hint from a broken one: rename a variable and it reds while the feature is fine;
// invert the `currentVal === 0` test and it stays green while the toast fires on every rank-up.
//
// The store is importable in node and the toast renders in jsdom, so both halves are checkable for real.
// This drives the ACTUAL invariant the feature promises — FIRST unlock teaches, later ranks stay quiet.

const ASPECT = 'wildheart_roar';

// A non-unlock talent sits behind its tree's root (DECISIONS 2026-10-28 W1-H item 6), and the store enforces that, so a
// case that takes one first seeds its prerequisite into the tree without spending (no hint).
const seedPrereq = (id) => {
  const pre = talentNode(id)?.prereq;
  if (pre) useGameStore.setState({ unlockedTalents: { ...useGameStore.getState().unlockedTalents, [pre]: 1 } });
};

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
    expect(s.aspectHint).toEqual(aspectUnlockHint(ASPECT));
    expect(tIn('en', s.aspectHint.key, s.aspectHint.vars)).toBe('WILDHEART unlocked — press R to roar');
    expect(tIn('zh-CN', s.aspectHint.key, s.aspectHint.vars)).toBe('WILDHEART 已解锁：按 R 咆哮');
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
    seedPrereq(id);
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
    seedPrereq(plain);
    useGameStore.getState().spendTalentPoint(plain);
    expect(useGameStore.getState().unlockedTalents[plain]).toBe(1);
    expect(useGameStore.getState().aspectHint).toBeNull();
  });

  it('an existing hint is not clobbered by an unrelated unlock', () => {
    useGameStore.setState({ aspectHint: 'PRIOR' });
    const plain = Object.keys(TALENT_LIMITS).find((t) => aspectUnlockHint(t) === null);
    seedPrereq(plain);
    useGameStore.getState().spendTalentPoint(plain);
    expect(useGameStore.getState().unlockedTalents[plain], 'SETUP: the unrelated talent was not taken').toBe(1);
    expect(useGameStore.getState().aspectHint).toBe('PRIOR');
  });
});

describe('AspectHintToast — hands the hint to the notification channel once play is live, then clears it', () => {
  const HINT = { key: 'notice.aspect.roar', vars: { key: 'R' } };
  beforeEach(() => { useGameStore.setState({ addNotification: vi.fn() }); });

  it('in play, the hint becomes one toast in the channel and the store flag clears', () => {
    useGameStore.setState({ aspectHint: HINT });
    const { container } = render(<AspectHintToast live />);
    const add = useGameStore.getState().addNotification;
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith('notice.aspect.roar', 'success', { vars: { key: 'R' } });
    expect(useGameStore.getState().aspectHint).toBeNull();
    expect(container.textContent, 'it draws nothing of its own').toBe('');
  });

  it('in the Talents panel (play not live), the hint waits; it is sent when play returns', () => {
    useGameStore.setState({ aspectHint: HINT });
    const { rerender } = render(<AspectHintToast live={false} />);
    const add = useGameStore.getState().addNotification;
    expect(add).not.toHaveBeenCalled();
    expect(useGameStore.getState().aspectHint).toEqual(HINT);
    rerender(<AspectHintToast live />);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('with no hint, nothing is sent', () => {
    render(<AspectHintToast live />);
    expect(useGameStore.getState().addNotification).not.toHaveBeenCalled();
  });
});
