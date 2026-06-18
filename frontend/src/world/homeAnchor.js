// THE HEARTH — the crafted home-anchor plinth at the world origin (World-Design M1).
// A flat, above-water, fully deterministic platform stamped at chunk-gen time. The spawn probe
// (Components.jsx:892-930) raycasts ground at (0,0) and drops the player groundY+1.2, so this
// flat top simply BECOMES the spawn floor — no spawn code changes. Pure coordinate math (NO RNG):
// the same seed regenerates the identical Hearth every load, zero save data (like the dungeon).
//
// HEARTH_Y is the natural origin grade raised just enough to read as a deliberate crafted PAD that
// nestles FLUSH in the terrain — NOT a podium the player is perched on. W2-T7 (2026-06-17) FLUSHED
// the pad: was 56 (a 3-11 voxel plinth above the surrounding grade — Kevin "perched on an island").
// Re-measured under the W2-T7 enlarged continent (seed 12345): the footprint[-7..7] base grade is
// min 45 / max 53 / avg 49 — so 51 caps ~1.5 above the average and ~2 BELOW the footprint max: a
// gently-raised pad flush with the land, still well above the water fill (y<=28) so it never floods.
import { HUB_BUILDINGS } from './hubLayout.js';

const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 256;

export const HEARTH_Y = 51;       // a flush pad nestled in the ≈y45-53 origin grade; >> the water fill (y<=28)
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

// HUB_PAD: half-extent (blocks) of the small stone TERRACE flattened under each hub building so it
// sits FLUSH on the grade — covers the largest footprint (forge 3.4 wide -> half 1.7) + a margin.
export const HUB_PAD = 3;

// Flatten a small terrace under EACH frontier-outpost building (world/hubLayout.js HUB_BUILDINGS) to
// HEARTH_Y — same fill/cap/clear as stampHomeAnchor. Per-building patches (NOT one big disc) keep the
// natural terrain + trees BETWEEN buildings, so the outpost reads as a settlement carved into the
// frontier rather than a bald plaza. The buildings ring the plinth at r≈12-15 (off the [-7,7] core),
// so without this they float ~several blocks over the lower natural grass. Runs on the hearth chunks
// only, AFTER stampHomeAnchor + foliage, BEFORE the player-mod replay. NO-RE-MESH (baked into the
// chunk array, meshed once like all gen output).
export function stampHub(blocks, cx, cz) {
  if (!isHearthChunk(cx, cz)) return;
  const baseX = cx * CHUNK_SIZE;
  const baseZ = cz * CHUNK_SIZE;
  for (let lx = 0; lx < CHUNK_SIZE; lx++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = baseX + lx;
      const wz = baseZ + lz;
      let inPatch = false;
      for (const b of HUB_BUILDINGS) {
        if (Math.abs(wx - b.pos[0]) <= HUB_PAD && Math.abs(wz - b.pos[1]) <= HUB_PAD) { inPatch = true; break; }
      }
      if (!inPatch) continue;
      for (let y = 0; y <= HEARTH_Y; y++) {
        const i = idx(lx, y, lz);
        const bb = blocks[i];
        if (bb === 0 || bb === 9) blocks[i] = STONE; // 0=air, 9=water -> fill the gap so nothing floats
      }
      blocks[idx(lx, HEARTH_Y, lz)] = STONE;       // a clean stone foundation cap
      for (let y = HEARTH_Y + 1; y < CHUNK_HEIGHT; y++) blocks[idx(lx, y, lz)] = 0; // clear above
    }
  }
}
