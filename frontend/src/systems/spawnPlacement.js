// spawnPlacement.js — the mob spawn-placement loop, extracted from SpawnerSystem as a pure seam so
// its termination bound is testable. Picks random points inside the loaded candidate chunks and asks
// `trySpawn(x, z)` to place a mob, keeping only points in the visible-safe distance band [28, 85] from
// the player. Bounded by maxAttempts so a single tick can never stall the frame.
//
// attempts counts EVERY pick (in-range or not). An earlier version incremented attempts only after an
// in-range pick, so a candidate set skewed entirely too-near or too-far produced only out-of-range
// picks that were free retries — attempts never advanced and the while-loop spun unbounded (a frame
// hang). spawnedThisTick still advances only on a successful in-range spawn, so behaviour under normal,
// mixed candidate sets is unchanged; only the pathological unbounded case is fixed.
//
// MUTATION-PROOF: move `attempts++` back inside the `dist >= 28 && dist <= 85` guard and the placement
// gate test goes RED (it spawns maxAttempts mobs instead of the in-range subset).
export function runSpawnPlacement({ candidateChunks, spawnCount, maxAttempts, playerX, playerZ, rng, trySpawn }) {
  if (!candidateChunks || candidateChunks.length === 0) return 0;
  let spawned = 0;
  let attempts = 0;
  while (spawned < spawnCount && attempts < maxAttempts) {
    attempts++; // count EVERY pick so the loop is bounded even when all picks land out of range
    const randomKey = candidateChunks[Math.floor(rng() * candidateChunks.length)];
    const [cx, cz] = randomKey.split('_').map(Number);
    const x = cx * 16 + rng() * 16;
    const z = cz * 16 + rng() * 16;
    const dist = Math.sqrt((x - playerX) ** 2 + (z - playerZ) ** 2);

    // Only spawn if not too close (avoid visible spawning) and not too far.
    if (dist >= 28 && dist <= 85) {
      if (trySpawn(x, z)) spawned++;
    }
  }
  return spawned;
}
