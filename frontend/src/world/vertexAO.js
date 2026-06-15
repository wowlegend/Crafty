// Voxel ambient-occlusion corner factor — the classic "0fps" voxel-AO formula (0fps.net, 2013).
//
// For a face vertex, look at the THREE occluder voxels on the face's OUTWARD (+normal) side that
// touch that corner: the two edge-adjacent neighbours (side1, side2) and the diagonal (corner).
// Each arg is whether that occluder is SOLID (truthy = solid; block-id or boolean both work).
//
// Returns an AO LEVEL 0..3: 3 = fully open (brightest), 0 = most occluded (darkest contact-shadow).
// The special rule — if BOTH edge-sides are solid the corner reads fully occluded (0) regardless of
// the diagonal — is what makes voxel AO read as a soft contact-shadow in concave inner corners.
//
// Pure (no state, no GL) -> unit-testable. The mesher (terrain.worker.js) calls this per emitted
// quad-corner and bakes the result into the `aAO` geometry attribute; the terrain shader maps it to
// a diffuse multiplier. Capture-deterministic (depends only on the static voxel neighbourhood).
export function cornerAO(side1, side2, corner) {
  if (side1 && side2) return 0;
  return 3 - ((side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0));
}
