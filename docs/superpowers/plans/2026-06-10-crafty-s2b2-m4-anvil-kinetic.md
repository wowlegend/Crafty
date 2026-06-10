# VOIDHAND M4 — Anvil + Kinetic Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = spec §3e/§3f + §12 M4 row (`docs/superpowers/specs/2026-06-09-crafty-s2b2-voidhand-design.md`). Inputs verified at HEAD: the Ferocity precedent chain (store 565-568 · load ~768 · save ~821 · autosave diff in App.jsx · `useFerocityAccrual` AdvancedGameFeatures.jsx:20 · dawn bleed in `useSurvivalMode` · `StatBar kind="ferocity"` HUD.jsx:47) + the M3 hit event (pos+dir) + `kinetic.js` (M1, already complete: KINETIC_MAX/GRAB_COST/kineticForKill/clampKinetic/canGrab).

**Goal:** Building MATTERS in combat: hurling a mob into a wall does 3× damage; combat grabs cost banked Kinetic (day-kill accrual, dawn bleed) gated behind the `voidhand_grasp` talent, persisted, with an unlock-gated HUD bar.

**Architecture:** Mirror Ferocity exactly (Kevin Decision #2): store twin fields + save/load/autosave-diff + a kill-bus accrual hook + the dawn-bleed line. The anvil = a pure `resolveAnvil` helper over a caller-provided ray fn (TDD with stub rays) consumed by HurlSystem via a new parametrized `GameMethods.castWorldRay` (Terrain owns Rapier). `canGrab` composes bank + talent at the SM ctx (the gate M1 left OPEN); GRAB_COST spends at the apply-site.

**Tech Stack:** existing pure `kinetic.js`; `subscribeMobKill` bus; `unlockedTalents?.['id'] > 0` read (the roar precedent, Components.jsx:557); fold-tolerant effect-less talent nodes (the WILDHEART fix); `StatBar` primitive.

**Loop-decided deltas (recorded, reversible):**
- **Kinetic HUD bar renders ONLY when `voidhand_grasp` is unlocked** — capture saves lack it → visual baselines UNCHANGED (no re-baseline), and no meter is shown for a locked ability (legibility win). Reversal: drop the gate at M7's re-baseline.
- **Gold "WALL HIT!" label + wall impact flash → M7** (damage numbers are closure-internal to SimplifiedNPCSystem's CombatSystem; the 3× number itself reads big at M4 — cosmetic plumbing isn't mechanics scope). The spec's one-shot bounce guard is structurally unnecessary (single-flight ends at first hit — asserted by test, not coded).
- Bar color = the shipped voidhand violet (#B36BFF family) — already the phantom-rim identity, not a new token family.

---

## File structure

| File | Responsibility |
|---|---|
| Modify `frontend/src/store/useGameStore.jsx` | `kineticBanked` twin fields (~374 voidhand region) + load (~768) + save (~821) |
| Modify `frontend/src/App.jsx` | autosave-diff `|| s.kineticBanked !== prevS.kineticBanked` |
| Modify `frontend/src/AdvancedGameFeatures.jsx` | `useKineticAccrual` (twin of :20) + dawn bleed line in `useSurvivalMode` |
| Modify `frontend/src/game/talentTree.js` | `voidhand_grasp` effect-less node in ASPECT_TREES[0] |
| Modify `frontend/src/Components.jsx` | SM ctx `canGrab` composition + GRAB_COST spend at 'grab' + accrual hook mount check |
| Modify `frontend/src/game/hurl.js` (+ test) | pure `resolveAnvil(castRay, hit)` + `ANVIL_*` consts |
| Modify `frontend/src/world/Terrain.jsx` | register `GameMethods.castWorldRay(origin, dir, maxToi)` |
| Modify `frontend/src/world/HurlSystem.jsx` | anvil multiplier at the hurl impact |
| Modify `frontend/src/HUD.jsx` (+ StatBar map if needed) | unlock-gated kinetic bar under ferocity |
| Modify `frontend/tests/store/voidhandStore.test.js` | kinetic persistence/dawn/spend store tests |

---

### Task 1: store twin + persistence + dawn bleed + accrual hook (TDD)

- [ ] **Step 1: failing store tests** — append to `frontend/tests/store/voidhandStore.test.js` (mirror the ferocity store tests' setup idioms in that file):

```js
describe('M4 kinetic economy (store twin of ferocity)', () => {
  it('accrueKinetic clamps to [0, KINETIC_MAX] and rounds', () => {
    const s = useGameStore.getState();
    s.setKineticBanked(0);
    s.accrueKinetic(12.4);
    expect(useGameStore.getState().kineticBanked).toBe(12);
    s.accrueKinetic(1000);
    expect(useGameStore.getState().kineticBanked).toBe(KINETIC_MAX);
    s.accrueKinetic(-1000);
    expect(useGameStore.getState().kineticBanked).toBe(0);
  });
  it('a grab spend debits GRAB_COST', () => {
    const s = useGameStore.getState();
    s.setKineticBanked(60);
    s.accrueKinetic(-GRAB_COST);
    expect(useGameStore.getState().kineticBanked).toBe(60 - GRAB_COST);
  });
});
```
(imports: `KINETIC_MAX, GRAB_COST` from `../../src/game/kinetic.js`.)

- [ ] **Step 2: red** (fields missing) → **Step 3: implement**
  a. Store (next to `voidhandHeld` ~374; NOTE: unlike voidhandHeld, kineticBanked IS persisted):
```js
    // M4: the KINETIC bank (twin of ferocityBanked:566-568) — day-kill accrual, spent per combat
    // grab, dawn-bled, PERSISTED in the progression slice (unlike the transient held flags above).
    kineticBanked: 0,
    setKineticBanked: (v) => set({ kineticBanked: clampKinetic(v) }),
    accrueKinetic: (delta) => set((s) => ({ kineticBanked: clampKinetic(s.kineticBanked + delta) })),
```
  (+ `import { clampKinetic } from '../game/kinetic';` next to the clampFerocity import.)
  b. Load site (~768, next to ferocityBanked): `const kineticBanked = clampKinetic(prog?.kineticBanked ?? state.kineticBanked);` + include `kineticBanked,` in the same set() it feeds.
  c. Save site (~821): add `kineticBanked,` next to `ferocityBanked,`.
  d. App.jsx autosave diff (grep `ferocityBanked !== prevS.ferocityBanked`): add `|| s.kineticBanked !== prevS.kineticBanked` with the comment `// M4: a day-banked kinetic charge survives a tab-close`.
  e. `useKineticAccrual` in AdvancedGameFeatures.jsx (directly below useFerocityAccrual:20):
```js
export const useKineticAccrual = () => {
    useEffect(() => subscribeMobKill((mobType) => {
        const s = useGameStore.getState();
        if (s.isDay && !isCaptureMode()) s.accrueKinetic(kineticForKill(mobType));
    }), []);
};
```
  (+ `kineticForKill` import next to `ferocityForKill`'s.) Mount it in App.jsx next to `useFerocityAccrual();`.
  f. Dawn bleed — in `useSurvivalMode`'s dawn branch, directly under `setFerocityBanked(0)`:
```js
            // S2-B2-M4: Kinetic mirrors Ferocity at dawn (Kevin Decision #2) — no carry across nights.
            useGameStore.getState().setKineticBanked(0);
```
- [ ] **Step 4: green** → **Step 5: commit** `feat(voidhand-m4): kinetic store twin — persistence, autosave diff, day-kill accrual, dawn bleed (TDD)`

### Task 2: the talent gate + canGrab + spend

- [ ] **Step 1:** `voidhand_grasp` node in `talentTree.js` ASPECT_TREES[0].nodes (after voidhand_crush; effect-LESS like wildheart_roar — the fold skips it):
```js
      { id: 'voidhand_grasp', name: 'Kinetic Grasp', desc: 'Unlocks the VOIDHAND grab — press V in combat to seize a phantom block (costs 25 banked Kinetic); hurl it (attack) or slam it down (cast).', limit: 1, prereq: 'voidhand_force' },
```
- [ ] **Step 2:** Components SM ctx (the `canGrab: true,` line in the voidhand SM block): →
```js
        // M4: the gate M1 left OPEN — bank + talent compose here (the roar-gate pattern :557)
        canGrab: kCanGrab(stv.kineticBanked) && (stv.unlockedTalents?.['voidhand_grasp'] > 0),
```
  (import `{ canGrab as kCanGrab, GRAB_COST }` from `./game/kinetic`.) And in the `'grab'` apply branch, first line: `stv.accrueKinetic(-GRAB_COST);`.
- [ ] **Step 3:** extend the talent fold-tolerance test if one names nodes explicitly (grep `wildheart_roar` in tests/; mirror for voidhand_grasp) — else the generic fold test already covers effect-less nodes. Full suite green.
- [ ] **Step 4: commit** `feat(voidhand-m4): voidhand_grasp talent gates the grab; GRAB_COST spends on commit`

### Task 3: base-as-anvil 3× (pure + ray + wiring) — TDD

- [ ] **Step 1: failing tests** (append to `frontend/src/game/hurl.test.js`):
```js
describe('base-as-anvil (M4)', () => {
  const hit = { id: 'm', pos: { x: 0, y: 10, z: 0 }, dir: { x: 1, y: 0, z: 0 } };
  it('mob next to a wall along the hurl line -> ANVIL_MULT', () => {
    const castRay = (o, d, max) => ({ toi: 1.2 }); // a wall 1.2m past the impact
    expect(resolveAnvil(castRay, hit)).toBe(ANVIL_MULT);
  });
  it('open air -> 1x', () => {
    expect(resolveAnvil(() => null, hit)).toBe(1);
  });
  it('wall beyond ANVIL_RANGE -> 1x (the ray is range-capped by the caller contract)', () => {
    const castRay = (o, d, max) => (max >= 99 ? { toi: 50 } : null);
    expect(resolveAnvil(castRay, hit)).toBe(1);
  });
  it('exports the tuning', () => {
    expect(ANVIL_RANGE).toBe(3);
    expect(ANVIL_MULT).toBe(3);
  });
});
```
- [ ] **Step 2: red** → **Step 3: implement** in `hurl.js`:
```js
export const ANVIL_RANGE = 3; // wall within this along the hurl line past the impact
export const ANVIL_MULT = 3;  // total damage multiplier (spec §3e — "rewards day-building directly")

/** Base-as-anvil: castRay(origin, dir, maxToi) -> {toi}|null (the caller binds the real Rapier
 *  ray, range-capped at ANVIL_RANGE). Pure decision; the gold label + wall flash are M7 look. */
export function resolveAnvil(castRay, hit) {
  const r = castRay(hit.pos, hit.dir, ANVIL_RANGE);
  return r && r.toi <= ANVIL_RANGE ? ANVIL_MULT : 1;
}
```
- [ ] **Step 4:** register the parametrized ray in Terrain's #72 executor effect (next to `GameMethods.castBuildRay`; same filterPredicate; teardown deletes it):
```js
        // M4: parametrized world ray (the anvil wall check) — same player-filtered cast, any origin/dir.
        const castWorldRay = (origin, dir, maxToi) => {
            const playerRigidBody = useGameStore.getState().playerRigidBodyRef?.current;
            const playerHandle = playerRigidBody?.handle;
            const ray = new rapier.Ray(origin, dir);
            const filterPredicate = (collider) => {
                if (playerHandle === undefined) return true;
                const parent = collider.parent();
                return !parent || parent.handle !== playerHandle;
            };
            const h = world.castRay(ray, maxToi, true, undefined, undefined, undefined, playerRigidBody, filterPredicate);
            return h ? { toi: h.timeOfImpact } : null;
        };
        GameMethods.castWorldRay = castWorldRay;
```
  (+ `delete GameMethods.castWorldRay;` in the teardown.)
- [ ] **Step 5:** HurlSystem hurl-impact branch — replace the flat damage line:
```js
      const anvil = GameMethods.castWorldRay ? resolveAnvil(GameMethods.castWorldRay, r.hit) : 1;
      if (GameMethods.damageMob) GameMethods.damageMob(r.hit.id, HURL_DAMAGE * anvil, element);
```
  (import `resolveAnvil` from '../game/hurl'.)
- [ ] **Step 6:** suite + build green. **Commit** `feat(voidhand-m4): base-as-anvil — hurl a mob into a wall for 3x (pure resolveAnvil + castWorldRay)`

### Task 4: HUD bar (unlock-gated) + battery + smoke

- [ ] **Step 1:** HUD.jsx — read the ferocity bar's data plumbing at :47 (`ferocity` selector + `FEROCITY_MAX`); add below it:
```jsx
    {hasGrasp && (
      <StatBar kind="kinetic" value={kinetic} max={KINETIC_MAX} icon="force"
        ... (mirror the ferocity bar's remaining props verbatim) />
    )}
```
  with `const kinetic = useGameStore((s) => s.kineticBanked);` + `const hasGrasp = useGameStore((s) => (s.unlockedTalents?.['voidhand_grasp'] ?? 0) > 0);` + `KINETIC_MAX` import. If `StatBar`'s kind→color map is closed (check `src/ui/primitives/StatBar*`), add `kinetic: '#B36BFF'`-family entries mirroring ferocity's shape (the shipped voidhand violet).
- [ ] **Step 2: battery** — `npx vitest run` (grows) · `npm run build` · `npm run test:visual` (**13/13 — the bar is unlock-gated and capture saves lack the talent; if ANY frame diffs, STOP and verify the gate, do NOT re-baseline**).
- [ ] **Step 3: smoke** (headless, the M3 harness pattern — REAL mobs only): unlock `voidhand_grasp` via store, bank kinetic via `accrueKinetic(50)`, assert `canGrab` path: simulate grabEdge through the SM? (the SM is ref-internal — instead assert store-level: kineticBanked 50 → apply-site spend on a driven grab is covered by unit seams; smoke asserts accrual: kill-bus emit → bank grows by `kineticForKill(type)` day-only).
- [ ] **Step 4: commit** `feat(voidhand-m4): unlock-gated Kinetic HUD bar (voidhand violet); no re-baseline`

### Task 5: close-out

- [ ] Spec §12 M4 row + status header (✅, M5/M6 next per seq) · this plan ✅ SHIPPED · SOTA banner · CHANGELOG · KRB (decisions-of-record: unlock-gated bar, WALL-HIT label → M7, anvil walls-PRISTINE per Decision #3 rec) · ACTIVE_PLAN · commit + push.

---

## Self-review (at authoring)

- **Spec coverage:** §3e anvil 3× ✓T3 (one-shot guard structurally unnecessary — single-flight, recorded) · wall-hit label/flash → M7 (recorded deferral) · §3f store twin/persistence/autosave ✓T1 · talent node + SM gate + spend ✓T2 · HUD 5th bar ✓T4 · §12 M4 "wall-hit 3× unit test next-to-wall vs open-air" ✓T3 tests 1-2 · autosave-diff ✓T1d · dawn bleed ✓T1f.
- **Placeholders:** the two "mirror verbatim" instructions (StatBar props, store test idioms) are deliberate read-the-precedent steps with exact anchors, not gaps.
- **Type consistency:** `resolveAnvil(castRay, hit)` matches T3 tests/impl/HurlSystem call ✓; `castWorldRay(origin, dir, maxToi) -> {toi}|null` consistent ✓; `kCanGrab` aliasing avoids the kinetic.js/store name clash ✓.
- **Risk:** the HUD bar's unlock gate is load-bearing for the visual gate — explicit STOP instruction if frames diff.
