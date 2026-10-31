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

//
// A WORLD BEING BUILT IS COVERED TOO. A Start clicked before the spawn chunk is built leaves App's loading overlay
// (bg-black/90 with a backdrop blur) over the canvas until it is: the title's case, so the title's pace and no governor,
// which would read the build's cost as the machine's and step the tier down for the session. Drawn at the play pace
// there, on CI's software renderer the page saturated its main thread, and the input the browser's pointer lock streams
// then queued in the renderer and the browser without bound, to the runner's 16 GB (DECISIONS 2026-10-31 item 370).

/** Frames a second the game canvas draws while the title screen, or the loading overlay over a world being built, covers it. */
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
 * PURE. The Canvas `frameloop`, the FrameCap rate, and whether the tier governor may be mounted at all.
 * @param {{ frameCap: number, titleCovering: boolean, worldBuilding?: boolean, panelCovering?: boolean, unfocused?: boolean, harness: boolean }} s
 *   frameCap: the player's setting (60, or 0 = unlimited); titleCovering: the title screen is up; worldBuilding: the
 *   spawn chunk is not built yet, so the loading overlay is up; panelCovering: a panel scrim covers the canvas;
 *   unfocused: a desktop window without focus; harness: the capture harness or the perf probe is running (they step or
 *   time their own frames — never paced).
 * @returns {{ loop: 'always' | 'demand', fps: number, governor: boolean }} fps 0 = not paced. governor: false where the
 *   whole canvas is ours to pace (a harness, the title); the player's cap is a display the governor's bounds already
 *   know. A panel or an unfocused window leaves it true: whether a pace BELOW the cap may be sampled is the second,
 *   separate rule GameScene also applies — render/tierGovernor.js governorSamples.
 */
export function paceFor({ frameCap, titleCovering, worldBuilding = false, panelCovering = false, unfocused = false, harness }) {
  if (harness) return { loop: 'always', fps: 0, governor: false };
  if (titleCovering) return { loop: 'demand', fps: TITLE_FPS, governor: false };
  if (worldBuilding) return { loop: 'demand', fps: atMost(TITLE_FPS, frameCap), governor: false };
  if (unfocused) return { loop: 'demand', fps: atMost(BLUR_FPS, frameCap), governor: true };
  if (panelCovering) return { loop: 'demand', fps: atMost(PANEL_FPS, frameCap), governor: true };
  if (frameCap > 0) return { loop: 'demand', fps: frameCap, governor: true };
  return { loop: 'always', fps: 0, governor: true };
}
