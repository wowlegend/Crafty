# Terrain mipmaps at eye level, 2026-10-28

Lane W1-E, plan item #10 (`docs/superpowers/plans/2026-10-28-crafty-sota-reset.md`): the block texture array gets a
mip chain, built in linear light (DECISIONS 2026-10-28 item 20). These frames show what it changes at the player's
eye. All of them come from the production build on a real GPU ("ANGLE Metal Renderer: Apple M3 Max"), at the
lookbook's `chromium-1280x800` target (the game ran at device pixel ratio 1.75, canvas 2240x1400, tier high), at the
Hearth, at time 0.30 (afternoon). The 1-minute load average was under 28 when each run started.

## Two instruments

**The same-page A/B, the controlled one.** One page of this lane's build. Between shots, the block texture's minify
filter is switched on the GPU between NEAREST, which samples only level 0 (byte-identical to the old build's
texture, checked below), and NEAREST_MIPMAP_LINEAR, which ships. Pose, loaded chunks, time of day and build are the
same, so the only difference is the mip chain. Each filter is shot twice, 250 ms apart: that spread is the noise
floor (leaf sway, clouds, mobs, ambient occlusion). It ran as a throwaway Playwright script on the lookbook seam
(`?lookbook=1`: play, stand, look, setCycle, clearHostiles), with an init script that records every TEXTURE_2D_ARRAY
the page binds; the block texture is the one with 6 immutable levels. It is not committed, because it changes GL
state behind three's back.

**The lookbook,** `node scripts/visual/lookbook.mjs --targets chromium-1280x800 --sets eye,clips --build-dir <dir>`,
against a build of main `030ada1f` (before, `index-DuGj5xO_.js`) and a build of this lane (after,
`index-B1yLdAvU.js`), served locally. Two separate pages, so chunk streaming, mobs and time differ between the arms.
The clips come from this pair.

## Files

| File | What it shows |
|---|---|
| `crop-meadow-240-off-on.png` | Native pixels, mips off on the left, on at the right. The grass tops at a grazing angle in the meadow go from speckle to flat colour (high-frequency energy -54% over two shots each). The vertical grass faces keep their texture. The stone path in front keeps its texels with less fine noise (-17%): it is seen at a grazing angle too. |
| `crop-forest-120-off-on.png` | Mid-distance forest: the leaf speckle smooths out. The trunks and the nearest leaves are unchanged. |
| `crop-forest-120-off-nearest-trilinear.png` | Off, NEAREST_MIPMAP_LINEAR (ships), and LINEAR_MIPMAP_LINEAR, from one page. |
| `eye-120-0.30-{off,on}.png`, `eye-240-0.30-{off,on}.png` | Whole same-page frames, scaled down to CSS size (Lanczos). The downscale removes some of the speckle itself, so judge on the crops. |
| `walk-0.30-{before,after}.mp4` | The lookbook clips: W held for 4 s due south from the Hearth, on the old build and on this lane's build. |

## Numbers

**High-frequency energy** (mean luma step to the next pixel) over every 64 px tile that is not static UI, mips on
against off, from the same page. Two runs, each with its own noise floor:

| Bearing | Run 1: on vs off | Run 1 floor | Run 2: on vs off | Run 2 floor |
|---|---|---|---|---|
| 000 | -4.8% | 1.5% | -5.9% | 1.7% |
| 120 | -8.3% | 2.2% | -8.6% | 2.2% |
| 240 | -7.8% | 0.6% | -7.2% | 1.7% |

The change sits between the horizon and the mid ground: in run 1 the bands 40-80% down the frame fall 7-16%, while
the top fifth (mostly sky) moves by at most 1.0%. Over the centre of the frame (30-80% of the height,
x 700-1900), trilinear removes 12-16% where NEAREST_MIPMAP_LINEAR removes 8-13% (the two match at bearing 240). The extra is the softening of texel edges
where a texel is about one pixel wide, which is why the nearest-within-a-level filter ships.

**What is on the GPU.** A second throwaway probe read the bound texture arrays of the running page back through a
framebuffer. On this lane's build the block texture has 6 immutable levels, minify filter NEAREST_MIPMAP_LINEAR and
magnify filter NEAREST, and all 87,360 bytes of its 6 levels x 16 layers equal the chain the module builds in node
(0 mismatches). On the old build it has 1 level, NEAREST, and its 65,536 bytes equal this lane's level 0.

**Frame time.** Every walking clip held the game's 60 fps cap on both builds: 16.67 ms per frame pooled over 1,053
frames before, 16.64 ms over 1,315 frames after (wall-clock window divided by the composer's frame count, from
`lookbook.json`). The cap hides any difference under 16.7 ms. The timer-query reading for the scene pass moved from
4.03 to 4.19 ms on eye frames and from 3.45 to 3.56 ms on clips, inside the spread between two runs of the same build
(an earlier pair read 2.25 and 2.33 ms on eye frames). These readings are not established as GPU
time (`../eye-level/index.md`).

**Texture memory.** 65,536 bytes before, 87,360 bytes after (+21,824, +33%).

## What these do not show

- **The crawl in motion is not measured.** A frame-difference proxy over the clips did not separate from its sky
  control (same page: mid band -7.1%, sky -4.5%; across the two builds the mid band rose 3-8%). The screencast is
  1280x800 H.264 from a 2240x1400 canvas, which smooths the speckle away. Whether the crawl is gone is judged by eye,
  walking on the deployed sha.
- **One machine, one GPU, one pixel ratio.** At a pixel ratio of 1 the mip levels start at half the distance, so the
  change should be larger there; that was not shot. WebKit was not shot either.
- **Grazing ground is the remaining ceiling.** three r172 applies no anisotropy while the magnify filter is NEAREST,
  so grass tops at a grazing angle drop to the small mips sooner than they would with it; the on frames show faint
  bands across them.
