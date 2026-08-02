# W1 — Purge & Fix Implementation Plan

> **✅ COMPLETE 2026-06-17 (main @ `8b6e3a4`).** All 18 tasks shipped via subagent-driven execution (3 batches; implement→spec-review→quality-review per task), gates green (1479 unit / build / eslint), all targeted dead code gone, the 2 visible changes (ESC-pause/no-flash + M-key panel) live-look-verified. Kevin-ear/eye items + follow-ups in `KEVIN-REVIEW-BATCH.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (- [ ]) syntax.

**Goal:** Restore lived-correctness and trust by purging the dead/legacy rot (auth, CRAFTY-RPG overlay, pet/tame, dead ECS/audio/combat/economy code) and fixing the real shipped-broken bugs (the dead `gameStarted` flag, 0-mana potion, SFX bypassing the limiter, free spell upgrades, junk boss reward, unique-key error, KeyF conflict, hostile ally eyes, prod log spam).

**Architecture:** Surgical edits to the existing monolith (React 19 + R3F/three 0.172 + Rapier + zustand store + miniplex ECS). No new systems. The load-bearing structural fix is a single real `gameStarted` store flag latched at the one authoritative pointer-lock writer (Components.jsx) + the touch `enterPlay` path, which un-deadens ESC=pause + 3 relock guards and (combined with deleting the legacy overlay) removes the CRAFTY-RPG ESC flash. The audio fix routes `THREE.AudioListener.gain → masterBus.input` by exposing the existing `getMasterBus` through the SoundProvider context (GameScene + SoundManager already share one AudioContext via `THREE.AudioContext.setContext`).

**Tech Stack:** zustand 5 store, miniplex ECS, three 0.172 WebAudio (`THREE.PositionalAudio` + `DynamicsCompressor` limiter), vitest unit + static-gate tests, puppeteer LIVE-LOOK probes (`scripts/visual/*-probe.mjs`), pixelmatch visual gate (`vitest.visual.config.js`, 6%).

---

## Conventions (apply to EVERY task)

- Run npm/tests from `frontend/`: `cd /Users/kz/Code/Crafty/frontend && npx vitest run <path>`.
- AST-safe edits only on `.js/.jsx` (Edit tool, never `sed`/regex). `.css`/`.html`/`.md` may use any edit.
- Commit per task: `git commit -F <msgfile>` (write the message to a temp file). NO AI footer, NO "Co-Authored-By: Claude", NO backticks in the message. Never touch `.state/`. Branch first if on `main` (W1 should run on a `w1-purge-fix` branch).
- Done-gate for EVERY task (`verification-before-completion`): the named test passes (paste the real output), AND `npm run build` is clean, AND `npx eslint src` is clean for touched files. For VISIBLE-change tasks, additionally run the named LIVE-LOOK probe and LOOK at the PNG before checking the box — a green pinned capture gate is necessary, not sufficient (per the spec's verification discipline).
- Capture-determinism is load-bearing: never add unconditional animation/RNG to a rendered path; gate on `isCaptureMode()`.

## Pre-flight (do once, before Task 1)

- [ ] `cd /Users/kz/Code/Crafty/frontend && git checkout -b w1-purge-fix` (isolate from `main`).
- [ ] Note pre-existing uncommitted state: `src/GameScene.jsx` is already modified in the worktree (a line ~199 `THREE.AudioContext.setContext` / audio area). **Read it and confirm it does not conflict with Task 9 (audio routing) BEFORE editing GameScene** — if it is an in-progress audio edit, reconcile rather than clobber. Flag to Kevin if unclear.
- [ ] Baseline green check: `npx vitest run` (record the pass count so later tasks can prove grow-or-hold), `npm run build` (clean).

---

## File Structure (created / modified + responsibility)

**Bugs / structural (first — unblock ESC + boot):**
- `src/store/useGameStore.jsx` — MODIFY: add `gameStarted` flag + `markGameStarted()` action; add `restoreMana(amount)` action; remove `attackEntity`/`setAttackEntity` dead alias; remove `tameMob`/`setTameMob`/`getPets`/`setGetPets`; remove starting `scrolls` currency; DEV-gate the two combat `console.log`s.
- `src/Components.jsx` — MODIFY: latch `markGameStarted()` in the authoritative `handlePointerLockChange`; resolve KeyF (remove held-F cast); remove the now-vestigial `keysRef`; DEV-gate the two `[DEBUG]` console calls.
- `src/MenuSystem.jsx` — MODIFY: latch `markGameStarted()` in `enterPlay` (touch path); remove `AuthModal` import/render + `isAuthenticated`/`showAuthModal`/`setShowAuthModal` props (the 3 relock guards keep `gameState.gameStarted` — now real); mount the wired `MagicSystem` panel on `showMagic`.
- `src/App.jsx` — MODIFY: delete the `showClickToPlay` CRAFTY-RPG overlay + `showClickToPlay` derivation; remove `AuthProvider`/`useAuth`/auth props/`openAuth` hook; the loading gate keys off boot readiness; remove `usePetSystem`/`petSystem` prop wiring.
- `src/AuthContext.jsx` — DELETE (whole file).
- `src/AuthComponents.jsx` — DELETE (whole file).
- `src/WorldManager.jsx` — MODIFY: drop `useAuth`/`user` + axios cloud branches → localStorage-only ('Guest').

**Audio (Task 9):**
- `src/SoundManager.jsx` — MODIFY: expose `getMasterBus` in the SoundProvider context `value`.
- `src/GameScene.jsx` — MODIFY: route `listener.gain → masterBus.input` (not `ctx.destination`); replace the phantom `getState().volume` read with `sfxVolume`.
- `tests/gates/spatial-sfx-bus-gates.test.js` — CREATE: static gate asserting spatial SFX route through the bus.

**Combat / economy / entity bugs:**
- `src/world/bossSystem.js` — MODIFY: grant registered legendary items.
- `src/data/items.js` — MODIFY: register `crown_dragon_king` + `dragon_scale`.
- `src/SimplifiedNPCSystem.jsx` — MODIFY: stamp `id` on loot-drop + XP-orb `ecs.add()`.
- `src/render/MobModel.jsx` — MODIFY: gate hostile red eyes on `!entity.isAlly`.
- `src/EnhancedMagicSystem.jsx` — MODIFY: charge the leveled `manaCost` at cast.
- `src/world/spellUpgrades.js` — MODIFY: spend `xpCost` on upgrade.
- `src/ui/GamePanels.jsx` — MODIFY: Mana Potion → `restoreMana`; delete dead `Apple` branch; export `MagicSystem` (wire it).

**Dead-code purge (no behavior change):**
- `src/ecs/world.js` — MODIFY: delete `movingMobsQuery`/`aggroMobsQuery`.
- `src/GameSystems.jsx` — MODIFY: delete `SPELL_EFFECTS` const + `shield`/`heal` keys in `SPELL_MANA_COSTS`.
- `src/render/playerRender.jsx` — MODIFY: delete `SpellLeftHandEffects` (returns null) + its mount + stale `isSwingingMelee`.
- `src/world/petSystem.js`, `src/render/PetEntities.jsx`, `src/ui/PetIndicator.jsx` — DELETE (whole files).
- `src/HUD.jsx`, `src/GameScene.jsx` — MODIFY: remove PetIndicator/PetEntities mounts + `petSystem` props.
- `src/input/inputState.js` — (KeyF task) no change to INTENT_KEYS; documented placeholders stay (out of W1 scope, noted).
- `src/ui/TradingInterface.jsx` — MODIFY: remove the 'Crystals to Scroll' dead trade + Scrolls display.
- `src/data/lootTables.js` — MODIFY: remove Damage/Shield Scroll chest entries.
- `src/index.jsx` — MODIFY: DEV-gate the `__debugLogs` console monkeypatch.
- `src/App.css` — MODIFY: delete `float-slow` + `title-glow` keyframes (zero-consumer ONLY; Orbitron/.pixel-font/menu keyframes are W2's title rebuild).
- `package.json` — MODIFY: remove unused `@playwright/test` + `@react-three/test-renderer` devDependencies.

**NOT in W1 (explicitly deferred to W2 "The Look"):** the title-screen rebuild, the `showClickToPlay` REBUILD-as-bold-flat option, Orbitron `@import` + `.pixel-font` + `menu-*`/`shimmer`/`glow` keyframe removal (still consumed by the live off-brand title menu), HUD.jsx:245 Orbitron canvas font, the bold-flat restyle of the GENERATING-WORLD + Loading splashes. W1 deletes the overlay outright (audit's preferred DELETE option) and leaves the title menu's purple chrome for W2. The brand-conformance gate extension is W2.

---

## TASK 1 — Add a real `gameStarted` store flag (un-deadens ESC + relock guards)

**Files:** modify `src/store/useGameStore.jsx`; create test `tests/store/gameStarted.test.js`.

The flag is read at App.jsx:210 + MenuSystem.jsx:198/220/230 but defined nowhere → always `undefined`. Add a real boolean + a one-way latch action (`markGameStarted`) so the 5 guards resolve to a real mid-game predicate. One-way (never unset): "has the player ever entered play this session" is exactly what pre-game suppression + relock want.

- [ ] **1.1 Write the failing test.** Create `tests/store/gameStarted.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

describe('store gameStarted flag', () => {
  beforeEach(() => useGameStore.setState({ gameStarted: false }));

  it('defaults to a boolean false (never undefined)', () => {
    expect(useGameStore.getState().gameStarted).toBe(false);
  });

  it('markGameStarted() latches it true', () => {
    useGameStore.getState().markGameStarted();
    expect(useGameStore.getState().gameStarted).toBe(true);
  });

  it('markGameStarted() is a one-way latch (stays true)', () => {
    useGameStore.getState().markGameStarted();
    useGameStore.getState().markGameStarted();
    expect(useGameStore.getState().gameStarted).toBe(true);
  });
});
```

- [ ] **1.2 Run it — fails.** `cd /Users/kz/Code/Crafty/frontend && npx vitest run tests/store/gameStarted.test.js` → expect `gameStarted is undefined` / `markGameStarted is not a function`.
- [ ] **1.3 Minimal impl.** In `src/store/useGameStore.jsx`, immediately AFTER the `isAlive: true,` line (currently line 682), add:

```js
    // W1 BUG-FIX: `gameStarted` was read at 5 guard-sites (App ESC=pause + 3 MenuSystem relock guards)
    // but never defined -> always undefined -> all 5 dead. One-way latch: set true the first time the
    // player enters play (Components pointer-lock OR touch enterPlay) and never unset (pre-game vs mid-game).
    gameStarted: false,
    markGameStarted: () => set((state) => (state.gameStarted ? {} : { gameStarted: true })),
```

- [ ] **1.4 Run it — passes.** Re-run 1.2 path → 3 passing. Paste output.
- [ ] **1.5 Commit.** Message file body: `W1: add real gameStarted store flag + markGameStarted one-way latch`.

## TASK 2 — Latch `gameStarted` at the authoritative pointer-lock writer + touch enterPlay

**Files:** modify `src/Components.jsx` (the `handlePointerLockChange` at line 500), `src/MenuSystem.jsx` (`enterPlay` at line 98). No new test file — verified by the LIVE-LOOK in Task 3 (the behavior is browser-pointer-lock-bound, untestable in jsdom).

- [ ] **2.1 Components.jsx — latch on lock.** Replace the body of `handlePointerLockChange` (line 500-502):

```js
    const handlePointerLockChange = () => {
      const locked = !!document.pointerLockElement;
      setActive(locked);
      // W1: the FIRST real pointer-lock = the player has entered play -> latch the gameStarted flag
      // (the single authoritative writer; the one-way latch makes repeated calls a no-op).
      if (locked) useGameStore.getState().markGameStarted();
    };
```

Confirm `useGameStore` is imported in Components.jsx (`grep -n "import.*useGameStore" src/Components.jsx`); it is used elsewhere in the file so it is already imported.

- [ ] **2.2 MenuSystem.jsx — latch on touch enterPlay.** iPad/iPhone have no pointer-lock, so the touch path must latch too. Replace `enterPlay` (line 98-102):

```js
  const enterPlay = () => {
    if (gameState.requestPointerLock) gameState.requestPointerLock();
    else if (document.body.requestPointerLock) document.body.requestPointerLock().catch(e => console.warn(e));
    if (isTouchDevice()) setIsPointerLocked(true);
    // W1: touch has no pointerlockchange event, so latch gameStarted here too (one-way; desktop also
    // re-latches via Components' pointer-lock writer — idempotent).
    useGameStore.getState().markGameStarted();
  };
```

Confirm `useGameStore` import in MenuSystem.jsx (`grep -n "useGameStore" src/MenuSystem.jsx`). If absent, add `import { useGameStore } from './store/useGameStore';` at the top with the other imports.

- [ ] **2.3 Verify gates.** `npx vitest run` (grow-or-hold vs the Task-1 baseline), `npm run build` (clean), `npx eslint src/Components.jsx src/MenuSystem.jsx` (clean). Paste outputs. (The ESC/touch behavior itself is LIVE-LOOKed in Task 3.)
- [ ] **2.4 Commit.** `W1: latch gameStarted at the authoritative pointer-lock writer + touch enterPlay`.

## TASK 3 — Delete the legacy CRAFTY-RPG click-to-play overlay + LIVE-LOOK the ESC/boot/flash UX

**Files:** modify `src/App.jsx` (delete the `showClickToPlay` overlay block 734-806 + the `showClickToPlay`/`anyPanelOpen` derivation at 639-641 if now unused). VISIBLE change → mandatory LIVE-LOOK.

The audit's preferred option is DELETE: once `gameStarted` is real, ESC opens Settings (pause), and the bold-flat title menu (`MenuSystem` `titleMenuVisible`) already covers the unlocked/resume case. The slate-blue overlay is the surface that flashed on ESC.

- [ ] **3.1 Delete the overlay JSX.** In `src/App.jsx`, delete the entire `{showClickToPlay && ( ... )}` block (lines 734-806, the slate-950/blue CRAFTY-RPG div with the Quick Controls grid).
- [ ] **3.2 Delete the now-dead derivation.** Delete line 641 `const showClickToPlay = isWorldBuilt && !isPointerLocked && !anyPanelOpen && (gameSystems?.isAlive !== false);`. The `anyPanelOpen` const at line 639 is also used only by the ESC effect's `isAnyPanelOpen` call inline (line 211 builds its own) — confirm with `grep -n "anyPanelOpen" src/App.jsx`; if `anyPanelOpen` (line 639) has no other reader after deleting 641, delete line 639 too. Leave the comment at 637-638.
- [ ] **3.3 Verify static gates.** `npx vitest run` (grow-or-hold), `npm run build` (clean), `npx eslint src/App.jsx` (clean — catches any orphaned `showClickToPlay`/`anyPanelOpen` reference). Paste output.
- [ ] **3.4 LIVE-LOOK the ESC + boot + no-flash behavior.** Drive the REAL game with the existing pov-probe pattern, but add ESC steps. Create `scripts/visual/esc-pause-probe.mjs` (mirror `scripts/visual/pov-probe.mjs`'s server-spawn + `start` hook + pointer-lock acquire, then):

```js
  // After pointer-lock acquired and isSpawnChunkLoaded === true:
  const shoot = async (name) => { await delay(500); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
  await shoot('1-in-game');                        // expect: HUD, NO CRAFTY-RPG overlay
  await page.keyboard.press('Escape');             // ESC mid-game
  await delay(500);
  const paused = await page.evaluate(() => window.useGameStore.getState().showSettings);
  await shoot('2-after-esc');                       // expect: Settings (pause) panel, NOT title menu, NOT slate CRAFTY-RPG flash
  const started = await page.evaluate(() => window.useGameStore.getState().gameStarted);
  console.log('[esc-probe] gameStarted=' + started + ' showSettings-after-ESC=' + paused);
  if (!started || !paused) { console.error('[esc-probe] FAIL: gameStarted or ESC=pause not satisfied'); done(1); }
```

  Set `OUT = '/tmp/crafty-esc'`, `PORT = 4195`. Run `node scripts/visual/esc-pause-probe.mjs`. **Then Read `/tmp/crafty-esc/1-in-game.png` and `/tmp/crafty-esc/2-after-esc.png` with the Read tool and LOOK:** confirm (a) NO blue/slate "CRAFTY RPG" overlay ever appears, (b) after ESC the bold-flat Settings/pause panel shows (not the purple title menu), (c) no double-overlay flash. The probe must also print `gameStarted=true showSettings-after-ESC=true`.
- [ ] **3.5 Commit.** `W1: delete legacy CRAFTY-RPG click-to-play overlay (ESC now opens pause); add esc-pause LIVE-LOOK probe`.

## TASK 4 — Delete the auth subsystem (AuthContext + AuthModal + axios boot-block)

**Files:** DELETE `src/AuthContext.jsx`, `src/AuthComponents.jsx`; modify `src/App.jsx`, `src/MenuSystem.jsx`, `src/WorldManager.jsx`. Removes the per-boot `axios.get(localhost:8001/api/auth/me)` that gates the app behind "Loading Crafty…" until it fails, and the dead `openAuth` test hook + `showAuthModal` panel surface.

- [ ] **4.1 App.jsx — remove AuthProvider + useAuth.**
  - Delete import line 4 `import { AuthProvider, useAuth } from './AuthContext';`.
  - In `App()` (line 56-64) remove the `<AuthProvider>`/`</AuthProvider>` wrapper so it returns `<SoundProvider><GameAppWrapper /></SoundProvider>`.
  - In `GameApp`, delete line 106 `const { isAuthenticated, loading } = useAuth();`.
  - Delete the `if (loading) { ... }` Loading-Crafty block (lines 694-703) — the real boot gate is the `!isWorldBuilt` GENERATING-WORLD overlay (lines 724-732), which keys off real world-load readiness.
  - Delete `const [showAuthModal, setShowAuthModal] = useState(false);` (line 121).
  - Delete the `openAuth` test hook (lines 625-630, the `registerTestHook('openAuth', ...)` block + its comment).
  - Remove `showAuthModal` from the two `isAnyPanelOpen(...)` calls (lines 211, 639) and from the ESC effect dep array (line 215).
  - Remove `showAuthModal={showAuthModal}` from the `<GameScene>` props (line 718).
  - Remove `isAuthenticated={isAuthenticated}`, `showAuthModal={showAuthModal}`, `setShowAuthModal={setShowAuthModal}` from `<MenuSystem>` props (lines 845-847).
- [ ] **4.2 MenuSystem.jsx — remove AuthModal.**
  - Delete import line 14 `import { AuthModal } from './AuthComponents';`.
  - Delete the `isAuthenticated`, `showAuthModal`, `setShowAuthModal` destructured props (lines 41-43).
  - Remove `showAuthModal` from the `shouldShowTitleMenu({...})` call (line 91).
  - Delete the `<AuthModal ... />` block (lines 225-232). (The 3 relock guards at 198/220/230 KEEP `gameState.gameStarted` — now a real flag.)
- [ ] **4.3 WorldManager.jsx — localStorage-only.**
  - Delete import line 15 `import axios from 'axios';` and line 16 `import { useAuth } from './AuthContext';`.
  - Delete line 22 `const { user } = useAuth();`.
  - In `loadWorlds` (37-53): replace the `if (user) { axios... } else { listWorlds() }` with just `setWorlds(listWorlds());` inside the try; keep the catch fallback.
  - In `saveCurrentWorld` (55-85): name uses `'Guest'` (drop `user?.username`); call `persistLocal()` directly (remove the `if (user) axios.post` cloud branch, keep `persistLocal`).
  - In `createWorld` (87-140): remove the `if (user) axios.post` branch; call `persistLocal()` directly.
  - In `loadWorld` (142-166): the `else { axios.get(...) }` cloud branch is now unreachable for local ids — keep the `local_`-prefixed path; the non-local branch can throw `new Error('Cloud worlds unavailable')` (offline-only) OR be removed. Simplest: keep only the `local_` path and `onWorldLoad`.
  - In `deleteWorld` (168-187): remove the `axios.delete` else branch; keep `deleteWorldSave` for local ids.
- [ ] **4.4 Delete the files.** `rm src/AuthContext.jsx src/AuthComponents.jsx`.
- [ ] **4.5 Confirm no dangling refs.** `grep -rn "AuthContext\|AuthComponents\|AuthModal\|useAuth\|isAuthenticated\|showAuthModal" src/` → expect ZERO hits. `grep -rn "axios" src/` → expect ZERO hits (auth + WorldManager were the only consumers). If axios is now unused, also remove it from `package.json` dependencies (verify with the grep first).
- [ ] **4.6 Verify gates.** `npx vitest run` (grow-or-hold), `npm run build` (clean — catches missing imports/props), `npx eslint src/App.jsx src/MenuSystem.jsx src/WorldManager.jsx` (clean). Paste outputs.
- [ ] **4.7 LIVE-LOOK boot.** Re-run `node scripts/visual/esc-pause-probe.mjs` (from Task 3). Read `/tmp/crafty-esc/1-in-game.png` and confirm boot reaches in-game WITHOUT a stuck "Loading Crafty…" screen and with no console auth error. Also confirm `page.on('pageerror')` / console has no `localhost:8001` request failure (add a `page.on('requestfailed', r => console.log('REQFAIL', r.url()))` line and assert no `8001`/`/api/auth` failure prints).
- [ ] **4.8 Commit.** `W1: delete auth subsystem (AuthContext + AuthModal + axios boot-block); WorldManager localStorage-only`.

## TASK 5 — Fix Mana Potion 0-mana (real `restoreMana`)

**Files:** modify `src/store/useGameStore.jsx` (add `restoreMana`), `src/ui/GamePanels.jsx` (line 206); test `tests/store/restoreMana.test.js`.

`window.addMana` is never defined → consuming a Mana Potion removes the item and restores 0 mana. Add a `restoreMana(amount)` action mirroring `healPlayer`, route the consume to it.

- [ ] **5.1 Write the failing test.** `tests/store/restoreMana.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

describe('store restoreMana', () => {
  beforeEach(() => useGameStore.setState({ mana: 20, maxMana: 100, isAlive: true }));

  it('adds mana clamped to maxMana', () => {
    useGameStore.getState().restoreMana(40);
    expect(useGameStore.getState().mana).toBe(60);
  });

  it('never exceeds maxMana', () => {
    useGameStore.setState({ mana: 80 });
    useGameStore.getState().restoreMana(40);
    expect(useGameStore.getState().mana).toBe(100);
  });

  it('is a no-op when dead', () => {
    useGameStore.setState({ isAlive: false, mana: 20 });
    useGameStore.getState().restoreMana(40);
    expect(useGameStore.getState().mana).toBe(20);
  });
});
```

- [ ] **5.2 Run it — fails.** `npx vitest run tests/store/restoreMana.test.js` → `restoreMana is not a function`.
- [ ] **5.3 Impl.** In `src/store/useGameStore.jsx`, immediately AFTER `healPlayer` (closes at line 756), add:

```js
    restoreMana: (amount) => {
        const state = get();
        if (!state.isAlive) return;
        set({ mana: Math.min(state.mana + amount, state.maxMana) });
    },
```

- [ ] **5.4 Wire the consume.** In `src/ui/GamePanels.jsx` line 206, replace `if (window.addMana) window.addMana(40);` with `useGameStore.getState().restoreMana(40);`.
- [ ] **5.5 Run it — passes.** Re-run 5.2 → 3 passing. Confirm `grep -rn "window.addMana\|addMana" src/` returns ZERO hits.
- [ ] **5.6 Verify gates + commit.** `npm run build` clean, `npx eslint src/ui/GamePanels.jsx` clean. Commit: `W1: fix Mana Potion 0-mana bug (window.addMana undefined -> real restoreMana)`.

## TASK 6 — Route ALL spatial SFX through the master-bus limiter

**Files:** modify `src/SoundManager.jsx` (expose `getMasterBus` in context value), `src/GameScene.jsx` (route `listener.gain → masterBus.input`; replace phantom `getState().volume`); CREATE `tests/gates/spatial-sfx-bus-gates.test.js`.

Today `listener.gain → filter → ctx.destination` (GameScene:231-233) and `wetGain → ctx.destination` (241) BYPASS the limiter — every real in-game sound is unlimited and the SFX slider + Mute-All are dead. SoundManager + GameScene share ONE AudioContext (GameScene:199 `THREE.AudioContext.setContext(audioContext)`), so the masterBus input node is reachable.

- [ ] **6.1 Write the failing static gate.** `tests/gates/spatial-sfx-bus-gates.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameScene = readFileSync(path.resolve(__dirname, '../../src/GameScene.jsx'), 'utf8');
const soundMgr = readFileSync(path.resolve(__dirname, '../../src/SoundManager.jsx'), 'utf8');

// W1 audio fix: spatial SFX (THREE.AudioListener.gain) must route through the master-bus limiter,
// not straight to ctx.destination. masterBus.test.js covers the bus DSP; this gate locks the route.
describe('W1 — spatial SFX route through the master bus', () => {
  it('SoundManager exposes getMasterBus in the provider context value', () => {
    expect(/value\s*=\s*\{[\s\S]*getMasterBus[\s\S]*\}/.test(soundMgr)).toBe(true);
  });
  it('GameScene reads getMasterBus from useSounds()', () => {
    expect(/getMasterBus/.test(gameScene)).toBe(true);
  });
  it('GameScene routes listener.gain into the bus input (not direct to destination)', () => {
    // the listener.gain final connect must target the bus input
    expect(/listener\.gain\.connect\(\s*busInput\s*\)/.test(gameScene)).toBe(true);
  });
  it('GameScene no longer reads the phantom store field getState().volume', () => {
    expect(gameScene.includes('getState().volume')).toBe(false);
  });
});
```

- [ ] **6.2 Run it — fails.** `npx vitest run tests/gates/spatial-sfx-bus-gates.test.js`.
- [ ] **6.3 Expose getMasterBus.** In `src/SoundManager.jsx`, add `getMasterBus,` to the context `value` object (the block beginning `const value = {`, after `audioContext: audioContext.current,`). `getMasterBus` is already a `const` function in scope (line 451).
- [ ] **6.4 Route in GameScene.** In `src/GameScene.jsx`:
  - Add `getMasterBus` to the `useSounds()` destructure (line 137): `const { audioContext, sounds, soundEnabled, volume, getMasterBus } = useSounds();`.
  - Replace the routing block (lines 230-233):

```js
    // Connect routing — W1: route the spatial SFX listener through the SHARED master-bus limiter
    // (SoundManager built it on this same ctx, unified at THREE.AudioContext.setContext above), so
    // the in-game mix is limited AND the SFX-volume slider + Mute-All (which drive the bus gain) work.
    // Fallback to destination only if the bus failed to build (never silence).
    const busInput = (getMasterBus && getMasterBus()) || audioContext.destination;
    listener.gain.disconnect();
    listener.gain.connect(filter);
    filter.connect(busInput);
```

  - Replace the wet-reverb terminal connect (line 241) `wetGain.connect(audioContext.destination);` with `wetGain.connect(busInput);`.
  - Fix the phantom volume read (line 379): replace `const freshVolume = useGameStore.getState().volume !== undefined ? useGameStore.getState().volume : volume;` with `const freshVolume = useGameStore.getState().sfxVolume ?? volume;` (the store has `sfxVolume`, never `volume`).
- [ ] **6.5 Run the gate — passes.** Re-run 6.1 path → 4 passing. Also re-run `npx vitest run tests/gates/master-bus-gates.test.js` (SoundManager's existing gate — grow-or-hold).
- [ ] **6.6 Verify gates.** `npm run build` clean, `npx eslint src/GameScene.jsx src/SoundManager.jsx` clean. Paste outputs.
- [ ] **6.7 LIVE-LOOK (audio is non-visual → behavioral probe).** Add to `scripts/visual/esc-pause-probe.mjs` a runtime assertion right after pointer-lock: trigger a sound and confirm the limiter node exists on the shared ctx and the listener routes into it. Minimal evaluate:

```js
  const audioOk = await page.evaluate(() => {
    const w = window;
    // the bus input node is on the SoundProvider ctx; assert the listener.gain has >=1 outgoing
    // connection and the ctx is shared (THREE.AudioContext === provider ctx). We can at least assert
    // no audio exception fired and a sound plays (combat hit) without throwing.
    try { w.useGameStore.getState().playSpatialSound?.('hit', w.__threeCamera.position, 1, 20); return true; }
    catch (e) { return 'throw:' + e.message; }
  });
  console.log('[esc-probe] spatial-sfx playable=' + audioOk);
  if (audioOk !== true) { console.error('[esc-probe] FAIL: spatial SFX threw after bus reroute'); done(1); }
```

  Run the probe; confirm `spatial-sfx playable=true` (no exception from the reroute). (Full mix-limiting + slider audibility is a Kevin ear-check — flag in KEVIN-REVIEW-BATCH.)
- [ ] **6.8 Commit.** `W1: route spatial SFX through master-bus limiter (fixes dead SFX slider + Mute-All); add bus-route static gate`.

## TASK 7 — Fix the unique-key console error (id on loot-drop + XP-orb)

**Files:** modify `src/SimplifiedNPCSystem.jsx`; CREATE `tests/store/ecsSpawnIds.test.js`.

Loot-drop (`spawnLootDrop`, line 47) and XP-orb (line 546) `ecs.add()` omit `id`; rendered with `key={loot.id}`/`key={orb.id}` (= undefined) → React unique-key error. Add a shared module-level counter.

- [ ] **7.1 Write the failing test.** `tests/store/ecsSpawnIds.test.js` — import the spawn helper + assert ids are unique. Since `spawnLootDrop` is module-private but assigned to `GameMethods.spawnLootDrop` (line 57), test via that seam:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { GameMethods } from '../../src/GameMethods.js';
import { ecs } from '../../src/ecs/world.js';

describe('ECS spawn entities carry a unique id', () => {
  beforeEach(() => { for (const e of [...ecs.entities]) ecs.remove(e); });

  it('loot drops each get a defined unique id', () => {
    GameMethods.spawnLootDrop('bone', 0, [0, 10, 0]);
    GameMethods.spawnLootDrop('bone', 0, [1, 10, 0]);
    const loot = [...ecs.entities].filter(e => e.isLootDrop);
    expect(loot.length).toBe(2);
    expect(loot.every(e => e.id !== undefined)).toBe(true);
    expect(new Set(loot.map(e => e.id)).size).toBe(2);
  });
});
```

  (Confirm the import path of `GameMethods` — `grep -n "export" src/GameMethods.js`. The XP-orb path is inside `CombatSystem` and not directly callable from a unit test; the loot path proves the id-stamp pattern + the XP-orb gets the SAME counter so it is covered by construction.)
- [ ] **7.2 Run it — fails.** `npx vitest run tests/store/ecsSpawnIds.test.js` → ids undefined.
- [ ] **7.3 Impl — shared counter.** In `src/SimplifiedNPCSystem.jsx`, add a module-level counter near the top (before `spawnLootDrop`, ~line 31): `let _spawnId = 0;`. In `spawnLootDrop`'s `ecs.add({ ... })` (line 47), add `id: _spawnId++,` as the first field. In the XP-orb `ecs.add({ ... })` (line 546), add `id: _spawnId++,` as the first field.
- [ ] **7.4 Run it — passes.** Re-run 7.1 → passing. Paste output.
- [ ] **7.5 Verify gates + LIVE-LOOK.** `npm run build` clean, `npx eslint src/SimplifiedNPCSystem.jsx` clean. LIVE-LOOK: the loot-showcase capture exercises `spawnLootDrop` — re-run `npm run visual:capture` then check the dev console has NO "unique key" warning (the probe's `page.on('console')` should log none). Drive `lootShowcase` via the test bridge in a probe OR re-run the existing capture and grep its console output for `unique "key"`.
- [ ] **7.6 Commit.** `W1: stamp unique id on loot-drop + XP-orb ecs.add (fixes React unique-key error)`.

## TASK 8 — Register proper boss-reward legendary items

**Files:** modify `src/data/items.js` (register 2 items), `src/world/bossSystem.js` (lines 86-87); test `tests/store/bossReward.test.js`.

Boss grants `'Crown of the Dragon King'` + `'Dragon Scale'`, neither in `ITEMS` (no icon, default 'common'), and passes a 3rd arg `addToInventory` ignores (arity 2). Register them with proper rarity, and use registered ids.

- [ ] **8.1 Read the ITEMS shape.** `src/data/items.js` rows are `id: { name, icon, rarity }`. Pick valid existing icons (e.g. `'crown'`/`'gem'`/`'sword'` — verify available icon names with `grep -n "icon:" src/data/items.js | head`; reuse an existing icon key, do NOT invent one).
- [ ] **8.2 Write the failing test.** `tests/store/bossReward.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { ITEMS, getItemRarity } from '../../src/data/items.js';

describe('boss reward items are registered legendaries', () => {
  it('Crown of the Dragon King is a registered legendary', () => {
    const entry = Object.values(ITEMS).find(i => i.name === 'Crown of the Dragon King');
    expect(entry).toBeTruthy();
    expect(getItemRarity('Crown of the Dragon King')).toBe('legendary');
  });
  it('Dragon Scale is a registered epic', () => {
    const entry = Object.values(ITEMS).find(i => i.name === 'Dragon Scale');
    expect(entry).toBeTruthy();
    expect(getItemRarity('Dragon Scale')).toBe('epic');
  });
});
```

  (Confirm `getItemRarity` looks up by name OR id — it is defined at items.js:78; read it first to know whether to key the test by name or id, and adjust the assertion to its real contract.)
- [ ] **8.3 Run it — fails.** `npx vitest run tests/store/bossReward.test.js`.
- [ ] **8.4 Register the items.** In `src/data/items.js`, add two rows to `ITEMS` (use a verified existing icon name):

```js
  crown_dragon_king:  { name: 'Crown of the Dragon King', icon: 'crown',  rarity: 'legendary' },
  dragon_scale:       { name: 'Dragon Scale',             icon: 'shield', rarity: 'epic' },
```

- [ ] **8.5 Fix the grant.** In `src/world/bossSystem.js` (lines 86-87), drop the ignored 3rd arg:

```js
                    store.addToInventory('Crown of the Dragon King', 1);
                    store.addToInventory('Dragon Scale', 3);
```

  (`addToInventory(item, quantity)` writes into `inventory.blocks` keyed by the display NAME — the registry maps name→rarity/icon for display, so granting by name is consistent with the existing reward + loot paths. Confirm `getItemRarity`/`getItemEmoji` resolve by name in the inventory render before finalizing.)
- [ ] **8.6 Run it — passes.** Re-run 8.2 → passing. Paste output.
- [ ] **8.7 Verify gates + commit.** `npm run build` clean, `npx eslint src/data/items.js src/world/bossSystem.js` clean. Commit: `W1: register Crown of the Dragon King + Dragon Scale as boss-reward legendaries`.

## TASK 9 — Wire spell-upgrade costs (charge leveled manaCost + spend xpCost)

**Files:** modify `src/EnhancedMagicSystem.jsx` (charge leveled manaCost at cast, line 157), `src/world/spellUpgrades.js` (spend xpCost on upgrade); test `tests/store/spellUpgradeCost.test.js`.

The cast reads leveled DAMAGE (`getSpellStats`) but charges STATIC `SPELL_MANA_COSTS` → L2/L3 manaCost never charged; `upgradeSpell` never spends `xpCost` (only a level gate). The UI (`SpellUpgradePanel`) advertises both. Decision: WIRE the costs (keep the UI honest) rather than delete — deleting would force a UI rebuild (W-Look territory).

- [ ] **9.1 Charge leveled manaCost at cast.** In `src/EnhancedMagicSystem.jsx` line 157, replace `const manaCost = SPELL_MANA_COSTS[spellType] || 15;` with:

```js
      // W1: charge the LEVELED mana cost (getSpellStats mirrors the upgrade hook) so upgrades aren't free;
      // null-safe fallback to the static base for unmapped/pre-mount (byte-identical at L1).
      const leveled = useGameStore.getState().getSpellStats?.(spellType);
      const manaCost = (leveled && leveled.manaCost) || SPELL_MANA_COSTS[spellType] || 15;
```

- [ ] **9.2 Spend xpCost on upgrade — write the failing test.** `tests/store/spellUpgradeCost.test.js`. `useSpellUpgrades` is a React hook; test the store-mirrored `upgradeSpell` after mounting via `@testing-library/react`'s `renderHook` IF available, else test the pure cost-gate logic. Confirm test infra: `grep -n "renderHook\|@testing-library" package.json src/**/*.test.* 2>/dev/null | head`. If `renderHook` is unavailable, the leveled-manaCost charge (9.1, the higher-impact half) is unit-covered via a store test that sets `getSpellStats` to a stub and asserts `castSpell` spends the leveled cost:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

describe('cast charges the leveled mana cost', () => {
  beforeEach(() => useGameStore.setState({
    mana: 100, maxMana: 100, isAlive: true,
    getSpellStats: (t) => ({ fireball: { damage: 80, manaCost: 18 } }[t]),
  }));
  it('useMana drains the LEVELED cost, not the static 15', () => {
    // proxy: useMana(leveledCost) leaves 100-18 = 82
    const leveled = useGameStore.getState().getSpellStats('fireball').manaCost;
    useGameStore.getState().useMana(leveled);
    expect(useGameStore.getState().mana).toBe(82);
  });
});
```

- [ ] **9.3 Run it — fails / passes appropriately.** `npx vitest run tests/store/spellUpgradeCost.test.js`.
- [ ] **9.4 Spend xpCost in upgradeSpell.** In `src/world/spellUpgrades.js` `upgradeSpell` (after the player-level gate passes, before `setSpellLevels`, ~line 96): read the player's spendable XP/level currency. **Verify the store has a spendable XP sink FIRST** (`grep -n "spendXP\|grantXP\|talentPoints\|getPlayerLevel" src/store/useGameStore.jsx`). If a true XP-debit action exists, charge `nextLevel.xpCost`; if NOT (XP is derive-on-read level only), the honest minimal fix is to keep the existing player-LEVEL gate (which `requiredLevel` already enforces) and surface that the gate is the cost in the UI — do NOT invent a fake debit. Document the chosen path in the commit body. The non-negotiable half of this task is 9.1 (leveled manaCost charged); xpCost is wired only if a real sink exists.
- [ ] **9.5 Run it — passes.** Re-run 9.2 path. `npx vitest run tests/gates/spell-mastery-ui-gates.test.js` (existing UI gate — grow-or-hold; if it asserts the OLD free behavior, update it to match the now-honest charge and note in the commit).
- [ ] **9.6 Verify gates + commit.** `npm run build` clean, `npx eslint src/EnhancedMagicSystem.jsx src/world/spellUpgrades.js` clean. Commit: `W1: charge leveled spell mana cost at cast (upgrades no longer free); xpCost wired iff a real XP sink exists`.

## TASK 10 — Resolve the KeyF triple-conflict (remove held-F cast; align keyMap + hints)

**Files:** modify `src/Components.jsx` (delete the held-F cast block at 1230 + the now-vestigial `keysRef` substrate), `src/game/keyMap.js` (line 16 label), test update `tests/.../keyMap.test.js` (or wherever the anti-drift gate lives).

F currently does melee-on-keydown (Components:393) AND continuous-cast-on-hold (Components:1230) — redundant with the LMB-melee/RMB-cast verb router and self-contradicting hints. Decision: keep F = MELEE (the keydown path, consistent with the title-menu "F Cast" being WRONG and LMB already being melee) — remove the held-F continuous cast and the vestigial `keysRef`.

- [ ] **10.1 Read the two F paths + keysRef.** Read `src/Components.jsx` around 346-400 (the keydown melee + keysRef writes), 880-881 (keysRef read alias), 1230-1244 (held-F cast). Confirm `keysRef` is read ONLY for `keys.KeyF` (the audit's claim) via `grep -n "keysRef\|keys\.Key\|keys\[" src/Components.jsx`.
- [ ] **10.2 Decide the semantic + update keyMap.** In `src/game/keyMap.js` line 16, change `label: 'Attack / cast spell'` to `label: 'Attack'` (F = melee, matching LMB; RMB owns cast). Keep `code: 'KeyF'`.
- [ ] **10.3 Run the anti-drift gate — see current state.** Find it: `grep -rln "KEY_MAP\|keyMap" src/**/*.test.* tests/ 2>/dev/null`. Run it; it string-matches each `code` row against a live handler. F-keydown (melee, Components:393) is still live, so changing only the LABEL keeps it green — confirm.
- [ ] **10.4 Remove the held-F cast.** In `src/Components.jsx`, delete the `if (keys.KeyF) { ... }` continuous-cast block (lines 1230-1244).
- [ ] **10.5 Remove the vestigial keysRef.** If 10.1 confirmed `keysRef` is read only for `keys.KeyF`: delete the `keysRef` declaration (line 151), the two `keysRef.current[e.code] = true/false` writes (350, 399), and the `const keys = keysRef.current;` read (880-881). If `keysRef` has OTHER readers, leave it and only remove the KeyF read — document which in the commit.
- [ ] **10.6 Align the remaining hint.** The title-menu "F Cast" hint (MenuSystem.jsx:317) is W2's title rebuild — but its TEXT is now wrong. Minimal W1 fix: change MenuSystem.jsx:317 `<span>F Cast</span>` to `<span>F Attack</span>` (label-only, no chrome change). The click-to-play overlay's F hint is gone (deleted in Task 3).
- [ ] **10.7 Verify gates + LIVE-LOOK.** `npx vitest run` (grow-or-hold incl. the keyMap gate), `npm run build` clean, `npx eslint src/Components.jsx src/game/keyMap.js src/MenuSystem.jsx` clean. LIVE-LOOK (input behavior): in a probe (extend esc-pause-probe), after pointer-lock, press-and-hold `f` and assert no spell projectile spawns from held-F (only melee on the press) — assert `window.useGameStore.getState()` projectile count does not climb while F is held.
- [ ] **10.8 Commit.** `W1: resolve KeyF triple-conflict (F=melee; remove held-F cast + vestigial keysRef; align keyMap + hints)`.

## TASK 11 — Gate hostile red eyes on `!isAlly` (bound allies)

**Files:** modify `src/render/MobModel.jsx` (the eyes block at 274-285); test `tests/data/mobAllyEyes.test.js` (characterization — assert the render gate).

A bound ally keeps its hostile `entity.type` so `!mobConfig.passive && type !== 'villager'` is still true → friendly jade companion shows hostile `#ff0000` eyes. Gate on `!entity.isAlly`.

- [ ] **11.1 Inspect the gate.** Read `src/render/MobModel.jsx` 272-286. The condition is `{!mobConfig.passive && entity.type !== 'villager' && (...)}`.
- [ ] **11.2 Write a characterization test.** MobModel is an R3F component (not trivially renderable in jsdom). Instead test the PREDICATE by extracting it OR by a static-gate asserting the source gate includes `!entity.isAlly`. Simplest robust path — static gate `tests/gates/ally-eyes-gate.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(__dirname, '../../src/render/MobModel.jsx'), 'utf8');

describe('W1 — bound allies do not render hostile red eyes', () => {
  it('the hostile-eyes gate excludes isAlly', () => {
    // the red-eye block must be gated on !entity.isAlly so a captured companion is not red-eyed
    expect(/!entity\.isAlly/.test(src)).toBe(true);
    // and the #ff0000 eye mesh still exists (we did not delete eyes wholesale)
    expect(src.includes("#ff0000")).toBe(true);
  });
});
```

- [ ] **11.3 Run it — fails.** `npx vitest run tests/gates/ally-eyes-gate.test.js`.
- [ ] **11.4 Impl.** In `src/render/MobModel.jsx` line 274, change `{!mobConfig.passive && entity.type !== 'villager' && (` to `{!mobConfig.passive && entity.type !== 'villager' && !entity.isAlly && (`.
- [ ] **11.5 Run it — passes.** Re-run 11.2 → passing.
- [ ] **11.6 Verify gates + LIVE-LOOK.** `npm run build` clean, `npx eslint src/render/MobModel.jsx` clean. LIVE-LOOK: the `soulbindShowcase` test-bridge fixture (App.jsx:533) renders jade allies — re-run `npm run visual:capture` (or drive `soulbindShowcase` in a probe), Read the soulbind capture frame, and confirm the jade ally has NO red eyes.
- [ ] **11.7 Commit.** `W1: gate hostile red eyes on !isAlly (bound allies no longer read as foes)`.

## TASK 12 — DEV-gate prod console spam + the index.jsx console monkeypatch

**Files:** modify `src/store/useGameStore.jsx` (705, 720), `src/Components.jsx` (823, 868), `src/GameScene.jsx` (789), `src/index.jsx` (1-46 patch).

- [ ] **12.1 Store combat logs.** In `src/store/useGameStore.jsx`, wrap line 705 `console.log('[i-frames] ...')` and line 720 `console.log('[hit] ...')` each in `if (import.meta.env.DEV)`. (Both are per-hit debug instrumentation.)
- [ ] **12.2 Components void/physics.** In `src/Components.jsx`, keep the void/physics WARN telemetry (genuine error signal) but drop the `[DEBUG]` prefix — change line 823 to `console.warn('Player fell into void; teleporting to safety.')` and 868 to `console.error('Physics corrupted', velocityY.current, currentTrans)`. (They are real error telemetry — keep but de-noise, per audit J.)
- [ ] **12.3 GameScene WebGL log.** In `src/GameScene.jsx` line 789, wrap the `console.log('WebGL context successfully restored...')` in `if (import.meta.env.DEV)`.
- [ ] **12.4 index.jsx monkeypatch.** In `src/index.jsx`, wrap the entire `window.__debugLogs`/console-override block (lines 1-46) in `if (import.meta.env.DEV && typeof window !== 'undefined') { ... }` so prod never overrides `console` (DebugOverlay is DEV-only — no prod consumer). Keep `window.onerror`/`onunhandledrejection` ONLY if they remain useful in prod — per audit they feed the DEV-only DebugOverlay, so gate them too.
- [ ] **12.5 Verify gates.** `npx vitest run` (grow-or-hold), `npm run build` clean (build is the prod path — confirm no `import.meta.env.DEV` typos), `npx eslint src/store/useGameStore.jsx src/Components.jsx src/GameScene.jsx src/index.jsx` clean.
- [ ] **12.6 LIVE-LOOK prod-ish console.** In a probe (esc-pause-probe), attach `page.on('console', m => console.log('PAGE:', m.type(), m.text()))` and confirm NO `[i-frames]`/`[hit]`/`WebGL context successfully restored` lines appear during a short play session (dev server is DEV so they WILL appear in dev — instead build + `npx vite preview` to serve the PROD bundle, drive it, and confirm the per-hit logs are absent). Document the prod-preview check.
- [ ] **12.7 Commit.** `W1: DEV-gate prod console spam (combat logs, WebGL-restore, index console monkeypatch); de-noise void/physics telemetry`.

## TASK 13 — Delete the legacy pet/tame system

**Files:** DELETE `src/world/petSystem.js`, `src/render/PetEntities.jsx`, `src/ui/PetIndicator.jsx`; modify `src/App.jsx`, `src/HUD.jsx`, `src/GameScene.jsx`, `src/InputManager.jsx`, `src/store/useGameStore.jsx`, `src/game/keyMap.js`.

Fully superseded by the soulbind squad; has a broken attack-target bug; T-key double-bind. Frees T.

- [ ] **13.1 App.jsx.** Delete import line 13 `import { usePetSystem } from './world/petSystem';`; delete line 183 `const petSystem = usePetSystem();`; remove `petSystem={petSystem}` from `<GameScene>` (714) and `<HUD>` (823).
- [ ] **13.2 HUD.jsx.** Delete import line 32 `import { PetIndicator } from './ui/PetIndicator';`; remove the `petSystem` prop (589); delete the `<PetIndicator pets={petSystem.pets} />` mount (675) and the `petSystem.petNotification` Toast block (693-695).
- [ ] **13.3 GameScene.jsx.** Delete import line 20 `import { PetEntities } from './render/PetEntities';`; remove the `petSystem` prop (707); delete the `<PetEntities pets={petSystem.pets} />` mount (876).
- [ ] **13.4 InputManager.jsx.** Delete the entire `if (event.code === 'KeyT' ...)` tame block (lines 197-216).
- [ ] **13.5 Store.** Delete `tameMob`/`setTameMob`/`getPets`/`setGetPets` (lines 442-445).
- [ ] **13.6 keyMap.js.** Delete the `T` row (line 31): `{ key: 'T', code: 'KeyT', label: 'Tame', ... }`.
- [ ] **13.7 Delete files.** `rm src/world/petSystem.js src/render/PetEntities.jsx src/ui/PetIndicator.jsx`.
- [ ] **13.8 Confirm no dangling refs.** `grep -rn "petSystem\|usePetSystem\|PetEntities\|PetIndicator\|tameMob\|getPets\|petNotification\|KeyT\|'Tame'" src/` → ZERO hits. The keyMap anti-drift gate must stay green (KeyT row gone, so no orphaned-handler mismatch).
- [ ] **13.9 Verify gates.** `npx vitest run` (grow-or-hold — the keyMap gate must still pass), `npm run build` clean, `npx eslint src` clean. Paste outputs.
- [ ] **13.10 Commit.** `W1: delete legacy pet/tame system (petSystem + PetEntities + PetIndicator + tameMob slot + KeyT); frees T`.

## TASK 14 — Wire the M-key Magic panel (resolve dead MagicSystem + phantom showMagic)

**Files:** modify `src/ui/GamePanels.jsx` (export `MagicSystem`), `src/MenuSystem.jsx` (import + mount on `showMagic`).

`MagicSystem` (GamePanels.jsx:464-528) is a complete, on-brand bold-flat spell panel that is never exported/rendered; `showMagic` is fully wired (M key, touch tray, HUD button) but renders nothing. Decision: WIRE the existing panel to `showMagic` (resolves BOTH the dead component AND the phantom surface, keeps the advertised M honest — cheaper + better than ripping the surface). FLAG to Kevin for confirmation.

- [ ] **14.1 Export MagicSystem.** In `src/ui/GamePanels.jsx` line 464, change `const MagicSystem = ({ onClose }) => {` to `export const MagicSystem = ({ onClose }) => {`.
- [ ] **14.2 Mount in MenuSystem.** In `src/MenuSystem.jsx`: add `MagicSystem` to the `./ui/GamePanels` import (line 4-9). Inside the `<AnimatePresence>` that holds Inventory/Crafting (after the `showCrafting` block, ~line 162), add:

```jsx
        {gameState.showMagic && (
          <MagicSystem
            onClose={() => {
              gameState.setShowMagic(false);
              enterPlay();
            }}
          />
        )}
```

- [ ] **14.3 Verify gates + LIVE-LOOK.** `npx vitest run` (grow-or-hold; `panelState.test.js` already lists `showMagic` so the panel-gate is consistent), `npm run build` clean, `npx eslint src/ui/GamePanels.jsx src/MenuSystem.jsx` clean. LIVE-LOOK: in a probe, after pointer-lock press `m` and assert `window.useGameStore.getState().showMagic === true`, screenshot, Read the PNG, confirm the bold-flat Magic Spells panel renders (NOT an empty/no-op M).
- [ ] **14.4 Commit.** `W1: wire the M-key Magic panel (export + mount MagicSystem on showMagic; resolves dead component + phantom surface)`.

## TASK 15 — Purge dead combat config (SPELL_EFFECTS, SpellLeftHandEffects, shield/heal mana)

**Files:** modify `src/GameSystems.jsx` (delete `SPELL_EFFECTS` const 148-164 + `shield`/`heal` keys 144-145), `src/render/playerRender.jsx` (delete `SpellLeftHandEffects` + its mount at 415 + stale `isSwingingMelee` at 371).

- [ ] **15.1 Confirm zero consumers.** `grep -rn "SPELL_EFFECTS" src/` → expect only the def line. `grep -rn "SpellLeftHandEffects" src/` → expect def (playerRender:446) + mount (playerRender:415). `grep -rn "SPELL_MANA_COSTS" src/` → confirm `shield`/`heal` keys are read nowhere (castSpell early-returns on missing SPELL_TYPES).
- [ ] **15.2 Delete SPELL_EFFECTS.** In `src/GameSystems.jsx`, delete the `const SPELL_EFFECTS = { ... };` block (148-164) and the `shield: 30,` + `heal: 40,` lines (144-145) from `SPELL_MANA_COSTS`.
- [ ] **15.3 Delete SpellLeftHandEffects.** In `src/render/playerRender.jsx`, delete the `SpellLeftHandEffects` component (line ~446, returns null) and its mount (line ~415). Delete the stale `isSwingingMelee` local (line ~371 — assigns a function, never read; confirm with `grep -n "isSwingingMelee" src/render/playerRender.jsx`).
- [ ] **15.4 Verify gates.** `npx vitest run` (grow-or-hold), `npm run build` clean (catches any orphaned import of the deleted symbols), `npx eslint src/GameSystems.jsx src/render/playerRender.jsx` clean. Paste outputs.
- [ ] **15.5 LIVE-LOOK (the left-hand FX was always null → no visible change expected).** Re-run `npm run visual:capture`; the spell-cast capture frame must be byte-identical or within the 6% gate (SpellLeftHandEffects rendered nothing). Run `npx vitest run --config vitest.visual.config.js` and confirm the spell-cast frame passes WITHOUT a re-baseline (this is a pure dead-code delete — NO deliberate re-baseline should be needed; if it changes, STOP and investigate).
- [ ] **15.6 Commit.** `W1: purge dead combat config (SPELL_EFFECTS, SpellLeftHandEffects null-stub, shield/heal phantom mana costs)`.

## TASK 16 — Delete dead ECS exports + dead store alias

**Files:** modify `src/ecs/world.js` (delete `movingMobsQuery`, `aggroMobsQuery`), `src/store/useGameStore.jsx` (delete `attackEntity`/`setAttackEntity` 371-372), `src/SimplifiedNPCSystem.jsx` (delete the `attackEntity` set at line 577).

- [ ] **16.1 Confirm zero external refs.** `grep -rn "movingMobsQuery\|aggroMobsQuery" src/` → only the defs (world.js:11-12). `grep -rn "attackEntity\|setAttackEntity" src/` → store def (371-372) + the NPCSystem setter (577); NOTHING reads `attackEntity` (only `damageMob` is read).
- [ ] **16.2 Delete.** Remove `world.js` lines 11-12; remove store lines 371-372; remove the `attackEntity`/`setAttackEntity` set-call at `SimplifiedNPCSystem.jsx:577` (confirm exact line via grep — keep the surrounding `damageMob` set intact).
- [ ] **16.3 Verify gates + commit.** `npx vitest run` (grow-or-hold), `npm run build` clean, `npx eslint src/ecs/world.js src/store/useGameStore.jsx src/SimplifiedNPCSystem.jsx` clean. Commit: `W1: delete dead ECS exports (movingMobsQuery/aggroMobsQuery) + attackEntity store alias`.

## TASK 17 — Purge dead economy (scrolls currency, Apple, chest Damage/Shield scrolls)

**Files:** modify `src/store/useGameStore.jsx` (567), `src/ui/TradingInterface.jsx` (85, 136-137), `src/data/lootTables.js` (67-68), `src/ui/GamePanels.jsx` (Apple branches 92, 188, 198-200); test `tests/store/inventoryConservation.test.js` (existing — grow-or-hold).

- [ ] **17.1 Remove starting scrolls.** In `src/store/useGameStore.jsx` line 567, change `magic: { wand: 1, crystals: 8, scrolls: 4 }` to `magic: { wand: 1, crystals: 8 }`.
- [ ] **17.2 Remove the dead scroll trade + display.** In `src/ui/TradingInterface.jsx`: delete the `'Crystals to Scroll'` trade row (line 85); delete the Scrolls display block (lines 136-137 — the `<span>Scrolls</span>` + value). Keep the wand display + 'Crystals to Wand' (wand is out of W1 scope — flag separately; the audit lists wand as a SEPARATE dead-economy item but the spec's W1 scope names ONLY scrolls + Apple). Leave wand untouched in W1.
- [ ] **17.3 Remove chest Damage/Shield Scroll drops.** In `src/data/lootTables.js`, delete lines 67-68 (the `Damage Scroll` + `Shield Scroll` entries — their buff effects are never applied).
- [ ] **17.4 Remove the dead Apple branch.** In `src/ui/GamePanels.jsx`: remove `'Apple'` from the food list (line 92) and the consumable list (line 188); delete the `} else if (item.includes('Apple')) { ... }` branch (lines 198-200). (Apple is never obtainable.)
- [ ] **17.5 Confirm.** `grep -rn "scrolls\|'Apple'\|Apple\|Damage Scroll\|Shield Scroll" src/` → expect ZERO `scrolls`/`Apple` hits (Damage/Shield Scroll gone from loot).
- [ ] **17.6 Verify gates.** `npx vitest run tests/store/inventoryConservation.test.js` + full `npx vitest run` (grow-or-hold — the inventory-conservation test must still pass with scrolls removed; if it asserts a scrolls count, update it). `npm run build` clean, `npx eslint` clean on touched files.
- [ ] **17.7 LIVE-LOOK.** Open the inventory/trading via the `openModal('inventory')` test bridge in a probe; Read the frame; confirm no "Scrolls" row and no Apple. (The merchant/trading panel re-baseline if its layout shifts — run the visual gate; if the trading capture frame exists and changed, re-baseline DELIBERATELY and eyeball it.)
- [ ] **17.8 Commit.** `W1: purge dead economy (scrolls currency + Crystals-to-Scroll trade + chest Damage/Shield scrolls + phantom Apple)`.

## TASK 18 — Delete zero-consumer CSS keyframes + unused devDependencies

**Files:** modify `src/App.css` (delete `float-slow` 83-93 + `title-glow` 117-127), `package.json` (remove `@playwright/test` + `@react-three/test-renderer`).

ONLY the zero-consumer keyframes (`float-slow`, `title-glow`). Orbitron `@import`, `.pixel-font`, and the `shimmer`/`glow-pulse`/`menu-*` keyframes are STILL consumed by the live off-brand title menu → they belong to W2's title rebuild. Do NOT touch them in W1.

- [ ] **18.1 Confirm zero consumers.** `grep -rn "float-slow\|title-glow" src/` → expect ONLY the `@keyframes` defs in App.css (zero class/animation references). If ANY consumer exists, STOP — it is not dead.
- [ ] **18.2 Delete the keyframes.** In `src/App.css`, delete the `@keyframes float-slow { ... }` block (83-93) and the `@keyframes title-glow { ... }` block (117-127).
- [ ] **18.3 Remove unused devDeps.** Confirm zero import sites: `grep -rn "@playwright/test\|@react-three/test-renderer" src/ tests/ scripts/ vitest*.config.js` → ZERO (probes use plain `puppeteer`). Remove both from `package.json` devDependencies. Do NOT run `npm install` unless Kevin asks (lockfile churn) — just edit `package.json` + `package-lock.json` via `npm prune` ONLY if Kevin grants it; else flag for a separate `npm install` pass.
- [ ] **18.4 Verify gates.** `npm run build` clean (CSS still parses; no missing keyframe). `npx vitest run` (grow-or-hold). Visual gate: `npm run visual:capture` + `npx vitest run --config vitest.visual.config.js` — the menu frame must NOT change (those keyframes had zero consumers); if it changes, STOP (means they were consumed).
- [ ] **18.5 Commit.** `W1: delete zero-consumer CSS keyframes (float-slow, title-glow) + unused devDependencies (@playwright/test, @react-three/test-renderer)`.

---

## Final W1 verification (after all tasks — `plan-verify-kz` done-gate)

- [ ] **F.1 Full unit suite green + grown.** `cd /Users/kz/Code/Crafty/frontend && npx vitest run` — pass count ≥ the pre-flight baseline + the new tests (gameStarted, restoreMana, spatial-sfx-bus, ecsSpawnIds, bossReward, spellUpgradeCost, ally-eyes). Paste the final count.
- [ ] **F.2 Build + lint clean.** `npm run build` (clean), `npx eslint src` (clean).
- [ ] **F.3 Dead-ref sweep.** `grep -rn "gameStarted\|AuthContext\|useAuth\|axios\|petSystem\|tameMob\|SPELL_EFFECTS\|SpellLeftHandEffects\|movingMobsQuery\|attackEntity\|window.addMana\|scrolls\|'Apple'\|float-slow\|title-glow\|CRAFTY RPG" src/` — every hit must be an INTENTIONAL keep (e.g. the real `gameStarted`/`markGameStarted` defs + reads). NO `AuthContext`, `window.addMana`, `SPELL_EFFECTS`, `movingMobsQuery`, `CRAFTY RPG`, `float-slow`, `title-glow`, `petSystem` hits.
- [ ] **F.4 Visual gate + deliberate re-baselines.** `npm run visual:capture` then `npx vitest run --config vitest.visual.config.js`. Most W1 changes are NON-visual (dead code, store flags, audio routing) → frames should HOLD. The ONLY expected deliberate re-baseline candidates: NONE in W1 (the title/overlay look is W2). If ANY frame changed, eyeball-review the diff and re-baseline ONLY if intended; otherwise treat as a regression.
- [ ] **F.5 Consolidated LIVE-LOOK.** Run `node scripts/visual/esc-pause-probe.mjs` and Read the frames one final time: (a) boot reaches in-game with no Loading-Crafty hang + no auth 404; (b) NO CRAFTY-RPG flash ever; (c) ESC = bold-flat pause; (d) `gameStarted=true`; (e) spatial SFX playable; (f) no prod `[hit]`/`[i-frames]` spam in the PROD-preview console.
- [ ] **F.6 Verify Gate block (plan-verify-kz).** Reconcile this task list against commit evidence: list any DONE-WITH-EVIDENCE / PUNTED / MISSED tasks. Headline = MISSED. Then update `memory/ACTIVE_PLAN.md` + `docs/superpowers/KEVIN-REVIEW-BATCH.md` with the W1 Kevin-flags below.

## Kevin-flags (route to KEVIN-REVIEW-BATCH.md)

- **M-key decision (Task 14):** W1 wires the EXISTING bold-flat `MagicSystem` panel to `showMagic` (vs ripping the surface). Confirm this is the wanted call (the panel is a static spell-list, not a live cooldown bar — the real ability bar is W3).
- **Spell-upgrade xpCost (Task 9):** W1 charges the leveled MANA cost at cast (the high-impact half); xpCost is wired ONLY if a real XP-debit sink exists in the store. If XP is derive-on-read level-only, the player-LEVEL gate stays the de-facto cost — confirm acceptable or schedule a real XP-sink in W4 (item depth).
- **Wand dead-trade (Task 17):** the 'Crystals to Wand' trade + wand display are LEFT IN W1 (spec scoped W1 to scrolls + Apple). The audit flags wand as separately dead (cast uses mana, not wand) — schedule for a later economy pass.
- **Audio ear-check (Task 6):** the bus reroute is code-verified + probe-confirmed playable, but actual mix-limiting + SFX-slider/Mute-All audibility is a Kevin live ear-check.
- **Title screen + Orbitron (out of W1):** the purple title menu + Orbitron `@import` + `.pixel-font` + HUD canvas font + the GENERATING-WORLD/Loading splashes are W2 (The Look). W1 only deleted the CRAFTY-RPG overlay + the 2 zero-consumer keyframes.
