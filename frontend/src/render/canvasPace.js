// canvasPace — how often the GAME canvas draws, decided in one place (plan
// docs/superpowers/plans/2026-09-23-crafty-perf-heat-ipad.md, Task 3).
//
// Behind the title screen the game canvas is fully covered — the title is an opaque layer with its own WebGL canvas —
// yet it drew the whole world at the display rate: two contexts at once, the covered one the expensive one. It is
// PACED there, not stopped: stopping it would move every shader compile and the first shadow render to the instant the
// player presses Start (a multi-second freeze on an iPad), and the simulation behind the title would take one huge
// step on resume. 10 fps keeps the compiles happening and the world warm for a fraction of the work.

//
// THE TIER GOVERNOR READS ONLY A RATE THE MACHINE SET. drei's PerformanceMonitor (GameScene) judges the renderer by
// the frames it counts per 250 ms window, and behind the title every window reads TITLE_FPS — under any bound. Left
// sampling there, it declined high -> med after ~2.5 s and med -> low after ~5 s on every machine, so play opened with
// the pass recompiles, shadow-map reallocation and chunk re-streaming of the climb back: the freeze this pace exists to
// avoid. So `governor` is false wherever the rate is ours (the title pace, the harnesses), and GameScene mounts the
// monitor only while it is true: the one that mounts in play starts with no samples, since drei keeps its samples and
// the highest rate it has seen in the component's own state.

/** Frames a second the game canvas draws while the title screen covers it. */
export const TITLE_FPS = 10;

/**
 * PURE. The Canvas `frameloop`, the FrameCap rate, and whether the tier governor may judge the frames drawn.
 * @param {{ frameCap: number, titleCovering: boolean, harness: boolean }} s
 *   frameCap: the player's setting (60, or 0 = unlimited); titleCovering: the title screen is up; harness: the
 *   capture harness or the perf probe is running (they step or time their own frames — never paced).
 * @returns {{ loop: 'always' | 'demand', fps: number, governor: boolean }} fps 0 = not paced. governor: the frame
 *   rate is the machine's to report (the player's cap is a display the governor's bounds already know).
 */
export function paceFor({ frameCap, titleCovering, harness }) {
  if (harness) return { loop: 'always', fps: 0, governor: false };
  if (titleCovering) return { loop: 'demand', fps: TITLE_FPS, governor: false };
  if (frameCap > 0) return { loop: 'demand', fps: frameCap, governor: true };
  return { loop: 'always', fps: 0, governor: true };
}
