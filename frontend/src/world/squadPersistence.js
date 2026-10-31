import { Vector3 } from 'three';
import { ecs, alliesQuery } from '../ecs/world';
import { rosterOf, allyFor, sameRoster } from '../game/squadRoster.js';
import { FOLLOW_RING } from '../game/squadAI.js';

// Where a rebuilt creature stands: just outside the squad's follow ring around the player, spread by its place in the
// roster, so the squad's first steps walk it in and stand it on the ground (world/SquadAISystem.jsx ground-snaps every
// step it orders; a creature inside the ring holds still and would keep the height it was put at).
const REBUILD_M = FOLLOW_RING.max + 1;
let minted = 0;

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
      const { squad, playerPosition } = store.getState();
      const p = playerPosition || { x: 0, y: 18, z: 0 };
      squad.forEach((entry, i) => {
        const angle = (i / squad.length) * Math.PI * 2;
        const at = new Vector3(p.x + Math.cos(angle) * REBUILD_M, p.y, p.z + Math.sin(angle) * REBUILD_M);
        ecs.add(allyFor(entry, `ally_${++minted}`, at));
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
