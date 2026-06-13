# Touch M3a — panel-access tray (the touch playability gap) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Give touch players a way to OPEN the core panels. On desktop, inventory/crafting/build/magic open via E/C/B/M (InputManager:117-120 → store setters); there is no keyboard on touch, and M2a hid the desktop HUD openers — so touch players currently CANNOT open any panel (the core playability gap after M2a). Add a top-edge **tray** (a grid icon → an expanding row of 4 openers) that calls the existing store setters.

**Architecture (touch spec §1.3 "top-edge tray"; charter §2 #2 finish-in-flight):** the touch layer stays a pure PRODUCER. A pure `ui/touchTray.js` registry + toggle helper (the openers map to the verified store actions `setShowInventory/setShowCrafting/setShowBuildingTools/setShowMagic`, each a value-or-fn updater — useGameStore:542/545/548/554) + a `<TouchTray>` visible surface mounted inside the existing touch overlay (gated by `isTouchUIMode`, capture-null like the rest of `TouchControls`). NO new panel logic — the panels themselves already render (MenuSystem:136-156); this only adds touch OPENERS.

**Ladder (mirrors the proven M0→M1→M2a pure-first discipline):**
- **T1 (this cut — capture-SAFE, unit-verifiable):** pure `ui/touchTray.js` (registry + `togglePanel`) + tests + a store-action-existence static gate. Sidesteps the flaky capture harness.
- **T2 (next cut — needs the capture env):** the `<TouchTray>` surface + mount in `TouchControls` + re-baseline `mobile.png` (self-eyeball HD + KEVIN-REVIEW entry).

**Tech Stack:** the pure-module + fake-store vitest pattern (touchMath/inputState precedent); lucide chrome icons (M2a lesson: the 2-tone game-icons don't tint → use lucide for touch chrome); `isTouchUIMode` overlay gating.

---

### Task 1 (T1): the pure tray registry + toggle (TDD red-first)

**Files:** Create `frontend/src/ui/touchTray.js`; Create `frontend/src/ui/touchTray.test.js`

- [ ] **Step 1 (RED):** write `frontend/src/ui/touchTray.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { TRAY_PANELS, togglePanel } from './touchTray';

const fakeStore = () => ({
  showInventory: false, setShowInventory(v) { this.showInventory = typeof v === 'function' ? v(this.showInventory) : v; },
  showCrafting: false, setShowCrafting(v) { this.showCrafting = typeof v === 'function' ? v(this.showCrafting) : v; },
  showBuildingTools: false, setShowBuildingTools(v) { this.showBuildingTools = typeof v === 'function' ? v(this.showBuildingTools) : v; },
  showMagic: false, setShowMagic(v) { this.showMagic = typeof v === 'function' ? v(this.showMagic) : v; },
});

describe('touchTray — the panel-access registry', () => {
  it('registers the 4 core touch-openable panels with complete fields', () => {
    expect(TRAY_PANELS.map(p => p.id)).toEqual(['inventory', 'craft', 'build', 'magic']);
    for (const p of TRAY_PANELS) {
      expect(p.label, `${p.id} label`).toBeTruthy();
      expect(p.icon, `${p.id} icon`).toBeTruthy();
      expect(p.action, `${p.id} action`).toMatch(/^setShow/);
      expect(p.show, `${p.id} show`).toMatch(/^show/);
    }
  });
  it('togglePanel flips the panel via the store setter (open when closed, close when open)', () => {
    const s = fakeStore();
    const inv = TRAY_PANELS.find(p => p.id === 'inventory');
    expect(togglePanel(inv, s)).toBe(true);
    expect(s.showInventory).toBe(true);   // opened
    togglePanel(inv, s);
    expect(s.showInventory).toBe(false);  // closed
  });
  it('togglePanel is null-safe (missing store action -> false, no throw)', () => {
    expect(togglePanel(TRAY_PANELS[0], {})).toBe(false);
    expect(togglePanel(null, fakeStore())).toBe(false);
  });
});
```
Run `npx vitest run src/ui/touchTray.test.js` → FAIL (module missing).

- [ ] **Step 2 (GREEN):** write `frontend/src/ui/touchTray.js`:
```js
/**
 * touchTray.js — the touch panel-access registry (touch M3a). On desktop E/C/B/M open these panels
 * (InputManager:117-120); touch has no keyboard, so the tray surface (<TouchTray>) calls togglePanel
 * for each. PURE producer — the panels themselves already render (MenuSystem). Icons are lucide names
 * (the 2-tone game-icons don't tint; M2a switched touch chrome to lucide).
 */

// id -> { label, lucide icon name, store action (value-or-fn updater), the boolean store key }
export const TRAY_PANELS = [
  { id: 'inventory', label: 'Inventory', icon: 'Package', action: 'setShowInventory',     show: 'showInventory' },
  { id: 'craft',     label: 'Craft',     icon: 'Hammer',  action: 'setShowCrafting',       show: 'showCrafting' },
  { id: 'build',     label: 'Build',     icon: 'Blocks',  action: 'setShowBuildingTools',  show: 'showBuildingTools' },
  { id: 'magic',     label: 'Magic',     icon: 'Sparkles',action: 'setShowMagic',          show: 'showMagic' },
];

/** Flip one panel through its verified store setter (which accepts a fn updater). Returns false if unwired. */
export const togglePanel = (panel, store) => {
  if (!panel || !store || typeof store[panel.action] !== 'function') return false;
  store[panel.action]((prev) => !prev);
  return true;
};
```
Run the test → PASS.

### Task 2 (T1 gate): store-action-existence gate

**Files:** Create `frontend/tests/gates/touch-tray-gate.test.js`

- [ ] **Step 1 (RED→GREEN, the "signature-fires-in-prod" insurance):** assert every registry action+show key is a REAL store key (a renamed store action turns this red instead of silently dead openers):
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { TRAY_PANELS } from '../../src/ui/touchTray.js';
const __dir = dirname(fileURLToPath(import.meta.url));
const store = readFileSync(resolve(__dir, '../../src/store/useGameStore.jsx'), 'utf8');
describe('touch tray openers map to real store actions', () => {
  it('every TRAY_PANELS action + show key exists in the store', () => {
    for (const p of TRAY_PANELS) {
      expect(store, `${p.action} missing`).toMatch(new RegExp(`${p.action}\\s*:`));
      expect(store, `${p.show} missing`).toMatch(new RegExp(`${p.show}\\s*:`));
    }
  });
});
```
Run `npx vitest run tests/gates/touch-tray-gate.test.js` → PASS (the 4 setters exist; verified at useGameStore:542/545/548/554).

### Task 3: verify + close-out (T1)

- [ ] **Step 1: battery** (from `frontend/`): `npx vitest run` (count GROWS by the new module + gate tests; 0 fail) · `npm run build` clean · `npx vitest run --config vitest.visual.config.js` → **18/18 byte-identical** (T1 renders nothing — pure module) · arrow-grep the 3 new files.
- [ ] **Step 2: commit + close-out** — `feat(touch-m3a): pure panel-access tray registry + togglePanel (T1, capture-safe)` + ACTIVE_PLAN (T1 done, T2 = the visible surface next) + this plan stays OPEN (T2 pending). NOT a full SHIPPED banner yet (the milestone completes at T2).

### T2 (next cut — documented here, NOT built this iteration; needs the capture env)
Build `<TouchTray>` (a grid/hamburger icon top-edge inside the safe-area → tap expands a row of the 4 lucide openers; tap an opener → `togglePanel(panel, useGameStore.getState())` → the existing panel renders; tap again / tap scrim closes). Mount in `TouchControls` under `isTouchUIMode` (capture-null with the rest). Re-baseline `mobile.png` (the tray is new on-screen furniture) — self-eyeball at HD (premium S1-C: near-black buttons + gold glyph, per M2a) + a KEVIN-REVIEW-BATCH before/after entry. Verify the 17 desktop baselines stay byte-identical (isTouchUIMode-off on desktop).

## Self-Review
**Spec coverage:** touch spec §1.3 (top-edge tray, the panel subset) ✓ — radial wheel (M3b) + analog (M3c) + hotbar-cycle are separate sub-milestones (scope-split per writing-plans). **Placeholder scan:** all code concrete (the registry + the toggle + both tests). **Type consistency:** `store[panel.action]((prev)=>!prev)` matches the verified fn-updater setters (useGameStore:542). **Capture-safety:** T1 is a pure module (renders nothing) → 18/18 trivially holds; T2 carries the deliberate re-baseline. **Why T1/T2 split:** T1 is capture-SAFE (sidesteps the flaky harness) and unit-locks the correctness; T2 isolates the one capture-dependent step.
