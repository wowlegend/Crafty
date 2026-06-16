# Spawn-Direction Cue (persistent ObjectiveTracker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Fix Kevin's #1 complaint — "I spawn and see no guide/direction; where do I go?" — with a PERSISTENT, always-on, facing-independent objective cue that names the current goal and points to it with a rotating arrow + live distance.

**Root cause (verified by the `crafty-spawn-direction-diagnosis` workflow + inline reads):** a returning player has NO persistent directional guide on spawn. The goal toast is `localStorage`-once (`crafty_onboarded`, App.jsx:131) -> dead for returning players; the Compass SHRINE/BLIGHT markers are FOV-gated (`inView = |diff| < fov/2`, fov=PI) -> vanish when you face away, no off-screen arrow; the QuestTracker text has no bearing/distance + collapses on touch; the Minimap is desktop-only + plots only mobs. Nearest shrine is ~97m (world ~40,-88), beyond the ~64-block render so not visible at spawn.

**Architecture:** a new capture-suppressed `<ObjectiveTracker/>` memo in HUD.jsx, mounted right after `<Compass/>`. Copies the Compass rAF + ref/DOM-write pattern (Game-Loop-Isolation: transient `getState()` reads, no per-frame React state). KEY difference vs Compass: calls `bearingToMarker(..., Math.PI*2)` so the marker is ALWAYS in view (facing-independent) and a pure `bearingDeg(pct)` helper converts the bearing to a CSS `rotate()` for the arrow. Objective switches shrine -> Blight Heart via a `shrineReached` store flag.

---

## Slice 1 — pure bearing-to-rotation helper (TDD)
**Files:** Modify `src/game/compass.js`; Test `src/game/compass.test.js` (or extend existing)
- [ ] Add `export function bearingDeg(pct)` -> `((pct - 50) / 50) * 180`. With `bearingToMarker` called at `fov=Math.PI*2`, `pct` maps the normalized heading-relative bearing [-PI,PI] to [0,100] (50 = dead-ahead); `bearingDeg` converts to degrees [-180,180] for a CSS-rotated arrow that points to the target regardless of facing.
- [ ] Unit: `bearingDeg(50)===0`, `bearingDeg(0)===-180`, `bearingDeg(100)===180`, `bearingDeg(75)===90`.

## Slice 2 — `shrineReached` objective signal (store flag)
**Files:** Modify `src/QuestSystem.jsx`
- [ ] In the reach_shrine poll, right after `reachedShrines.current.add(key);` (QuestSystem.jsx:214), add `useGameStore.setState({ shrineReached: true });` so the cue can switch shrine->Blight-Heart via a transient `.getState()` read. Undefined defaults to falsy = shrine objective (no store default needed). Existing pilgrim/quest gates stay green.

## Slice 3 — the ObjectiveTracker HUD component + mount + source-gate
**Files:** Modify `src/HUD.jsx`; Test `tests/gates/objective-tracker-gates.test.js`
- [ ] Source-gate (RED first): assert (1) `const ObjectiveTracker` exists; (2) the block has `if (isCaptureMode()) return null;` BEFORE any `nearestLandmark(`/`blightHeartSite(` (capture guard precedes the scan -> never leaks into baselines); (3) `<ObjectiveTracker` is mounted after the `<Compass` mount; (4) the block does NOT contain `localStorage`/`crafty_onboarded` (persistent, not once-ever); (5) the block uses `Math.PI * 2` (full-circle, facing-independent — distinct from the FOV=PI compass).
- [ ] Implement `const ObjectiveTracker = React.memo(() => {...})`: top-level `if (isCaptureMode()) return null;`; refs for arrow/text/dist; a `useEffect` rAF doing transient `getState()` reads (camera heading via `fx=-el[8]; fz=-el[10]; heading=atan2(fx,-fz)` — copied from Compass), a ~750ms `nearestLandmark` cache, objective = shrine (cyan #46E0FF) unless `getState().shrineReached` -> Blight Heart (violet #A24BFF via `blightHeartSite()`); `bearingToMarker(target,...,Math.PI*2)`; write `arrow.style.transform=rotate(bearingDeg(pct)deg)` + `arrow.style.background=color` + `text.textContent=label` + `dist.textContent=Math.round(dist)+'m'`. Arrow = a CSS triangle (`clip-path:polygon(50% 0,100% 100%,0 100%)`) NOT a glyph (zero-emoji gate). Bold-flat: `bg-panel-raise` + `border-chrome border-ink`, `text-text`/`text-text-muted`, `tabular-nums`, `whitespace-nowrap`. Mount `<ObjectiveTracker />` between `<Compass/>` (HUD.jsx:479) and `<CoinReadout/>`, placed `absolute top-12 left-1/2 -translate-x-1/2 z-20 pointer-events-none`.

## VERIFY + PERSIST
- [ ] `npx vitest run` grows (Slice1 unit + Slice3 gate) · `npm run build` clean · eslint clean.
- [ ] `npm run visual:capture` THEN the visual gate -> stays green with NO re-baseline (capture-suppressed). If a frame drifts, the guard leaked -> fix, don't re-bless.
- [ ] Commit (-F) + push + CHANGELOG + ACTIVE_PLAN + KEVIN-REVIEW #49 (the persistent spawn-direction cue: playtest wording/placement (top-center under compass may sit near the Spell panel) + reminder the deployed build must be the latest).

## Notes / Self-Review
- **Facing-independent** is the load-bearing fix: fov=2PI removes the FOV-gating that hid the compass markers, so the arrow always points to the objective.
- **Capture-safe:** top-level null-return in capture; the gate asserts guard-before-scan; the visual gate verifies zero baseline drift.
- **No new deps; no glyph (CSS-triangle arrow); Game-Loop-Isolation (rAF + DOM writes, no per-frame React state).**
- Placement (top-center) is the one taste item -> surface to Kevin (#49).
