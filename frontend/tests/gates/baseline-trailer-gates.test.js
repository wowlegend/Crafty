import { describe, it, expect } from 'vitest';
import { offenders, BASELINE_PATHS, SOURCE_PATHS, TRAILER } from '../../scripts/ci/baseline-trailer.mjs';

// THE ORACLE HAD NO GOVERNANCE. The visual gate judges 31 frames against committed PNGs, so those PNGs
// ARE the specification — and none of the 10 pre-push gates looked at them. Measured over the full
// history: 79 of 1,603 commits rewrite baselines, and 10 of the LAST 12 also touched frontend/src/ in the
// same commit, which makes an intended look change indistinguishable from a regression the oracle was
// quietly updated to match.
//
// Both failure shapes are asserted reachable before the clean verdict is trusted. A governance gate that
// cannot say NO is the most expensive kind of decoration: it reads as oversight while providing none.
const commit = (over) => ({ sha: 'abc1234def', subject: 'a commit', message: 'body\n', files: [], ...over });
const BASE = 'frontend/tests/visual/baseline/menu.png';
const SRC = 'frontend/src/render/Ocean.jsx';

describe('baseline-trailer: rewriting the visual oracle requires a stated reason', () => {
  it('flags a baseline rewrite with no Baseline-Review trailer', () => {
    const [bad] = offenders([commit({ files: [BASE] })]);
    expect(bad, 'an untrailered oracle rewrite passed').toBeTruthy();
    expect(bad.reasons).toContain('no Baseline-Review: trailer');
    expect(bad.baselines).toEqual([BASE]);
  });

  it('accepts a baseline rewrite that carries the trailer and touches no source', () => {
    const ok = offenders([
      commit({ files: [BASE], message: 'body\n\nBaseline-Review: ocean re-art-directed; opened all 31\n' }),
    ]);
    expect(ok).toHaveLength(0);
  });

  it('flags a baseline rewrite BUNDLED with a src change, even WITH the trailer', () => {
    // The measured defect. The trailer alone does not make it reviewable: when the pixels and the code
    // that moved them land together, `git show` cannot separate intent from regression.
    const [bad] = offenders([
      commit({ files: [BASE, SRC], message: 'body\n\nBaseline-Review: ocean waves\n' }),
    ]);
    expect(bad, 'a bundled rewrite passed because it had a trailer').toBeTruthy();
    expect(bad.reasons).toContain('bundled with frontend/src/ changes');
    expect(bad.bundled).toEqual([SRC]);
  });

  it('reports BOTH reasons when a commit is untrailered AND bundled', () => {
    const [bad] = offenders([commit({ files: [BASE, SRC] })]);
    expect(bad.reasons).toHaveLength(2);
  });

  it('ignores commits that touch no baseline at all', () => {
    // Docs, tests and source churn must stay silent — a gate that fires on everything gets switched off.
    expect(offenders([commit({ files: [SRC, 'memory/STATUS.md', 'frontend/tests/gates/x.test.js'] })])).toHaveLength(0);
  });

  it('does not treat the diff/ or current/ artifacts as the oracle', () => {
    // Only baseline/ is the specification; current/ and diff/ are transient and gitignored.
    expect(offenders([commit({ files: ['frontend/tests/visual/current/menu.png'] })])).toHaveLength(0);
    expect(offenders([commit({ files: ['frontend/tests/visual/diff/menu.png'] })])).toHaveLength(0);
  });
});

describe('baseline-trailer: the matchers say what they mean', () => {
  it('matches the oracle path and not its neighbours', () => {
    expect(BASELINE_PATHS.some((re) => re.test(BASE))).toBe(true);
    expect(BASELINE_PATHS.some((re) => re.test('frontend/tests/visual/current/menu.png'))).toBe(false);
  });

  it('treats only frontend/src as a pixel-moving change', () => {
    expect(SOURCE_PATHS.some((re) => re.test(SRC))).toBe(true);
    expect(SOURCE_PATHS.some((re) => re.test('docs/superpowers/DECISIONS.md'))).toBe(false);
  });

  it('requires the trailer to carry actual content', () => {
    expect(TRAILER.test('Baseline-Review: ocean re-art-directed')).toBe(true);
    expect(TRAILER.test('Baseline-Review:'), 'an empty trailer satisfied the check').toBe(false);
  });
});
