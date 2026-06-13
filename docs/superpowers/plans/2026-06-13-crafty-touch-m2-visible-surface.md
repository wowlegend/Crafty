# Touch Input M2 — Visible surface + `mobile.png` fixture Implementation Plan

> **✅ M2a SHIPPED (loop iter 137, 2026-06-13).** The visible S1-C touch surface + the `mobile.png`
> baseline (18/18). Built per this plan with deviations recorded honestly: the 2-tone game-icons don't
> tint (`color` ignored) → switched to **lucide** chrome icons (gold via currentColor); the icons/buttons
> needed a **near-black fill** to pop off the navy HUD; and the real blocker was a HUD-LAYOUT collision
> (minimap/XP-bar/cheatsheet/tool-column) → **hidden on touch via `isTouchUIMode`** (not repositioned —
> that's M2b/M3). `showTouch` capture-opt-in works (the bridge forwards it). Commits
> `63709e5`/`5aa7107`/`d9ee9f9`/`a176eba`/`0e65f66`. **M2b queued** (focus-model `resumeControl()` +
> Settings sensitivity + visible pause overlay + gate `<PointerLockControls>` on `!isTouchDevice()` +
> joystick-ring crispness); **M3** = the panel-access tray + analog channel + touch-repositioning the
> M2a-hidden HUD. The Tasks below were the M2a contract.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the M1 touch overlay a VISIBLE, S1-C-styled surface — a resting joystick base (left), a context-routed primary + cast button cluster + jump (bottom-right thumb arc), a center crosshair, and a Pause affordance — and capture it as a NEW deterministic visual baseline (`mobile.png`), the first frame that renders the overlay. Desktop + the 17 existing baselines stay byte-identical.

**Architecture:** The render splits into a PRESENTATIONAL `<TouchControlsSurface>` (pure: joystick base ring + button cluster + crosshair + pause, no listeners/state, S1-C tokens + `<Icon>` glyphs) shared by BOTH paths, so the capture baseline shows exactly what a player sees. `TouchControls` becomes a 3-way guard: under `isCaptureMode()` render the static surface ONLY if `getCaptureOpts().showTouch` (the new opt-in the `mobile` fixture sets) else null; in normal mode render the live overlay only when `isTouchDevice()` else null. The live overlay = `<TouchControlsSurface>` + the M1 touch listeners + a dynamic joystick nub that follows the active touch. This decouples the baseline from puppeteer touch-emulation quirks (the `showTouch` flag forces a static, frozen render).

**Tech Stack:** React 19, S1-C primitives (`src/ui/primitives/`: `Icon`, tokens via `--ui-*` cssVars), the capture-determinism layer (`src/devtest/captureMode.js`), the puppeteer visual harness (`scripts/visual/capture.mjs` + `tests/visual/diff.test.js`).

**Spec of record:** `docs/superpowers/specs/2026-06-13-crafty-touch-input-design.md` (§1 dual-zone + the 5 layout zones, §3 trap-1 capture-safety, §4 iOS `100dvh`/safe-area, §6 M2 row). M1 (`TouchControls.jsx` + `touchHandlers.js` + `touchMath.js` + `touchDevice.js`) is SHIPPED.

> **Scope (M2a = this plan):** the visible surface + the `mobile.png` baseline. **Deferred to M2b** (separate plan): the `resumeControl()` relock-site refactor (~15 sites so panel-close/respawn re-set `active` directly instead of relying on Tap-to-Play), a Settings touch-sensitivity slider + invert-Y, gating `<PointerLockControls>` on `!isTouchDevice()`, and a visible pause MENU (M2a's Pause button works — sets `setActive(false)` — but M2b gives it a styled overlay). Reference-lock: the S1-C bold-flat language (filled game-icons for game actions, the navy/gold token ladder) IS the locked reference — no new look invented.

---

### Task 1: the `showTouch` capture opt-in

**Files:**
- Modify: `frontend/src/devtest/captureMode.js`
- Test: `frontend/src/devtest/captureMode.test.js` (create if absent; else append)

- [ ] **Step 1: Write the failing test**

```js
// in frontend/src/devtest/captureMode.test.js
import { describe, it, expect, afterEach } from 'vitest';
import { enterCaptureMode, exitCaptureMode, getCaptureOpts, isCaptureMode } from './captureMode.js';

describe('captureMode showTouch opt-in', () => {
  afterEach(() => exitCaptureMode());

  it('defaults showTouch falsy (the 17 baselines never render the touch overlay)', () => {
    enterCaptureMode({});
    expect(!!getCaptureOpts().showTouch).toBe(false);
  });

  it('enterCaptureMode({showTouch:true}) sets the flag (the mobile fixture opts in)', () => {
    enterCaptureMode({ showTouch: true });
    expect(getCaptureOpts().showTouch).toBe(true);
    expect(isCaptureMode()).toBe(true);
  });

  it('camera opts still merge alongside showTouch (no regression)', () => {
    enterCaptureMode({ showTouch: true, camera: { position: [1, 2, 3] } });
    expect(getCaptureOpts().camera.position).toEqual([1, 2, 3]);
    expect(getCaptureOpts().showTouch).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `frontend/`): `npx vitest run src/devtest/captureMode.test.js`
Expected: FAIL — `showTouch` is undefined / not merged.

- [ ] **Step 3: Implement** — in `enterCaptureMode`, merge `showTouch`:

```js
export function enterCaptureMode(opts = {}) {
  _captureMode = true;
  if (opts.camera) _opts = { ..._opts, camera: { ..._opts.camera, ...opts.camera } };
  if ('showTouch' in opts) _opts = { ..._opts, showTouch: !!opts.showTouch };
  return _opts;
}
```
And ensure `exitCaptureMode()` resets it (so a showTouch fixture doesn't leak into later frames):
```js
export function exitCaptureMode() {
  _captureMode = false;
  _opts = { ..._opts, showTouch: false };
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run src/devtest/captureMode.test.js` → PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add frontend/src/devtest/captureMode.js frontend/src/devtest/captureMode.test.js
git commit -m "feat(touch-m2): captureMode showTouch opt-in (lets the mobile fixture render the overlay deterministically)"
```

---

### Task 2: `<TouchControlsSurface>` (presentational) + the 3-way TouchControls guard

**Files:**
- Create: `frontend/src/ui/TouchControlsSurface.jsx`
- Modify: `frontend/src/ui/TouchControls.jsx`

- [ ] **Step 1: Write the presentational surface** (pure — no listeners, no state; props drive it). Uses `position:fixed` + `100dvh` + `env(safe-area-inset-*)`; S1-C tokens via inline `--ui-*` (read the existing primitives for the exact var names at build — `Panel.jsx`/`Button.jsx` show the pattern; e.g. `var(--ui-panel)`, `var(--ui-ink)`, `var(--ui-accent)`).

```jsx
// frontend/src/ui/TouchControlsSurface.jsx
import { Icon } from './primitives';

const BTN = (extra) => ({
  position: 'absolute', display: 'grid', placeItems: 'center',
  borderRadius: '50%', border: '3px solid var(--ui-ink, #0C1322)',
  background: 'var(--ui-panel, #1A2540)', color: 'var(--ui-accent, #C9A86A)',
  opacity: 0.82, pointerEvents: 'none', ...extra,
});

/**
 * Pure visual surface for the touch overlay (M2). Renders the resting joystick base ring,
 * the bottom-right thumb cluster (jump / primary / cast), a center crosshair, and a Pause
 * affordance. NO listeners, NO state -- the live overlay layers interactivity on top, and the
 * capture-view renders this alone for the mobile.png baseline. nub = optional {x,y} px offset
 * for the dynamic joystick knob (live path passes it; capture-view omits it -> resting).
 */
export default function TouchControlsSurface({ nub = null }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* center crosshair */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 22, height: 22,
                    transform: 'translate(-50%,-50%)', borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.7)', boxShadow: '0 0 0 1px rgba(0,0,0,0.5)' }} />
      {/* resting joystick base ring (left thumb) */}
      <div style={{ position: 'absolute', left: 'max(env(safe-area-inset-left,0px), 6%)', bottom: '14%',
                    width: 132, height: 132, borderRadius: '50%',
                    border: '3px solid var(--ui-ink, #0C1322)', background: 'rgba(26,37,64,0.45)' }}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 56, height: 56,
                      transform: `translate(calc(-50% + ${nub?.x ?? 0}px), calc(-50% + ${nub?.y ?? 0}px))`,
                      borderRadius: '50%', background: 'var(--ui-accent, #C9A86A)', opacity: 0.85,
                      border: '3px solid var(--ui-ink, #0C1322)' }} />
      </div>
      {/* bottom-right thumb cluster */}
      <div style={BTN({ right: 'calc(env(safe-area-inset-right,0px) + 26px)', bottom: '11%', width: 84, height: 84 })}>
        <Icon name="sword" size={38} />
      </div>
      <div style={BTN({ right: 'calc(env(safe-area-inset-right,0px) + 124px)', bottom: '9%', width: 64, height: 64 })}>
        <Icon name="magic" size={28} />
      </div>
      <div style={BTN({ right: 'calc(env(safe-area-inset-right,0px) + 40px)', bottom: 'calc(11% + 96px)', width: 60, height: 60 })}>
        <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>^</span>
      </div>
      {/* Pause (top-right, inside the notch inset) */}
      <div style={BTN({ top: 'calc(env(safe-area-inset-top,0px) + 8px)', right: 8, width: 44, height: 44, opacity: 0.7 })}>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>II</span>
      </div>
    </div>
  );
}
```
> Build note: confirm the real `--ui-*` var names from `src/theme/cssVars.js` (the fallbacks above are the tokens.js values, so it renders correctly even if a var name differs). Pick the jump glyph: the `^`/`II` placeholders above are deliberate ASCII so the zero-emoji + arrow gates pass; if a cleaner glyph is wanted, use a lucide chrome icon via `<Icon name="up" />` (maps to the `upgrade` game-icon) — decide at build by eyeballing `mobile.png`.

- [ ] **Step 2: Restructure `TouchControls.jsx`** to the 3-way guard + render the surface. Replace the outer component + add a capture-view; the live component keeps ALL M1 listener logic and now renders `<TouchControlsSurface nub={nubRef}/>` plus the existing transparent zone/buttons (the transparent `data-touch-btn` hit-areas stay as the ACTUAL touch targets, layered over the visual surface which is `pointerEvents:none`).

```jsx
// new outer guard (replaces the current default export)
export default function TouchControls({ isWorldBuilt }) {
  if (isCaptureMode()) {
    return getCaptureOpts().showTouch ? <TouchControlsSurface /> : null; // static frozen baseline
  }
  if (!isTouchDevice()) return null;
  return <TouchControlsLive isWorldBuilt={isWorldBuilt} />;
}
```
Add imports: `import { getCaptureOpts } from '../devtest/captureMode';` and `import TouchControlsSurface from './TouchControlsSurface';`. In `TouchControlsLive`, render `<TouchControlsSurface />` as the first child of the root div (visual, pointer-events:none), keeping the existing transparent `data-touch-btn` buttons (the real targets) after it. (M2a keeps the nub resting; wiring the dynamic nub offset into the surface is a small follow-up — the live joystick already works via touchHandlers; the visible nub-follow is optional polish, fine to leave resting in M2a.)

- [ ] **Step 3: Verify desktop + capture-default unchanged** — `npx vitest run` (count grows), `npm run build` clean, `npx vitest run --config vitest.visual.config.js` → **17/17 byte-identical** (showTouch defaults false → capture still renders null for all 17). 

- [ ] **Step 4: Commit**
```bash
git add frontend/src/ui/TouchControlsSurface.jsx frontend/src/ui/TouchControls.jsx
git commit -m "feat(touch-m2): TouchControlsSurface (S1-C visible thumb surface) + 3-way capture/touch/desktop guard"
```

---

### Task 3: the `mobile.png` visual fixture + new baseline

**Files:**
- Modify: `frontend/scripts/visual/capture.mjs` · `frontend/tests/visual/diff.test.js`

- [ ] **Step 1: Add the fixture to capture.mjs** — after the `start` + an explore frame is set up (game live, day), insert a mobile-viewport capture. Place it AFTER the landmark/world fixtures restore the default camera, BEFORE the tier variants (mirror the existing `enterCapture` fixture pattern):
```js
    // --- mobile (touch overlay) -------------------------------------------------
    await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 2 }); // iPhone-ish portrait
    await page.evaluate(() => window.__craftyTest.call('enterCapture', { showTouch: true }));
    await flushFrames(page, 8);
    await page.screenshot({ path: resolve(OUT, 'mobile.png') });
    // restore the default capture pose + 1280x800 for any later frames
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluate(() => window.__craftyTest.call('enterCapture', { showTouch: false, camera: { position: [0, 70, 24], lookAt: [0, 64, -66] } }));
    await flushFrames(page, 4);
```
> Verify at build: the `__craftyTest.call('enterCapture', ...)` bridge passes opts straight to `enterCaptureMode` (grep the bridge in App.jsx/GameScene — it does today for `camera`). `showTouch` flows the same way. If the bridge whitelists keys, add `showTouch` to it.

- [ ] **Step 2: Add `'mobile'` to the STATES array** in `tests/visual/diff.test.js` (so the diff test asserts it).

- [ ] **Step 3: Generate + self-eyeball + baseline** (the DELIBERATE new baseline — charter §4):
```bash
npm run visual:capture           # regenerates current/, incl. current/mobile.png
```
Then Read `frontend/tests/visual/current/mobile.png` at HD: verify the joystick base ring (left), the sword + magic + jump cluster (bottom-right), the crosshair (center), Pause (top-right) all read clean against the live game scene, S1-C bold-flat, nothing clipped by the safe-area. Confirm the 17 OTHER current/*.png are byte-identical to baseline/ (the showTouch default-false guard). Then baseline:
```bash
cp frontend/tests/visual/current/mobile.png frontend/tests/visual/baseline/mobile.png
```
(or `npm run visual:baseline` if it only promotes changed/new frames — check the script first; prefer the targeted copy to avoid re-baselining unrelated noise — the iter-98 lesson).

- [ ] **Step 4: Verify the gate** — `npx vitest run --config vitest.visual.config.js` → **18/18** (17 unchanged + mobile). `npx vitest run` (unit holds-or-grows) + `npm run build` clean.

- [ ] **Step 5: Commit + KRB**
```bash
git add frontend/scripts/visual/capture.mjs frontend/tests/visual/diff.test.js frontend/tests/visual/baseline/mobile.png
git commit -m "test(touch-m2): mobile.png visual baseline — the first frame rendering the touch overlay (18/18)"
```
Add a KEVIN-REVIEW-BATCH entry: the new `mobile.png` before/after path + "first touch-UI eyeball; real-device feel/FPS still parked."

---

### Task 4: static gate + close-out

**Files:**
- Modify: `frontend/tests/gates/touch-wiring-gates.test.js`

- [ ] **Step 1: Add gates** — (a) `TouchControlsSurface.jsx` is presentational: contains NO `addEventListener`, `useState`, `setIntent`, `setActive` (pure render); (b) `TouchControls.jsx` capture path is `getCaptureOpts().showTouch`-gated (renders null by default under capture). Append:
```js
  it('TouchControlsSurface is presentational (no listeners/state/intents)', () => {
    const s = read('src/ui/TouchControlsSurface.jsx');
    expect(/addEventListener|useState|setIntent\(|setActive\(/.test(s)).toBe(false);
  });
  it('TouchControls renders nothing under capture unless showTouch (17 baselines stay clean)', () => {
    const c = read('src/ui/TouchControls.jsx');
    expect(/isCaptureMode\(\)[\s\S]*getCaptureOpts\(\)\.showTouch/.test(c)).toBe(true);
  });
```

- [ ] **Step 2: Full battery** — `npx vitest run` (count grows), `npm run build` clean, `npx vitest run --config vitest.visual.config.js` → 18/18. Arrow-grep the new files (zero-emoji hard gate: use ASCII).

- [ ] **Step 3: Commit + close-out** — banner this plan ✅ SHIPPED; spec §6 M2 row done; ACTIVE_PLAN (M2a shipped + NEXT = M2b focus-model polish, or M3 verb-tray); CHANGELOG; push. Adversarial-review Workflow optional here (mostly presentational + a new baseline — lower risk than M1's controller surgery; a self-eyeball of mobile.png is the key gate).

## Self-Review
**Spec coverage:** §6 M2 row (visible thumb cluster + Tap-to-Play/Pause + `mobile.png` fixture + lifecycle) → Task1 (capture mechanism) + Task2 (surface + guard) + Task3 (fixture/baseline) + Task4 (gates). The `resumeControl` refactor + Settings sensitivity the M2 row also lists are explicitly split to M2b (scope note). ✅
**Placeholder scan:** the two genuine unknowns (exact `--ui-*` var names; the `__craftyTest` enterCapture bridge whitelisting `showTouch`) are called out with grep-first/verify-at-build notes + safe fallbacks, not silent. Jump glyph is ASCII to pass the gates with a noted upgrade path. ✅
**Type consistency:** `TouchControlsSurface({nub})`; `getCaptureOpts().showTouch`; `enterCaptureMode({showTouch})`. ✅

## Execution Handoff
Recommended: **Inline execution**; the load-bearing verification is the `mobile.png` self-eyeball at HD (the first touch-UI taste check) + the 17 baselines holding byte-identical. The risk here is visual/baseline, not controller-logic (M1 already de-risked the wiring).
