# Crafty → SOTA Rebuild — Design Spec (2026-06-17)

**Status:** Design (awaiting Kevin approval → then `writing-plans`).
**Author of record:** brainstormed with Kevin via the superpowers process (visual companion).
**Grounding:** the 11-agent total-element audit + 8-complaint diagnostic in `docs/superpowers/audits/2026-06-17-*`.

## Why this rebuild

Kevin reviewed the LIVE game and found the prior "SOTA" work was largely **invisible**: green capture
gates + "verify-done / code-exists" verdicts measured code-PRESENCE, not lived result. ~309 commits since
06-13, but only ~21 capture frames changed (clustered in UI panels / menus / night) — so the only always-on
visible change was the grass. The engine and systems are genuinely strong; the gap is **visible fidelity,
dead/legacy rot, real shipped-broken bugs, and an empty (un-populated) world.**

**The core process fix:** every visible slice is validated by a **LIVE-LOOK** (drive the real game,
screenshot, look) + `verification-before-completion`, NOT the pinned capture gate alone. The capture gate is
re-baselined as deliberate (glowier is now the intended look).

## Decisions of record (from the brainstorm)

| Decision | Choice |
|---|---|
| Sequence | **Trust-first**: W1 Purge & Fix → W2 Look → W3 Content → W4 Polish |
| Auth subsystem | **DELETE entirely** (rebuild fresh if accounts ever wanted) |
| Legacy pet/tame system | **DELETE** (Soulbind supersedes it) |
| Title screen | **Cinematic 3D vista** — live 3D Hearth scene behind the menu |
| Ocean | **Stylized tropical toon (Caribbean)** — animated water surface |
| Daytime grade | **Warm magic-hour** (glowier; the NEUTRAL lock is REVERSED) |
| W3 world population | **Living frontier (max)** — outpost + NPCs + ambient routines + travelers + lore |
| Spell shapes | **4 distinct silhouettes** + per-element trail/impact (full per-element VFX) |
| Multiplayer | **Out of scope** (Crafty is solo; "alive" comes from ambient NPC life) |

## Locks in force

- **Bold-flat** UI/material STYLE preserved (no normal maps on terrain; the token chain governs UI).
- **Glowier/warmer grade AUTHORIZED** (Kevin reversed the restrained-NEUTRAL lock 2026-06-17).
- Zero emoji in `src/`; no AI commit footers; `.state/` untouched; deliberate-only re-baselines.

---

## W1 — Purge & Fix (first; rebuilds trust, fixes shipped-broken)

Mostly mechanical; uses `systematic-debugging` for the bug-class items. Every item is file-grounded in the
audit digest.

**Dead/legacy purge:**
- **`gameStarted` flag** — referenced 5×, set nowhere → define+set on first play (or re-derive from
  `isWorldBuilt && isAlive`). Restores ESC=pause + 3 pointer-relock guards AND removes the trigger for the
  CRAFTY-RPG flash.
- **Legacy "CRAFTY RPG" click-to-play overlay** (App.jsx:734-806) — DELETE; the bold-flat title menu covers
  the unlock-prompt case. Kills the ESC flash + the off-brand surface.
- **Auth subsystem** (AuthContext + AuthModal + axios→localhost:8001) — DELETE entirely; remove the boot-block
  + per-load console error; the loading gate keys off real boot readiness.
- **Legacy pet/tame system** (petSystem + PetEntities + PetIndicator + tameMob slot + KeyT) — DELETE; frees T.
- **Dead `MagicSystem` component** + phantom `showMagic` M-key panel — delete the dead component; decide M-key
  (wire a real panel or remove the surface).
- Dead ECS exports (`movingMobsQuery`, `aggroMobsQuery`, `attackEntity` alias); dead audio voices
  (`magic`, `magicCharge`, `playJump/playMagic/playTone`); orphaned `Tooltip` primitive; dead CSS keyframes
  (`float-slow`, `title-glow`); **Orbitron font** (off-brand, render-blocking); combat dead config
  (`SPELL_EFFECTS`, `SpellLeftHandEffects`→null, shield/heal mana costs for non-existent spells).
- Prod `console.log/warn` spam (per-hit combat logs, etc.); DEV-gate the `index.jsx` console ring-buffer patch.

**Real shipped-broken BUGS:**
- **Mana Potion restores 0 mana** (`window.addMana` undefined) → route to a real `restoreMana`.
- **All spatial SFX bypass the master limiter** → route `listener.gain → masterBus.input`; restores the
  SFX-volume slider + Mute-All (currently dead controls) + the limiter's purpose. Add a test asserting the route.
- **Spell upgrades are free** (xpCost + escalating manaCost never charged; UI lies) → wire the costs or delete
  the dead fields + fix the UI to match.
- **Boss win-reward = unregistered junk** ('Crown of the Dragon King' / 'Dragon Scale' not in ITEMS) → register
  proper legendary items (it's the payoff of the whole run).
- **Unique-key console error** → add `id` to loot-drop + XP-orb `ecs.add()`.
- **KeyF triple-conflict** (melee-on-press + continuous-cast-on-hold) → pick one semantic, align keyMap + hints.
- **Bound-ally hostile red eyes** → gate red eyes on `!isAlly`.
- Purge dead economy content (chest Damage/Shield scrolls + `scrolls` currency + phantom `Apple`).

## W2 — The Look

- **Lighting/postproc → Warm magic-hour glow.** Bloom `luminanceThreshold` 1.0 → ~0.65 + intensity up (so
  highlights actually bloom); daytime fill light ON (explore `fillIntensity` 0 → ~0.35, warm); add a
  `hemisphereLight` (sky/ground bounce) so terrain reads as form; warmer grade (saturation/brightness up).
  Live-look tuned; protect highlight detail. (The staged GameScene Bloom edit folds in here.)
- **Ocean → stylized tropical toon (Caribbean).** Replace the voxel water-tops with a real animated water
  **surface**: a subdivided plane at sea level, 3–4 summed Gerstner waves (world-space, cross-chunk coherent)
  with **recomputed normals**, Fresnel off the real normal, bright turquoise→teal palette, glossy highlight
  bands, **continuous smoothstep shoreline foam** (not binary 1×1 white cells). Cull the water top + water/air
  side faces from the greedy mesher. Built in a **git worktree** (risky). Live-look at the shoreline.
- **Title screen → Cinematic 3D vista.** Full-bleed live 3D Hearth diorama under the magic-hour grade (slow
  camera drift, light motes), wordmark + Crafty-Hero lockup, one bold-flat gold CTA; re-enter the token system;
  drop Orbitron + confetti + candy-purple. New `menu` capture baseline (capture-frozen).
- **Spell per-element shapes + VFX.** Make the silhouette the hero (boost shape, shrink/dim the white core);
  Fire = roiling ember-ball + rising embers; Ice = angular shard + satellites, crisp (less bloom); Lightning =
  jagged forking bolt, crackles in flight + chains on hit; Arcane = rotating sigil orb (rings + rune glyph).
  Per-element TRAIL + IMPACT geometry, not just hue. Characterization test asserting distinct geometry.
- **Death-FX.** Add a `death` velocity branch; fix the additive-glow white-wash (hue-preserving so a green mob
  reads green at peak); per-element death burst (embers/shards/jitter) + ground decal + t=0 flash; brighten
  dark-mob tint floor.
- **FPV hands.** Replace the raw `#fdbcb4` boxes with a gloved/stylized silhouette in the character render
  language (Outlines + player white-gold accent); add a non-capture hands live-look probe.
- **World feel → de-island + flatten spawn.** Push the ocean threshold out + enlarge the continent + drop/grade
  the Hearth plinth so spawn isn't a peak on a tiny island. Data-only; reposition the pinned ocean cameras;
  re-baseline.
- **Biome variety.** Expand beyond 3 hard-threshold biomes (per-biome flora/tint/blending).

## W3 — Living Frontier (the "feels-complete" content; max tier)

- **Populated Hearth outpost** — the origin plinth becomes a small frontier settlement: 3–5 **static NPCs**
  (merchant, smith, quest-giver/guide, healer) at fixed coords + 3–4 procedural **voxelKit buildings** (forge,
  stall, watchtower). Re-anchor the wandering villager (the TradingInterface + claimQuest backends already work).
- **Ambient life** — NPC patrol/work routines + emotes + the occasional wandering traveler (the "max" tier).
- **Narrative quest chain + quest log** — thread the existing shrine→Blight-Heart spine with lore/giver fields;
  re-theme generic chores ("defeat 5 mobs") into a story; add a quest LOG panel.
- **HUD-completeness (ships regardless of tier):** entity **nametags** + a **target/unit frame**; a **combat
  log** (render the notification stream as a corner ticker); **cooldown sweeps** on a real **ability bar**
  (Aspect signatures + dodge; timers already exist); a real **radial minimap** with destination blips (data
  already tracked).
- **UI restraint:** **demote the always-on CONTROLS cheat-sheet** to a toggle/auto-fade (reclaims ~30% of
  screen — the biggest "tech-demo" tell); HUD declutter (dedupe the identical 100/100 stat pills; resolve
  compass-vs-minimap-vs-ObjectiveTracker redundancy).
- **Spawn legibility:** a far-LOD light-shaft beacon for the nearest shrine + the Blight-Heart, visible from
  spawn (decoupled from chunk load); a persistent (not 4s-auto-dismiss) goal cue.

## W4 — Depth & Polish

Movement game-feel (acceleration/coyote-time/jump-buffer); meaningful weather (biome-gated + storm audio +
sky-darkening); item depth (affixes/sets); favicon + PWA manifest + OG/Twitter share meta + theme-color; brand
copy fix ("Minecraft-style" → brand-accurate).

---

## Verification discipline (applies to EVERY slice)

1. Unit tests grow-or-hold; build clean; eslint clean.
2. **LIVE-LOOK probe** for any visible change — drive the real game (enterPlay / the scripts/visual probes),
   screenshot the actual frame (spawn view, hands, ocean shoreline, spell cast, title), and LOOK. A green
   pinned-capture gate is necessary, not sufficient.
3. Capture gate re-baselined deliberately (glowier is the intended look); diffs reviewed by eye.
4. `verification-before-completion` as the done-gate; `systematic-debugging` for bug-class items;
   `using-git-worktrees` for the ocean rewrite; execution via `subagent-driven-development`.
5. Commit per slice (`-F`, no AI footer, `.state/` untouched); push (auto-deploys to crafty-sand.vercel.app).

## Out of scope

Multiplayer / accounts backend (Crafty stays solo; "alive" comes from ambient NPC life). i18n item-name
decouple (separate refactor). Real-device perf tuning (Kevin live-test).
