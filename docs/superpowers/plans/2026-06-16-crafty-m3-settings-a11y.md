# M3 — Settings / Accessibility (#3) + Touch Dodge (#6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Bring the game to the 2026 accessibility floor — surface the M1 feedback-intensity dial to the player, respect `prefers-reduced-motion`, add audio mute/volume, and give touch players a reachable dodge.

**Architecture:** Almost entirely *wiring into existing surfaces* (verified live, Phase-B): the `SettingsPanel` already exists on Panel/Button + tokens (`ui/GamePanels.jsx:636`) with a Look-Sensitivity slider that is the exact pattern to mirror; the M1 `juiceIntensity` store dial already scales shake + hitstop but has no UI driver; dodge already exists (`game/dodge.js`, Shift-triggered at `Components.jsx:357`) — touch just needs a button. New work is one pure reduced-motion mapping + small UI additions.

**Tech Stack:** React 19, zustand, Tailwind (tokens), framer-motion, vitest. JS/JSX.

**Locks honored:** bold-flat (SettingsPanel is already on Panel/Button primitives + theme tokens). No new visual language.

**Capture-determinism:** the Settings panel + touch dodge never appear in the 20 capture states (capture is a fresh, settings-closed, desktop session). Reduced-motion driving `juiceIntensity` only affects runtime shake/hitstop, which are already capture-suppressed. → gate holds 20/20; a moved frame = a leak to fix.

**Grounded live facts (Phase-B verified 2026-06-16):**
- `SettingsPanel` (`ui/GamePanels.jsx:636`, `React.memo`, `const gameState = useGameStore()`) renders a Look-Sensitivity slider (673-687): `<Panel variant="inset" className="bg-slot p-3">` + a label row + an `<input type="range" className="w-full accent-[rgb(var(--ui-accent))]">` bound to `gameState.lookSensitivity` / `setLookSensitivity`. **This is the template** for the new sliders.
- Store: `juiceIntensity: 1` + `setJuiceIntensity: (v) => set({ juiceIntensity: clamp01(v) })` (`useGameStore.jsx:289`); consumed by `Components.jsx:1164` (shake) + `SimplifiedNPCSystem.jsx:472` (hitstop). No UI drives it yet.
- Dodge: `game/dodge.js` (`dodgeDirection`/`dodgeSpeed`/`isDodgeInvincible`); `Components.jsx:357` maps `ShiftLeft/Right` → `setIntent('dodge', true)`; the dodge state-machine consumes `input.dodge` (Components:887). Touch (`ui/TouchControlsSurface.jsx`) has jump/primary/cast/pause buttons but **no dodge**.
- No game setting persists to `localStorage` today (only `crafty_onboarded`). So slice 1 matches the existing non-persisted pattern; cross-cutting settings-persistence is out of scope (note it, don't add a one-off).
- Labels in SettingsPanel are raw strings (e.g. "Look Sensitivity", not `t()`'d) → new labels use raw strings too (no i18n scope-creep).

---

## Slice 1 (Commit) — Feedback-intensity slider (surface the M1 dial)

**Files:** `frontend/src/ui/GamePanels.jsx` (add a slider to SettingsPanel), gate test.

- [ ] **Step 1: add the slider** after the Look-Sensitivity Panel block (~687), mirroring it exactly:

```jsx
                    {/* Feedback Intensity (M3 #3: the M1 juiceIntensity dial -- screenshake + hitstop strength;
                        0 = calm/reduced-motion, 1 = full punch). */}
                    <Panel variant="inset" className="bg-slot p-3">
                        <div className="flex justify-between items-center mb-2">
                            <span className="font-display text-xs font-bold tracking-[2px] uppercase text-text-muted">Feedback Intensity</span>
                            <span className="font-display font-bold text-accent tabular-nums text-lg">{Math.round((gameState.juiceIntensity ?? 1) * 100)}%</span>
                        </div>
                        <input
                            type="range" min="0" max="1" step="0.05"
                            value={gameState.juiceIntensity ?? 1}
                            onChange={(e) => gameState.setJuiceIntensity(parseFloat(e.target.value))}
                            className="w-full accent-[rgb(var(--ui-accent))]"
                            aria-label="Feedback intensity (screenshake and hitstop)"
                        />
                    </Panel>
```

- [ ] **Step 2: source-gate** — `tests/gates/settings-a11y-gates.test.js`: assert SettingsPanel has a Feedback-Intensity slider bound to `gameState.juiceIntensity` + `setJuiceIntensity`.
- [ ] **Step 3: verify** — `npx vitest run` (grows) · `npm run build` · eslint · `npm run visual:capture` THEN gate 20/20 (panel not in capture). **LIVE LOOK**: a settings-probe (`scripts/visual/settings-probe.mjs`) that forces `useGameStore.setState({ showSettings: true })` after `start` + screenshots → eyeball the new slider. Commit.

## Slice 2 (Commit) — Reduced-motion respect (the real a11y win)

**Files:** new `frontend/src/game/a11y.js` (pure `motionIntensity(prefersReduced, userScale)`), a mount-time hook (App or a small component) listening to `matchMedia('(prefers-reduced-motion: reduce)')` → `setJuiceIntensity(0)`, gate test. TDD the pure mapping (reduced → 0; else → the user's chosen scale). Capture-safe.

## Slice 3 (Commit) — Audio mute + volume

**Files:** GROUND the audio store/bus first (`SoundManager` + `audio/masterBus.js` master gain; `ui/MusicPlayer.jsx` `<audio>.volume`). Add a master-mute Button + SFX/music sliders to SettingsPanel wired to the bus gain + music element volume. TDD any pure gain mapping. Capture-safe (no audio in capture).

## Slice 4 (Commit) — Touch dodge

**Files:** `ui/TouchControlsSurface.jsx` (+ the live touch-input bridge). Add a dodge button (mobile-only) that drives the same `setIntent('dodge', true)` the Shift key uses. TDD any pure cooldown gate. LIVE LOOK via `scripts/visual/touch-probe.mjs` (iPhone viewport). Surface dodge-button placement/feel → Kevin #50.

---

## Self-Review
- **Spec coverage:** S1 feedback-intensity (#3), S2 reduced-motion (#3), S3 audio (#3), S4 touch dodge (#6) — covers audit theme-4's called-out gaps. Colorblind/text-scale/remap are deeper a11y → note as future (don't over-build M3).
- **Type consistency:** slider binds `gameState.juiceIntensity` ∈ [0,1] / `setJuiceIntensity` (clamped in-store). `motionIntensity(prefersReduced:bool, userScale:number)→number`.
- **Reuse:** mirrors the Look-Sensitivity slider; reuses the M1 dial + existing dodge; LOOK via the death-probe's force-state pattern.
- **Anti-tunneling:** 4 commits, each ≤1-2 systems.
