# W2-E hands viewmodel: before and after

The hands set of the lookbook (`frontend/scripts/visual/lookbook.mjs --sets hands`), on local production builds:
**before** is main at `c3a0a7cb`, **after** is this lane's tree at `891a050f`. Chromium on ANGLE-Metal (Apple M3 Max,
read from the context), 1280x800 CSS at device scale 2, and WebKit at the iPad portrait viewport (820x1180, touch;
WebKit masks its renderer as "Apple GPU"), shot 2026-10-29 between 03:04 and 03:16 UTC. One run at a time under the
machine-wide GPU lock, each started with the 1-minute load under 28 (8 to 24). `w2e-hands.json` holds every reading.

**How a hand pixel is found.** The player stands at the Hearth and faces bearing 240 at eye level. One frame with the
hands, then two through a lookbook pose at that exact eye and direction (a pose hides the hands). A hand pixel lies
below 55% of the frame height, differs from the first hidden frame by more than 24 in some 8-bit channel, and is
stable (the two hidden frames agree there within 12). Luma is Rec. 709 weights on the encoded values. The thresholds
were declared in `docs/superpowers/plans/2026-10-29-crafty-w2e-hands.md` before any frame was shot. The eye stood
1.2 m over the body's centre in the before build and 0.67 m in the after build (DECISIONS item 34), so the two
frames show different heights as well as different hands.

## Readings, Chromium 1280x800

| Time | Before: mean / median luma | Before: mean RGB | After: mean / median luma | After: mean RGB |
|---|---|---|---|---|
| 0.30 afternoon | 35.3 / 6 | 53 / 32 / 14 | 126.3 / 135 | 181 / 120 / 24 |
| 0.48 golden hour | 33.4 / 6 | 56 / 30 / 5 | 115.2 / 124 | 193 / 102 / 14 |
| 0.55 blue hour | 27.0 / 3 | 38 / 25 / 19 | 99.1 / 107 | 132 / 96 / 38 |
| **0.75 midnight** | **28.7 / 7** | 38 / 26 / 25 | **100.2 / 106** | 132 / 96 / 46 |

- **Value floor at midnight:** declared mean 48 and median 40; after reads 100.2 and 106. Met.
- **Warm:** declared red at least 1.3 times blue at every time; after reads 7.5, 13.8, 3.5 and 2.9. Met.
- The before mean sits well above its median because the mask also takes the orange aura sphere and the slabs'
  shadows; the median is the slabs themselves, near black.

## Point blank

The player is stood at the trunk sight (a tree trunk at least three blocks tall) and walks into it with a real W key
until the controller stops the body: 0.45 m from the face in both builds, no climb. Hand pixels at the trunk divided
by hand pixels from the sight's stand, 3.5 m back: **before 0.02** (8,907 pixels: the hands sank into the trunk, and
the set flags the frame as under its 1.5% denominator, which here is the defect itself), **after 1.14** (declared at
least 0.9). Met. Frames: `before-point-blank.jpg`, `after-point-blank.jpg`.

## The dark polygon (registry `REVIEW:w2k:dark-polygon-between-hands`)

`before-turf-wall.jpg` is the turf-wall sight W2-K's after frames were shot at: the flat dark shape between the
slabs, partly behind the XP card. `before-turf-wall-hands-hidden.jpg` is its pose twin, the same eye with the hands
hidden: the turf block's dirt face shows there instead, so the shape belongs to the hands. The held block is
elsewhere (the flat green box at the left of the left slab). The old hands cast shadows and stood in front of that
face; `after-turf-wall.jpg`, with hands that cast none, shows no polygon. DECISIONS item 35.

## Touch (iPad portrait, WebKit)

`ipad-portrait-0.30-before-after.jpg`: before, one near-black slab at the left edge (hand pixels left/right
267,270 / 100,787, the right side mostly the aura sphere); after, both gauntlets in frame (374,453 / 340,443), the
wand on the right and the held block on the left. After at midnight: mean 86.7, median 82. The touch joystick and the
action buttons draw over the gauntlets' lower parts; the controls stay on top. Not checked: a real iPad (macOS
WebKit is not iPadOS), landscape, and the hands in motion on touch.
