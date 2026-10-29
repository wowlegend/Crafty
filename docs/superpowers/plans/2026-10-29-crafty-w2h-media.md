# W2-H: one media pipeline (task script)

**Lane:** W2-H of `docs/superpowers/plans/2026-10-28-crafty-sota-reset.md` (plan row 17; section 6, "README" and
"Social preview and og card"; W2-B's note that `tests/visual/baseline/menu.png` stays only until this lane replaces the
og source). **Branch:** `feat/w2h-media`, cut from main `3e138271`. **Decisions:** DECISIONS 2026-10-29, items from 50.

## Goal

Every image that represents Crafty outside the game (the README hero, the og card a shared link shows, the GitHub
social preview, release stills) is a real frame of today's production build on a real GPU, written by one declared
pipeline, stamped with the commit and the renderer, inside a byte budget, and checked on every CI run against the files
that actually ship.

**Metric (written before any frame is shot):**
1. `docs/media/media.json` lists exactly the files under `docs/media/` plus `frontend/public/og-image.png`: every file
   listed, every listed file present, each entry's bytes, width and height equal to the file's own, each within its
   budget, its commit a full sha from a clean tree, its renderer a hardware one (`_lookbook.mjs classifyRenderer`).
2. Every declared shot that is not optional has its file; the GitHub social preview is 1280x640; the og card is
   1200x630 and the og tags state its true size.
3. A person opened every frame before it was committed, and none is dark, blank, all sky or mid-load.

**PASS-but-wrong samples the gate must refuse:** a stray still left from an earlier table; a re-encoded file whose
manifest still names the old bytes; a frame shot on SwiftShader; a manifest entry whose file was deleted; a width and
height transposed in the manifest; a table that declares more bytes than the folder budget.
**FAIL-but-right sample it must accept:** an optional shot (the fight) the night did not stage, absent from both the
manifest and the disk.

## What a visitor sees when this lands

The README opens on a golden-hour frame at the Hearth, at the player's own eye with the warm hands, no HUD, linked to
the live game. A shared link to the site shows a golden-hour frame with the Crafty wordmark instead of the old title
screen. `docs/media/social-preview.jpg` waits for Kevin's one upload in the repository settings (no API exists).

## The shot table (declared in `frontend/scripts/visual/_media.mjs`, shot in this order)

| name | purpose | time (cycle) | recipe | size | format, target bytes |
|---|---|---|---|---|---|
| hero | hero | golden hour 0.48 | eye at the Hearth, bearing 240 (Old Pike's tower over the meadow, into the low sun), pitch +3 | 1600x900 | jpg 330 KB |
| og | og | golden hour 0.48 | the hero recipe, composed into the og card (wordmark in Lilita One, gold on ink) | 1200x630 | png 390 KB |
| golden-forest | still | golden hour 0.48 | eye at the Hearth, bearing 120 (the forest and the shrine beam) | 1600x1000 | jpg 250 KB |
| coast | still | golden hour 0.48 | pose: the lookbook's coast place | 1600x1000 | jpg 250 KB |
| forest-edge | still | afternoon 0.30 | pose: the lookbook's forest-edge place (turf, trunks, leaves: the material grammar) | 1600x1000 | jpg 250 KB |
| snow-terrace | still | golden hour 0.48 | pose: the lookbook's snow-terrace place | 1600x1000 | jpg 250 KB |
| social-preview | social | blue hour 0.55 | eye at the Hearth, bearing 0, pitch +2 (the outpost against the dusk sky) | 1280x640 | jpg 300 KB |
| blue-hour | still | blue hour 0.55 | eye at the Hearth, bearing 120 | 1600x1000 | jpg 250 KB |
| night-fight | still, optional | blue hour 0.55 | eye at the Hearth facing the nearest hostile 4-14 m out, a fireball cast with the real F key | 1600x1000 | jpg 250 KB |

Places reuse `LOOKBOOK_PLACES` (same ground on every build, seed 12345). Day shots go before the fight, because after
dusk the night's mobs crowd the Hearth (lookbook.mjs); the fight goes last for the same reason.

## Decisions this lane makes (each a DECISIONS item)

- **No HUD in any shot** (item 50). W2-D will re-key the HUD; a HUD-free frame outlives it, and a frame for people who
  have not played sells the world, not the readout. Hidden through the store's own `setHudHidden(true)`, the game's
  HUD switch, not by editing the DOM. The hands stay: they are the world, and W2-E made them the warmest thing in frame.
  So no re-shoot row for W2-D.
- **The encoder is ImageMagick, at shoot time only** (item 51): the browser shoots a lossless PNG master at device scale
  2, `magick` downsamples it (Lanczos) and encodes the JPEG to a byte target (`jpeg:extent`) and the og card to an
  8-bit palette PNG. No npm dependency; the gates read the committed files and need nothing installed.
- **The og card is composed** (item 52): the og frame under an ink scrim with the wordmark in the game's Lilita One,
  gold `#C9A86A`, and the brand title's subtitle, rendered in the same browser from `ogCardHtml` (pure). No buttons and
  no controls text (reset plan section 6).
- **make-og-image.mjs and menu.png are deleted** (item 53), once nothing reads them; the generator's crop tests go
  with it, and social-preview.test.js reads the new source (media.json's og entry).
- **The fight is optional** (item 54): the seam cannot spawn a mob; the shot waits for the night's own hostiles and
  is left out, named, when none comes within range.
- **The browser helpers the lookbook and this pipeline share move to `scripts/visual/_lookbookPage.mjs`** (item 55),
  so there is one way to launch a hardware Chromium, enter play and read the seam, not a second capture path.

## Steps (red first)

### 1. The pure half and its gate

- [ ] Write `frontend/tests/gates/media-plan-gates.test.js` against `_media.mjs` exports that do not exist yet: the
  table's shape (`shotTableProblems`), image size readers (`pngSize`, `jpegSize`, `imageSize`) on non-square fixtures,
  the manifest check (`mediaProblems`) on fixtures of every PASS-but-wrong sample above and the FAIL-but-right one,
  the per-shot verdict (`mediaShotVerdict`), and the card (`ogCardHtml`). Run it: RED (module missing).
- [ ] Write `_media.mjs` until it is green. No browser, no server, no file writes at import.
- [ ] Mutants (each RED, then restored from a `cp` backup): `jpegSize` swaps width and height; `mediaProblems` skips
  the unlisted-file check; it skips the hardware check; `shotTableProblems` drops the folder budget sum;
  `mediaShotVerdict` drops the HUD-hidden check. Identity mutant (reformat a line): GREEN.
- [ ] Commit `feat(media): the declared shot table and its pure checks` with the `Mutation-Proof:` trailer.

### 2. One set of browser helpers

- [ ] Move `freshRenderer`, `resolveChromium` (taking `launch` and `close`), `contextOptions`, `initScript`, `info`,
  `holdActive`, `restingBody`, `respawnIfDead` and `hudOn` from `lookbook.mjs` into `_lookbookPage.mjs`, unchanged in
  body; `lookbook.mjs` imports them. `npm run lint` (no-undef) and `node --check` on both files.
- [ ] Commit `refactor(lookbook): the page helpers move to _lookbookPage.mjs for the media pipeline`.

### 3. The driver

- [ ] `frontend/scripts/visual/media.mjs`: serve `build/` with `vite preview` (`_serve.mjs`, port registered as
  `media.mjs` in `PROBE_PORTS`), refuse a port serving another build (`servedBuildProblem`), refuse when `magick` is
  missing or no Chromium candidate gives a hardware renderer (exit 3, COULD NOT MEASURE), enter play through the seam,
  hide the HUD, shoot each shot in table order with its verdict, retry an invalid shot once, encode, write only valid
  frames, merge `media.json` (entries for shots no longer in the table are dropped; strays on disk are the gate's job).
  `--only a,b` re-shoots named shots. Refuses a dirty tree outside its own outputs.
- [ ] Commit `feat(media): media.mjs shoots the table on the production build`.

### 4. Shoot once

- [ ] `npm run build` from the committed tree. Then, under the GPU lock (`mkdir` the lane's `w2i/gpu.lock`, wait while
  it exists, `rmdir` in a finally), with the 1-minute load under 28 and outside 18:00-21:00Z:
  `node scripts/visual/media.mjs`. Kill the preview group and sweep `scripts/dev/kill-test-procs.sh` after.
- [ ] Open every frame. Re-shoot (`--only`) or drop any frame that is dark, blank, all sky or mid-load.

### 5. The file gates, the switch and the deletions

- [ ] `frontend/tests/scripts/media.test.js`: the committed `media.json` against the disk (`mediaProblems` with the real
  files), the denominator (declared shots minus absent optional ones), the README hero line (`docs/media/hero.jpg`,
  linked to the live game, alt text equal to the table's).
- [ ] `frontend/tests/scripts/social-preview.test.js`: the og tags against the file's true size (kept), the og card's
  source is media.json's `og` entry (new), the generator's crop tests and the menu.png check deleted.
- [ ] Mutants: delete a manifest entry; add a stray JPG in `docs/media/stills/`; change one entry's bytes; empty one
  renderer; set an og tag's width to 1201; change the README alt. Each RED; identity GREEN.
- [ ] Delete `frontend/scripts/visual/make-og-image.mjs` and `frontend/tests/visual/baseline/menu.png`; `BRAND.ogImageAlt`
  describes the new card and the head is regenerated (`node scripts/ci/public-face.mjs --write`); the README hero
  replaces its placeholder comment; `memory/ARCHITECTURE.md` and the probe-ports comment stop naming the deleted files.
- [ ] Commit `feat(media): the README hero, og card and social preview come from media.mjs` with the trailer.

### 6. Record and land

- [ ] DECISIONS items 50 onward; registry rows: the social-preview upload (owner Kevin), the live share-card check
  after the deploy, the fight if it was not staged, the Command Record's frames and release stills (not this lane).
- [ ] VERIFY from `frontend/`: `npm run lint`, `npm run test:unit` (background, deadline), `node scripts/ci/doc-currency.mjs`,
  `node scripts/ci/gate-shape.mjs`, `npm run build`, `node scripts/ci/bundle-budget.mjs`,
  `node scripts/ci/opsec-scan.mjs --all`, `npm run knip`.
- [ ] `git fetch`, `git merge origin/main` (trailer `Mutation-Proof: carried from the merged commits`), push, open the PR
  (body: what a visitor sees, the decisions, what is not proven, Kevin's upload), wait for `ci ok` on the exact head sha.
  Do not merge.

## What this lane will not prove

- How a frame reads on a phone, in Slack, X or Discord: their scrapers re-encode and crop, and nothing here runs them.
- That the live site serves the new card: only after a merge deploys it (registry row).
- The GitHub social preview: Kevin's upload, then `usesCustomOpenGraphImage: true` read back (registry row).
- WebKit or iPad frames: the media are shot in Chromium on ANGLE-Metal only.
