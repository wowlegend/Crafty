# Touch M2b — unified Look-Sensitivity setting (mouse + touch) Implementation Plan

> **✅ SHIPPED (loop iter 154).** `lookSensitivity` store key (clamped 0.3–2.5) → desktop PLC `pointerSpeed={lookSensitivity}` (GameScene) + touch `onMove` `applyLook` sensitivity (TouchControls) + a "Look Sensitivity" slider in SettingsPanel + a `look-sensitivity-gate`. Default 1 → 18/18 byte-identical (capture-safe). 1033→1037 unit, build clean. Commit `ccd4bbb`.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** A single **Look Sensitivity** setting that tunes look speed for BOTH desktop (mouse via PointerLockControls' `pointerSpeed`) and touch (the drag-look `applyLook` sensitivity, currently hardcoded `1` at `TouchControls:66`). A real, commonly-expected setting; desktop-verifiable (unlike a touch-only slider). The M2b touch item, broadened.

**Architecture (charter §2 #2 finish-in-flight touch; additive, capture-safe):** a store `lookSensitivity` (default 1, clamped 0.3–2.5). Desktop: `<PointerLockControls pointerSpeed={lookSensitivity} …>` (drei spreads `ThreeElement<PointerLockControlsImpl>` → `pointerSpeed` is a real three-stdlib field). Touch: `onMove` reads `lookSensitivity` instead of the hardcoded `1`. A "Look Sensitivity" slider in SettingsPanel. **Capture-safe:** default 1 → identical behavior in the 18 captured states (PLC is invisible; SettingsPanel isn't a baseline; touch onMove isn't captured) → 18/18 holds, no re-baseline.

**Tech Stack:** zustand store + drei PLC prop + the verified `applyLook(…, sensitivity)` chain + the SettingsPanel slider idiom (`input type=range`, the Build-Size precedent).

---

### Task 1: store key

**Files:** Modify `frontend/src/store/useGameStore.jsx`

- [ ] Add near the other settings: `lookSensitivity: 1,` + `setLookSensitivity: (v) => set({ lookSensitivity: Math.max(0.3, Math.min(2.5, Number(v) || 1)) }),`.

### Task 2: desktop (PLC pointerSpeed)

**Files:** Modify `frontend/src/GameScene.jsx`

- [ ] Read it: `const lookSensitivity = useGameStore((s) => s.lookSensitivity);` (top of the component). Add `pointerSpeed={lookSensitivity}` to the `<PointerLockControls …>` at `:833`.

### Task 3: touch (applyLook sensitivity)

**Files:** Modify `frontend/src/ui/TouchControls.jsx`

- [ ] In `onMove` (`:66`) change `sensitivity: 1` → `sensitivity: useGameStore.getState().lookSensitivity ?? 1` (transient getState read — Game-Loop-Isolation; the value changes only on a settings tweak).

### Task 4: the SettingsPanel slider

**Files:** Modify `frontend/src/ui/GamePanels.jsx`

- [ ] In SettingsPanel's body (after the Show-Stats toggle, ~`:670`) add a slider row (Build-Size idiom):
```jsx
                    {/* Look Sensitivity */}
                    <Panel variant="inset" className="bg-slot p-3">
                        <div className="flex justify-between items-center mb-2">
                            <span className="font-display text-xs font-bold tracking-[2px] uppercase text-text-muted">Look Sensitivity</span>
                            <span className="font-display font-bold text-accent tabular-nums text-lg">{(gameState.lookSensitivity ?? 1).toFixed(1)}</span>
                        </div>
                        <input type="range" min="0.3" max="2.5" step="0.1"
                            value={gameState.lookSensitivity ?? 1}
                            onChange={(e) => gameState.setLookSensitivity(parseFloat(e.target.value))}
                            className="w-full accent-[rgb(var(--ui-accent))]" />
                    </Panel>
```

### Task 5: gate + verify

**Files:** Create `frontend/tests/gates/look-sensitivity-gate.test.js`

- [ ] Gate (signature-fires): GameScene's PLC passes `pointerSpeed={lookSensitivity}`; TouchControls onMove reads `lookSensitivity`; GamePanels wires `setLookSensitivity`. Then battery (from `frontend/`): `npx vitest run` (GROWS by the gate; 0 fail) · `npm run build` clean · `npx vitest run --config vitest.visual.config.js` → **18/18 byte-identical** (default 1 → no change) · arrow-grep.

### Task 6: close-out
- [ ] Commit `feat(settings): unified Look Sensitivity (mouse pointerSpeed + touch applyLook) + slider` + ACTIVE_PLAN/CHANGELOG + KEVIN-REVIEW (the slider — desktop testable now; touch needs a device for feel). Banner this plan ✅ SHIPPED.

## Self-Review
**Spec coverage:** touch spec M2b (touch-sensitivity) — broadened to unified mouse+touch ✓. **Placeholder scan:** concrete (store + PLC prop + onMove + slider). **Type consistency:** `applyLook(yaw,pitch,dx,dy,sensitivity)` already takes sensitivity (M0-tested); drei PLC `pointerSpeed` is a real three-stdlib field. **Capture-safety:** default 1 → 18/18 byte-identical. **Verifiability:** desktop pointerSpeed is reasoned + the slider/clamp gate-locked; touch feel is Kevin-async.
