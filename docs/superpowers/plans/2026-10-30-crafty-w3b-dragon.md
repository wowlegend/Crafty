# W3-B, the dragon, first half: task script (2026-10-30)

**Contract:** `2026-10-27-crafty-shadow-dragon.md` (its Review amendments govern), Units 1, 10, 2, 3 and 4.
**Plan:** `2026-10-28-crafty-sota-reset.md` lane W3-B and row 25 (hurl, squad, element zones and burns hit the dragon
through a small adapter). **Builds on:** main `80238889` (the whole Cut, the HUD lane's boss bar and one notification
channel, the hands). **Branches:** PR A `feat/w3b-dragon` from `80238889`; PR B `feat/w3b-dragon-b` from PR A's head.
DECISIONS items for this lane start at 120. **Held by the W2-G lane, not edited here:** `App.jsx`, `QuestSystem.jsx`,
`SimpleExperienceSystem.jsx`, `GameSystems.jsx`, the `window.play*` call sites in `EnhancedMagicSystem.jsx`,
`world/Terrain.jsx`, `world/terrain.worker.js`, `world/climate.js`, `game/saveSchema.js`, the autosave,
`ci/pipeline.sh`, `.knip.json`.

## The contract's citations, re-read on `80238889`

| Contract says | On `80238889` |
|---|---|
| `BossEntity.jsx` 609 lines; static import `GameScene.jsx:25`, mount `:376-382` | 604 lines; import `GameScene.jsx:27`, mount `:465-471`, inside `<Physics>` in the one `<Suspense>` at `:449` |
| bite `:283-290`, fireball `:293-311`, roar `:314-343`, lava `:346-365`, summon `:368-382` | bite `:286-293`, fireball `:296-312`, roar `:315-342` (impulse `:330`), lava `:345-362`, summon `:365-377` |
| four English toasts | four keys through `bossAttackCall` (`:310`, `:337`, `:358`, `:375`; `world/bossSystem.js:21`), ranked last in the one line (DECISIONS item 92) |
| boss lines in `bossSystem.js` hardcoded English | already keys through `bossCall` with the name as `bossNameKey(tier)` (`game/bossTier.js:37-41`), en and zh-CN; `damagePlayer`'s source is an attribution id read only by the DEV console (`store/useGameStore.jsx:927,950`) and `grantXP`'s reason is unused (`:449`) |
| boss point light `:565`, per-fireball light `:590` | both `PooledLight` from the fixed pool (`render/lightPool.jsx`, `:560`, `:585`): no program re-link per fireball any more; Unit 5 still deletes them |
| `applyPerfectDodge(mobsQuery.entities, …)` `Components.jsx:998` | `:1141`; boss melee branch `:323-345`; heavy stagger on mobs `:308-312`; `applyImpulse` shim `:173-177` |
| `damageBoss` `bossSystem.js:134-137` | `:127-130`; arrival effect `:56-110` (guard `:57-58`); kill beat `:136-164`; DEV `forceBossSpawn` `:178-186` |
| `index` ceiling 760,000 B | 700,000 B (`scripts/ci/bundle-budget.mjs:38`); measured on `80238889`: **682,746 B** |
| lookbook seam on `feat/instruments` | on main: `render/lookbookSeam.js` (`installLookbookSeam` `:250`), wired at `index.jsx:80-88`; sets in `scripts/visual/lookbook.mjs` |
| move 11's `edgeLook`, `telegraphLevel`, `hdrGain`, decal pools | absent from main (grep finds none); the reset plan moved the edge telegraph to W3-A (`sota-reset.md:539`) |
| DEV hooks in `App.jsx` (`plantWindup`, `spawnBossCloseup`) | `App.jsx` is W2-G's: this lane registers its hooks from `world/bossSystem.js` and `render/BossEntity.jsx` through `devtest/testBridge.js registerTestHook`, which any module may call |

## The seam between the two PRs

**PR A (Units 1 and 10): no behaviour change.** The dragon loads as a lazy chunk while a fight is due or on, and the
lookbook can spawn it and hold it still on the production build, so every later unit is judged on frames. **PR B
(Units 2, 3, 4 and row 25), stacked on A:** every attack has a tell, the tells are read from the ground, the perfect
dodge and the heavy answer the dragon, and hurl, squad, zones and burns reach it. B changes the fight; A changes only
when its code downloads.

## Decisions (routine calls, stated; DECISIONS items 120 on record the non-routine ones)

1. **Units 1-4 go before move 11's surfaces** (DECISIONS 120). The decals are the dragon's own fixed pool of four
   meshes inside `BossEntity`'s one frame loop (no second `useFrame`), so W3-A's edge telegraph can absorb them.
   Units 5 (rig), 6 (slow motion), 7 (roar voice), 8 (returns), 9 (arena), 10.2b (gpu-cost scene) are registry rows.
2. **The failed chunk suspends the encounter** (DECISIONS 121). GameScene's props come from `App.jsx`, so the give-up
   path is published on the store as `suspendBossEncounter` (a declared slot), as `damageBoss` is.
3. **The lookbook's hold is seam state**, read per frame like `lookbookPose()`: `lookbookDragonHold()` in
   `render/lookbookSeam.js`. A held dragon takes no flight step and starts no move. `bossSystem` installs its
   production spawn (`lookbookSpawnDragon`) only when `parseLookbookParam(location.search)` is true (DECISIONS 122).
4. **The move machine is pure and lazy** (`game/dragonMoves.js`, imported only by `BossEntity` and tests); **the
   shared record is the one main-chunk module** (`game/bossCombat.js`), mutated by the machine, the perfect dodge and
   the heavy. Values are the contract's (`DRAGON_MOVES`), tuned only through DECISIONS.
5. **The interim tell on today's model** (until Unit 5): the head's emissive ramps with the windup (`windupRamp`), and
   a ground decal: bite and dive-bite an arc of reach 5 in the heading, roar a ring of radius 9 on the dragon, fireball
   a disc of 1.6 m on the aim point, summon a ring of 7 m where the skeletons rise; the lava keeps its own ring.
6. **The attack toasts and their class go** (DECISIONS 123, amending item 92): `bossAttackCall`, the `attack` mark in
   `ui/notifications.js`, the four `notice.boss*` attack keys, `tests/gates/boss-attack-line-gates.test.js` and the
   attack-call states of `tests/e2e/hud-at-rest.spec.js`. The phase lines describe the read (en and zh-CN).
7. **One damage path** (DECISIONS 124, row 25). `BOSS_TARGET_ID` names the record; `bossTargets(mobs)` hands systems
   the mob list with the record appended while a fight is live (a module scratch array, no per-tick allocation);
   `CombatSystem.damageMob` routes that id to `damageBoss(amount, source)`, which applies the riposte to the player's
   sources only. Hurl, slam, zones and the squad read `bossTargets`; their pure hit tests add an entity's `bodyRadius`
   (0 for a mob, 1.6 for the dragon). A spell that burns starts its burn on the dragon's id.
8. **DEV seams for the e2e** (`bossSystem` and `BossEntity`, DEV only): `spawnDragonAt`, `pinDragon` (no flight step,
   moves still run), `plantDragonMove`, `readDragon`, `readImpulses` (the `applyImpulse` shim logs each call in DEV).

## PR A: tasks, red first

- **A1** `render/dragonLoader.test.js` + `render/LazyDragon.test.jsx` (contract step 1.1, the three boundary cases,
  `shouldPreloadAtMount`). See them RED (unresolved import). Then `render/dragonLoader.js`: `makeDragonLoader` over
  `onceRetrying`, `dragonLoader`, `preloadDragon`, `shouldPreloadAtMount`, `DragonBoundary` (notice, 5 s remount, three
  retries, `onGiveUp`), `LazyDragon` (direct when loaded, else boundary + inner `<Suspense fallback={null}>`).
- **A2** `bundle-budget.mjs`: `DRAGON_MARKERS = ['crafty:dragon-chunk']`, absent from `index`, in exactly one chunk.
  Add the marker to `BossEntity`'s outer group first; build; see `✘ dragon … BOOT chunk` (L3 shape).
- **A3** `GameScene.jsx`: `{bossActive && <LazyDragon …five props… />}` where the static mount was. `bossSystem.js`:
  preload past the arrival guard and at mount when restored active; `forceBossSpawn` preloads; `suspendEncounter`
  with a `rearm` counter; i18n `notice.dragonLoadFailed`, `notice.dragonLoadGaveUp` (en, zh-CN). A
  `tests/gates/boss-persistence-hook-gates.test.jsx` case: suspend keeps HP, re-arms the lair.
- **A4** Mutants L1, L2, L5, L6 (`scripts/dev/mutate.sh`), L3, L4 (build + budget), each with an identity mutant.
- **A5** Unit 10: `lookbookSeam.js` `dragon({ pose })` over an injected `spawnDragon`; `DRAGON_POSES` (PR A:
  `rest`); an unknown pose throws a `TypeError` naming it. `bossSystem` `lookbookSpawnDragon` only under `?lookbook=1`;
  `index.jsx` injects it. Gate cases in `tests/gates/lookbook-seam-gates.test.js` (absent without the param, spawn
  seam absent, unknown pose throws, a live dragon after `dragon()`) and `lookbook-plan-gates.test.js` (the
  `dragon-arena` place and the dragon shot plan); see them RED first. `lookbook.mjs --sets dragon`; e2e case in
  `tests/e2e/lookbook-seam.spec.js`: `dragon()` finds the `crafty:dragon-chunk` group in the scene.
- **A6** Frames: `node scripts/visual/lookbook.mjs --sets dragon --targets chromium-1280x800,webkit-1180x820
  --cycles 0.48,0.75` under the GPU lock; JPG under 300 KB, opened, listed in the PR.
- **A7** Gates (below), DECISIONS 120-122, registry rows, merge `origin/main`, push, PR, CI on the exact head.

## PR B: tasks, red first

- **B1** `game/bossCombat.test.js` (record: fresh values, reset in place keeps identity, no shared `position`, a live
  record reads inactive after reset) and `game/dragonMoves.test.js` (the contract's step 2.1 cases, M5's "a staggered
  dragon starts nothing", "knocked down starts nothing"); `game/bossTier.test.js` tricks. RED, then implement.
- **B2** `BossEntity`: `stepDragon` plus the applier (strike, whiff, launch, lava, summon), the record written every
  frame, `resetBossCombat` on unmount, the head's windup glow, the decal pool, the hold's tell poses, `pinned`.
  Re-run the boss source gates: same assertion counts.
- **B3** Decals and the toasts' deletion (decision 6), `render/dragonTelegraphs.js` (`decalFor`, `decalOpacity`) with
  `render/dragonTelegraphs.test.js` (roar ring 9, arc 5 in the heading, lava null, opacity monotonic, the new zh-CN
  keys differ from en and carry no Latin letter).
- **B4** Skill answers: `withBossTarget`, `registerBossHeavy`, `bossHitByCone`, `bossDamage` (contract step 4.1
  cases); `Components.jsx` dodge start and boss branch; `damageBoss(amount, source)`; the phase-0 dive and landing.
- **B5** Row 25: `bossTargets`, the `damageMob` route, `bodyRadius` in `game/hurl.js`, `game/elementZones.js`,
  `game/squadAI.js` (unit cases: a big body is hit at its radius, a mob's reach is unchanged); the burn on the boss.
- **B6** `tests/e2e/dragon-fight.spec.js` (CI): the bite telegraphs and a perfect dodge staggers it (an early press
  does not); the roar hits at 5 m, misses at 11 m, and does nothing under i-frames (impulse log); a decal shows during
  a planted roar windup; a zone, an ally, a hurl and a burn each lower its HP.
- **B7** Lookbook frames of each tell (bite, fireball, roar, lava, summon, staggered) at 0.48 and 0.75.
- **B8** Mutants (unit: M1-M9, T1-T3, K1-K5, the row-25 radius mutants; e2e on CI where run), gates, DECISIONS
  123-124, registry, merge `origin/main` (into A then B), push, PR, CI.

## Gates, every PR (from `frontend/`)

`npm run lint` · `npm run test:unit` (background, deadline) · `node scripts/ci/doc-currency.mjs` ·
`node scripts/ci/gate-shape.mjs` · `npm run build` · `node scripts/ci/bundle-budget.mjs` · `npm run knip`. CI's
`ci ok` on the exact head; each e2e shard's first attempt read (`retry #`).

## Not done in this lane (registry rows)

Units 5-9 and 10.2b; the touch heavy chain e2e; the death beat and slow motion; any e2e mutant not run on CI.
