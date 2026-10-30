// A placed block is solid to the player from the click, not from its chunk's trimesh rebuild. That trimesh arrives after
// three hops (terrain.worker.js re-meshes the chunk, Terrain.jsx sets the chunk, @react-three/rapier 2.2 rebuilds the
// TrimeshCollider in a passive effect), and a player running into the cell meanwhile was inside it when it landed: held,
// with the eye inside a block whose faces all point away (DECISIONS 2026-10-30 item 132). So every placed cell gets a fixed
// 1 m cuboid collider at the click, kept until its chunk's trimesh with that edit is in the broad phase.
//
// Rapier (rapier3d-compat 0.19.2) answers the character controller's sweep and every ray from a broad-phase BVH that only
// a world step updates, and the API has no call that updates it without stepping. A collider created between steps is
// found only where the leaf its reused slot inherited happens to lie: a lone chunk rebuilt in place gets its own old leaf
// back, but two chunks rebuilt in one React commit swap leaves, and a player pressed against a two-high step walked through
// it (tests/integration/place-clear-of-player-rapier.test.jsx). Hence:
//  - a cuboid made since the last step, and a chunk trimesh created since then, are listed by `unindexed()`, and
//    game/kinematicMove.js cuts the controller's swept movement at each one. @react-three/rapier's stepper runs before
//    the Player loop, so on a frame that steps the new collider is indexed before the sweep; the cut is for the sweep of
//    a frame that takes no step (above 60 Hz), which no click or rebuild can then slip past;
//  - a cuboid whose chunk trimesh has landed is removed after the next step, when that trimesh is indexed; removed at once,
//    the cell would be open to the controller for the frame before the step.
// Retirement goes by sequence: the click's update_block carries `seq`, the worker stamps every chunk_mesh with the last seq
// it has applied (`editSeq`), and a mesh retires only its own chunk's cuboids with seq <= editSeq, so a mesh made for an
// earlier message still in flight never retires a later cell.
//
// Cost: at most buildFootprint's MAX_CELLS cuboids a click, each alive from the click until one step after its chunk
// re-meshes; nothing is allocated per frame, and the cut costs one pairwise cast per unindexed collider, on one frame.
import { CHUNK_HEIGHT, chunkOf } from './chunkLayout.js';

/**
 * @param {import('@dimforge/rapier3d-compat').World} world the physics world the player's controller sweeps
 * @param {typeof import('@dimforge/rapier3d-compat')} rapier the Rapier module (ColliderDesc)
 */
export function createPlacedCellColliders(world, rapier) {
  /** @type {{collider: object, cx: number, cz: number, seq: number, landed: boolean}[]} */
  const cells = [];
  const unindexed = [];
  let lastSeq = 0;

  const drop = (i) => {
    const { collider } = cells[i];
    const u = unindexed.indexOf(collider);
    if (u >= 0) unindexed.splice(u, 1);
    if (world.getCollider(collider.handle)) world.removeCollider(collider, true);
    cells.splice(i, 1);
  };

  return {
    /** Make the cell at world (x, y, z) solid now. Returns the sequence number its update_block carries. */
    add(x, y, z) {
      lastSeq += 1;
      // The worker drops an edit outside the chunk's height, so no mesh would ever retire a cuboid there.
      if (y < 0 || y >= CHUNK_HEIGHT) return lastSeq;
      const collider = world.createCollider(rapier.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(x + 0.5, y + 0.5, z + 0.5));
      cells.push({ collider, cx: chunkOf(x), cz: chunkOf(z), seq: lastSeq, landed: false });
      unindexed.push(collider);
      return lastSeq;
    },
    /**
     * The chunk's trimesh holding every edit up to `editSeq` has been created (null when the mesh is empty); the chunk's
     * cuboids up to that edit go after the next step. Until that step the trimesh itself is unindexed too.
     */
    landed(cx, cz, editSeq, trimesh) {
      for (const c of cells) if (c.cx === cx && c.cz === cz && c.seq <= editSeq) c.landed = true;
      if (!trimesh) return;
      // A chunk's first trimesh is made on a body @react-three/rapier 2.2 creates at the origin and only then moves to
      // the chunk's place, and Rapier carries a body's move to its colliders at a step: until then the trimesh lies over
      // chunk 0_0, where the player spawns, and the cut would sweep against it there. The RigidBody's effect has moved
      // the body by now (it runs before this, its parent's), so this puts the trimesh where its body is. It moves no
      // collider whose body has not been set since the last step: not the player's, which a pending kinematic move
      // leaves at the stepped position.
      world.propagateModifiedBodyPositionsToColliders();
      unindexed.push(trimesh);
    },
    /** A world step ran: every collider made before it is indexed now, and a landed cell's trimesh with it. */
    afterStep() {
      unindexed.length = 0;
      for (let i = cells.length - 1; i >= 0; i--) if (cells[i].landed) drop(i);
    },
    /** The colliders made since the last step (cuboids and rebuilt trimeshes): the controller's sweep cannot see them. */
    unindexed: () => unindexed,
    /** The chunk unloaded: its cuboids go with it. */
    dropChunk(cx, cz) {
      for (let i = cells.length - 1; i >= 0; i--) if (cells[i].cx === cx && cells[i].cz === cz) drop(i);
    },
    /** The terrain was wiped (a world load) or unmounted. */
    clear() {
      for (let i = cells.length - 1; i >= 0; i--) drop(i);
      unindexed.length = 0;
    },
    /** How many placed cells are held solid by a cuboid. */
    size: () => cells.length,
  };
}
