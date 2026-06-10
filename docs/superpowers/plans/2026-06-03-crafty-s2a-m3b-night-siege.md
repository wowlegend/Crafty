# S2-A-M3b — Night SIEGE + survive-to-dawn + reward (the stakes loop core)

> ✅ SHIPPED — this milestone is merged to `main`; historical plan-of-record (see CHANGELOG/ROADMAP for the build record).

> **Status:** PLAN (2026-06-03). Branch `s2a-m3b-night-siege` off `main`.
> **Method:** subagent-driven (Opus implementer, TDD red-first, sequential — shared god-files; + spec/quality/gameplay-determinism review); NO Claude footer; fix-ups = NEW commits; verify test state MYSELF; **visual 12/12 must hold.**
> **Kevin's decisions (2026-06-03 AskUserQuestion):** death = **SOFT** (respawn, keep all) · dawn reward = **ALL** (bonus XP + guaranteed scaling loot + currency) · **proceed now**.

## Goal

M3a made day↔night cycle. M3b makes night MATTER: an escalating siege you survive to dawn for a reward. Today `useSurvivalMode` is a stub (nightCount + a toast; its night-danger `setInterval` body is literally empty) and night spawning is a flat 0.7 hostile bias at a constant `maxMobs=16` (no escalation, no stakes). M3b builds the loop: **day (build/explore) → night (escalating siege + danger mood) → survive to dawn → reward → repeat, harder.**

## Reality grounding (what exists — do NOT rebuild)

- **Soft death ALREADY EXISTS:** `store.damagePlayer` → `isAlive=false` at 0 HP; `store.respawn()` (useGameStore.jsx:637) restores health/mana/hunger + `isAlive=true` and **keeps inventory/progression/level/equipment** (no penalty); `Components.jsx:209` teleports to safe spawn on the false→true `isAlive` transition. So "soft death" = the current behavior. M3b's job is to **VERIFY + LOCK it with a test** (respawn keeps level/XP/inventory/coins), NOT add a penalty.
- **No currency exists** (`gold:8` in the store is a block mining-XP value, not a wallet). M3b ADDS one.
- **Night spawn:** `SimplifiedNPCSystem.spawnMob` (~526) biases hostile when `!isDay && Math.random()<0.7`; the maintenance loop (~602) holds up to `maxMobs=16`. Both constants — no escalation.
- **`dangerLevel`→obsidian mood** is wired (moodTarget reads `dangerLevel`; the boss bridge sets 2, capture-guarded). Night currently does NOT raise `dangerLevel` (explore-night = dusk mood 1 via `isDay:false` only).
- **`grantXP`** exists (reward XP). **`addToInventory`/loot** exists (reward loot). **`useSurvivalMode`** already detects the night→day + day→night transitions (the reward + siege hooks).

## ⚠️ CAPTURE-DETERMINISM (the load-bearing gotcha — visual 12/12)

Two baseline frames are night/danger-sensitive: **`explore-night`** (dusk mood, `dangerLevel=0`) and **`boss-obsidian`** (`dangerLevel=2`). M3b changes night spawn + adds a **night→`dangerLevel`** bridge. BOTH must be **capture-guarded** so the 12 baselines stay byte-stable:
- The night→`dangerLevel` bridge MUST early-return under `isCaptureMode()` (mirror the boss bridge `a428df7`) — otherwise the `explore-night` capture would get a raised dangerLevel → mood shift → frame drift.
- The siege spawn-rate/maxMobs escalation MUST stay inside the existing `!isCaptureMode()` spawn guards (already present at ~563 + ~600).
- Run `npm run test:visual` and confirm **12/12 with NO re-baseline**. If `explore-night` or `boss-obsidian` drift, the capture guard is wrong → STOP.

## Tasks (TDD red-first; sequential — shared store + SimplifiedNPCSystem)

### T1 — Currency (`coins`) in store + save + HUD (ADDITIVE)
- Store: `coins: 0` near the progression fields + `addCoins: (n) => set(s => ({ coins: Math.max(0, s.coins + n) }))`.
- Persist: add `coins` to the `saveSchema.js` `progression` slice (line ~27) + restore in `loadWorldData` (`prog?.coins ?? state.coins`), mirroring `talentPoints`.
- HUD: a small coin readout (use a game-icon + the bold-flat token style; **gate so the existing capture frames stay byte-identical** — if coins=0 by default and the readout shows on the HUD, confirm it doesn't alter `explore-day/night` baselines; if it would, only render when `coins>0` OR place it where the baselines already tolerate — verify visual 12/12).
- Tests: store `addCoins` (clamps ≥0); save round-trip persists `coins` (extend saveSchema/round-trip test).

### T2 — Escalating night siege + night→danger bridge
- **Siege intensity from nightCount:** a pure helper (extend `src/game/dayNight.js` or a new `src/game/siege.js`) `siegeParams(nightCount)` → `{ hostileChance, maxMobs }` that ramps with nights survived (e.g. base day `maxMobs=16`; night `maxMobs = 16 + min(nightCount*4, 24)` capped, `hostileChance = min(0.7 + nightCount*0.05, 0.95)`). **Pure + unit-tested** (monotonic, capped). Numbers = batched knob.
- Wire `SimplifiedNPCSystem`: replace the literal `0.7` hostile bias + the literal `maxMobs=16` with `siegeParams(store.nightCount ?? 0)` values, **only at night** (day stays the calm baseline). `nightCount` must be readable from the store — **lift `nightCount` into the store** (today it's `useState` inside `useSurvivalMode`); add `nightCount` + `setNightCount`/increment to the store so both the survival hook AND the spawn system read one source (mirror the M3a/M2c single-SoT discipline). Keep the spawn changes inside the existing `!isCaptureMode()` guards.
- **Night→danger bridge (capture-guarded):** when night falls, `setDangerLevel(1)` (deep siege/boss escalates to 2 — boss bridge already does 2); clear to 0 at dawn. Do this in the store transition or `useSurvivalMode`, **with `if (isCaptureMode()) return`** so `explore-night` stays dusk-mood (danger 0) in the gate. This makes night actually FEEL dangerous (obsidian-tinted mood) in real play.
- Tests: `siegeParams` pure (ramps + caps + day vs night); a static/behavior gate that the night-danger bridge is capture-guarded.

### T3 — Survive-to-dawn reward (XP + guaranteed loot + currency)
- Store action `grantDawnReward(nightNumber)`: `grantXP(BASE_XP * nightNumber)` + `addCoins(BASE_COINS * nightNumber)` + a **guaranteed loot drop** scaling with nightNumber (use the existing loot/`addToInventory` path; pick rarity by night tier). Pure reward-math helper unit-tested; the grant action wires it.
- `useSurvivalMode`: on the night→day (survived) transition it already detects, call `grantDawnReward(nightCount)` + show a reward toast ("Dawn! +N XP, +M coins, loot!"). Guard against double-grant (one grant per dawn).
- Tests: reward-math pure (scales with night); the grant action mutates XP/coins/inventory once.

### T4 — Soft-death verify + lock
- Confirm `respawn()` keeps level/XP/attributes/equipment/inventory/coins (no penalty) — Kevin's SOFT choice = the existing behavior. Add a test that damages to death → respawn → asserts progression + inventory + coins unchanged (only health/mana/hunger restored). This LOCKS soft-death as the contract so a future change can't silently add a penalty. (No production code change expected unless a gap is found.)

## Definition of done
- Night = escalating siege (more/hostile mobs per night survived) + danger-tinted mood (in play); survive to dawn → XP + scaling loot + coins; death = soft (verified + locked). Currency persists.
- `npm run test:unit` green (478 + new) · `npm run build` clean · `npm run test:visual` **12/12, NO re-baseline** (night-danger bridge + siege spawn capture-guarded).
- Adversarial review (spec/quality/gameplay-determinism) → no BLOCKING unaddressed; merged to `main`.

## Batched to Kevin (KEVIN-REVIEW-BATCH — feel/balance, reversible constants)
- **Siege ramp** — default: night `maxMobs = 16 + min(nightCount*4, 24)` (cap 40), `hostileChance = min(0.7 + nightCount*0.05, 0.95)`. Tune to taste.
- **Dawn reward magnitude** — default `XP = 50 * nightNumber`, `coins = 10 * nightNumber`, +1 guaranteed loot drop (rarity tiering up by night). Tune.
- Currency name/icon (default "coins") — cosmetic.
- **Deep-night obsidian mood?** (post-review decision) — see below.

## Post-review (2026-06-03)

3 lenses (spec/quality/determinism) all flagged the SAME two issues — fixed in a follow-up commit before merge:

1. **MAJOR — `dangerLevel` double-writer (fixed by REMOVAL).** The night→`dangerLevel(1)` bridge was both (a) a **no-op for mood** — `moodTarget` already floors night at mood 1 via its `night` term, so writing danger=1 at night = `max(1,1)` = no change — and (b) **harmful**: it could stomp an active boss's `dangerLevel=2` to 0/1 at a dusk/dawn transition (the boss bridge wouldn't re-fire), blanking the obsidian mood mid-fight. **Fix:** removed the night→danger write entirely → the **boss bridge is the SOLE `dangerLevel` writer** (single-authority, mirroring the M2d pointer-lock lesson). Night danger is delivered by the **siege spawn-ramp** + the existing **dusk mood**; **obsidian (mood 2) stays the boss signature.** → **Batched to Kevin:** want deep/late nights to visually escalate toward obsidian (a deliberate mood feature: write danger=2 on a deep-siege tier, capture-guarded)? Default = NO (keep obsidian boss-only — cleaner signature).
2. **MAJOR — `nightCount` not persisted (fixed).** `nightCount` is the sole source of siege intensity AND dawn-reward scaling, but only `coins` was persisted → a reload reset the "harder every night" loop to night 0 while the coins it granted persisted (inconsistent). **Fix:** persist `nightCount` + `lastRewardedNight` in the saveSchema progression slice + `loadWorldData`; round-trip tested.
3. **MINOR — reward double-grant guard (fixed).** The once-per-dawn guard was a `useRef` that resets on remount (and wouldn't survive reload). **Fix:** moved it INTO the store — `grantDawnReward` guards on the persisted `lastRewardedNight` (returns null if already rewarded), robust across remount + reload.

`test:unit` **507** · build clean · `test:visual` **12/12 no re-baseline** (removing the capture-inert night bridge changed nothing in the gate — confirming it was inert).
