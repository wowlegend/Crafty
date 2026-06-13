// THE HEARTH — the crafted home-anchor plinth at the world origin (World-Design M1).
// A flat, above-water, fully deterministic platform stamped at chunk-gen time. The spawn probe
// (Components.jsx:892-930) raycasts ground at (0,0) and drops the player groundY+1.2, so this
// flat top simply BECOMES the spawn floor — no spawn code changes. Pure coordinate math (NO RNG):
// the same seed regenerates the identical Hearth every load, zero save data (like the dungeon).
//
// HEARTH_Y is the natural origin grade (≈50 for the locked seed 12345 — computed across the
// footprint: min 41 / max 58 / avg 49.5) raised a few voxels, so the plinth is a gently-raised
// crafted PAD flush-to-slightly-above the local terrain — NOT a sunken pit (the early "~Y30"
// design assumption was wrong by ~20 voxels; corrected against the real worldgen height formula).
const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 256;

export const HEARTH_Y = 56;       // a raised pad over the ≈y50 origin grade; >> the water fill (y<=28)
export const HEARTH_RADIUS = 7;   // world [-7,7] in x/z -> a 15x15 standable platform
const STONE = 3;                  // existing block id (no new blocks in M1 — palette is M4)

// The 4 origin chunks the plinth touches: cx,cz in {-1,0} (world [-16,16) spans the corner quad).
export function isHearthChunk(cx, cz) {
  return (cx === -1 || cx === 0) && (cz === -1 || cz === 0);
}

function idx(x, y, z) {
  return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
}

// Flatten the Hearth footprint in THIS chunk to a solid plinth capped at HEARTH_Y, clearing
// everything above (natural hills / trees / overhang). Must run AFTER the main gen + foliage
// (so it removes any tree that spawned in its footprint) and BEFORE the player-mod replay
// (so player edits still win). No-op on every chunk but the four origin chunks.
export function stampHomeAnchor(blocks, cx, cz) {
  if (!isHearthChunk(cx, cz)) return;
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = baseX + lx;
      const wz = baseZ + lz;
      if (Math.abs(wx) > HEARTH_RADIUS || Math.abs(wz) > HEARTH_RADIUS) continue; // square footprint
      // Fill any gap (air/water) up to the cap so the platform never floats; keep natural rock.
      for (let y = 0; y <= HEARTH_Y; y++) {
        const i = idx(lx, y, lz);
        const b = blocks[i];
        if (b === 0 || b === 9) blocks[i] = STONE; // 0=air, 9=water
      }
      blocks[idx(lx, HEARTH_Y, lz)] = STONE;       // a clean stone cap
      for (let y = HEARTH_Y + 1; y < CHUNK_HEIGHT; y++) blocks[idx(lx, y, lz)] = 0; // clear above
    }
  }
}
