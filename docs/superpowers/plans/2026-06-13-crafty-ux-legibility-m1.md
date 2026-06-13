# UX-Legibility Interleave (Honest-Controls pass) — Implementation Plan

> **✅ SHIPPED (2026-06-13, loop iters 97-98):** T1+T2 `game/keyMap.js` SoT + anti-drift gate + the KeyM lie-fix (89172c2) · T3 `deniedReason` + `denyToast` → no-mana + locked-Aspect-verb feedback (d1692a7) · T4 the controls panel renders from keyMap (grouped keycap-badge, teaches R/V/X/Z) + a deliberate, isolation-verified explore re-baseline (2f687c7) · the review-fix (49f27d3): boss/inventory/achievements re-baselined too (the panel is in the unconditional HUD — review-caught). A 3-lens adversarial-review workflow ran; 1 HIGH (re-baseline scope) FIXED, 1 LOW (`aspect-underbanked`) deferred-with-rationale. 8 HUD-bearing states re-baselined (HD-eyeballed); 874 unit/105 files (+8) · build · visual 13/13.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Design of record (the §4 hard-gate):** `docs/superpowers/specs/2026-06-13-crafty-ux-legibility-design.md` (the design-gate verdict, the 3 verified wounds, the taste decision, reference-lock, the adversarial critique). This is the experience interleave due at the S3-M3/M4 boundary (UX is the only untouched axis).
> **Verified at plan time (live, this iteration):** NO `KeyM` handler exists in `src/` (the M-lie is a real bug); `setShowMagic`/`showMagic` live at `useGameStore.jsx:547-548`; the toggle pattern is `InputManager.jsx:95 toggleUI(setter, current)` + `:117-119` KeyE/C/B; R/V/X/Z are handled in `Components.jsx:428-445` (`e.code==='KeyR'`→`setIntent('roar')`, KeyV→grab, KeyX→snare, KeyZ→imbue; intents in `inputState.js:40 INTENT_KEYS`); `CombatInstructions` renders unconditionally at `HUD.jsx:397` and IS visible in the gated `explore-day.png`/`explore-night.png`; the toast pipe (`addNotification`→`HUD` NotificationStack→`Toast`) self-nulls under capture (`QuestSystem.jsx:574`).

**Goal:** Close the three verified first-60-seconds legibility wounds — the M-lie, the undiscoverable Aspect verbs, and silent denied actions — via a `keyMap` single-source-of-truth driving a truthful+complete controls panel, the missing KeyM handler, and capture-safe denied-action feedback.

**Architecture:** A pure `game/keyMap.js` (the binding SoT, EN-first row data) is consumed by a redesigned `CombatInstructions` and guarded by a keyMap↔handler anti-drift test (the M-lie can never reappear). Pure `deniedReason()` returns toast copy; the existing capture-self-nulling `addNotification` pipe carries it. Extraction/addition only — no test weakened.

**Tech Stack:** React 19 `React.memo` panel (no useFrame); module-const data; vitest unit tests; the bold-flat `<Panel>` + `<Toast>` primitives; the keycap-badge style from `AdvancedGameFeatures.jsx:1214`.

---

## File structure

```
NEW  src/game/keyMap.js                 ← KEY_MAP: the binding single-source-of-truth (rows {key, code?, label, group, verb?})
NEW  tests/game/keyMap.test.js          ← shape + the ANTI-DRIFT gate (every advertised key has a live handler)
NEW  src/game/deniedReason.js           ← pure deniedReason(kind) -> toast text  (or co-locate in keyMap.js if trivial)
NEW  tests/game/deniedReason.test.js
MOD  src/InputManager.jsx               ← add the KeyM toggle case (the M-lie fix)
MOD  src/ui/CombatInstructions.jsx      ← render from KEY_MAP, grouped, keycap-badge style
MOD  src/EnhancedMagicSystem.jsx        ← no-mana cast -> deniedReason toast (capture-guarded, debounced)
MOD  src/Components.jsx                 ← the 4 verb gates -> denied toast (locked vs under-banked)
RE-BASELINE  tests/visual/baseline/{explore-day,explore-night,explore-day-low,explore-day-med,explore-night-low}.png  (deliberate, HD-eyeballed)
```

---

### T1 — `game/keyMap.js` (the SoT) + the anti-drift gate

**Files:** Create `frontend/src/game/keyMap.js` + `frontend/tests/game/keyMap.test.js`

- [ ] **Step 1 (RED):** write `tests/game/keyMap.test.js`:
  ```js
  import { describe, it, expect } from 'vitest';
  import { readFileSync } from 'node:fs';
  import { resolve, dirname } from 'node:path';
  import { fileURLToPath } from 'node:url';
  import { KEY_MAP } from '../../src/game/keyMap.js';
  import { INTENT_KEYS } from '../../src/input/inputState.js';

  const HERE = dirname(fileURLToPath(import.meta.url));
  const read = (p) => readFileSync(resolve(HERE, '../../src/', p), 'utf8');
  const input = read('InputManager.jsx');
  const comp = read('Components.jsx');

  describe('KEY_MAP — the binding single-source-of-truth', () => {
    it('every row has {key, label, group} with a known group', () => {
      const groups = new Set(['Move', 'Combat', 'Aspects', 'Panels']);
      for (const r of KEY_MAP) {
        expect(typeof r.key).toBe('string');
        expect(typeof r.label).toBe('string');
        expect(groups.has(r.group)).toBe(true);
      }
    });
    it('teaches the 4 signature Aspect verbs (the game identity)', () => {
      const aspects = KEY_MAP.filter(r => r.group === 'Aspects');
      expect(aspects.map(r => r.key).sort()).toEqual(['R', 'V', 'X', 'Z']);
      // each Aspect verb maps to a REAL consumed intent + a live Components handler
      for (const r of aspects) {
        expect(INTENT_KEYS).toContain(r.verb);          // roar/grab/snare/imbue
        expect(comp).toContain(`e.code === '${r.code}'`); // KeyR/KeyV/KeyX/KeyZ
      }
    });
    it('ANTI-LIE: every Panels key advertises a LIVE InputManager handler (no KeyM-style lie)', () => {
      for (const r of KEY_MAP.filter(r => r.group === 'Panels')) {
        expect(input.includes(`'${r.code}'`), `${r.key} (${r.code}) must have a live handler`).toBe(true);
      }
      // the regression that prompted this unit: M must be handled
      expect(KEY_MAP.some(r => r.key === 'M' && r.code === 'KeyM')).toBe(true);
    });
  });
  ```
- [ ] **Step 2:** Run it — FAILS (`keyMap.js` missing; and the M anti-lie will fail until T2 wires KeyM — that is intended: T1 RED stays partially red on the M assert until T2). Expected.
- [ ] **Step 3 (GREEN):** create `src/game/keyMap.js`. Mirror the `aspectGuide.js` field idiom. Author the rows from the VERIFIED handlers — confirm the Move/dodge keys at `Components.jsx:414-424` and that G/T/U/Tab/Esc still map as labelled at build:
  ```js
  // keyMap.js — the binding single-source-of-truth (EN-first; route labels through t() later for zh-CN).
  // The controls panel + the keyMap.test anti-drift gate both consume this so the HUD can never lie about a key.
  export const KEY_MAP = [
    { key: 'WASD',  label: 'Move',                       group: 'Move' },
    { key: 'Space', label: 'Jump',                       group: 'Move' },
    { key: 'Shift', label: 'Dodge-roll',                 group: 'Move' },   // confirm code at Components.jsx:424
    { key: 'LMB',   label: 'Attack / mine',              group: 'Combat' },
    { key: 'RMB',   label: 'Cast / place / interact',    group: 'Combat' },
    { key: 'F',     label: 'Attack / cast spell',        group: 'Combat' },
    { key: '1-4',   label: 'Select spell',               group: 'Combat' },
    { key: 'Wheel', label: 'Cycle block',                group: 'Combat' },
    { key: 'R', code: 'KeyR', verb: 'roar',  label: 'WILDHEART — roar / beast form', group: 'Aspects' },
    { key: 'V', code: 'KeyV', verb: 'grab',  label: 'VOIDHAND — grab, then hurl / slam', group: 'Aspects' },
    { key: 'X', code: 'KeyX', verb: 'snare', label: 'SOULBIND — snare, then fuse', group: 'Aspects' },
    { key: 'Z', code: 'KeyZ', verb: 'imbue', label: 'ELEMANCER — imbue the next cast', group: 'Aspects' },
    { key: 'E',   code: 'KeyE',   label: 'Inventory',              group: 'Panels' },
    { key: 'M',   code: 'KeyM',   label: 'Magic',                  group: 'Panels' },
    { key: 'C',   code: 'KeyC',   label: 'Crafting',               group: 'Panels' },
    { key: 'B',   code: 'KeyB',   label: 'Building',               group: 'Panels' },
    { key: 'U',   code: 'KeyU',   label: 'Talents & Aspect guide', group: 'Panels' },
    { key: 'G',   code: 'KeyG',   label: 'Open chest / trade',     group: 'Panels' },
    { key: 'T',   code: 'KeyT',   label: 'Tame',                   group: 'Panels' },
    { key: 'Tab', code: 'Tab',    label: 'Achievements',           group: 'Panels' },
    { key: 'ESC', code: 'Escape', label: 'Settings / pause',       group: 'Panels' },
  ];
  ```
  (NOTE for the builder: the `Panels` anti-lie test will be RED on the `KeyM` row until T2 — author T1+T2 so the battery is green at the T2 commit; T1 alone may commit with the keyMap + a `it.todo`/`it.fails` ONLY if it must be split — prefer landing T1+T2 in one commit so no red is committed.)
- [ ] **Step 4:** Land T1 + T2 together (below) so the suite is green at commit. Commit message in T2.

### T2 — wire the missing KeyM handler (the M-lie fix)

**Files:** Modify `frontend/src/InputManager.jsx`

- [ ] **Step 1 (RED):** add to `tests/game/keyMap.test.js` (or a small `InputManager` unit) the assertion already present (the anti-lie `KeyM` check). It is RED until the handler lands.
- [ ] **Step 2 (GREEN):** at `InputManager.jsx:119` (immediately after the KeyB line), add:
  ```js
  if (event.code === 'KeyM') toggleUI(state.setShowMagic, state.showMagic);
  ```
  (Inside the SAME `active && !anyPanelOpen` guard block as E/C/B; `toggleUI` + `state.setShowMagic`/`state.showMagic` are in scope — verified. `showMagic` is already in `panelState.js:14`, so `isAnyPanelOpen` and ESC-close already account for it.)
- [ ] **Step 3:** Full battery from `frontend/` (absolute path — the cwd resets between turns): `cd /Users/kz/Code/Crafty/frontend && npx vitest run` (count grows by T1's tests) · `npm run build` · visual gate 13/13 (no visual change yet). Commit `feat(ux): keyMap SoT + the missing KeyM handler — the controls panel can no longer lie`

### T3 — denied-action feedback (capture-safe, debounced)

**Files:** Create `frontend/src/game/deniedReason.js` + `frontend/tests/game/deniedReason.test.js`; Modify `frontend/src/EnhancedMagicSystem.jsx`, `frontend/src/Components.jsx`

- [ ] **Step 1 (RED):** `tests/game/deniedReason.test.js` — `deniedReason('no-mana')` → `'Not enough mana'`; `deniedReason('aspect-locked')` → `'Aspect not yet unlocked'`; `deniedReason('aspect-underbanked')` → a "need more <resource>"-class string; unknown kind → a safe generic. (Pin the exact copy.)
- [ ] **Step 2 (GREEN):** create `src/game/deniedReason.js` (pure map).
- [ ] **Step 3:** wire the no-mana path at `EnhancedMagicSystem.jsx:154-156` (the bare `return`): before returning, `if (!isCaptureMode()) maybeNotify(deniedReason('no-mana'))` where `maybeNotify` is a module-level ~1s debounce wrapping `useGameStore.getState().addNotification(text, 'warn')`. Import `isCaptureMode` + `deniedReason` (verify `isCaptureMode` import already present in the file; add if not).
- [ ] **Step 4:** wire the four verb gates in `Components.jsx` (the `canEnter`/`canGrab`/`canSnare`/`canIgnite` fail paths — verify exact lines at build, ~:621/:689/:757/:839): on a denied verb, fire `deniedReason('aspect-locked')` vs `'aspect-underbanked'` by reading which half of the gate failed (the talent-unlock check vs the banked-resource check — read each gate's two conjuncts at build). Same `if (!isCaptureMode())` + debounce.
- [ ] **Step 5:** Full battery (count grows; visual still 13/13 — the toasts self-null in capture so NO baseline shift). Commit `feat(ux): denied actions speak — no-mana + locked/under-banked Aspect verbs give capture-safe feedback`

### T4 — the truthful + complete controls panel (the deliberate re-baseline)

**Files:** Modify `frontend/src/ui/CombatInstructions.jsx`; re-baseline the 5 explore PNGs

- [ ] **Step 1:** rewrite `CombatInstructions.jsx` to render `KEY_MAP` grouped (Move / Combat / Aspects / Panels), keeping the bold-flat `<Panel variant="base">` top-right placement + the `font-display uppercase` header. Use the keycap-badge chip style from `AdvancedGameFeatures.jsx:1214` (`px-2 py-0.5 rounded border-chrome border-ink bg-slot`) for each key. Keep it TIGHT — group sub-headers (small uppercase muted), compact rows; the Aspects group shows the verb + its short identity cue. NO emoji. `import { KEY_MAP } from '../game/keyMap.js'`.
- [ ] **Step 2 (the re-baseline — the load-bearing eyeball):** from `frontend/`: `npm run visual:capture` to regenerate frames. Then **Read the regenerated `tests/visual/current/explore-day.png` + `explore-night.png` at HD and self-eyeball** (IB-grade: is the panel legible, premium, tight, not cluttered? do the keycap badges align? is the Aspect identity clear?). If good → copy current→baseline for the 5 explore PNGs (`explore-day`, `explore-night`, `explore-day-low`, `explore-day-med`, `explore-night-low`). If it looks cluttered/off → iterate the layout BEFORE baselining (the gate is not the safety net for a self-set baseline). Verify the OTHER 11 states did NOT drift (only the explore-* should change).
- [ ] **Step 3:** Full battery — `npx vitest run` (count holds/grows), `npm run build`, visual gate 13/13 against the NEW baselines. Add a KEVIN-REVIEW-BATCH before/after entry (the 2 gated explore states, with the rationale: honest+complete controls teaching the 4 Aspects). Commit `feat(ux): the controls panel teaches the 4 Aspects + every real key — deliberate explore re-baseline`

### T5 — close-out

- [ ] Banner THIS plan `✅ SHIPPED` with final counts; mark the spec done. CHANGELOG entry (the UX-legibility interleave). Update `memory/ACTIVE_PLAN.md` → interleave ledger **UX@96**, NEXT UNIT = S3-M4 (the AdvancedGameFeatures dissolve part 1; the night-siege juice pass is the ranked fast-follow for the NEXT interleave). Refresh SOTA §3 if the interleave-ledger line is shown there.
- [ ] Adversarial review (ultracode): a short review workflow over the delta — does the panel read premium (not AI-generic clutter)? does the anti-drift test actually prevent the lie? any capture leak from the toasts? Fix confirmed findings before declaring done.

## Self-review
- **Spec coverage:** the 3 wounds → T2 (M-lie), T4 (Aspect discoverability), T3 (silent denials); the keyMap SoT + anti-drift gate → T1. Full design-of-record covered.
- **Placeholder scan:** the KEY_MAP rows are concrete (verified handlers); the 2-3 confirm-at-build items (dodge code, G/T/U/Tab labels) are NAMED verification steps reading specific lines, not vague TODOs. The denied-gate conjunct-reading (T3-Step 4) is a named build-time read of the 4 gates.
- **Type consistency:** `deniedReason(kind)` signature used identically in T3 steps; `KEY_MAP` row shape `{key, code?, label, group, verb?}` consistent across keyMap.js + the test + CombatInstructions.
- **Ratchet:** T1/T3 add tests (grow count); T2/T4 don't weaken any; T4's re-baseline is DELIBERATE + HD-eyeballed + KRB-logged (not a silent gate weakening). The anti-drift gate is net-new and permanent.
- **Capture/perf:** toasts self-null in capture (no baseline shift in T3); only T4 shifts baselines (deliberate); zero per-frame cost.
