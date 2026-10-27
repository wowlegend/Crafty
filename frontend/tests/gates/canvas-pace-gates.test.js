import { describe, it, expect } from 'vitest';
import { paceFor, TITLE_FPS } from '../../src/render/canvasPace.js';

/**
 * WHO DECIDES HOW OFTEN THE GAME CANVAS DRAWS (plan 2026-09-23-crafty-perf-heat-ipad, Task 3). Behind the opaque title
 * screen the game canvas drew the whole world at the display rate while nobody could see it. paceFor is the one
 * decision; this drives every combination of its three inputs.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   P1 the title case removed -> "the covered canvas drew at the setting's rate"
 *   P2 plausible-wrong: the title case STOPS the canvas (fps 0 on demand) -> "the covered canvas never draws"
 *   P3 plausible-wrong: the harness check after the title check -> "the harness was paced"
 *   P4 plausible-wrong: Unlimited paced at 60 -> "Unlimited is capped"
 *   and P0, an identity mutant (a comment edit in canvasPace.js, same harness and batch), SURVIVED.
 *
 * BLIND SPOT: that GameScene reads this, and that MenuSystem's title flag reaches the store, is the e2e's
 * (tests/e2e/frame-cap.spec.js); that the pace BINDS is the same e2e's 1 fps case.
 */
describe('paceFor', () => {
  it('in play, the setting decides: 60 -> paced at 60, Unlimited -> the display rate', () => {
    expect(paceFor({ frameCap: 60, titleCovering: false, harness: false })).toEqual({ loop: 'demand', fps: 60 });
    expect(paceFor({ frameCap: 0, titleCovering: false, harness: false }), 'Unlimited is capped').toEqual({ loop: 'always', fps: 0 });
  });
  it('behind the title, the covered canvas draws slowly whatever the setting — never at the display rate, never not at all', () => {
    for (const frameCap of [60, 0]) {
      const p = paceFor({ frameCap, titleCovering: true, harness: false });
      expect(p.loop, 'the covered canvas drew at the setting\'s rate').toBe('demand');
      expect(p.fps, 'the covered canvas drew at the setting\'s rate').toBe(TITLE_FPS);
      expect(p.fps, 'the covered canvas never draws — Start would pay for every shader compile at once').toBeGreaterThan(0);
    }
    expect(TITLE_FPS, 'a title pace at or above the cap saves nothing').toBeLessThan(60);
  });
  it('the capture harness and the perf probe are never paced, title or not', () => {
    for (const titleCovering of [false, true]) {
      for (const frameCap of [60, 0]) {
        expect(paceFor({ frameCap, titleCovering, harness: true }), 'the harness was paced').toEqual({ loop: 'always', fps: 0 });
      }
    }
  });
});
