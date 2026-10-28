# Eye-level lookbook, 2026-10-28

What a player sees: the production build on a real GPU, at the player's own eye, with the first-person hands and
the HUD on. This is the look acceptance surface for plan item #3
(`docs/superpowers/plans/2026-10-28-crafty-sota-reset.md`, lane W1-D).

**How it was made.** `npm run build`, then `node frontend/scripts/visual/lookbook.mjs` (run from `frontend/`), on
2026-10-28 from 10:50Z to 10:58Z. The build was main at `ee26549c` plus this lane's changes (index chunk
`index-RgqgJmVN.js`). The machine was an M3 Max with 14 cores, shared with other sessions. `uptime` at the start
read a load average of 236.52, with 174 processes runnable; at the end it read 33.17. The frames are shot at device
pixel ratio 2 and stored here at CSS-pixel size (Lanczos downscale, lossless PNG). The clips are Playwright
screencasts at 25 fps, cut to the 4.0 s the key was held, encoded as H.264.

| Target | Renderer | Eye frames valid | Clips |
|---|---|---|---|
| `chromium-1280x800` | ANGLE Metal, Apple M3 Max | 12/12 | 4/4 |
| `webkit-1180x820` (iPad landscape, touch) | "Apple GPU" (WebKit masks the name) | 12/12 | none (Chromium only) |
| `webkit-820x1180` (iPad portrait, touch) | "Apple GPU" | 12/12 | none |

A frame is valid when input is live, the player is alive, the world is built, the clock is where it was asked, no
hero pose is pinned, no hostile is within 3 m of the eye, the hands are on the camera, the HUD vitals are on screen
and the camera faces the asked bearing within 1 degree. `eye-level.json` holds every reading, per frame and clip.

## The eye-level frames

`<target>/eye-<bearing>-<time>.png`. The player stands at the Hearth, the spawn. Bearings follow the HUD compass:
0 is north, then clockwise. Times are dawn-origin cycle fractions.

| Bearing | What is in view |
|---|---|
| `000` (north) | The lodge wall at the left, a cyan light beam, the forest edge, Mara the Smith |
| `120` | The Hearth fire block in front, Sister Wren, a purple light beam, forest behind |
| `240` | Old Pike the Warden's tower, meadow hills to the south-west |

| Time | Name | What the frames show |
|---|---|---|
| `0.30` | afternoon | Blue sky, white cloud, full daylight |
| `0.48` | golden hour | By eye, still blue daylight with no golden cast; the "Dusk approaches" toast is up |
| `0.55` | blue hour | Navy sky and an orange horizon band; the terrain is a near-black silhouette |
| `0.75` | midnight | Almost identical to `0.55`, the orange band included |

On every frame the hands are two near-black slabs at the bottom edge, with an orange translucent sphere at the
right (plan items #13 and W2-E). On the portrait viewport only the left hand shows, at the frame's edge. The camera
sits 1.2 m above the body's centre, which rests 0.95 m above the ground (the capsule's half-height plus the
controller's 0.05 m offset). That puts the eye about 2.15 m above the ground, not the plan's +1.6 m. These frames
show the game's own eye.

## The walking clips

`chromium-1280x800/walk-<time>.mp4`: W held for 4.0 s due south from the Hearth, a real key event, over open plains
with forest to the left.

| Clip | Walked | Game frames, key down to recording stop | Post-pass GPU ms per frame, same window |
|---|---|---|---|
| `walk-0.30.mp4` | 48.0 m | 318 | 26.2 |
| `walk-0.48.mp4` | 46.5 m | 642 | 64.3 |
| `walk-0.55.mp4` | 41.2 m | 380 | 55.9 |
| `walk-0.75.mp4` | 42.5 m | 351 | 57.3 |

The base walk speed is 14 m/s (`frontend/src/game/locomotion.js`). The bearing stayed at 180 from start to end in
every clip.

## GPU time per post pass (Chromium only)

These come from `EXT_disjoint_timer_query_webgl2`, over about a second of frames per shot. Each figure is the median
across the 12 eye shots of each segment's mean.

| Segment | ms |
|---|---|
| RenderPass (the scene, shadows included) | 1.63 |
| depth blit | 1.03 |
| N8AO | 2.94 |
| GodRays update (only while the sun is up) | 3.08 |
| Bloom update | 3.38 to 3.60 |
| merged draw of the grade, bloom and GodRays pass | 2.58 to 2.79 |
| SMAA update / draw | 2.95 / 3.18 |
| tone mapping, noise and vignette draw | 3.30 |
| **post chain total** | **22.5 to 24.4 (median 23.4)** |

Treat these as upper bounds. The GPU was shared under the load above, and a full-screen tone-map draw costing about
3 ms at 2560x1600 on this GPU suggests the queries also count queueing. Compare segments against each other within
one run, never across runs or machines. WebKit exposes no timer extension, and its frames record that rather than a
number.

## Earlier runs on the same day

Run 1 (10:23Z) shot the eye set after the hero set, and most of its WebKit eye frames showed a hostile at arm's
length, which its verdict still passed. Run 2 (10:40Z) shot the eye set first and refused a frame with a hostile
within 3 m. It refused all 24 WebKit eye frames: a hostile sat 1.65 m from the eye at every bearing and time, so at
the player's own position, through the whole eye set on both WebKit viewports. Chromium was clean in both runs. The
probe now also removes hostiles within 12 m of the eye before each eye shot and clip (`clearHostiles`, recorded as
`cleared`).

In this run no hostile came within 23 m of any eye frame, so `cleared` is 0 everywhere. The clean frames here are
not the clearing's doing, and the clearing has not yet been seen to remove a mob in a live run.
