# The light and colour script, Wave 1 landing: evidence, 2026-10-28

This lane is `worktree-wf_34f35934-dfe-1`, and its plan is `docs/superpowers/plans/2026-10-27-crafty-light-colour-script.md`
(see "As built for the Wave 1 landing"). The SOTA reset accepts the look on W1-D's eye-level frames and dusk clip. It
also asks for an OKLab check of the blend and for a decision on the day length. The decisions are DECISIONS
2026-10-28 item 21.

## The OKLab blend

`oklab-blend.json` lists every pair of adjacent keys the script blends: day and sunset, sunset and dusk, dusk and
night, night and preDawn, preDawn and sunrise, sunrise and day. Each pair is checked for eight colours: sky top, sky
mid, horizon, fog, glow, hemisphere sky, hemisphere ground and ambient. For each it gives the midpoint's OKLab
lightness and chroma three ways: the script's own blend (`lin`, a linear-RGB lerp, three's `lerpColors`), an
sRGB-byte lerp (`srgb`), and the straight OKLab line (`ok`). It also gives each path's largest OKLab distance from
the OKLab path.

| Pair, colour | Ends (C) | Midpoint C, lin / sRGB / OKLab | Midpoint L, lin / sRGB / OKLab |
|---|---|---|---|
| sunset to dusk, horizon `#FFC27A` to `#9A90C0` | 0.113 / 0.071 | 0.050 / 0.045 / 0.040 | 0.777 / 0.763 / 0.767 |
| sunset to dusk, fog `#E8C6A0` to `#5A6690` | 0.064 / 0.068 | 0.026 / 0.013 / 0.013 | 0.720 / 0.683 / 0.682 |
| sunset to dusk, glow `#FFB060` to `#9A90C0` | 0.133 / 0.071 | 0.062 / 0.058 / 0.051 | 0.755 / 0.743 / 0.749 |
| preDawn to sunrise, horizon `#8A90C0` to `#FFB8A0` | 0.071 / 0.089 | 0.051 / 0.041 / 0.041 | 0.765 / 0.751 / 0.755 |
| day to sunset, horizon `#CFE6F2` to `#FFC27A` | 0.029 / 0.113 | 0.033 / 0.045 / 0.043 | 0.884 / 0.878 / 0.883 |

Over the whole path, sampled through `sampleScript` at the real fractions (1380 samples), the linear blend is never
darker than the OKLab line (worst 0.0000 L). It is at most 0.0147 short in chroma (the fog, between dusk and sunset).
That is under 0.02, the OKLab step this check takes as one visible difference. The sRGB lerp runs up to 0.006 darker,
also under a step. These figures are the colour model and the authored keys, not pixels. In the display model (the
dome's horizon, through the key's exposure, the grade and NEUTRAL), the chroma bottoms at 0.051 at f 0.508 between
the sunset and dusk keys, and at 0.058 between preDawn and sunrise. The orange turns to violet, so every straight
blend passes near neutral there, OKLab's included (0.040 at the raw midpoint).

**The dusk clip's pixels, in OKLab.** `after-walk-0.50.mp4` (H.264, 1280x800, 101 frames, f 0.500 to 0.508, about a
quarter of the 16.8 s blend) was decoded to RGB and, in every frame, each column in x 300-900 (clear of the HUD) was
scanned up from y 560 to the first three sky pixels (displayed OKLab L > 0.6, C < 0.15, not green-dominant); the six
pixels above that point are the sky where it meets the land, and their median is the frame's reading. All 101 frames
had at least 10 such columns. The band reads L 0.675-0.793 and chroma 0.005-0.047, median 0.017, against the display
model's L 0.82-0.83 and chroma 0.051-0.068 for the dome's horizon over the same fractions. Its hue goes from peach (h
37-42, frames 0-20) through near-neutral (C 0.009-0.018, frames 60-80) to lavender (h 290-300). So on screen the
horizon band does pass near neutral mid-clip, greyed by the fog and the distance haze, which the model's "never grey"
does not cover: that claim is about the dome colour. The clip predates the ground retune below, which changes no sky,
fog or exposure value. **Verdict: no evidence that another blend space would do better (any straight orange-to-violet
blend passes near neutral), so the blend stays linear; whether the grey band reads as mud is a look judgement for
the lookbook.** The guard is `colour-script-gates`, "the blend between keys, against OKLab", both bounds one visible
step.

## The day length

The day is 480 s (`DAY_LENGTH_SECONDS`). From a fresh profile's own start, the first dusk falls at 240 s of play and
the first dawn at 480 s, or 540 s with the first minute in front. The golden blend lasts 16.8 s, up from 10.5 s. The
sun's shadow steps run at 1.51 renders a second (727 a cycle), down from about 2.4. Measured by
`tests/gates/day-length-gates.test.js` and `tests/gates/shadow-schedule-gates.test.js`, which print these figures.

## The eye-level lookbook, before and after

**How the frames were made.** W1-D's lookbook (`frontend/scripts/visual/lookbook.mjs`) was run on two local production
builds: "before" is main at `030ada1f` (index chunk `index-DuGj5xO_.js`), and "after" is this lane at `340b47fa`
(`index-CmjXxhOu.js`; the commits after it change no game code). Both runs used `--sets eye,clips --cycles
0.02,0.25,0.48,0.5,0.75` on an M3 Max: `chromium-1280x800` (ANGLE Metal; eye frames and walking clips) and
`webkit-820x1180` (iPad portrait, touch). The after run went 15:10Z to 15:13Z and the before run 15:22Z to 15:25Z. Each
started at a one-minute load of 23 to 28, and the load read 26 to 30 when it ended. Every frame and clip was valid:
15/15 eye frames per target and 5/5 clips. Both runs checked that the port served the build they named
(`998c7de2`). Two earlier runs did not have that check, and they shot whatever build held the shared port 4238, so
they are discarded. `before-lookbook.json` and `after-lookbook.json` hold every reading. The local scratch paths in
them are replaced with `<out>`.

**The sheets.** Each sheet has two rows: before on top, after below. The columns are dawn 0.02, noon 0.25, golden hour
0.48, the sunset-to-dusk blend 0.50, and midnight 0.75. The sheets are `chromium-1280x800-eye-000.jpg`, `-120.jpg` and
`-240.jpg` (the three bearings from the Hearth), and `webkit-820x1180-eye-120.jpg`. The dusk clips are
`before-walk-0.50.mp4` and `after-walk-0.50.mp4`: W held for 4 s due south from the Hearth, starting at 0.50.

**What the frames show, opened by eye:**
- **Before.** Dawn, noon and golden hour are the same saturated blue daylight. At 0.50 and 0.75 the land is a
  near-black silhouette under a navy sky with an orange horizon band.
- **After, dawn and golden hour.** The horizon is warm (peach), and the light is softer than noon's.
- **After, noon.** The sky is blue and the ground near neutral.
- **After, 0.50.** The sky is lavender, and the land is dim but readable.
- **After, midnight.** The sky is blue-violet with stars, the grass and trees read under the moon key, there is no
  orange band, and fireflies are out.
- **After, every time.** By day no motes sit on the lens.

Sky patch, the top centre of `eye-120`, median sRGB (Chromium; WebKit agrees within about 10/255):

| Time | Before | After |
|---|---|---|
| 0.02 | (149, 193, 245) | (199, 219, 237) |
| 0.25 | (106, 173, 245) | (138, 184, 239) |
| 0.48 | (62, 154, 244) | (148, 186, 228) |
| 0.50 | (4, 51, 98) | (111, 142, 200) |
| 0.75 | (1, 48, 95) | (12, 33, 87) |

**The iPad portrait ground.** The gravel path in front of the Hearth (WebKit 820x1180, `eye-120`, device pixels
450-750 x 1650-1850, median, displayed OKLCH):

| Time | Before | After |
|---|---|---|
| 0.02 | L 0.285 C 0.084 h 265 (navy) | L 0.233 C 0.055 h 33 |
| 0.25 | L 0.415 C 0.045 h 281 (blue-grey) | L 0.406 C 0.026 h 44 (warm grey) |
| 0.48 | L 0.281 C 0.086 h 264 (navy) | L 0.236 C 0.059 h 36 |
| 0.50 | L 0.159 C 0.064 h 20 (near black) | L 0.202 C 0.053 h 3 |
| 0.75 | L 0.162 C 0.065 h 20 (near black) | L 0.285 C 0.039 h 317 (moonlit violet-grey) |

The navy is gone, and midnight is readable at L 0.285 against 0.162 before. **Not met:** at dawn and golden hour this
patch reads dark warm brown (L 0.23, hue 33-36), not grey. The patch is beside the Hearth, and with the low sun the
fire's orange light outweighs the key light on it. The reading does not separate the fire from the script. A patch
away from any fire is the next reading to take before the golden-hour keys are tuned.

**Not covered.** The hero shots and the production URL wait for the deploy.

## The ground retune (after the lane's review, 2026-10-28)

The review found the dawn and golden-hour ground darker than at midnight and than on main, and the iPad pad maroon at
0.50 (DECISIONS 2026-10-28 item 21 (d)). The keys were retuned twice; the second retune is the one committed.

**The model** (`tests/gates/_lightModel.js`, render/mood.js `sampleMood` at mood 0: the grey card's key-lit up face,
displayed OKLCH, no fire):

| f | main `030ada1f` | lane before the retune | after |
|---|---|---|---|
| 0.02 | L 0.374 C 0.098 h 247 | L 0.225 C 0.021 h 21 | L 0.418 C 0.029 h 78 |
| 0.25 | L 0.484 C 0.055 h 259 | L 0.491 C 0.016 h 70 | L 0.491 C 0.016 h 70 |
| 0.48 | L 0.374 C 0.098 h 247 | L 0.225 C 0.025 h 25 | L 0.415 C 0.035 h 79 |
| 0.50 | L 0.146 C 0.031 h 240 | L 0.197 C 0.028 h 281 | L 0.381 C 0.002 h 22 |
| 0.75 | L 0.146 C 0.031 h 240 | L 0.337 C 0.036 h 268 | L 0.337 C 0.036 h 268 |

**The pad by the fire, explained.** With the brazier's own light (`HEARTH_FIRE`) at 1 m and one grey albedo (sRGB 112,
the stone texture's), the model reproduces the five iPad pad readings above, taken under the previous keys, within L
0.007, so the warm brown at dawn and golden hour and the maroon at 0.50 were the fire on a dim, violet light. The
model's hue runs 10-20 deg less red than the screen's at that patch.

**The reshoot.** `lookbook.mjs --sets eye --cycles 0.02,0.48,0.5,0.75` on `chromium-1280x800`, `webkit-820x1180` and
`webkit-1180x820`, 16:29Z to 16:31Z, one-minute load 25.4 at the start and 7.9 at the end, port-checked, 12/12 eye
frames valid per target. The build is this lane's with the final keys (index chunk `index-FCdFRD2x.js`); the run
record is `retune-lookbook.json`, and the sheets are `retune-<target>-eye.jpg`: bearing 120 (toward the brazier) on
top, 240 (away) below, columns 0.02, 0.48, 0.50, 0.75. The clock stood at 0.022-0.024, 0.484, 0.502 and 0.752 when
the frames were taken, and the model column is computed there.

Two patches per target, at the same screen position in both bearings: "by the fire" in bearing 120 is the gravel
pad in front of the brazier (WebKit 820x1180 device pixels 450-750 x 1650-1850, the patch the first lookbook read;
WebKit 1180x820 900-1240 x 1220-1400; Chromium 1000-1300 x 1120-1190), and "away" is the same pixels in bearing
240, the pad facing away from the brazier. Median displayed OKLCH; the model is the sRGB 112 stone's key-lit up face,
with the brazier at 1 m for "by the fire" and without it for "away", diffuse only.

| f | patch | Chromium 1280x800 | WebKit 820x1180 | WebKit 1180x820 | model |
|---|---|---|---|---|---|
| 0.02 | by the fire | L 0.332 C 0.037 h 47 | L 0.340 C 0.040 h 55 | L 0.351 C 0.046 h 52 | L 0.346-0.349 C 0.040-0.042 h 64-66 |
| 0.02 | away | L 0.568 C 0.080 h 68 | L 0.548 C 0.079 h 68 | L 0.499 C 0.068 h 68 | L 0.319-0.322 (no specular) |
| 0.48 | by the fire | L 0.338 C 0.042 h 56 | L 0.345 C 0.047 h 61 | L 0.356 C 0.053 h 58 | L 0.358 C 0.051 h 72 |
| 0.48 | away | L 0.297 C 0.023 h 82 | L 0.314 C 0.032 h 73 | L 0.314 C 0.031 h 74 | L 0.332 C 0.040 h 83 |
| 0.50 | by the fire | L 0.307 C 0.031 h 13 | L 0.296 C 0.026 h 11 | L 0.310 C 0.035 h 19 | L 0.305 C 0.021 h 30 |
| 0.50 | away | L 0.260 C 0.012 h 287 | L 0.260 C 0.011 h 293 | L 0.260 C 0.011 h 293 | L 0.274 C 0.005 h 290 |
| 0.75 | by the fire | L 0.296 C 0.040 h 321 | L 0.286 C 0.037 h 313 | L 0.299 C 0.039 h 331 | L 0.280 C 0.029 h 309 |
| 0.75 | away | L 0.263 C 0.041 h 268 | L 0.260 C 0.041 h 268 | L 0.260 C 0.040 h 268 | L 0.261 C 0.036 h 266 |

What it shows:
- **Dawn and golden hour read.** By the fire the iPad pad is L 0.340 at 0.02 and 0.345 at 0.48, against 0.233 and
  0.236 before the retune, main's 0.285 and 0.281, and its own 0.286 at midnight. Away from the fire, golden hour is
  L 0.297-0.314 against 0.260-0.263 at midnight.
- **No maroon at 0.50.** By the fire the pad is a warm grey, chroma 0.026-0.035 at hue 11-19, under the 0.04 the
  maroon rule needs, on all three targets. The first retune (lavender twilight light, redder golden greys; shot
  16:20Z to 16:23Z, build `index-BR0XezZO.js`, not kept) read 0.034-0.043 there and crossed the rule on WebKit
  1180x820 (L 0.303 C 0.043 h 16), which is why the committed colours differ.
- **The horizon crossing equals midnight away from the fire.** At 0.50 the away patch is L 0.260 on all three
  targets, against 0.260-0.263 at midnight; the model puts it 0.013 above. G1 holds this in the model only.
- **The model's limits at this patch.** It runs 10-20 deg less red than the screen by the fire, and it holds no
  specular, which is why the away patch facing the low sun at 0.02 reads L 0.50-0.57 against a diffuse 0.32.
- By eye (`retune-webkit-820x1180-eye.jpg`): dawn and golden hour warm with a gold ground, the 0.50 ground a neutral
  grey under the lavender sky, midnight blue with fireflies.

A local run bound port 4238 twice (16:20Z, 16:29Z); both servers exited with their runs and the port is free. Whether
a browser tab was left cannot be seen from here.

