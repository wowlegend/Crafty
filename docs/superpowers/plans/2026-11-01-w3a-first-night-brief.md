# Brief: W3-A, the First Night (2026-11-01)

**Plan:** reset plan row 45 and the W3-A row (`2026-10-28-crafty-sota-reset.md:126`, `:225`). **Rows:** `LANE:W3-A`
(13). **Units, order, PRs and the calls made:** `2026-11-01-w3a-first-night-tasks.md`, beside this file. Designs that
stand: encounters-siege Moves A-H, the lantern brief, feedback-grammar M1, M2, M4-M6, first-minute D5 and D11.

## The ten minutes, for a fresh player

| Clock | Beat |
|---|---|
| 0:00-1:00 | **Light the Hearth.** Start at a cold brazier; Old Pike says to light it and the compass marks it. G (Talk on touch) within 3 m kindles it: a light swell, a voice, and Primal Roar as a gift. Two ember husks crest the ridge. |
| 1:00-4:00 | **Day.** Table groups: boars by the Hearth, husk pairs 28-85 m out, no brute or pack at tier 0. Kills and walls fill the bar, which marks each verb's price. The dusk warning says a full bar wakes the beast. |
| 4:00 | **Dusk horn**, on the clock's crossing and never on a load; a red compass wedge, pinned to the edge when behind. |
| 4:00-8:00 | **Siege.** Waves of 2, 2 and 3 from one bearing at 0, 72 and 152 s, marching on the Hearth; marchers at the brazier drain its flame. Windup voices, a heated edge, a flash on the lit side. Health refills after 4 s of calm. As wave 3 and the Ashen Captain arrive, the lit Hearth tops the bar up: **hold R** and stay the beast, in third person, for all 14 s. Fall, and rise at the nearest lit light. |
| ~6:40 or 8:00 | **Dawn.** The captain's death pans the sun up in about 4 s; then the bloom, the Hearth's flare, "Night 1 held" (or "survived" if the flame went out) and the reward. |
| 8:00-10:00 | **The next light.** Dawn empties the bar, and the last line points at Mara's lantern. |

## Systems

- **Lights** (`game/lights.js`, pure, derived): the Hearth while lit, the lanterns, and W3-B's `litShrines`. One home for the 16 m ward, respawn at the lit light nearest the fall, and the siege objective (nearest lit light within 32 m, else the player).
- **One encounter table and one spawn contract** (Move A): `spawnMob(x, z, type, y, opts)`; one 3-per-second budget for every source.
- **Siege director** (Moves C, D): derived from `nightCount` and `gameTime`, nothing saved. The captain's kill breaks it at once, even in a hitstop, and the sky follows the rush instead of cutting.
- **The stake (a BET):** the Hearth's flame, 0 to 1, per session. At 0: no ward, no lend, no respawn there, "survived" at dawn. The kindle verb relights it when calm. One constant switches it off.
- **The lend:** night 1 only. Night kills pay 0, dawn empties the bar and building caps at 40 a day (`ember.js:23`, `:36-38`), so a builder reaches 72 by dusk and a fighter needs 7 day kills. When wave 3 comes, a lit Hearth fills the bar to 100.
- **The held beast:** a boom on the player's own look, aimed at the rendered body. Orbs, loot, the spawner and `playerPosition` read the body's eye point, not the camera.
- **Regeneration on calm** (`game/vitality.js`): stance not engaged and 4 s of world time since a hit; 6 HP/s at 2 Hz; it holds while the world is frozen. The healer heals only when calm.
- **The lantern:** block 16, tables derived, 2 coal + 1 iron + 20 coins at the Forge. Its flame is emissive, so the read survives a low tier's 2 pool lights.
- **Voices and the grammar:** six windup voices in the lazy night chunk; feedback-grammar M1, M2, M4-M6.

## What it cuts or replaces

Hunger (gone, DECISIONS item 72) becomes regeneration. The untyped pick and the boot ring become table groups. The
horn on the `isDay` edge moves to the crossing. The 1.2 s camera return becomes the held view. The origin-only
respawn becomes the nearest lit light. The always-lit brazier starts cold for a fresh profile: its light stays mounted
at intensity 0, and a save without `hearthLit` reads lit. The healer's free heal becomes calm-only, and the siege's
source grep becomes a driven test.

## What it must not break

The pillars: P1 deepens Wildheart; P2 gives walls and lanterns a siege to feed; P3 is one grammar; P4 means no voxel
edits by a system, the caps and the 3-per-second guard, and touch everywhere; P5 keeps night 1 gentle, death soft and
zh-CN everywhere. Game-Loop Isolation: the store is written on a change only. The index ceiling is 652,500 B
(`bundle-budget.mjs:46`; 647,757 B measured): W3-A nets at most 3,000 B, so C0 frees 2,500 B or more first; it is
never raised. One-way door: block id 16 (reset plan :237); `hearthLit` is a boolean this brief adds.

## Measured acceptance

1. **CI on the exact sha:** `first-night.spec.js`, real input, eight beats (kindle, horn, beast held, regeneration, captain and panned dawn, respawn, ward, lend), each with a presence control and a killing mutant.
2. **Production:** `scripts/visual/first-night.mjs`, local prod build, then the live URL. Fresh, real time: kindle by 1:00, horn at 4:00 ± 3 s, the beast held 13.5 s or more, dawn by 8:05. Pressure in band: lowest health 30-85 %, 60 s or more engaged, the flame dipped and held. A reviewer who did not build the lane judges the clip beside today's eye-level frames, and the verdict goes in DECISIONS.
3. **By hand** on Chromium and WebKit at 1180x820 and 820x1180: touch-hold roar and heavy through a siege. iPad feel is Kevin's.
4. **Budgets:** index under the ceiling; at most 4 elites; a 40-mob night on the WebKit viewport (the M3 Max, not an iPad).
5. **All 13 rows** close.
