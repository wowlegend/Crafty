import { describe, it, expect, beforeAll } from 'vitest';

/**
 * THE WORLD'S FLOOR IS SOLID UNDER EVERY CAVE (src/world/terrain.worker.js generateChunkData).
 *
 * The cells at y 0 are the bottom of the world (world/chunkLayout.js): nothing lies under them, and the void guard sends
 * a player who falls past them to the origin (game/spawnPlacement.js isVoidFall). The cave carve once opened them, so in
 * about a fifth of the columns round the spawn a cave's floor was the void (registry REVIEW:l4:caves-open-the-world-floor).
 *
 * This runs the real worker (behind a stand-in `self`, as world-seed-gates does: it assigns self.onmessage at import) on
 * the 6 x 6 chunks round the spawn at the default seed, and reads the meshes it posts: the mesher draws a face wherever a
 * solid cell meets air, the bottom of the world included (world/mesher.js), so a column whose y-0 cell is solid has a
 * downward face at y 0 under it, and one whose y-0 cell is open has none. A cave that reaches the bottom has an upward face
 * at y 1, the top of the floor cell, or (carved through it) no face at y 0: counted either way, that is the presence check,
 * so the caves are still there and reach the bottom, and on a carve that opens the floor the gate goes red on the floor,
 * not on the presence. NOT READ: whether a cave is walkable, the dungeon stamp (y 12 up), any seed but the default, and the
 * cells above y 0 (keeping y 0 solid fills up to 2259 cave cells at y 1 to 6 in the 192 x 192 m round the spawn, where the
 * cave automaton reads it: DECISIONS 2026-11-01 (lane L13 part 2) item 514).
 */
let posted, send;
beforeAll(async () => {
  posted = [];
  let handler;
  globalThis.self = { postMessage: (m) => posted.push(m), set onmessage(fn) { handler = fn; }, get onmessage() { return handler; } };
  await import('../../src/world/terrain.worker.js');
  send = (type, payload) => handler({ data: { type, payload } });
});

/** The columns (local `${x}_${z}`) a mesh covers with a face of normal `ny` (+1 or -1) lying in the plane y = `y`. */
function columnsWithFace(mesh, y, ny) {
  const P = mesh.positions, N = mesh.normals, I = mesh.indices;
  const out = new Set();
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]];
    if (Math.sign(N[v[0] * 3 + 1]) !== ny || Math.abs(N[v[0] * 3 + 1]) < 0.5) continue;
    if (v.some((i) => P[i * 3 + 1] !== y)) continue;
    const xs = v.map((i) => P[i * 3]), zs = v.map((i) => P[i * 3 + 2]);
    for (let x = Math.min(...xs); x < Math.max(...xs); x++) for (let z = Math.min(...zs); z < Math.max(...zs); z++) out.add(`${x}_${z}`);
  }
  return out;
}

describe('the world\'s floor', () => {
  it('every column of the 96 x 96 m round the spawn keeps its y-0 cell solid, and the caves there still reach down to it', () => {
    send('init', {});
    let columns = 0, open = 0, caveBottoms = 0;
    const where = [];
    for (let cx = -3; cx <= 2; cx++) for (let cz = -3; cz <= 2; cz++) {
      posted.length = 0;
      send('generate', { cx, cz });
      const mesh = posted.find((m) => m.type === 'chunk_mesh')?.payload;
      expect(mesh, `SETUP: the worker posted no mesh for chunk ${cx}_${cz}`).toBeTruthy();
      const floor = columnsWithFace(mesh, 0, -1);
      columns += 256;
      open += 256 - floor.size;
      if (floor.size < 256 && where.length < 5) where.push(`${cx}_${cz}: ${256 - floor.size}`);
      const onFloor = columnsWithFace(mesh, 1, 1);
      for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) if (onFloor.has(`${x}_${z}`) || !floor.has(`${x}_${z}`)) caveBottoms++;
    }
    process.stdout.write(`\nworld floor: ${columns} columns read, ${open} with the y-0 cell open, ${caveBottoms} where a cave reaches the bottom\n`);
    expect(columns, 'SETUP: not every chunk was read').toBe(36 * 256);
    expect(caveBottoms, 'SETUP: no cave reaches the bottom here: the gate reads no cave that could open the floor').toBeGreaterThan(500);
    expect(open, `columns with the world's floor carved open (first chunks: ${where.join('; ')})`).toBe(0);
  });
});
