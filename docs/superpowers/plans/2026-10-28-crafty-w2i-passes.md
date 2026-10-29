# W2-I: measure the post passes, then decide them

Lane W2-I of `docs/superpowers/plans/2026-10-28-crafty-sota-reset.md` (rows 14, 16 and 28; section 3; section 8's row on
#24). A task script under DECISIONS 2026-10-28 (W1-H) item 3: 300 lines or less, red-first steps, the gates it runs.

## Goal

Kevin reported the live site running his M3 Max hot. #24 (steady tiers, cool by budget) cut the pixels; this lane cuts
GPU work per frame by deleting post passes whose cost is real and whose look is not, so the Mac runs cooler now and
steady-cool's pixel budgets can later rise toward dpr 2 at the same cost. Rapier lazy-behind-title (row 28) is not in
this lane; it gets a registry row.

## Why the existing per-pass numbers cannot decide anything

W1-D's timer (`frontend/src/render/passTimer.js`) wraps every pass in its own `TIME_ELAPSED` query. On ANGLE-Metal
its readings summed to more than the window lasted (`masterpiece-2026-10/evidence/eye-level/index.md`), and every
segment that did GPU work read about 3 ms whatever it was, which looks like a per-query floor rather than work. So a
segment cannot rank a pass, and a sum of segments cannot be a frame. This lane adds an independent whole-frame
measurement and decides on the DIFFERENTIAL: the whole frame with a pass on, minus the whole frame with it off.

## The metric

- **Whole-frame GPU ms** (instrument Q): one `TIME_ELAPSED` query around the entire `EffectComposer.render` (the scene,
  its shadow maps and every post pass), opened right after a sync point, so the GPU is idle when it opens and the
  query does not count queueing behind earlier work.
- **Synced wall ms** (instrument W, independent of the timer extension): `performance.now()` around the same render,
  with a 1-pixel `readPixels` before (drains the GPU) and after (waits for this frame's work). It also counts the
  pass's CPU encoding and the sync's round trip; the round trip is the same in both arms and cancels in a differential.
- **Per window**: the median over its frames (about 1.5 s). **Per pass and time**: at least 5 repetitions of an
  (on, off) pair, the order alternating (on/off, off/on, ...) so a drift in the scene or the clock cancels. A
  repetition's differential is `d = on - off`. Reported: the median `d`, its range (min to max), how many `d` are
  positive, and the 1-minute load average at the start of each block.
- **Segments check**: windows with every pass on, in segment mode, whose summed segment medians are set against the
  whole-frame median. Reported as a ratio; never used for a decision.

Where: the production build (`npm run build`), served by the lookbook's `vite preview` on its managed port
(`scripts/visual/_serve.mjs`), headless Chromium on ANGLE-Metal, M3 Max. The page is Kevin's laptop window, 1728x1117
CSS at device scale 2 (the case `render/quality.js` derives its budgets from), at tier `high`, which `selectTier` gives
this machine and which steady-cool holds while the frame rate holds: dpr 1.475, 4.2 Mpx. The player stands at the
Hearth at eye level. Times (dawn-origin cycle): noon 0.25, golden hour 0.48 (GodRays is horizon-gated and live only
while the sun is up), midnight 0.75. Before each block: `uptime`; no block starts while the 1-minute load is over 12.
One GPU run at a time, holding the lane's `gpu.lock` directory.

Arms (a pass switched off through the lookbook seam, the rest of the chain unchanged): `n8ao`; `godrays` with the
`sun` billboard; `bloom`; `smaa`; `tonemapping`; `grade` (HueSaturation and BrightnessContrast); `vignette`. An effect
is switched off the way deleting it would read on the GPU: its blend function set to skip (postprocessing then leaves
it out of the merged shader and skips a pass left with nothing to draw) and its `update()` not run (its own render
passes). N8AO is a pass of its own and is disabled. The Sun billboard is hidden.

## Amendment before the measurement: a third instrument, and which instruments count

A smoke run (noon, N8AO and Bloom, one repetition, on the production build) checked the instruments before the
measurement. It showed the whole-frame query is not GPU execution time either: its median was 13.3 to 15.0 ms
per frame while the synced wall clock that brackets it read 10.9 to 11.4 ms, and GPU work bracketed by two syncs
cannot outlast them. The segment sum in the same run was 65 ms per frame at 60 frames a second. The wall clock's
differentials were near zero (N8AO +0.1 ms, Bloom -0.3 ms) while the query's were +2.2 and +3.0 ms: the wall clock
measures the frame's critical path, which the GPU is not on when the CPU encodes for longer than the GPU draws.

So a third instrument joins, one with no timer query in it: **U, the GPU's own busy time per frame**, the driver's
"Device Utilization %" (`ioreg -r -d 1 -w 0 -c IOAccelerator`, the figure Activity Monitor's GPU history reads, no
root) sampled every 200 ms over 2.5 s of free-running play (no query, no sync), the median after the first 0.5 s,
times the window's mean frame interval. It is GPU-wide, so other processes' GPU work is in it; the interleaving puts
that on both arms alike, and the idle reading before the run is recorded. It measures what heat follows: how long
the GPU is busy per frame.

A positive control joins the arms: **all-post**, every post pass off at once, which must move an instrument that can
see post-processing at all. The amended rule:

- An instrument is **admitted** at a time of day when the control's differential on it is material (0.5 ms or more,
  4 of 5 repetitions positive), and, for Q, when no window has Q above W.
- The decision rests on **U**. A pass is **material** when its median `dU` is at least **0.5 ms** and at least
  **10%** of the frame's `U` with the pass on, at one or more of the three times, with at least 4 of 5 repetitions
  positive, and no admitted instrument contradicts it (a contradiction is a median of the opposite sign larger than
  0.25 ms). If U is not admitted, no pass is decided on cost.
- Everything else in the rule below stands: look loss, delete, keep, the ink edge, the dynamic import, the bundle.

## Second amendment, after the windowed run and before the alternation run

The windowed run (all three times, 5 repetitions) showed the GPU moving between two busy levels with no change in the
work, about 45% and 87% busy at the same 60 frames a second, holding each for tens of seconds and switching at
moments unrelated to the arm (a power or clock state; GPU-wide, so another process's GPU work cannot be ruled out).
The windows of an on/off pair sit about 5 s apart, so a pair that straddles a switch reads up to 6 ms either way.
The median over 5 repetitions is the rule's defence, and the 4-of-5 sign test its second.

A **fast alternation** (`lookbook.mjs --passes --alt`) is added as a check written before its results: one window per
arm, the pass switched off and on every 1.5 s for 10 halves, the utilization read through each half, so each adjacent
pair of halves is one differential within one state; 2 such windows per arm per time. It does not replace the
windowed decision. **It can only block one:** a pass the windowed U finds material at a time is deleted only if the
alternation's median at that time is at least 0.25 ms; below that, the pass is recorded as unproven and kept.

## The decision rule (written before measuring)

For each arm, at each time where the pass runs:

1. **The two instruments agree** when their median differentials have the same sign and differ by no more than
   0.25 ms or half the larger, whichever is more. A pass whose instruments disagree is not deleted on cost; it is
   recorded as unproven.
2. **Material** means: median `dQ` of at least **0.5 ms** (3% of a 16.7 ms frame) AND at least **10%** of the whole
   frame's GPU ms with the pass on, at one or more of the three times, with at least 4 of 5 repetitions positive, and
   the instruments agreeing.
3. **Look loss** is judged by eye on lookbook pairs shot in the same session (the pass on, then off, same stand,
   bearing and time), at the times where the pass matters, and written in words below. **Small** means a player at
   eye level would not notice it in ordinary play, or sees it only in a narrow view (for example only when facing the
   sun near the horizon). **Large** means a signature of the look goes.
4. **Delete** a pass that is material and whose look loss is small. **Delete** a pass that is inert (no visible
   change on its pairs) whatever it costs. **Keep** a pass that is not material, or whose loss is large; a kept
   material pass is named as the first candidate for a cheaper replacement.
5. **N8AO's replacement** by one ink-edge pass happens only if N8AO is deleted under 4, the ink edge measures cheaper
   on the same instruments, and it can be built in about 80 lines. Otherwise no replacement in this lane.
6. **A kept pass that some tier switches off** is imported only when its tier enables it (a dynamic import, so the
   boot chunk does not carry it; the GameScene half of row 14).
7. **Bundle**: a deletion that frees bytes lowers the chunk's ceiling in `scripts/ci/bundle-budget.mjs`; no ceiling
   is raised.

## Tasks

| # | Task | Red first | Done when |
|---|---|---|---|
| T1 | This plan, committed before any measurement | — | committed |
| T2 | Whole-frame mode in `passTimer.js`: `setMode('frame')` times each `composer.render` as one query (`frame`) plus the synced wall (`frame:wall`); segment wrappers pass through while it is on | a gate in `tests/gates/lookbook-seam-gates.test.js` over the fake GL: the `frame` query equals the frame's drawn ms, no segment opens inside it, `frame:wall` is recorded, and `report()` lists the live chain's pass labels whether or not the extension exists | the gate is green and goes red with the whole-frame query removed |
| T3 | The seam's `passesOff(names)` and the driver that applies it (`render/postFx.jsx` PostTierDriver, `render/Sun.jsx`) | a gate driving a real EffectComposer: `passesOff(['bloom'])` sets Bloom's blend function to skip and stops its `update()`, `passesOff([])` restores both; an unknown name throws | green; prod-smoke's seam method list includes it |
| T4 | `lookbook.mjs --passes`: the measurement and the look pairs, and `_lookbook.mjs` `passDifferential` (pure) | a gate in `tests/gates/lookbook-plan-gates.test.js` on synthetic windows: the ABBA order, `d` per repetition, medians, range, positives, agreement | green |
| T5 | Build, measure (one run, background, deadline in its loop), save raw JSON under `docs/superpowers/masterpiece-2026-10/evidence/w2i/` | — | every arm at every time has 5 or more repetitions, or the run names what is missing |
| T6 | Open the pairs, judge each candidate's look loss below | — | judged in words |
| T7 | Decide by the rule; delete; dynamic-import a kept tier-gated pass; lower freed ceilings | a gate that goes red if a deleted pass or the Sun billboard returns (on structure: the live chain the production build renders, and the built chunks) | mutation-proved |
| T8 | DECISIONS entry (items continue from the last 2026-10-28 item), registry rows (the Rapier row; close what this lane resolves) | — | `registry-harvest.mjs` green |
| T9 | `npm run lint`, `npm run test:unit`, `doc-currency`, `npm run build`, `bundle-budget`; push the branch; PR; CI on the exact head | — | CI's `ci ok` on the head sha |

## Gates this lane adds or changes

- `tests/gates/lookbook-seam-gates.test.js`: the whole-frame mode (killable: remove the query and it reds) and
  `passesOff`.
- `tests/gates/lookbook-plan-gates.test.js`: `passDifferential`.
- Whatever T7 deletes: a gate on structure that reds if it returns. Each with a `Mutation-Proof:` trailer, red on the
  defect's shape and green on an identity mutant.

## What this cannot prove

Watts (the `power-ab.sh` A/B needs root and stays Kevin's optional row), the iPad (WebKit exposes no timer
extension), other machines, and whether the GPU's clock state under a sync each frame matches free-running play: the
differential is measured with a sync point per frame in both arms.

## Results

**The runs.** The production build of `651b589c` (index chunk `index-DDg_cF3-.js`), served by `lookbook.mjs` on its
managed port, headless Chromium on ANGLE-Metal (Apple M3 Max), 1728x1117 CSS at device scale 2, tier `high` the whole
time (dpr 1.475, canvas 2549x1647), 60 frames a second free-running. Windowed: noon 15:14-15:21, golden hour
15:23-15:31, midnight 15:33-15:40 (local), each block started at a 1-minute load of 10.3, 9.7 and 11.0, which other
sessions then pushed to 50, 28 and 26 during the windows (recorded per window). Alternation: noon 15:49-15:56, golden
16:00-16:03, midnight 16:04-16:06. Readings (a digest per window, not the raw samples): `docs/superpowers/masterpiece-2026-10/evidence/w2i/`.

**The instruments.** The segments summed to 55-63 ms per frame at 60 frames a second: not GPU time, as W1-D found. The
whole-frame query read more than the synced wall clock that brackets it in 214 of 240 windows: not GPU time either,
and not admitted. The synced wall clock and U were admitted by the control at all three times. U's windowed readings
sit at one of two busy levels, about 45% and 87%, at the same 60 frames a second, switching every tens of seconds at
moments unrelated to the arm; the alternation shows the same pass costing about three times as long at the higher
level (N8AO 1 ms against 3.5 ms in one window), so the GPU's clock is the likeliest cause, and a pass's saving is partly
taken back by the clock within a few seconds. The windowed medians are therefore lower than the alternation's.

**U differentials, ms of GPU busy time per frame** (median [min..max] (positive/n), share of the frame with the pass on):

| Arm | Noon, windowed | Golden, windowed | Midnight, windowed | Noon, alternation | Golden, alternation | Midnight, alternation |
|---|---|---|---|---|---|---|
| N8AO | 0.32 [0.02..3.34] (5/5) 4.1% | 0.32 [-0.17..3.68] (4/5) 4.2% | **2.31 [0.64..4.39] (5/5) 26.2%** | 3.41 [0.17..5.67] (18/18) 29% | 3.67 [1.00..4.00] (18/18) 25% | 2.58 [0.17..4.50] (18/18) 24% |
| GodRays + Sun | 0.17 [-5.68..2.04] (3/5) 2.1% | -0.48 [-6.13..1.74] (2/5) | 0.14 [-0.49..0.50] (3/5) 1.6% | 1.33 [1.17..1.50] (18/18) 9.1% | 1.33 [1.00..1.50] (18/18) 9.0% | 0.00 [-5.00..0.67] (6/18): gated below the horizon |
| Bloom | 1.11 [1.01..1.34] (5/5) 7.6% | 1.19 [-0.00..1.77] (4/5) 8.1% | 1.00 [-0.16..1.86] (4/5) 7.4% | 1.17 [1.00..1.50] (18/18) 8.0% | 1.17 [0.83..1.50] (18/18) 7.9% | 1.00 [1.00..1.83] (18/18) 7.5% |
| SMAA | 0.66 [-0.51..1.03] (4/5) 4.5% | 0.47 [-0.35..0.79] (3/5) 5.8% | 0.88 [0.46..0.94] (5/5) 6.6% | 0.67 [0.50..0.67] (18/18) 4.6% | 0.75 [0.50..1.00] (18/18) 5.1% | 0.67 [0.50..1.00] (18/18) 5.0% |
| Tone mapping | 0.12 [-0.03..0.22] (4/5) 0.8% | -0.02 [-0.83..0.19] (2/5) | 0.04 [-0.02..1.03] (4/5) 0.3% | not run | not run | not run |
| Grade | 0.07 [-0.22..0.20] (3/5) 0.5% | 0.01 [-0.14..0.16] (3/5) 0.1% | 0.15 [-0.03..0.28] (4/5) 1.1% | not run | not run | not run |
| Vignette | -0.00 [-0.11..0.21] (2/5) | 0.04 [-0.08..0.18] (3/5) 0.3% | 0.12 [-0.15..0.94] (3/5) 0.9% | not run | not run | not run |
| All post (control) | 9.93 [2.15..10.46] (5/5) 68% | 10.26 [1.00..10.51] (5/5) 70% | 4.59 [3.17..7.10] (5/5) 52% | 7.67 (18/18) | 8.33 (18/18) | 3.50 (18/18) |

The synced wall clock's differentials were within 0.25 ms of zero or positive for every arm the rule finds material,
so none contradicts it. Its own medians, for the record: N8AO 1.40, 1.10 and 0.70 ms at the three times.

**Look, judged on the pairs** (`evidence/w2i/frames/`, each pass on, then off, same stand, bearing and time):

- **N8AO** (`noon-000-n8ao-*`, `golden-056-n8ao-*`, `midnight-000-n8ao-*`): at noon and golden hour, a slight darkening
  under the leaf canopy and where a trunk meets it goes; the lodge wall, the ground and the NPCs do not change; at
  midnight the two frames cannot be told apart. The mesher's baked vertex AO (`aAO` in `world/Terrain.jsx`) already
  darkens every block corner and stays. The frame differences (1.2-1.3% mean) are the size of the motion between the
  two shots (rain, grass, clouds). **Small.**
- **GodRays + Sun** (`noon-316-godrays-sun-*`, `golden-043-godrays-sun-*`): at golden hour, facing the sun, the sun
  disc and its warm glow are the frame: off, there is no sun in the sky at all and the scene reads as flat overcast
  green. At noon facing the sun the shafts wash the upper half (the lodge roof reads pale pink-beige instead of maroon,
  the hands brown instead of black), which reads as glare more than light. **Large** at golden hour.

**Decisions by the rule.** N8AO is material (windowed at midnight; the alternation, 3.4-3.7 ms and about a quarter of
the frame, does not block it) and its look loss is small: **deleted**, with no ink-edge replacement (the loss is small
and the vertex AO stays). GodRays + Sun is not material on the windowed U at any time, and the alternation can only
block, so **kept**; at 1.3 ms and 9% of the frame it is the largest remaining pass and the first candidate if
steady-cool's raised pixel budgets need room, and its noon glare is a look note for the light and colour lane. Bloom,
SMAA, tone mapping, the grade and the vignette are not material: **kept**. GodRays is the only kept pass a tier switches
off, and a dynamic import would free nothing: `GodRaysEffect` lives in postprocessing's single module in the r3f chunk,
which boot loads for the composer, Bloom and SMAA anyway, and GameScene already builds it only when a tier first needs
it. The n8ao deletion takes 141,581 B out of the r3f chunk (829,540 to 687,959 B; 77 KB gzipped), and its ceiling falls
by that (900,000 to 760,000 B).
