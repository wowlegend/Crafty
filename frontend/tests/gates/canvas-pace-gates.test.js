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
 * The governor (review 2026-10-27: behind the title it read 10 fps as a slow machine and stepped every desktop down
 * to `low` before play), same harness, each observed RED:
 *   V1 the title case leaves the governor on -> "the governor samples the title's pace"
 *   V2 the harness case leaves it on -> "the governor samples a harness"
 *   V3 plausible-wrong: Unlimited play ungoverned -> "play is ungoverned"
 *   and V0, an identity mutant (a comment edit in canvasPace.js), SURVIVED.
 *
 * BLIND SPOT: that GameScene reads this, and that MenuSystem's title flag reaches the store, is the e2e's
 * (tests/e2e/frame-cap.spec.js); that the pace BINDS is the same e2e's 1 fps case. That GameScene mounts the monitor
 * on `governor` is pinned by shape in perf-config-gates and lived in the same e2e (the tier set on the title holds).
 */
describe('paceFor', () => {
  it('in play, the setting decides: 60 -> paced at 60, Unlimited -> the display rate', () => {
    expect(paceFor({ frameCap: 60, titleCovering: false, harness: false })).toMatchObject({ loop: 'demand', fps: 60 });
    expect(paceFor({ frameCap: 0, titleCovering: false, harness: false }), 'Unlimited is capped').toMatchObject({ loop: 'always', fps: 0 });
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
        expect(paceFor({ frameCap, titleCovering, harness: true }), 'the harness was paced').toMatchObject({ loop: 'always', fps: 0 });
      }
    }
  });
});

describe('the tier governor judges only a rate the machine set', () => {
  // All eight combinations, each with its own answer: the governor runs exactly in play without a harness.
  it('off behind the title and under either harness; on in play, capped or Unlimited', () => {
    let checked = 0;
    for (const harness of [false, true]) {
      for (const titleCovering of [false, true]) {
        for (const frameCap of [60, 0]) {
          const { governor } = paceFor({ frameCap, titleCovering, harness });
          const why = harness ? 'the governor samples a harness' : titleCovering ? 'the governor samples the title\'s pace' : 'play is ungoverned';
          expect(governor, `${why} (${JSON.stringify({ frameCap, titleCovering, harness })})`).toBe(!harness && !titleCovering);
          checked += 1;
        }
      }
    }
    expect(checked, 'the combinations checked').toBe(8);
  });
});
