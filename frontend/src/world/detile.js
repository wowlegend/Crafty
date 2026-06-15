// Bold-flat de-tile: a bounded, deterministic per-world-cell value offset that breaks the
// repeated-identical-tile monotony of the voxel terrain WITHOUT leaving the flat-shaded look.
// The GLSL terrain shader (Terrain.jsx compileShader) mirrors this exact formula on
// floor(worldPos) so the JS unit test and the GPU agree on the same numbers.
// Pure (no state, no GL) -> unit-testable; depends only on the static integer world cell -> capture-deterministic.
export function tileValueOffset(wx, wy, wz) {
  const h = Math.sin(Math.floor(wx) * 12.989 + Math.floor(wy) * 78.233 + Math.floor(wz) * 37.719) * 43758.5453;
  const f = h - Math.floor(h);        // fract -> 0..1
  return (f - 0.5) * 0.16;            // +/- 0.08 (subtle: keeps the flat read)
}
