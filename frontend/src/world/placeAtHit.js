// The PLACE verb's executor: what one placement on a face does to the world and the inventory. Terrain.jsx owns the
// build ray and the terrain worker and hands the worker's batched edit in (world/cellEdits.js); the rest lives here so
// the unit suite drives the same function the verb router calls (tests/gates/place-executor-gates.test.jsx,
// tests/gates/build-tools-worker-gates.test.js).
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { BLOCK_TYPES } from './Blocks';
import { idForBlock } from './blockIds';
import { buildFootprint } from '../game/buildFootprint.js';
import { CHUNK_HEIGHT } from './chunkLayout.js';
import { GOODS } from '../game/forge.js';
import { notifyDenied } from '../ui/denyToast.js';

// The blocks only Mara's Forge makes: their refusal says where more come from.
const FORGED = new Set(GOODS.map((g) => g.give));

// A block written into a cell the player's body fills holds them for good: the chunk's trimesh collider stops the
// capsule from inside, the build ray from inside hits the block's inner face (so mining takes the cell beyond it), and
// with the camera in the cell every face points away from the eye and the FrontSide terrain material culls it, so the
// block cannot be seen (Kevin, 2026-10-30; tests/integration/place-clear-of-player-rapier.test.jsx). So no cell the body
// fills is placed. The test is the capsule itself, not the KCC's 0.05 m offset around it: a cell inside that offset
// band but clear of the capsule does not hold the player (measured at gaps 0 to 0.1 m against real Rapier), and
// refusing it would refuse a block laid against the player's side.
function bodyCapsules(store) {
    const body = store.playerRigidBodyRef?.current;
    if (!body) return [];
    const out = [];
    // Where the body is and where it is going: the world steps before the Player loop moves the body, so between frames,
    // where a click is handled, the frame's move is in nextTranslation() and not yet in translation(), at any frame rate
    // (game/kinematicMove.js), and the next step puts the body there.
    const at = body.translation();
    const next = body.nextTranslation();
    // The live colliders, not BASE_CAPSULE: a beast form swaps the shape in place (game/beasts.js setColliderToForm).
    // Placed from the body, not read from the collider: a teleport (the Player loop's respawn and load placements,
    // setTranslation) moves the body at once and its collider only at the next world step, and a click between the two
    // read the capsule where it had been (chaos session deep, 120 Hz, lag 8, seed 1).
    for (let i = 0; i < body.numColliders(); i++) {
        const c = body.collider(i);
        const off = c.translationWrtParent() || { x: 0, y: 0, z: 0 };
        const p = { x: at.x + off.x, y: at.y + off.y, z: at.z + off.z };
        const halfHeight = c.halfHeight(), radius = c.radius();
        out.push({ x: p.x, y: p.y, z: p.z, halfHeight, radius });
        out.push({ x: p.x + next.x - at.x, y: p.y + next.y - at.y, z: p.z + next.z - at.z, halfHeight, radius });
    }
    return out;
}

// The body's rotations are locked, so each capsule's core is a vertical segment; the distance from it to the unit cell
// is the box distance on each axis, and the cell overlaps the capsule when that is under the radius.
function cellInCapsule(cell, cap) {
    const dx = Math.max(cell.x - cap.x, 0, cap.x - (cell.x + 1));
    const dz = Math.max(cell.z - cap.z, 0, cap.z - (cell.z + 1));
    const dy = Math.max(cell.y - (cap.y + cap.halfHeight), 0, (cap.y - cap.halfHeight) - (cell.y + 1));
    return Math.hypot(dx, dy, dz) < cap.radius;
}

/**
 * @param {{hitPoint: THREE.Vector3, normal: ({x:number,y:number,z:number}|null), direction: THREE.Vector3}|null} h the build-ray hit
 * @param {{editCells: (edit: {blockType: number, cells: {x: number, y: number, z: number, seq?: number}[]},
 *   onApplied: (applied: number[], recordable?: number[]) => void) => void, playPlace?: (pos: THREE.Vector3, block: string) => void,
 *   cells?: {add: (x: number, y: number, z: number) => number}}} io `editCells` sends the cells to the terrain worker as
 *   one batch and hands back the ones it filled, and of those the ones no later edit has recorded since (world/cellEdits.js;
 *   all of them when it does not say); `cells` holds each sent cell solid from the click (world/placedCellColliders.js)
 *   and numbers its edit
 * @returns {Promise<number>} the cells placed, once the worker has said which it filled (0 = refused)
 */
export function placeAtHit(h, { editCells, playPlace, cells: solidCells }) {
    if (!h) return Promise.resolve(0);
    const store = useGameStore.getState();
    const type = store.selectedBlock || 'grass';
    // `null` means the engine has no voxel for this block: refused, never substituted (world/blockIds.js).
    const numericType = idForBlock(type);
    if (numericType === null) return Promise.resolve(0);
    const placeDirection = h.normal ? new THREE.Vector3(h.normal.x, h.normal.y, h.normal.z) : h.direction.clone().multiplyScalar(-1);
    const placePos = h.hitPoint.clone().add(placeDirection.multiplyScalar(0.01));
    const tx = Math.floor(placePos.x);
    const ty = Math.floor(placePos.y);
    const tz = Math.floor(placePos.z);

    // Transient getState reads, not a subscription, so Game-Loop-Isolation holds. buildFootprint caps the cell count;
    // its header says why the cap is an economy decision, given the per-cell debit below. A chest is one storage
    // container keyed by its own cell, so it always places as a single cell at the aimed one, whatever the build mode;
    // the Delete Tool's footprint is its left-click's (world/mineAtHit.js), so its right-click places one block.
    const mode = type === 'chest' || store.buildingMode === 'delete' ? 'single' : store.buildingMode || 'single';
    const footprint = buildFootprint(mode, store.buildSize || 1, { x: tx, y: ty, z: tz }, h.normal);
    // Held back before anything is spent: a cell outside the world (the worker has no voxel there and drops it), a block
    // the player built, a chest's wood included (store.worldBlocks records every placed cell; the worker would refuse it
    // too), and a cell the body fills.
    const inWorld = footprint.filter((c) => c.y >= 0 && c.y < CHUNK_HEIGHT);
    const open = inWorld.filter((c) => !(store.worldBlocks.get(`${c.x}_${c.y}_${c.z}`) > 0));
    const body = bodyCapsules(store);
    const cells = open.filter((c) => !body.some((cap) => cellInCapsule(c, cap)));
    // Said whenever a cell is held back, a footprint's included: a gap the player did not see coming reads as a bug. One
    // notice a click (the toast is throttled), the body's first.
    if (cells.length < open.length) notifyDenied('in-the-way');
    else if (inWorld.length < footprint.length) notifyDenied('off-world');
    else if (open.length < inWorld.length) notifyDenied('occupied');

    // Placement spends the block, and the debit is the stop condition: a footprint the stack cannot cover pays for what
    // it can afford. Mining grants +1, so any free cell is an infinite-material loop. It is spent at the click, so a
    // second click before the worker answers cannot spend the same blocks, and what the worker does not fill is paid back.
    const paid = [];
    for (const c of cells) {
        if (!store.consumeForPlacement(type)) break;
        paid.push(c);
    }
    if (paid.length === 0) {
        // Not one cell affordable: say so, or an empty stack reads as a dead button.
        if (cells.length > 0) notifyDenied(FORGED.has(type) ? 'no-block-forge' : 'no-block', BLOCK_TYPES[type]?.name || type);
        return Promise.resolve(0);
    }
    // Solid now, not when the chunk's trimesh lands some frames later; the worker echoes `seq` on the meshes it makes
    // after this edit, which is how the cuboid knows when the trimesh holding this cell exists. A cell the worker then
    // refuses already holds a block, so its cuboid stands where the ground already does until that mesh.
    const sent = paid.map((c) => ({ x: c.x, y: c.y, z: c.z, seq: solidCells?.add(c.x, c.y, c.z) }));

    return new Promise((resolve) => {
        editCells({ blockType: numericType, cells: sent }, (applied, recordable = applied) => resolve(settle(applied, recordable)));
    });

    /** The worker's answer: pay back what it did not fill; credit and sound what it did, and record the cells it filled
     *  that no edit since the click has recorded (a mine of the stand-in before the answer: the worker holds its air). */
    function settle(applied, recordable) {
        const s = useGameStore.getState();
        const filled = applied.map((i) => paid[i]);
        if (filled.length < paid.length) {
            s.addToInventory(type, paid.length - filled.length);
            notifyDenied('occupied');
        }
        if (filled.length === 0) return 0;

        // Once per action, not per cell: a 64-cell footprint must not bank 64 ember ticks or stack 64 place sounds. The
        // store pays it only by day and only up to the day's building allowance (game/ember.js).
        s.accrueBuildEmber();
        playPlace?.(placePos, type);
        // A low spark count keeps the iPad fill-rate envelope.
        const puffColor = (BLOCK_TYPES[type] && BLOCK_TYPES[type].color) || '#cccccc';
        s.triggerGPUSparks?.(placePos, puffColor, 6, 'physical');

        const kept = recordable.map((i) => paid[i]);
        if (kept.length) {
            const newBlocks = new Map(s.worldBlocks);
            for (const c of kept) newBlocks.set(`${c.x}_${c.y}_${c.z}`, numericType);
            s.setWorldBlocks(newBlocks);
        }

        // The chest's identity lives in the `chests` Map; its voxel is wood (world/blockIds.js BLOCK_ALIAS).
        if (type === 'chest' && kept.length) {
            const newChests = new Map(s.chests);
            newChests.set(`${tx}_${ty}_${tz}`, { inventory: {}, name: 'Wooden Chest' });
            useGameStore.setState({ chests: newChests });
        }

        // One count per place verb, for the Master Builder achievement (the callback is registered by QuestSystem).
        s.onBlockPlace?.();
        return filled.length;
    }
}
