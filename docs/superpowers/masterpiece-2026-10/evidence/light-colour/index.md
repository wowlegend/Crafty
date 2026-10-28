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

**Not shot yet.** The run that should go here is W1-D's lookbook against two production builds: "before" is main at
`030ada1f`, and "after" is this lane at `340b47fa`. Both use `--sets eye,clips --cycles 0.02,0.25,0.48,0.5,0.75` (dawn,
noon, golden hour, the sunset-to-dusk blend, and midnight) on `chromium-1280x800` (eye frames and walking clips) and
`webkit-820x1180` (the iPad portrait stone). The session's rule is not to drive a real-GPU browser while the one-minute
load is above 28. From 14:29Z to 14:48Z the machine read 39 to 309 (14 cores, up to 148 runnable), so the run was
held back. It is owed before this lane is called accepted.
