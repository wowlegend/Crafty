import { Vector3 } from 'three';
import { ecs, alliesQuery } from '../ecs/world';
import { rosterOf } from '../game/squadRoster.js';
import { HYBRIDS, hybridAlly } from '../game/hybrids.js';
import { mobEntity } from '../game/mobTypes.js';
import { FOLLOW_RING } from '../game/squadAI.js';
import { groundForMover } from '../game/mobFloor.js';
import { BASE_CAPSULE } from '../game/beasts.js';

// Where a rebuilt creature stands: just outside the squad's follow ring around the player, spread by its place in the
// roster, so the squad's first steps walk it in (world/SquadAISystem.jsx ground-snaps every step it orders), and half a
// block over its own floor as those steps put it, found from the player's feet; where no floor is known yet (a boot,
// before the terrain), over the player's feet. Just after a load the store's playerPosition is the save's, the base
// capsule's centre (game/saveSchema.js savePosition), so the feet are its lower end.
const REBUILD_M = FOLLOW_RING.max + 1;
const CENTRE_OVER_FEET = BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius;
let minted = 0;

/** Whether two rosters hold the same creatures in the same order. */
const sameRoster = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((e, i) => e.type === b[i].type);

/**
 * The ally entity for a roster entry at `position` (a THREE.Vector3, the spawn contract MobModel reads): a hybrid as its
 * fusion makes it, a mob type as a bind leaves the mob the spawner made (game/mobTypes.js mobEntity, then what
 * convertMobToAlly does to it: an ally, whole, not aggroed, its type its fusion key).
 */
function allyFor(entry, id, position) {
  const def = HYBRIDS[entry.type];
  if (def) return hybridAlly(def, id, position, 0);
  const e = mobEntity(entry.type, id, position);
  delete e.isMob;
  e.isAlly = true;
  e.baseType = entry.type;
  return e;
}

/**
 * The squad's two owners, kept as one (deep audit 2026-10-30, lane L3). The store's `squad` is the roster the save
 * writes; the ECS's allies are its bodies. Every way the ECS squad changes (a bind, a fusion, the cap's release) is an
 * add or a remove on the allies query, and each writes the roster; a world load (the store's worldLoadedAt, and at
 * install, which follows the boot's load) rebuilds the bodies from the roster at the player. Returns the uninstall.
 * @param {{ getState: () => object, setState: (p: object) => void, subscribe: (fn: (s: object, prev: object) => void) => () => void }} store
 */
export function installSquadPersistence(store) {
  let rebuilding = false;
  // A remove is announced before the entity leaves the query (miniplex 2.0), so the one leaving is left out here.
  const sync = (leaving = null) => {
    if (rebuilding) return;
    const roster = rosterOf(alliesQuery.entities.filter((e) => e !== leaving));
    if (!sameRoster(roster, store.getState().squad)) store.setState({ squad: roster });
  };
  const rebuild = () => {
    rebuilding = true;
    try {
      for (const a of [...alliesQuery.entities]) ecs.remove(a);
      const { squad, playerPosition, getMobFloor, getMobGroundLevel } = store.getState();
      const p = playerPosition || { x: 0, y: 18, z: 0 };
      const feet = p.y - CENTRE_OVER_FEET;
      squad.forEach((entry, i) => {
        const angle = (i / squad.length) * Math.PI * 2;
        const x = p.x + Math.cos(angle) * REBUILD_M, z = p.z + Math.sin(angle) * REBUILD_M;
        const floor = groundForMover(getMobFloor, getMobGroundLevel, x, z, feet, true);
        ecs.add(allyFor(entry, `ally_${++minted}`, new Vector3(x, (Number.isFinite(floor) ? floor : feet) + 0.5, z)));
      });
    } finally {
      rebuilding = false;
    }
  };
  rebuild();
  const offAdded = alliesQuery.onEntityAdded.subscribe(() => sync());
  const offRemoved = alliesQuery.onEntityRemoved.subscribe((e) => sync(e));
  const offLoad = store.subscribe((s, prev) => { if (s.worldLoadedAt !== prev.worldLoadedAt) rebuild(); });
  return () => { offAdded(); offRemoved(); offLoad(); };
}
