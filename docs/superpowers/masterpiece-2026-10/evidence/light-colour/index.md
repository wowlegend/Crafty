# The light and colour script, Wave 1 landing: evidence, 2026-10-28

This lane is `worktree-wf_34f35934-dfe-1`, and its plan is `docs/superpowers/plans/2026-10-27-crafty-light-colour-script.md`
(see "As built for the Wave 1 landing"). The SOTA reset accepts the look on W1-D's eye-level frames and dusk clip. It
also asks for an OKLab check of the blend and for a decision on the day length. The decisions are DECISIONS
2026-10-28 item 20.

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
which is the muddy direction. On screen (the dome's horizon, through the key's exposure, the grade and NEUTRAL), the
chroma bottoms at 0.051 at f 0.508 between the sunset and dusk keys, and at 0.058 between preDawn and sunrise. The
orange turns to violet, so every straight blend passes near neutral there, OKLab's included (0.040 at the raw
midpoint). **Verdict: no muddy midpoints, so the blend stays linear.** The guard is `colour-script-gates`, "the blend
between keys, against OKLab".

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

**Not covered.** `webkit-1180x820`, the hero shots, and the production URL all wait for the deploy.

