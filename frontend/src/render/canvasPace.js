// canvasPace — how often the GAME canvas draws, decided in one place (plan
// docs/superpowers/plans/2026-09-23-crafty-perf-heat-ipad.md, Task 3).
//
// Behind the title screen the game canvas is fully covered — the title is an opaque layer with its own WebGL canvas —
// yet it drew the whole world at the display rate: two contexts at once, the covered one the expensive one. It is
// PACED there, not stopped: stopping it would move every shader compile and the first shadow render to the instant the
// player presses Start (a multi-second freeze on an iPad), and the simulation behind the title would take one huge
// step on resume. 10 fps keeps the compiles happening and the world warm for a fraction of the work.

/** Frames a second the game canvas draws while the title screen covers it. */
export const TITLE_FPS = 10;

/**
 * PURE. The Canvas `frameloop` and the FrameCap rate for the game canvas.
 * @param {{ frameCap: number, titleCovering: boolean, harness: boolean }} s
 *   frameCap: the player's setting (60, or 0 = unlimited); titleCovering: the title screen is up; harness: the
 *   capture harness or the perf probe is running (they step or time their own frames — never paced).
 * @returns {{ loop: 'always' | 'demand', fps: number }} fps 0 = not paced.
 */
export function paceFor({ frameCap, titleCovering, harness }) {
  if (harness) return { loop: 'always', fps: 0 };
  if (titleCovering) return { loop: 'demand', fps: TITLE_FPS };
  if (frameCap > 0) return { loop: 'demand', fps: frameCap };
  return { loop: 'always', fps: 0 };
}
