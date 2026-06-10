# SOULBIND M7 — Showcase Fixture + Balance + The Aspect Close Implementation Plan

> **✅ SHIPPED (2026-06-10, loop iters 55-60):** T1 the fixture + the 5/5 judge pass (and the invisible-hybrid bug family closed en route: Vector3 + the entity contract) · T2 the balance table (verdict: as-specced, four dampers hold) · T3 the 🏆 Aspect close. 783 unit · build · visual 13/13.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-10-crafty-s2b3-soulbind-design.md` §3 M7.
> **The instrument finding that shapes T1:** the codebase already has a PROVEN sky-studio fixture family
> (character/boss/spell-cast/loot showcase hooks in App.jsx ~:244-380): capture-first, subjects at the
> y~146 sky band in separated X lanes (x=0/40/80/120), fixed deterministic camera, and the 13 baselines
> PROVE subjects render in capture this way — the iter-54 "capture suppresses entities" conclusion was
> wrong in some detail; the fixture pattern sidesteps it. TWIN IT EXACTLY; do not hand-roll.

**Goal:** A deterministic `soulbindShowcase` card (2 jade allies + the 3 hybrids + the tether) that closes the creature look-judge debt permanently; a documented squad-vs-siege balance check; the SOULBIND Aspect bannered complete across every surface.

**Architecture:** T1 twins the `lootShowcase` hook (App.jsx :361-380): `registerTestHook('soulbindShowcase', ...)` at a fresh lane (x=160, y=146), capture-first, fixed front-on camera, spawning the 5 creatures as isAlly entities in a row + a static `writeSnareState` thread between the two base allies. Judged by the loop at HD (the visual:capture driving path), then OPTIONALLY promoted to a 14th visual-gate state (a deliberate ADD — existing 13 untouched). T2 is a pure-math budget table in the spec (ally DPS × cap vs the siege ramp) with at most ONE conservative tunable change. T3 is doc-currency.

**Tech Stack:** the test-hook registry (App.jsx registerTestHook precedents); writeSnareState (M4); HYBRIDS/allies (M6); scripts/visual/capture.mjs (read its per-card driving loop before wiring the judge shot); siegeParams (game/dayNight.js :75-101); squadAI consts (M5).

---

### Task 1: the `soulbindShowcase` fixture + the loop's look judge

**Files:** Modify `frontend/src/App.jsx` (the hook, beside lootShowcase); judge artifacts to `.superpowers/s2b3-soulbind-m4-refs/`

- [x] **Step 1:** read the lootShowcase hook IN FULL (App.jsx :361-~395 — incl. how it enters capture + sets the camera) and twin:
```js
    // SOULBIND-showcase fixture (S2-B3-M7): the deterministic creature-judge card the M4-M6
    // look-debt forensics proved missing. Sky-studio lane x=160 (clear of character 0 / boss 40 /
    // loot 80 / spell 120 by >=40u). Five subjects left->right: jade-tinted spider ally, zombie
    // ally, then the 3 hybrids (dreadweaver / bonehide_bulwark / marrowspinner) — silhouette
    // distinctness reads across the row; the snare/fusion tether threads the two base allies.
    registerTestHook('soulbindShowcase', () => {
      const store = useGameStore.getState();
      store.setHudHidden(true);
      store.setCaptureStudio(true);
      store.setDangerLevel(0);
      store.setTimeOfDay(0.5);
      const OX = 160, OY = 146, OZ = -8, GAP = 3.2;
      const mk = (i, type, color, extra = {}) => ecs.add({
        isAlly: true, id: 940001 + i, position: { x: OX + (i - 2) * GAP, y: OY, z: OZ },
        type, baseType: type, health: 60, maxHealth: 60, color, lastAllyAttack: 0, ...extra });
      mk(0, 'spider', '#2F8F5F');
      mk(1, 'zombie', '#3DAF70');
      [HYBRIDS.dreadweaver, HYBRIDS.bonehide_bulwark, HYBRIDS.marrowspinner].forEach((h, j) => {
        mk(2 + j, h.id, h.color, { hybridId: h.id, bodySize: h.bodySize, headSize: h.headSize, legMode: h.legMode, health: h.health, maxHealth: h.health });
      });
      // the static thread between the two base allies (the tether judge, finally framed)
      writeSnareState({ channeling: true, targetId: 940001, progress: 0.8,
        from: { x: OX - 2 * GAP, y: OY + 0.5, z: OZ }, to: { x: OX - GAP, y: OY + 0.5, z: OZ } });
      // camera: front-on from +Z (the lootShowcase framing math — copy its exact camera call/values
      // adjusted to OX=160; READ how lootShowcase sets the camera and mirror it verbatim)
      ...
    });
```
  (imports: ecs already in App? VERIFY — add `alliesQuery`-module imports as needed: `import { ecs } from './ecs/world'`, `import { HYBRIDS } from './game/hybrids'`, `import { writeSnareState } from './game/snareChannel'`. NOTE: the tether system hides under isCaptureMode — the THREAD will NOT draw in capture; if so, judge the tether from the fixture in NON-capture mode (the hook minus enterCapture) OR accept the creatures-only card + the tether stays Kevin-playtest-judged; decide at build, record which.)
- [x] **Step 2:** drive it headlessly (the capture.mjs pattern: goto / wait ready / `enterCapture` / `soulbindShowcase` / settle / screenshot at HD) → judge: 5 silhouettes distinct? the jade family coherent? iterate ONCE (the tune precedent).
- [x] **Step 3:** IF the card is judge-worthy: consider promoting to a 14th visual-gate state (capture.mjs + the gate list + a NEW baseline; a deliberate ADD, self-eyeballed, KRB-noted). If deferred, record why.
- [x] **Step 4: full battery + commit** `feat(soulbind-m7): the soulbindShowcase fixture — the creature look-judge has a permanent instrument`

### Task 2: the squad-vs-siege balance table (pure math + at most one conservative tune)

**Files:** the spec's §3 M7 row gains the table; possibly ONE const change in `game/squadAI.js`

- [x] **Step 1:** compute and record in the spec: squad DPS (ALLY_DPS_HIT 12 / ATTACK_COOLDOWN_SEC 1.5 × cap 2-3 = 16-24 DPS sustained) vs the siege budget (read siegeParams: nightCount ramp × MOB_TYPES hostile HP 60-100 / their spawn cadence) + the M1 attribution guarantee (ally kills bank NOTHING — no economy distortion) + the v1 stance (enemies never target allies → squads are pure additive DPS; the trivialization channel is DPS-only, spawn-cap displacement was excluded at M3 by query-construction).
- [x] **Step 2:** verdict: if 24 DPS > ~40% of the early-night hostile HP throughput, halve ALLY_DPS_HIT once (justify in the commit); else ship as-specced (all consts Kevin-tunable). Record the table + verdict in the spec M7 row.
- [x] **Step 3: battery + commit** `balance(soulbind-m7): the squad-vs-siege budget table (verdict recorded)`

### Task 3: 🏆 the SOULBIND Aspect close-out (doc-currency is part of done)

- [x] Spec header gains the 🏆 ASPECT COMPLETE banner (the WILDHEART/VOIDHAND precedent: the full kit one-paragraph + evidence counts + the parked list: FPV playtest eyeball · the worker-faction v2 seam · pets-merge Kevin decision). All §3 rows ✅. SOTA-INITIATIVE banner: B3 ✅ COMPLETE → next on the spine. CHANGELOG: the M3-M7 + Aspect entry. KRB: the SOULBIND playtest protocol (bank Soul by day → weaken → snare → squad fights → fuse → the hybrid). ACTIVE_PLAN: the next unit decision recorded honestly — the charter §2.5 interleave is DUE AGAIN (the audio unit was iter 34; SOULBIND ran ~M2-M7 since) → an EXPERIENCE unit precedes B4/S3; strong candidates: game-feel/juice pass (hit reactions/ally bind ceremony) or the music-motif system v2 (per-Aspect stingers wired to roar/grab/bind — the #74 design's deferred half) or content variety (mob types — the 6-type roster is the visible ceiling). Pick via a quick value/cost rank at the next iteration's orient.

## Self-review
- Spec coverage: M7 row = "balance vs siegeParams + the playtest/KRB close + Aspect close-out" ✓ T2+T3; T1 is the M6-carried look-debt's proper resolution (the spec's judge clause).
- Placeholders: T1 Step 1's camera ellipsis is an explicit read-then-mirror against the named lootShowcase lines (not TBD); the tether-in-capture question is flagged with both outcomes pre-decided.
- Type consistency: the fixture uses the M6 entity shape exactly (isAlly/baseType/hybridId/bodySize...); ids 940001+ clear of the 9xxxxx diag ids.
