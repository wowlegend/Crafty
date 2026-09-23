# Overnight — 2026-09-22 → 23

The first thing to read in the morning. Newest at the top of each section. Every "shipped" row names its
commit and the CI conclusion observed for it (`in_progress` / `cancelled` = no signal yet, not a pass).

## Shipped

| Commit | What | CI |
|---|---|---|
| `a8c35ad2` `9c6dc852` | **The perfect dodge is live — the parry the baseline found missing, on your Shift.** Dodge in the last moments of a foe's lunge (the 380 ms coil-and-glow you can already read): its strike never lands, it staggers for 1.4 s — reeling back, swaying — and every hit on it deals 1.5x. The dodge is refunded so they chain; it lands with a heavy hitstop, ice-white sparks, a new bright "ting" and a PERFECT! banner (en/zh-CN). Proven through a real Shift press in the running game, with the control: the same press made early is an ordinary dodge and that strike DOES land. **See `evidence/perfect-dodge-windup.png` → `perfect-dodge-stagger.png`** (the glow drops, it reels). Not yet seen with my own eyes: the banner and the sparks (out of frame in that shot) | run in progress (pushed `9c6dc852`) |
| `a01b1982` | **Spells cast under a tree or a roof fly; loot dropped under a canopy lands on the ground.** Same root as the mob fix below: a spell burst 2 m from you under any canopy, and drops snapped up onto the leaves. Proving it in the game found a second bug the frame rate had hidden: a spell's collision was checked once per frame, so on a slow frame a fireball crossed 8 m unchecked — straight through a thin wall. Now checked every half metre | ✅ run for `a01b1982` |
| `8db8016a` `fa065432` | **Mobs walk under trees and roofs.** The mob ground probe read the TOP of each column, so under a tree canopy or a roof the "ground" was the canopy: since the wall fix (`232f0581`) a mob refused to walk under any tree, and a roof you built over a mob lifted it onto the roof (review #6 caught both). Mobs now stand on the floor of the air gap their feet are in. Proven twice: a Rapier world built from the real mesher's output with the real AI worker chasing under a roof and a canopy, and in the RUNNING game — a roof placed with the build verb over a spawned zombie (with the old snap it stood on the roof in 6 of 6 samples; now 0) | ✅ run 35819618808 (`fa065432`) |
| `06d3f190` | Perfect dodge, the core: the timing window, the stagger the AI honours, a strike already in flight dropped | ✅ run 35819618808 (`fa065432`) |
| `4ff5cd6b` `458de5db` | **Review #5 fixes** (8 findings, each reproduced by a failing test first): a knockback shove could carry a mob THROUGH a thin wall (now walked against the ground where it happens); trench corners wedged mobs; a mob refused at a wall walked in place; a build placed on a mob embedded it; an undismissed VICTORY followed you into another world; the world clock lost a hitstop that ended between frames; three literal chunk sizes left | ✅ run 35817017547 (`9063b8c7`) |
| `5b1cb802` | VICTORY is now an EVENT of the first dragon's death: it no longer reappears on every reload of a won game, and a return kill never announces the win again | ✅ run 35815906462 (`34ead1d3`) |
| `d8e8a5b0` | One chunk index for the streamer, block edits and the far-field mask; the far ring no longer computes normals its flat-shaded material never reads | ✅ run 35815906462 (`34ead1d3`) |
| `c72586cd` | **A paused WORLD clock.** A hitstop now HOLDS a mob's windup (and the brute's brace/charge) instead of letting it expire inside the freeze and strike the frame it ends; the dragon's attacks and its lava warning hold too, instead of bursting out right after your hit. Proven in the running game (new e2e case) | ✅ run 35815906462 (`34ead1d3`) |
| `43154097` | **Walls hold for every mover** (review #4): a mob already pressed against a wall planned from the wall top and never went around (one grid framing now); diagonal gaps no longer wedge mobs; wandering mobs, knockback shoves and the first aggro tick can no longer climb — the ground snap itself refuses | ✅ run 35815906462 (`34ead1d3`) |
| `0eb6f64d` | Operator pages current — era-review (v22) and sota-audit (v12) republished to their same URLs, LOOP-PROGRESS refreshed | ✅ run 35815906462 (`34ead1d3`) |
| `84f9efe2` `c0785955` `fafc562a` `07661878` | **Review #3 fixes** (`/code-review high` over `0398b7b7..33c75345`, 10 findings, all verified then fixed): the dragon kept ATTACKING through a hitstop that froze its flight; physics debris were wrongly counted as frozen; hub NPCs walked at a per-frame pace through every freeze; one freeze answer per frame now; the far field's hole-punch lagged what was drawn (and could not see a far chunk after a teleport); VICTORY could be stranded by a failing kill step; a corrupt kill night saved as night 0; dead Gerstner code deleted; the GPU-ocean plan doc written, labelled retrospective | ✅ run 35815906462 (`34ead1d3`) |
| `232f0581` | **Mobs no longer walk up walls.** The AI moved mobs with no height check and the ground snap lifted them onto any wall they reached, so a wall you built stopped nothing. Now they route around, slide along, or wait at it; spiders still climb. Reproduced through the real worker first (a zombie walked up a 3-high wall onto the player) | ✅ run 35815906462 (`34ead1d3`) |
| `de175e6e` | The far horizon takes the boss-fight grade and the cloud shadows (one shared grade — measured: in the boss sky the fog swallows the far ring, so the visible effect there is ~nil); far swamps wear their trees; a re-centre refills one set of buffers | ✅ run 35815906462 (`34ead1d3`) |
| `bb9f170c` | **The hitstop freeze reaches EVERY world system.** It used to reach only the mobs, the AI clock and the boss (each edited to opt in); allies kept swinging, spells and enemy bolts kept flying (a bolt could land on you inside your own hit's freeze), debris, orbs and loot drifted, zones ticked. Now one function decides, and a census fails any frame loop that reads its raw delta — 15 loops: 12 freeze, 3 run on real time on purpose (your controller, the sky, the weather). Proven in the running game: a kill's XP orbs hang through the freeze, then move | ✅ run 35811371926 (`33c75345`) |
| `674a54eb` | A returning dragon's entrance names its tier; a corrupted save's kill night no longer wakes it at once | ✅ run 35815906462 (`34ead1d3`) |
| `1c0dde0b` | **The far horizon steps aside for real terrain.** Review #2 found its fixed 2 m sink wrong three ways (far water floating over a loaded seabed, canopy poking through chunks, triangles over gullies). Now it discards itself over every chunk on screen and sits at the true surface: distant ridges stand at their real height behind the tree line. Capture A/B opened: UI 0.000%, only the horizon band moved, no holes | ✅ run 35815906462 (`34ead1d3`) |
| `9860eaa9` | **The ocean's waves run on the GPU.** The CPU used to displace ~9,400 vertices and re-upload three buffers every frame (~14% of the frame budget by its own comment). The shader is GENERATED from the same wave table the physics reads, and a gate interprets the generated text against the JS surface at sample points, so they cannot drift | run 35809277093 in progress (pushed with `7ba29a83`) |
| `aad73f24` | Review #2 fixes for C3: a reload mid-return-fight refilled the dragon (reproduced: 1050 HP instead of 200); the VICTORY overlay re-fired on a return kill after a reload; autosave missed the tier | ✅ run 35807841045 (`a77af81e`) |
| `add563ff` | Hitting the BOSS lands with weight too — its melee and spell hits freeze the world, the dragon included | ✅ run 35807841045 (`a77af81e`) |
| `1eba517f` + `6e7591cb` | **C3 — the Shadow Dragon returns.** After the first kill (still THE win), it wakes again at the lair once you have survived 3 more nights AND gained 4 more levels — announced once, a tier stronger (health ×1.5, damage ×1.2, capped speed, double XP, more scales; the crown only the first time). Survives save/load; old won saves become "one kill, return in 3 nights". Driven through the real hook | ✅ run 35806632575 (`0398b7b7`) |
| `ba8c3ebf` | **The far horizon.** Land and sea now continue past the loaded chunks to 420 m, from the same surface formula, coloured like the near terrain and hazed by the same lines — distant ridgelines and headlands instead of fog over sky. Side-effect measured, not hidden: on med/high tiers the ground just under the horizon is up to ~8 levels darker because bright sky no longer blooms over it. **Review #2 found its fixed 2 m sink wrong three ways (R3.4–R3.6); the hole-punch that replaces it is in flight below** | ✅ run 35805582391 |
| `813428ac` + `0de44886` | **Clouds, and their shadows on the ground, from one field.** Bright by day, a dim shape at night, dark in the boss sky; shadows dim only the SUN's light (valleys stay readable), fade with a low sun, and vanish where the sky has no cloud | ✅ run 35805582391 (`ba8c3ebf`) |
| `91dcabc6` `7482cfdc` `3ef77fa5` | Review #1 fixes: brute's charge dropped on cover-seek; e2e-freshness treats a running base as unknown and a timeout as red; the sweep sees through `npm`/`sh -c` wrappers | ✅ run 35805582391 (`ba8c3ebf`) |
| `9e8efbf2` + `927b2191` | CI went red on `8202ec59` — knip (CI-only) read `pgrep`/`pkill` as missing dependencies; and e2e-freshness then blocked the fix because it read the whole red run instead of the e2e jobs. Both fixed | ✅ run 35803592408 |
| `20d51bdd` | **The test-process sweep kills leaks, not live runs.** It decided "leaked" by AGE (>3 min) and killed one of my own captures 15 minutes in. Now it decides by OWNERSHIP (is the process tree still rooted in a live runner?) and names the runner it left alone. Chrome's crashpad handlers sit at PPID 1 while alive, which I found by reading a live capture's process table after the tests were green; they are held while any browser is owned | ❌ run 35801779905 (knip only, see above) → ✅ 35803592408 |
| `6a33a101` | **Distant-terrain mipmaps, built and proven, NOT turned on** — see *Blocked on you*. What ships: the terrain sampler reads raw `vUv` (identical without mips, required with them) | ❌ 35801779905 (knip only) → ✅ 35803592408 |
| `68900749` | **EXTERNAL-BASELINE #3 — hitstop holds the WORLD.** A heavy hit now freezes the mob you hit, the AI clock and the mob animation, not just you; a burst of hits is capped (180 ms) so it never reads as lag; the knockback shove waits for the freeze and lands after it. Proven in the running game by a new e2e (`tests/e2e/world-hitstop.spec.js`) | ❌ 35801779905 (knip only) → ✅ 35803592408 |
| `c06b4ee1` | Docs: operator pages current (republished), R1 closed, this log, the baseline-tranche plan | ✅ CI success (run 35796538484) |
| `f4515dd9` | **R1.5 + R1.6** — the biome tint stops colouring stone, wood and ores (a green cast on every plaza and cliff in forest/jungle columns); the shader's tint array is sized from the biome table. Same-renderer A/B: stone and trunks moved, grass/leaves untouched, UI 0.00%. **See `evidence/tint-mask-ab-hearth.png`** (left old, right new) and `tint-mask-heat-hearth.png` (where it changed) | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `1be94a5c` | **R1.1 + EXTERNAL-BASELINE #1** — voxel AO no longer smears across merged faces; biome tint no longer read outside the quad. Same-renderer A/B: UI frames 0.000% (noise floor zero), terrain frames changed exactly where the smears were. **See `evidence/mesher-ao-ab-biome-snow.png` and `-hearth.png`** (left old, right new) | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `fa368b3c` | **R1.10** — ground and grass read one biome tint table | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `09f38107` | **R1.7 + R1.9** — gate-census resolves imports instead of text-matching them | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `ae96ff92` | **R1.4 + R1.8** — respec now ENDS what refunded talents granted (beast form, held grab, armed imbue; the squad cap is an every-tick invariant, so a Pack-Bond third ally departs); respec takes two presses | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `7bbe737e` | **pre-push hole** — a receipt-matched push skipped queue-ledger / artifact-currency / e2e-freshness entirely while the hook's comment said they ran. Now `pipeline.sh --tier=push --range-only` | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `57c4cd93` | **R1.2** — the brute's shoulder charge is a latched state machine (brace → charge → winded recovery = the punish window). One round-trip list for worker state, which also closed a dropped `wanderRoll`. Gate drives the REAL worker across ticks | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `94c63b8c` | **G1** — gate-shape now reads all four assertion forms and a path shape it used to skip silently: 387 → 547 assertions checked, 0 comment-satisfied | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `dbec53d7` | **R1.3** — the green-tree receipt is refused unless the tested working tree IS the index | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `27d42f95` | External SOTA baseline — `EXTERNAL-BASELINE.md`; four in-tree claims re-verified | ✅ CI success (run 35796538484, `c06b4ee1`) |

**Why nothing was pushed earlier:** the first push attempt was refused by `artifact-currency` — the three
operator pages (era-review, sota-audit, LOOP-PROGRESS) were 74 commits stale, unnoticed because of the
pre-push hole above. All three are refreshed (every new claim adversarially verified) and the two published
ones republished to their same URLs: sota-audit v11, era-review v21.

## In flight

- **CI went RED on `9c6dc852`** (run 35822535594): the perfect-dodge e2e, flaky three different ways, all in the SPEC
  (the game was right). Fixed in `962b69bd` — the main cause: the game's world clock is computed once per frame, so a
  reading taken between frames is up to a frame old, and at a loaded runner's frame rate that is longer than the whole
  220 ms window the spec was aiming a key press at. The push gate then refused to push onto a red base without a full
  local e2e run: **42/42 green (43 min)**, receipt recorded; pushing now.
- **Review #7 → QUEUE R8**, all eleven verified then fixed (`d729e2c0`, `a53aaae1`) except R8.8's leg-IK cost, which is
  unmeasured.
- **Parked, tested, not yet in main:** R7.4–R7.8 (a knockback shove is a fixed distance — a spider's leap was 6 m on a
  slow frame; one wall-walk with a slide; a brute that charges into a wall is winded; a wanderer turns away) and the
  **lazy panels** (every on-demand panel leaves the boot bundle for one prefetched chunk — the budget room the next
  features need). WIP `45590d2c`, branch `wip/r7-lazy-panels`, worktree `mip-ab`; next up.
- **Round two of the external baseline** (`EXTERNAL-BASELINE-R2.md`): round one's top five are done or yours. The new
  top five, each re-checked in the source: a **hold-to-charge heavy melee** (three genre leaders shipped one this year;
  spec written), glowing ore texels, leaf translucency + sway, storm lightning, and a **lantern + baked block light**.

- Review #6 (`/code-review high` over `34ead1d3..9063b8c7`) → QUEUE R7. R7.1 (HIGH, a regression of my own
  R6.4) and R7.9 FIXED; R7.9b (a mob can SPAWN on a canopy) open. R7.2–R7.8 queued (chunk-size literals, one voxel-index helper, knockback scaled by frame
  time, one wall-walk implementation, per-sub-step ray cost, A* vs mover corner rule, a refused wanderer
  re-picking the same wall). R7.9 new: spells, XP orbs, loot and spawns still read the column top — a spell cast
  under a tree may burst on launch; verifying in the game before fixing.
- **Budget note:** the `index` bundle chunk is at 740.9 of 742.2 KB after the perfect dodge — 1.3 KB of room.
  The next feature that lands in the main chunk will hit the byte budget; raising that ceiling is a decision
  about load time I will make only with a measured reason, not to fit a feature.

## Corrections to things I told you

- **My wall fix (`232f0581`) stopped mobs walking under trees, and my R6.4 fix lifted a mob onto any roof built
  over it** (review #6). Both came from the ground probe reading the column top; neither was caught by my gates,
  which modelled the world as a heightmap — no overhangs. Fixed at the probe (`8db8016a`).

- **R4.5's VICTORY fix was itself wrong** (review #4): it derived the screen from saved state, so a won game
  showed VICTORY on every reload. Replaced by an event (`5b1cb802`).
- **P1's first version held walls only for mobs already chasing** (review #4): wanderers, knockback and a mob
  already at the wall face still got over. Fixed at the one place every mover passes, the ground snap.

- **The GPU-ocean change (`9860eaa9`) was built without its plan doc** — the one shortcut CLAUDE.md forbids.
  Review #3 caught it; the doc now exists, labelled retrospective rather than presented as having come first.
- **EXTERNAL-BASELINE's "mobs stick on walls > 4 blocks" was wrong in the other direction**: they did not
  stick, they walked UP them (fixed, `232f0581`).

- `EXTERNAL-BASELINE.md` said Crafty has "no dodge, parry or i-frames". **False** — a dodge with a 0.2 s
  i-frame window exists and gates damage. I had re-verified four of the report's claims and not that one;
  it would have sent me building a duplicate verb. Corrected in the doc; recommendation #3 narrowed to world
  hitstop.

## Visual changes waiting on YOUR re-baseline

The 31-image oracle is still the Chromium-147 set (re-baseline is yours). Every intended look change since
then will diff against it: the AO merge fix (shipped), the tint mask, mipmaps and clouds (in flight). Each
has its own same-renderer A/B so you can judge them one at a time.

## Blocked on you

| Item | Why it is yours |
|---|---|
| 147→151 visual re-baseline | rewrites the 31-image oracle |
| three 0.172 → 0.186 + `SunLight` CSM | dependency bump (EXTERNAL-BASELINE #4); will be prepared, not merged |
| dprCap 2 → 1.75 · FPV glove value | your standing calls |
| vitest 3 → 4 (dev only) | Two open medium Dependabot alerts (#60 `@vitest/mocker`, #62 `vitest` — a path traversal in the TEST runner's mocker), both patched in 4.1.11; installed is 3.2.7. Nothing ships to players. A major bump of the whole test toolchain — yours to schedule. (Corrected: this row said "4 → 5, 3 advisories", read off `npm audit`'s latest-version fix and its three package entries; the page refresh caught it against the live alerts) |
| **Distant-terrain mipmaps (one constant)** | "no mipmaps" is part of the bold-flat LOCK, recorded as your taste call. Built and proven; flip `const TERRAIN_MIPMAPS = false` in `world/proceduralTextures.js` to `true` (and update the lock test). Same-renderer A/B is in KEVIN-REVIEW-BATCH (evidence `mipmaps-ab-*.png`): far faces go from crawling speckle to flat colour, crisp up close, no seams. My read: it looks MORE bold-flat, not less |

## Next, in order

1. Review #7's findings (QUEUE R8), verified then fixed.
2. R7.9b, R7.2–R7.8.
3. See the PERFECT! banner and the sparks in a frame (a probe that frames the zombie from further back).
4. R4.2b (pause Rapier through a freeze), I3 (mipmap motion probe for your lock decision), G2, I1, I2, then the
   next EXTERNAL-BASELINE gap.
