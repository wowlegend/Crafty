# ELEMANCER M5 — IMBUE End-to-End Implementation Plan

> **✅ SHIPPED (2026-06-10, loop iters 72-73):** T1+T2 iter 72 · T3+T4 iter 73 (incl. the cross-component-selector runtime crash the visual gate caught). THE VERB PLAYS. 825 unit (99 files) · build · visual 13/13.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-10-crafty-s2b4-elemancer-design.md` §2/§3 M5.
> **The impact seam (verified at plan time):** projectiles terrain-impact via the groundLevel check
> (EnhancedMagicSystem ~:401-409 → `createSpellImpact(projectile.position, type)`) and mob-impact via
> checkMobCollision (~:412+). BOTH spawn the zone for an imbued cast (a mob hit grounds the zone at the
> impact point — effects are 2D x/z so y is benign); AGE-OUT (~:397) is a FIZZLE — no zone, no refund
> (recorded: the generous maxAge makes air-fizzles rare; punitive-refund complexity not worth it).

**Goal:** The verb plays: hold-bank Resonance by day, press Z to arm (the white-gold reticle tells you), cast — the impact paints the element's zone into the world.

**Architecture:** The latch lives in Components beside the snare SM (the KeyZ edge + decideImbue per frame; `ctx.castFired` is clean there because the #72 cast branch routes through the same file). On 'consume': spend ZONE_COST + `armImbueCast(KIND_BY_SPELL[activeSpell])` (a new single-slot in elemancerChannel). EnhancedMagicSystem consumes the arm at projectile SPAWN (tagging `projectile.imbueKind`) and requests the zone at impact. The reticle tell is a low-frequency store boolean (`imbueArmed` — written only on arm/disarm edges, GLI-clean) tinting the crosshair white-gold + an 'IMBUE' label (the SNARE! precedent). The token chain gains `resonance: '#F5D76E'` (needed by M6's bar anyway).

**Tech Stack:** decideImbue (M2); canIgnite + ZONE_COST (M2); requestZone (M3); the snare-block wiring stencil (Components :686-740); the SNARE!/KineticBar HUD precedents; tokens→cssVars→tailwind chain.

---

### Task 1: the pure additions — KIND_BY_SPELL + the cast-arm slot (TDD)

**Files:** Modify `frontend/src/game/elemancer.js` + test; Modify `frontend/src/game/elemancerChannel.js` + test

- [x] **Step 1: failing tests** — elemancer.test.js gains:
```js
describe('S2-B4-M5: KIND_BY_SPELL (the element->zone mapping)', () => {
  it('maps all four spells to their zone kinds', async () => {
    const { KIND_BY_SPELL } = await import('./elemancer');
    expect(KIND_BY_SPELL).toEqual({ fireball: 'burning', iceball: 'frozen', lightning: 'conductive', arcane: 'resonant' });
  });
});
```
   elemancerChannel.test.js gains:
```js
describe('S2-B4-M5: the cast-arm slot (consume -> spawn handoff)', () => {
  it('armImbueCast -> consumeImbueCast returns the kind once, then null', async () => {
    const { armImbueCast, consumeImbueCast } = await import('./elemancerChannel');
    armImbueCast('burning');
    expect(consumeImbueCast()).toBe('burning');
    expect(consumeImbueCast()).toBe(null);
  });
});
```
- [x] **Step 2: red → implement:** `export const KIND_BY_SPELL = { fireball: 'burning', iceball: 'frozen', lightning: 'conductive', arcane: 'resonant' };` (elemancer.js, with the docstring line "the cast's element decides the chemistry"); the channel gains a second single-slot `_castArm` with armImbueCast/consumeImbueCast (the same shape as the zone-request slot).
- [x] **Step 3: green → commit** `feat(elemancer-m5): KIND_BY_SPELL + the cast-arm slot`

### Task 2: the latch wiring in Components (the snare-block stencil)

**Files:** Modify `frontend/src/Components.jsx` (the snare SM block neighborhood :686-740 + the KeyZ edge beside the KeyX edge + the cast branch), `frontend/src/store/useGameStore.jsx` (the imbueArmed boolean pair)

- [x] **Step 1:** store: `imbueArmed: false, setImbueArmed: (v) => set({ imbueArmed: v }),` beside the soul fields.
- [x] **Step 2:** Components: a `keyZEdge` ref-pair beside the KeyX edge handling; a module-level `imbueSM = { current: makeImbueState() }` beside the snare SM; in the same useFrame, AFTER the snare block:
```js
      // ELEMANCER (S2-B4-M5): the imbue latch — Z arms the next cast (bank- and talent-gated);
      // the cast branch below stamps castFiredThisFrame when the cast verb routes.
      const imbueOut = decideImbue(imbueSM.current, {
        imbueEdge: zEdge, castFired: castFiredRef.current, active: stv.gameStarted && !stv.isPaused,
        alive: stv.health > 0,
        canIgnite: rCanIgnite(stv.resonanceBanked) && (stv.unlockedTalents?.['elemancer_imbue'] > 0),
      });
      imbueSM.current = imbueOut.sm;
      if (imbueOut.action === 'arm') stv.setImbueArmed(true);
      else if (imbueOut.action === 'disarm') stv.setImbueArmed(false);
      else if (imbueOut.action === 'consume') {
        stv.setImbueArmed(false);
        stv.accrueResonance(-ZONE_COST);
        armImbueCast(KIND_BY_SPELL[stv.activeSpell] || 'burning');
      }
      castFiredRef.current = false;
```
   (imports: `decideImbue, makeImbueState, KIND_BY_SPELL` from game/elemancer; `canIgnite as rCanIgnite, ZONE_COST` from game/resonance; `armImbueCast` from game/elemancerChannel. `castFiredRef.current = true` is set inside the #72 'cast' route branch. VERIFY the exact names of gameStarted/isPaused/health in stv at build — twin whatever the snare block's ctx uses.)
- [x] **Step 3:** the wiring locks in the elemancer gate file: Components must match `/decideImbue\(/` and `/armImbueCast\(/`.
- [x] **Step 4: battery → commit** `feat(elemancer-m5): the imbue latch wired — Z arms, the cast consumes (bank+talent gated)`

### Task 3: the spawn tag + the impact request

**Files:** Modify `frontend/src/EnhancedMagicSystem.jsx`

- [x] **Step 1:** at projectile creation (find the push into the projectiles list): `imbueKind: consumeImbueCast(),` (null for normal casts — one consume per cast, single-slot semantics).
- [x] **Step 2:** at the TERRAIN-impact branch (the groundLevel check) AND the mob-hit branch (after damageMob): `if (projectile.imbueKind) { requestZone({ kind: projectile.imbueKind, pos: projectile.position }); projectile.imbueKind = null; }` — null-out so a piercing projectile spawns at most ONE zone. The age-out branch gets NO request (the fizzle, recorded above).
- [x] **Step 3:** the gate file wiring lock: EnhancedMagicSystem must match `/requestZone\(/`. (EnhancedMagicSystem is NOT in the no-re-mesh GATED list — it predates the Aspect and legitimately touches other systems; only the wiring lock applies.)
- [x] **Step 4: battery → commit** `feat(elemancer-m5): imbued impacts paint zones (terrain + mob hits; age-out fizzles)`

### Task 4: the reticle tell + the token

**Files:** Modify `frontend/src/theme/tokens.js` (+cssVars +tailwind: `resonance: '#F5D76E'` — the soul-chain precedent), the crosshair component (FIND at build: grep crosshair/reticle in HUD.jsx/Components.jsx), KEVIN-REVIEW-BATCH

- [x] **Step 1:** the token chain (tokens → `--ui-resonance` → tailwind `resonance`).
- [x] **Step 2:** the crosshair: when `useGameStore((s) => s.imbueArmed)` — tint white-gold + an 'IMBUE' label under it (the SNARE! shape; i18n via t() with EN default).
- [x] **Step 3:** KRB: the M5 playtest cue (bank by building → Z → cast at ground → the zone appears; fire+ice steam; the rune amplifies).
- [x] **Step 4: full battery → commit** `feat(elemancer-m5): the white-gold armed reticle + the resonance token`

### Task 5: close-out — spec §3 M5 row ✅ · this plan SHIPPED · ACTIVE_PLAN → M6 (THE LOOK: the instanced decal pool + char decals + the rune + SFX + the elemancerShowcase card).

## Self-review
- Spec coverage: M5 row = "KeyZ intent + the armed reticle + the surfaceHint thread + zone spawn at impact" — T2/T4/T1+T3/T3 ✓. The design's surfaceHint (block-identity at impact) is NOT needed for zone SPAWNING (kind comes from the spell, not the surface) — it becomes load-bearing only for M6+ (fire-spread along worldBlocks wood); recorded so M6 picks it up.
- Placeholders: none — the two VERIFY-at-build notes (stv field names; the crosshair component) are locate instructions against named stencils, with the wiring locks enforcing the outcome.
- Type consistency: armImbueCast(kind:string) ↔ consumeImbueCast():string|null ↔ projectile.imbueKind; ZONE_COST spent exactly once at 'consume'; the latch's canIgnite composition mirrors canSnare ∧ talent (the :698 precedent).
