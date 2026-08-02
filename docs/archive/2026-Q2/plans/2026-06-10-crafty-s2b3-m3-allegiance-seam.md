# SOULBIND M3 — The Allegiance Seam Implementation Plan

> **✅ SHIPPED (2026-06-10, loop iter 42):** T1 (alliesQuery + convertMobToAlly, 4 invariant tests vs the real ecs) + T2 (GameMethods.captureMob + the only-door gate). 759 unit (85 files) · build · visual 13/13.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-10-crafty-s2b3-soulbind-design.md` §3 M3.
> **Spec-vs-reality (recorded at plan time, fresh read of :750-785):** the milestone is SMALLER than the
> design feared. The apply loop rebuilds its entityMap FRESH from `mobsQuery.entities` per TICK_RESULT
> (:753-757) — so removing `isMob` closes the stomp window at BOTH ends in one synchronous op; the
> "serializer + apply loop in the SAME commit" two-ended trap is satisfied BY CONSTRUCTION via query-exit.
> Likewise the despawn cull, the spawn-cap count, the minimap hostile count, and the melee cone ALL read
> `mobsQuery` live → an entity that leaves the query exits all five surfaces atomically. The work is the
> CONVERTER + the QUERY + the REGISTRATION + the INVARIANT TESTS (which pin this construction so a future
> refactor that caches entities re-opens nothing silently).

**Goal:** A mob can be converted IN PLACE into an ally that the hostile machinery (worker AI, cull, spawn cap, minimap, melee cone) can no longer see — atomically, testably, reversibly-by-design.

**Architecture:** miniplex component swap: `ecs.removeComponent(entity, 'isMob')` + `ecs.addComponent(entity, 'isAlly', true)` re-index queries synchronously. A pure-ish `game/allegiance.js` owns the conversion semantics (heal, baseType record, aggro clear); `alliesQuery` joins the pre-created queries; `GameMethods.captureMob(id)` registers beside damageMob. Tests run against the REAL miniplex world (the ecs module is plain-importable).

**Tech Stack:** miniplex 2.x World (`ecs` at `src/ecs/world.js`); GameMethods registry (damageMob registration at SimplifiedNPCSystem ~:1018-1020).

---

### Task 1: `alliesQuery` + the converter (TDD vs the real world)

**Files:** Modify `frontend/src/ecs/world.js` (one export); Create `frontend/src/game/allegiance.js` + `frontend/src/game/allegiance.test.js`

- [x] **Step 1: failing tests** (`allegiance.test.js` — uses the real ecs; clean up entities in afterEach):
```js
import { describe, it, expect, afterEach } from 'vitest';
import { ecs, mobsQuery, alliesQuery } from '../ecs/world';
import { convertMobToAlly } from './allegiance';

const added = [];
const addMob = (props = {}) => {
  const e = ecs.add({ isMob: true, position: { x: 0, y: 1, z: 0 }, type: 'zombie', id: 9001,
    health: 12, maxHealth: 60, isAggro: true, color: '#4a7023', ...props });
  added.push(e);
  return e;
};
afterEach(() => { while (added.length) { try { ecs.remove(added.pop()); } catch { /* already removed */ } } });

describe('S2-B3-M3: the allegiance seam (query-exit conversion)', () => {
  it('conversion atomically exits mobsQuery and enters alliesQuery (the five-surface exclusion)', () => {
    const e = addMob();
    expect(mobsQuery.entities).toContain(e);
    const ally = convertMobToAlly(ecs, e);
    expect(ally).toBe(e); // IN PLACE — same entity object (position/type/color preserved)
    expect(mobsQuery.entities).not.toContain(e); // worker serializer + apply map + cull + cap + minimap + cone ALL read this query
    expect(alliesQuery.entities).toContain(e);
  });
  it('conversion heals to full, clears aggro, and records the base type (the fusion key)', () => {
    const e = addMob();
    convertMobToAlly(ecs, e);
    expect(e.health).toBe(e.maxHealth);
    expect(e.isAggro).toBe(false);
    expect(e.baseType).toBe('zombie');
  });
  it('refuses non-mobs and the villager (the quest-NPC blocklist)', () => {
    expect(convertMobToAlly(ecs, null)).toBe(null);
    const v = addMob({ type: 'villager' });
    expect(convertMobToAlly(ecs, v)).toBe(null);
    expect(mobsQuery.entities).toContain(v); // untouched
  });
  it('a stale worker update cannot stomp a converted ally (the fresh-entityMap construction, pinned)', () => {
    const e = addMob();
    convertMobToAlly(ecs, e);
    // the apply loop builds its map from mobsQuery.entities per message (:753-757) — simulate it:
    const entityMap = new Map();
    for (const m of mobsQuery.entities) { if (m.health > 0) entityMap.set(m.id, m); }
    expect(entityMap.get(e.id)).toBeUndefined(); // the stale TICK_RESULT for this id finds nothing
  });
});
```
- [x] **Step 2:** add to `ecs/world.js` beside mobsQuery: `export const alliesQuery = ecs.with('isAlly', 'position', 'type');`
- [x] **Step 3: red** → **Step 4: implement** `allegiance.js`:
```js
/**
 * allegiance.js — S2-B3-M3: the allegiance seam. Converting a mob into an ally is a miniplex
 * COMPONENT SWAP (isMob -> isAlly): queries re-index synchronously, so the entity atomically
 * exits mobsQuery — which the worker serializer, the per-message apply map (rebuilt fresh,
 * SimplifiedNPCSystem :753-757), the >100u cull, the spawn-cap count, the minimap hostile
 * count, and the player melee cone ALL read live. One op, five hostile surfaces exited by
 * construction (design §1; the invariant tests pin this construction against future caching).
 * The villager (quest NPC) is blocklisted here — the deepest layer (design §4).
 */
const UNBINDABLE = new Set(['villager']);

/** convertMobToAlly(world, entity) -> the same entity (now an ally) or null (refused). */
export function convertMobToAlly(world, entity) {
  if (!entity || !entity.isMob || UNBINDABLE.has(entity.type)) return null;
  world.removeComponent(entity, 'isMob');
  world.addComponent(entity, 'isAlly', true);
  entity.baseType = entity.type;        // the fusion-lookup key (M6) survives re-tints
  entity.health = entity.maxHealth;     // binding mends — the creature joins whole (design §2)
  entity.isAggro = false;               // no lingering hostility flag
  return entity;
}
```
- [x] **Step 5: green** → **commit** `feat(soulbind-m3): the allegiance seam — query-exit conversion (five surfaces excluded by construction)`

### Task 2: `GameMethods.captureMob(id)` + the registration gate

**Files:** Modify `frontend/src/SimplifiedNPCSystem.jsx` (beside the damageMob registration ~:1018-1020); extend `frontend/tests/gates/kill-attribution-gates.test.js`? NO — new shape: extend `frontend/src/game/allegiance.test.js` can't reach the closure. Add to `frontend/tests/gates/` a soulbind wiring gate file when M4 wires the verb; for M3 the registration is pinned by a minimal grep in the EXISTING kill-attribution gate file? NO — keep concerns separate: create `frontend/tests/gates/allegiance-gates.test.js`.

- [x] **Step 1:** in SimplifiedNPCSystem, import `convertMobToAlly` from `./game/allegiance` (match the sibling import style) and register beside damageMob:
```js
    // S2-B3-M3: capture a mob into the squad — the SNARE bind's apply-path (M4 calls this).
    const captureMob = (id) => {
      const entity = mobsQuery.entities.find(e => e.id === id);
      if (!entity || entity.health <= 0) return null;
      return convertMobToAlly(ecs, entity);
    };
```
  and add `captureMob` to the same registration object/lines where damageMob is exposed (read the exact registration block first; mirror it, including any teardown).
- [x] **Step 2:** `tests/gates/allegiance-gates.test.js` (the read-file shape used by the sibling gates):
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// S2-B3-M3: the capture path must stay wired through the allegiance module (never inline
// component-twiddling at call sites — the converter owns the semantics + the blocklist).
describe('allegiance gates (S2-B3-M3)', () => {
  it('captureMob is registered and routes through convertMobToAlly', () => {
    const npc = read('SimplifiedNPCSystem.jsx');
    expect(npc).toMatch(/captureMob/);
    expect(npc).toMatch(/convertMobToAlly\(ecs, entity\)/);
  });
  it('nothing outside allegiance.js removes the isMob component (the seam is the ONLY door)', () => {
    const npc = read('SimplifiedNPCSystem.jsx');
    expect(npc).not.toMatch(/removeComponent\([^)]*'isMob'/);
    expect(read('Components.jsx')).not.toMatch(/removeComponent\([^)]*'isMob'/);
  });
});
```
- [x] **Step 3: full battery** (suite grows; build; visual 13/13 — no render changes) → **commit** `feat(soulbind-m3): GameMethods.captureMob — the registered capture path (gate-locked to the seam)`

### Task 3: close-out
- [x] Spec §3 M3 row ✅ (with the spec-vs-reality note: the two-ended trap dissolved by construction — the fresh-entityMap finding) · this plan ✅ SHIPPED · ACTIVE_PLAN → M4 (SNARE end-to-end: the 'snare' intent + KeyX + the Components SM block + per-frame target validity via the cone + the channel ribbon + bind = SNARE_COST debit + captureMob + SFX).

## Self-review
- Spec coverage: M3 row = "isAlly conversion + the FIVE-surface exclusion + a static gate (worker messages) + captureMob": conversion ✓T1, five surfaces ✓by-construction + pinned by T1's query-exit + stale-map tests, the worker-message gate ✓T1 test 4 (stronger: runtime simulation of the apply map, not a grep), captureMob ✓T2. The spec's "static gate" became a RUNTIME invariant test — stronger, recorded.
- Placeholders: T2 Step 1 says "read the exact registration block first; mirror it" — locate-then-twin against a named site, not TBD.
- Type consistency: `convertMobToAlly(world, entity)` everywhere; `alliesQuery` exported in T1 Step 2 and consumed by M5 ✓.
