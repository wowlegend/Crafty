import { describe, it, expect } from 'vitest';
import { glVerdict } from '../../scripts/ci/prod-smoke.mjs';

/**
 * THE GL ERROR LEDGER — closing OI-06 and OI-08, the gate that could not see the class it watches.
 *
 * `.claude/rules/gates-and-probes.md` records that the PRODUCTION console carries
 * `GL_INVALID_OPERATION: glBlitFramebuffer` in two alternating forms, PER FRAME, until Chrome emits
 * "too many errors" and stops reporting. prod-smoke watched that channel with `page.on('console')`, which
 * makes its count a FLOOR rather than a count — and worse, once the context is muted a genuine GL error
 * later in the run is silenced too, so the storm disables the very channel the gate depends on.
 *
 * `gl.getError()` is immune to both: it drains a queue on the context, no console involved, no muting.
 * Polled once per FRAME because reading DRAINS — a single poll at the end reports at most one error for
 * the whole run, which is exactly how a storm reads as clean.
 *
 * WHY A RATCHET AND NOT A THRESHOLD. Nobody knows the post-fix number. The headless probe runs
 * SwiftShader, which reports MAX_SAMPLES 4 and emitted zero GL errors, so it cannot settle the question,
 * and a threshold chosen here would be a guess wearing a gate's clothes. The first run RECORDS; later runs
 * may FALL and never RISE — the shape the opsec, killability and source-grep ledgers already use here.
 * It makes the number falsifiable without pretending to know it.
 *
 * This is also what will ADJUDICATE the `multisampling={0}` change. A per-frame MSAA resolve is the only
 * blitFramebuffer in this pipeline, so if that was the storm's source, CI's first seeded reading is the
 * evidence — from a real browser, which is the thing I could not produce locally and said so.
 *
 * Mutation-Proof: 4 mutations, denominator asserted (6/6 cases collected on every run).
 *   M1 `if (!frames)` guard removed          -> control case RED (0 errors over 0 frames would read CLEAN,
 *      which is precisely the reading a dead instrument gives)
 *   M2 `count > cap` becomes `count >= cap`  -> at-ceiling case RED (a run exactly at the ceiling is not
 *      a regression, and failing it would make the ratchet unable to hold steady)
 *   M3 `count > cap` becomes `count < cap`   -> rise case RED (the ratchet would invert and accept storms)
 *   M4 missing ledger returns ok:false       -> seed case RED (a first run must SEED, not refuse — a gate
 *      that refuses on a fresh clone teaches people to bypass it)
 */
describe('GL error ledger verdict', () => {
  it('0 errors over 0 FRAMES is a control failure, not a clean run', () => {
    const v = glVerdict(0, 0, null);
    expect(v.ok).toBe(false);
    expect(v.control).toBe(true);
    expect(v.line).toMatch(/COULD NOT CHECK/);
  });

  it('seeds on a missing ledger rather than refusing (fresh clone, first CI run)', () => {
    const v = glVerdict(7, 120, null);
    expect(v.ok).toBe(true);
    expect(v.seed).toBe(true);
    expect(v.line).toMatch(/NO LEDGER YET/);
  });

  it('a count ABOVE the ceiling fails, and the message says what a GL error costs', () => {
    const v = glVerdict(11, 120, { count: 10 });
    expect(v.ok).toBe(false);
    expect(v.line).toMatch(/ROSE/);
    expect(v.line).toMatch(/MUTES/); // names the second, non-obvious cost, not just "errors bad"
  });

  it('a count AT the ceiling holds — the ratchet must be able to stay put', () => {
    expect(glVerdict(10, 120, { count: 10 }).ok).toBe(true);
  });

  it('a count BELOW the ceiling passes and asks to be re-frozen', () => {
    const v = glVerdict(3, 120, { count: 10 });
    expect(v.ok).toBe(true);
    expect(v.line).toMatch(/FELL/);
  });

  it('a ceiling of 0 is honoured — once the storm is gone, ANY error is a regression', () => {
    // The outcome the multisampling={0} change is aiming at. If CI seeds 0, the gate becomes absolute,
    // which is the strongest form this ledger can take and the one worth arriving at.
    expect(glVerdict(0, 120, { count: 0 }).ok).toBe(true);
    expect(glVerdict(1, 120, { count: 0 }).ok).toBe(false);
  });
});
