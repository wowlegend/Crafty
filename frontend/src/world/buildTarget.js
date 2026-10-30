// The cell a left click mines and the build outline frames, from the build ray's hit (world/Terrain.jsx castBuildRay and
// TargetOutline share it, so the outline always frames the cell the click takes).

/**
 * A camera inside a placed block takes that block. From inside, the ray meets the block's own inner face, so the step
 * past the hit lands in the cell beyond, and a left click mined a neighbour while the block around the player stayed:
 * the player could neither see it (its faces point outward) nor clear it. world/placeAtHit.js no longer places into the
 * body, but a save written before it can still hold such a block (Kevin, 2026-10-30). Only placed blocks are known on
 * the main thread (store.worldBlocks); generated terrain is the worker's.
 *
 * @param {{x:number,y:number,z:number}} hitPoint where the build ray met a collider
 * @param {{x:number,y:number,z:number}} scaledDirection the ray's direction already multiplied by its time of impact
 *   (castBuildRay's preserved quirk: the step into the hit block is 0.01 of that, not 0.01 m)
 * @param {{x:number,y:number,z:number}} eye the ray's origin, the camera
 * @param {Map<string, number>} [worldBlocks] the placed blocks, keyed `x_y_z` (0 = mined)
 * @returns {{x:number,y:number,z:number}} the cell
 */
export function mineTarget(hitPoint, scaledDirection, eye, worldBlocks) {
    const ex = Math.floor(eye.x), ey = Math.floor(eye.y), ez = Math.floor(eye.z);
    if (worldBlocks?.get(`${ex}_${ey}_${ez}`)) return { x: ex, y: ey, z: ez };
    return {
        x: Math.floor(hitPoint.x + scaledDirection.x * 0.01),
        y: Math.floor(hitPoint.y + scaledDirection.y * 0.01),
        z: Math.floor(hitPoint.z + scaledDirection.z * 0.01),
    };
}
