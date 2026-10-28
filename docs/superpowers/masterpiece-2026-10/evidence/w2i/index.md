# W2-I pass measurement, 2026-10-28

What each post pass costs the GPU per frame on the production build, and what it adds to the frame, for lane W2-I of
`docs/superpowers/plans/2026-10-28-crafty-sota-reset.md`. The task script, its decision rule (written before the
measurement, amended twice before the runs whose results it uses) and the results table are in
`docs/superpowers/plans/2026-10-28-crafty-w2i-passes.md`; the decisions are DECISIONS 2026-10-28 items 25 to 29.

**How it was made.** `npm run build` at `651b589c` (index chunk `index-DDg_cF3-.js`), then
`node scripts/visual/lookbook.mjs --passes --times <t>` (and `--alt --alt-reps 2 --arms n8ao,godrays+sun,bloom,smaa`
for the alternation), from `frontend/`, one time of day per run, each launched once the 1-minute load was 12 or less.
Headless Chromium, ANGLE Metal on an Apple M3 Max, 1728x1117 CSS at device scale 2, tier `high` (dpr 1.475, canvas
2549x1647), the player stood at the Hearth at eye level, input live, hostiles within 24 m cleared before each window.

## Files

| File | What it holds |
|---|---|
| `windowed-noon.json`, `windowed-golden.json`, `windowed-midnight.json` | Every window of the windowed run: arm, repetition, on or off, U (GPU busy ms per frame) with its raw device-utilization readings, the synced wall clock W, the whole-frame query Q, frames, tier, dpr, the clock, the load, and validity. The noon file's validity is re-derived: the run's clock check was 4.8 s wide against a 5.1 s window, so every noon window read "clock at 0.2604"; it accepts a clock up to 0.015 past the asked time and keeps the original reasons as `whyOriginal`, and its block's `admitted` is re-derived from those windows (the run's own, all false, is `admittedOriginal`). The probe now re-sets the clock between its two sub-windows. |
| `alternation-noon.json`, `alternation-golden.json`, `alternation-midnight.json` | Each alternation window: the 10 halves' device-utilization readings, each half's GPU ms, and the 9 adjacent on/off differentials. |
| `frames/*.jpg` | Ten frames at CSS size, JPEG quality 82: each named pass on and off, same stand, bearing and time. `<time>-<bearing>-<arm>-<on|off>.jpg`. |

## What the readings are, and are not

- **U** is the driver's own "Device Utilization %" (`ioreg -r -d 1 -w 0 -c IOAccelerator`, no root), the median after
  the first 0.5 s of a free-running window (no timer query, no sync), times that window's frame interval. It is
  GPU-wide: another process's GPU work would count. Idle, before the runs, it read 0%.
- The GPU sat at one of two busy levels, about 45% and 87%, at the same 60 frames a second, switching every tens of
  seconds. The alternation keeps each differential inside one level; the windowed run does not, which is why its
  medians run lower and its ranges wide.
- **Q** (one TIME_ELAPSED query per composer.render, after a sync) read more than the synced wall clock that brackets
  it in 214 of 240 windows, so it is not GPU execution time. **The segments** (W1-D's per-pass queries) summed to 55-63
  ms per frame at 60 frames a second, as W1-D found.
- **Not measured:** watts (the `power-ab.sh` A/B needs root and is Kevin's optional row), the iPad (WebKit exposes no
  timer extension, and its utilization was not read), any other machine, and whether the busy level a player's Mac
  settles at matches either level here.
