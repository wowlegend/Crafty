# Crafty vs the state of the art — round 2 (external baseline)

**Provenance.** Produced 2026-09-22 by a delegated read-only research agent against HEAD `962b69bd`. The Top 5's
gap claims were then re-checked against `frontend/src` by the session itself, one by one, before any was acted on
(2026-09-23): instant 300 ms melee with no hold; no leaf sway or translucency term; no emissive term in the terrain
shader; storms with a rumble and a mood but no flash; no light field.
Round one (`EXTERNAL-BASELINE.md`) ranked LOOKS rendering debt; its top 5 are shipped or owner-gated.
This round asks what the genre leaders now do that Crafty does not, **play and looks first**.
Every gap below was checked against `frontend/src` before being written down; the file checked sits in
the last column. Round one's "no dodge" error came from a grep that missed `game/dodge.js`, so absence
here was checked by several spellings (see §6 for the method and its limits).

**Search lanes: 4/6.** L4 Tavily ERRORED (plan usage limit, retried once); L5 Serper ERRORED (HTTP 400,
retried once). This is the same degradation recorded on 2026-09-17. L1 WebSearch, L2 Brave, L3 Exa and
L6 Parallel answered. Pages read in full: minecraft.wiki *Vibrant Visuals*, the HYTOPIA engine README
(`gh api`), Veloren `CHANGELOG.md` at tag `v0.18.0` (`gh api`). Every other citation is a search excerpt
from the named primary, and the authority tier is marked. Date seen for every URL: **2026-09-22**.

## 1. What the genre did since round one (dated, primary first)

| Title | What shipped | Source (tier) |
|---|---|---|
| **Hytale** (EA 2026-01-13) | Per-weapon movesets: charge, jumping and sprinting attacks; a meter that fills on hits and fires a weapon finisher; **stamina spent by blocking and sprinting**; skeleton swordsmen **block and parry**; trees **collapse** when the trunk is cut; placeable torches (U1); taming + mounts (U3); builder selections to 16 M blocks (U6); **Rune ability system** (U7 pre-release 2026-09-03); planned water+lightning elemental reactions | hytale.com/news/2026/1/hytale-patch-notes-update-1, …/2026/2/hytale-patch-notes-update-3, …/2026/9/2026-09-03-pre-release-patch-notes-update-7, …/2026/7/first-look-chapter-1-and-more (A2); ign.com/articles/hytale-review-early-access (A4); pcgamer.com …hytales-developer-warned-us… (A4); writersroomreviews 2026/02/04 (A5) |
| Hytale lighting | Flood-fill light, **RGB block light + skylight, 0-15 each**, per 32³ section | doctale.dev/plugin-development/world/lighting (A5), corroborated by U3/U6/U7 notes on "light color", per-block light, per-section lighting pass (A2) |
| **Enshrouded** (1.0 on 2026-10-15, PC+PS5) | U8 *Forging the Path* 2026-04-21: **hold-to-charge heavy attack, 2× damage and 2× stun-bar damage**; a "focus" meter fed by hits that unlocks a weapon special; **enemy awareness in stages** (suspicion → search → combat); pick-a-material-by-pointing in build mode. U7 2025-11-10: **dynamic voxel water**, swimming, **fishing** | enshrouded.com/en-US/news/enshrouded-forging-the-path-is-live (A2); enshrouded.com/en-US/news/enshrouded-10-release-date-reveal (A2); savingcontent.com 2025/11/10 (A5); gameinformer.com 2026/01/21 (A4, block/parry telegraphy patch) |
| **Minecraft** | Vibrant Visuals on Bedrock since 2025-06-17: **pixel-aligned shadows** (shadow texel size = texture texel size), **subsurface scattering on leaves**, emissive via MERS maps, SSR + IBL water, volumetric fog and shafts, cloud shadows. Java is switching OpenGL → Vulkan first (2026-02-18). *Mounts of Mayhem* 2025-12-09: the **spear**, jab plus a **charge attack whose damage scales with speed**, and a Lunge enchantment | minecraft.wiki/w/Vibrant_Visuals (A3, read in full); minecraft.net/en-us/article/minecraft-vibrant-visuals, …/another-step-towards-vibrant-visuals-for-java-edition (A2); minecraft.net/en-us/updates/mounts-of-mayhem-drop (A2) |
| **Vintage Story** 1.22.0 (2026-04-21; 1.22.7 on 2026-08-16) | Fishing; **rivulet river carver + flowing-water shader**; held/dynamic light range 60 → 120 blocks; **lightning flash lights the world** from further away. 1.23 is announced as a **combat** update: tighter hit detection, more varied attack animations | vintagestory.at/blog.html/news/1220-fishing-mechanisms-metalworking-and-more-r441 (A2); …/anego-studios-development-update-june-2026-r446 (A2) |
| **Veloren** 0.18.0 (2026-01-23) | Wall jump; a simple quest system; two-way NPC conversation; hireable NPCs; **directional lanterns**; **controller buttons rebindable in game**, a cyclable hotbar for controllers; fire gigas world boss | gitlab.com/veloren/veloren CHANGELOG.md @ v0.18.0 (A2, read via the GitHub mirror) |
| **Teardown** (multiplayer added) | Voxel ray-marched AO, soft shadows and specular occlusion, and **no GI**, by the creator's own account | 80.lv/articles/teardown-developer-breaks-down-multiplayer-and-voxel-destruction-tech 2026-03-17 (A4; single lane) |
| **HYTOPIA** (browser voxel platform; the closest stack to Crafty) | three.js `WebGLRenderer` + EffectComposer (SMAA, selective bloom, outline); greedy meshing with AO in a Web Worker; **glTF entities**; **keyboard/mouse/gamepad plus touch**; WebTransport with WebSocket fallback; block lighting via custom shader logic | github.com/hytopiagg/hytopia-source README (A2, read in full) |
| Web hobby engines 2026 | LostSpawns (WebGPU): flood-fill torch light, CSM, SSR water, fluid sim, lightning. buildingblock (three.js WebGPU/TSL): **19 block shapes** incl. slabs, ramps, wedges; P2P WebRTC co-building | github.com/LostBeard/LostSpawns, github.com/chh-ay/buildingblock (A5 own READMEs; single lane) |

**Convergence, and it is the finding.** Three independent leaders shipped a **held/charged heavy
attack beside the light one** inside twelve months: Hytale (EA 2026-01), Minecraft (the spear's charge
attack, 2025-12-09) and Enshrouded (U8, 2026-04-21). Two of them pair it with a guard: Hytale's costs
stamina, and Enshrouded's has a parry. Vintage Story named combat as its 1.23 focus but has not said how.
Crafty's melee is one instant cone check. On looks, the leaders light the night with **placeable light
sources**: Hytale torches (U1), Minecraft torches (block light, point lights under Vibrant Visuals),
Vintage Story placed and held lights, and Veloren lanterns. Hytale and Minecraft carry a voxel light
field, and HYTOPIA, the browser peer, does block lighting in its own shader logic. Crafty has neither. A `torch` item existed only as a recipe output that resolved to no block,
and it was deleted on 2026-08-09.

## 2. Gap table

Score = impact (1-5) ÷ (cost × risk). Cost S=1 · M=2 · L=3. Risk Low=1 · Med=1.5 · High=2.
"Crafty today" was read from the named file; absence was checked by the grep noted.

| # | Capability | Gap | LOOKS / PLAY impact | Cost | Risk | Score | Repo evidence |
|---|---|---|---|:-:|:-:|:-:|---|
| P1 | Heavy / charged melee | **Absent.** Melee is one instant cone test on a 300 ms cooldown, with no windup, string or charge | PLAY 4: every fight is click-spam. The heavy tier of the hitstop exists, and nothing the player does lands on it on purpose | S-M | Low | **2.7** | `Components.jsx:148,216-259` (`MELEE_COOLDOWN`, `triggerMeleeAttack`); `rg chargeAttack\|heavyAttack\|holdToCharge\|combo` → 0 |
| L3 | Leaf translucency + leaf sway | **Absent.** Only grass blades sway; leaf voxels are static and lit like stone | LOOKS 3: every forest, and with the sun arc now moving, every back-lit dawn and dusk | S | Low+ | **2.5** | `OptimizedGrassSystem.jsx` (grass wind only); `world/Terrain.jsx:129` has `vBlockType`, so a per-layer term has a seam |
| L2 | Emissive block texels (ores, crystals) | **Absent.** The terrain shader has no emissive term; the only glow is on separate meshes (shrine, landmark orbs) | LOOKS 2.5: nothing in the terrain glows at night or underground, so ores cannot act as wayfinding | S | Low | **2.5** | `world/Terrain.jsx` (no `emissive` inside the terrain shader; emissive only at `:405,:458,:484` on voxelKit meshes); `world/proceduralTextures.js` |
| L5 | Storm lightning | **Visual absent.** Storms darken the sky and play a synthesized thunder rumble; there is no flash and no bolt | LOOKS 2: storms already happen; the payoff beat is missing | S | Low | **2.0** | `render/WeatherSystem.jsx`, `game/weatherGate.js`, `audio/stormBed.js:2,28` (rumble only); `rg lightning render/` → 0 |
| L1 | **Voxel block light + placeable light** | **Absent.** No light field and no light block. The `torch` recipe output resolved to no block and was deleted 2026-08-09 ("real torches … are new block types, icons … a design unit") | LOOKS 5 + PLAY 4: the genre's night and cave look; lighting a base is the natural night-siege defence verb | M | Med | **1.7** | `rg blockLight\|lightLevel\|skyLight` → 0; `data/recipes.js:104-114`; `world/blockIds.js` (15 cube ids, none emissive). The only lights that follow the player are transient: the spell hand while casting (`render/playerRender.jsx:503`) and the voidhand's held phantom block (`world/PhantomBlockSystem.jsx:72`) |
| L4 | Pixel-aligned shadows | Absent. Stock PCF lookup; the only terrain shadow edit is the cloud term | LOOKS 3: the Vibrant Visuals signature; every sunlit edge | S-M | Med | 1.5 | `world/Terrain.jsx:116,189` (cloud shadow only), `MeshStandardMaterial` `:47` — **taste call, §4** |
| P7 | Crafting draws from nearby chests | Absent | PLAY 1.5: QoL; removes chest-shuttling | S | Low | 1.5 | `rg nearbyChest\|pullFromChest` → only `checkNearbyChest` (open UI) `store/useGameStore.jsx:432` |
| P6 | Controller (gamepad) + rebinding | **Absent** | PLAY 2.5: reach (handhelds, TV browsers); HYTOPIA and Veloren both ship it | M | Low | 1.25 | `rg getGamepads\|gamepad` → 0; `rg rebind\|keyBindings` → 0 (rebinding is already queued as Q26) |
| P5 | Tree felling | Absent: cutting the trunk leaves a floating canopy | PLAY 3: chopping is among a new player's first acts; two reviewers singled out Hytale's collapse | M | Med− | 1.15 | `rg fell\|collapse\|topple\|chop` → 0 hits in the world or game code |
| P3 | Enemies that guard, and staged awareness | Absent: aggro is a distance test; no mob blocks; no suspicious → alert stage | PLAY 3: approach choices, stealth openers; gives P1 a target | M | Med− | 1.15 | `game/mobSenses.js` (distance + vertical reach only); `rg suspicio\|awareness\|lastSeen` → 0; `workers/ai.worker.js` (no guard state) |
| P2 | Guard + stamina | Absent. Shields are an armour number with no block action | PLAY 3: a defensive verb other than the dodge | M | Med | 1.0 | `store/useGameStore.jsx:37-40`; `rg stamina\|isBlocking` → 0 |
| P9 | Fishing | Absent | PLAY 2: the downtime loop two peers added this year | M | Low | 1.0 | `rg fishing` → 0 |
| P10 | Wall-jump / 2-block mantle | Partial: autostep 1.05 m, coyote time and jump buffer exist | PLAY 1.5 | S-M | Low | 1.0 | `Components.jsx:119` (`enableAutostep(1.05…)`); `game/gameFeel.js:10` |
| P4 | Weapon classes with movesets | Absent: weapons differ only in a damage number | PLAY 4 | L | Med | 0.9 | `game/equipment.js` (`SLOT_ITEMS`: swords + pickaxe; `WEAPON_BASE_DAMAGE`) |
| P8 | Mounts / taming | Absent (beast *forms* and soulbound allies exist; nothing is ridden) | PLAY 3 | L | Med | 0.7 | `rg isRiding\|saddle\|rideable` → 0; `game/beasts.js`, `game/soulbind.js` |
| L6 | Water reflection + underwater volume | Partial: toon Fresnel, crest **and shoreline** foam; no reflection or refraction | LOOKS 2.5 | M-L | Med | 0.7 | `render/Ocean.jsx:4-5,72` |
| L8 | Non-cube block shapes (slab, stair, wedge) | Absent: 15 cube ids, cube-only mesher | PLAY/LOOKS 3: roofs and detail | L | High | 0.5 | `world/blockIds.js`; `world/mesher.js` |
| L7 | Flowing water / voxel fluid | Absent: water is static | PLAY 3 | L | High | 0.5 | `rg flowingWater\|fluidSim\|liquidSpread` → 0 |

Not counted as gaps (checked): a meter-fed special already exists as the Aspect economies (`game/ferocity.js`
bank-by-kill → beast form; `game/resonance.js` bank-by-building → element zones). Directional mob flinch
exists (`render/MobModel.jsx:137-160`), and so does a death dissolve (`game/deathFx.js`). Glass
transparency is already Q28.

## 3. Top 5 — impact ÷ (cost × risk)

**Cross-cutting constraint, before any of these.** The `index` chunk sits at 740.9 of 742.2 KB
(OVERNIGHT, "Budget note"), which leaves 1.3 KB. Each item below either lands outside the main chunk
(worker, shader string in a lazy module, a lazily-loaded system) or pays for a measured budget raise. The
lever is `docs/superpowers/plans/2026-09-23-crafty-lazy-panels.md`: the on-demand panels move to one lazy chunk.

**1. Heavy (hold-to-charge) melee — score 2.7.** Hold the melee input for about 0.5-0.8 s: a visible
FPV pull-back and weapon glow, walk slowed, released on key-up. The swing deals about 2× damage, uses
the existing `heavy` hitstop tier, and lands the existing stagger (`game/perfectDodge.js`
`isStaggered`/`staggerPose`) on non-boss mobs. Dodge or taking a hit cancels the charge. A tap stays
today's light swing. This is the verb that three leaders converged on (§1), and it gives the brute's
winded window (`57c4cd93`) and the perfect-dodge riposte something heavier to spend. Mining is instant,
not held (`rg mineProgress|breakTime` → 0), so there is no input collision with a mining hold. The
collision to design around is LMB-on-mob versus LMB-on-block in `input/verbRouter.js`.
*verify:* a pure `game/heavyAttack.js` unit covering the thresholds (tap → light, held ≥ T → heavy,
dodge/hurt → cancelled). An e2e through a **real key hold** (`keyboard.down` … wait … `up`) on a
spawned zombie: HP drop ≥ 1.8× the tap's, stagger set, `heavy` hitstop fired. **Control:** a tap in
the same spec deals the light number and sets no stagger. Mutation-proof: halve the multiplier, and the
spec goes red.

**2. Leaf translucency + leaf sway — score 2.5.** In the terrain shader, gate on `layerIndex == 7`
(leaves). Add (a) a vertex sway driven by the same wind uniform as the grass and zeroed by the capture
clock, and (b) a wrap/translucency term toward `-sunDir`, so a canopy with the sun behind it glows
green-gold. This is the Vibrant Visuals leaf SSS, done as one term, with no MERS maps. Watch for sway on
greedy-merged leaf quads. Displacing per vertex keeps merged quads intact but moves them as a slab, so
sway needs a world-position phase (not a per-quad one) or large canopies will visibly shear.
*verify:* a compiled-program gate (the pattern used for the clouds) proving both terms exist in the
**linked** terrain program. A same-renderer capture A/B on a dusk forest frame: leaf pixels change,
**non-leaf pixels 0.000%**, UI 0.000%. A real-play probe takes two frames 0.5 s apart: leaf vertices
moved, trunk pixels identical. Capture determinism holds at 0.000% on the other frames.

**3. Emissive block texels — score 2.5.** A per-layer emissive mask built from the procedural
textures: ores 10-13 first, and the item-5 lantern later. The terrain shader adds
`mask × texColor × k` to emissive, scaled up at night by the mood. Bloom already exists, so it halos
for free. This is also the material item 5 needs, so ship it first.
*verify:* a unit on the mask table (ore layers > 0, stone/dirt/grass = 0). A night probe frame at an
exposed ore face: ore-pixel luminance ≥ N× the surrounding stone, and the day frames unchanged within
the noise floor. **The "deleted" test:** zero the mask and the luminance-ratio assertion fails.

**4. Storm lightning — score 2.0.** A seeded strike scheduler during storms: a sky and hemisphere
flash for about 120-200 ms with a decaying tail, an occasional bolt quad on the horizon ring, and the
existing thunder rumble retriggered after a delay of distance ÷ 343 m/s. It is off in capture mode, so
the 31 frames are untouched. Vintage Story tuned exactly this in 1.22.
*verify:* a pure scheduler unit (seeded interval; thunder delay > 0 and proportional to distance; zero
strikes when there is no storm or when capture mode is on). A real-play probe under a forced storm: one
frame's mean luminance jumps by ≥ X% and decays within 300 ms, and the audio bridge logs a thunder
event after the flash. Full capture run: 31/31 frames at 0.000% versus the pre-change same-renderer
set.

**5. Block light: a lantern block + flood-fill light — score 1.7, and the highest impact on the
list.** Add a craftable **lantern** as a full-cube block (id 16, a texture layer, an icon, a recipe;
a full cube avoids the torch-shape and collider work). In the terrain worker, a BFS light field
(0-15, −1 per face step, blocked by solids) crosses chunk borders. The mesher bakes a per-vertex
`aLight`, and the shader adds `light × warmTint` to the diffuse, dominant at night. **Bake it; do
not use a three.js light per lantern.** The repo already records that a light-count change re-links
every shader program, a one-frame hitch (`world/PhantomBlockSystem.jsx:18-20`), which is why its held
light is always mounted. **Put light in the greedy-merge key** from day one; round one's AO defect was
exactly this key omission. Optional in the
same milestone: no hostile spawns inside light ≥ 8 (`systems/spawnPlacement.js`). That turns lighting
into a siege-defence verb, which is how every peer uses it. Skylight in caves is a later step. Cost is M
rather than L because the mesher already carries per-vertex AO and a worker; risk is Med for the
cross-chunk re-light on place/break and for the re-mesh cost that Q51 has never measured.
*verify:* worker unit: level 15 at the source, 14 one face away, 0 past range, blocked by stone, and
**continuous across a two-chunk fixture**. Mesher: a floor with one lantern yields ≥ 2 quads (light in
the key, same as the AO fixture). A night capture A/B of a base with a lantern: lit radius measured in
pixels, UI 0.000%. `perf:m2` and quads/chunk over fixed seeds within +10% / +25%. Spawn unit: zero
hostile placements inside the lit radius over N seeded attempts, with a dark control > 0.

Runners-up in order: pixel-aligned shadows (1.5, **owner**, §4) · craft from nearby chests (1.5) ·
gamepad + rebinding (1.25, folds into Q26) · tree felling (1.15, needs Q51's re-mesh number first) ·
enemy guard + awareness stages (1.15, pairs with #1 — a guard is what a heavy attack is for).

## 4. Needs the owner (dependency, money, or a locked taste)

| Item | Why it is his |
|---|---|
| three 0.172 → 0.186 + `SunLight` CSM | Carried from round one; still current (`npm view three` = 0.186.0 today). Dependency bump |
| Distant-terrain mipmaps (`TERRAIN_MIPMAPS`) | Carried; built, flag off, bold-flat lock |
| **Pixel-aligned shadows** | Changes every shadow edge in the game; the look is Minecraft's signature, and whether it reads as bold-flat is a taste call. Sequence it **after** the CSM decision: `SunLight` replaces the shadow path this would patch |
| **Co-op / multiplayer** (OI-23) | Every title in §1 is multiplayer; HYTOPIA shows the browser path (WebTransport + WebSocket). Servers, accounts, money — already his row |
| **Third-person camera** | Peers commonly offer one (UNVERIFIED this round, not source-checked per title). Crafty is FPV with a third-person cam only for the transform reveal (`Components.jsx:110,1302`), so this changes the game's identity and needs a player model worth looking at (Q17) |
| Main-chunk byte ceiling | If any Top-5 item cannot move out of `index`, the ceiling raise is a load-time trade (OVERNIGHT) |

## 5. Round-one claims that are now stale

| Round-one claim | Now | Evidence |
|---|---|---|
| "Sky … **no clouds anywhere**" | Clouds and cloud shadows from one field | `813428ac`, `0de44886`; `world/Terrain.jsx:116,189` |
| "Water … Gerstner re-displaced **on the CPU main thread every frame**" | GPU Gerstner, generated from the physics table | `9860eaa9`; `render/Ocean.jsx:13` |
| "Water … **no** reflection/refraction/**shore foam**" | Shore foam exists ("continuous smoothstep shoreline foam"); reflection and refraction are still absent | `render/Ocean.jsx:4-5,93` |
| "Streaming / LOD: **no LOD**" | Far-horizon ring to 420 m; near chunks still no LOD | `ba8c3ebf`, `world/FarField.jsx` |
| "AO not in the merge key; no diagonal flip" | Fixed | `1be94a5c` |
| "Hitstop **player-motion only**" | A paused world clock reaches 12 of 15 frame loops | `68900749`, `bb9f170c`, `c72586cd` |
| "… no parry" | Perfect dodge on the dodge key | `a8c35ad2`, `game/perfectDodge.js` |
| "Hytale combat specifics — **unverified**" | Now sourced (§1) | hytale.com patch notes, IGN review |
| postprocessing pinned at 6.39.1 (QUEUE Q02/Q07 era) | Installed **6.39.5** | `node_modules/postprocessing/package.json` |

Re-checked and **still true**: three latest is 0.186.0; fiber v10 is still `10.0.0-alpha.5`;
`@react-three/postprocessing` is installed 3.0.4 vs 3.1.2 latest. Firefox WebGPU is stable only on
Windows (141) and Apple Silicon (145/147), with Linux Nightly-only and Android behind a flag;
gpuweb Implementation-Status wiki (updated 2026-08-13) and MDN "Limited availability". So "WebGL2
fallback stays mandatory" holds. The A* grid is still 9×9 (`game/localPath.js:36`), now with wall
rules. Saves are still `localStorage` (`game/worldSaves.js:2,11-13`).

## 6. Future-proofing (second priority)

- `@dimforge/rapier3d-compat` **0.20.0** published 2026-08-08. `@react-three/rapier` 2.2.0 (still latest)
  pins **0.19.2 exactly**, which is what Crafty ships. Nothing is owed until the wrapper moves, and then
  the two move in one commit (QUEUE Q60).
- Minecraft is modernising Java's renderer (→ Vulkan) *before* porting its visuals. That is the same
  order as Crafty's r186-before-new-effects stance, and it supports keeping WebGPU/TSL parked (Q54).
- A controller path (P6) is the cheapest reach extension on the list and needs no dependency: the
  browser Gamepad API behind the existing `getInput().active` abstraction.
- UNVERIFIED: "WebTransport joined Baseline in March 2026 (Safari 26.4)" — one A5 source
  (utsubo.com). It matters only if co-op is started.

**Method limits.** Absence claims come from ripgrep over `frontend/src` (tests excluded) with several
spellings per capability, plus reading the file where the capability would live. A capability built
under a name I did not guess would be missed. That is round one's failure shape, which is why the files
where each feature *would* live were read rather than only grepped. Peer claims marked A5 or single-lane
are context, not the basis for any Top-5 rank.

Lanes: 4/6 (L4 Tavily ERRORED — plan usage limit; L5 Serper ERRORED — HTTP 400; both retried once)
READ: 3/74 urls extracted (minecraft.wiki Vibrant_Visuals; hytopia-source README; veloren CHANGELOG@v0.18.0) — veloren.net/blog/release-0-18 attempted, 404
COVERAGE: claims=26 supported=24 abstain=2
DROPPED: [GDC 2026 combat-session listings — off-question, no extractable content; hytaletop100 / hytale-wiki.fun / rosenberryrooms / technosports — A5 aggregators superseded by hytale.com and minecraft.net primaries; pinkcrow "Epic Fight" — a mod, off-question; bloxd.io player counts — A5 single-lane, not load-bearing]
RESIDUE: none
