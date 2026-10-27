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

// PACING BEYOND THE TITLE (plan docs/superpowers/plans/2026-10-27-crafty-steady-cool.md, item g). A panel covers the
// canvas with a full-screen bg-ink/75 scrim (ui/GamePanels.jsx): the world stays visible through it, so it keeps moving,
// at half the rate. An unfocused desktop window is not being looked at: the title's pace. Neither ever draws ABOVE the
// player's own cap (the frame-cap e2e runs a 1 fps test cap and opens Show Stats under it).

/** Frames a second the game canvas draws behind a panel. */
export const PANEL_FPS = 30;
/** Frames a second the game canvas draws while a desktop window is unfocused. */
export const BLUR_FPS = 10;

const atMost = (fps, frameCap) => (frameCap > 0 ? Math.min(fps, frameCap) : fps);

/**
 * PURE. The Canvas `frameloop` and the FrameCap rate for the game canvas.
 * @param {{ frameCap: number, titleCovering: boolean, panelCovering?: boolean, unfocused?: boolean, harness: boolean }} s
 *   frameCap: the player's setting (60, or 0 = unlimited); titleCovering: the title screen is up; panelCovering: a panel
 *   scrim covers the canvas; unfocused: a desktop window without focus; harness: the capture harness or the perf probe
 *   is running (they step or time their own frames — never paced).
 * @returns {{ loop: 'always' | 'demand', fps: number }} fps 0 = not paced.
 */
export function paceFor({ frameCap, titleCovering, panelCovering = false, unfocused = false, harness }) {
  if (harness) return { loop: 'always', fps: 0 };
  if (titleCovering) return { loop: 'demand', fps: TITLE_FPS };
  if (unfocused) return { loop: 'demand', fps: atMost(BLUR_FPS, frameCap) };
  if (panelCovering) return { loop: 'demand', fps: atMost(PANEL_FPS, frameCap) };
  if (frameCap > 0) return { loop: 'demand', fps: frameCap };
  return { loop: 'always', fps: 0 };
}
