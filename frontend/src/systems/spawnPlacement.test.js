import { describe, it, expect } from 'vitest';
import { runSpawnPlacement } from './spawnPlacement.js';

// A cycling deterministic rng driving a fixed pick pattern. Each spawn iteration consumes three rng
// values: [chunk-pick, x-fraction, z-fraction]. With candidateChunks ['3_2', '0_0'] and the player at
// the origin:
//   chunk '3_2' -> x in [48,64), z in [32,48) -> dist in [~57, ~80]  => ALWAYS in-range
//   chunk '0_0' -> x in [0,16),  z in [0,16)  -> dist < ~23           => ALWAYS out-of-range (too close)
// pick 0.9 selects index 1? No — Math.floor(0.9*2)=1 -> '0_0' (out); 0.1 -> index 0 -> '3_2' (in).
const cyclingRng = (seq) => {
  let i = 0;
  return () => seq[i++ % seq.length];
};

describe('runSpawnPlacement — maxAttempts bounds TOTAL picks, not just in-range ones', () => {
  const CHUNKS = ['3_2', '0_0']; // index 0 = in-range, index 1 = out-of-range

  it('with alternating in/out picks, maxAttempts bounds the loop so only the in-range subset spawns', () => {
    // Pattern per iteration: IN, OUT, IN, OUT, ...  (chunk-pick 0.1 -> '3_2' in; 0.9 -> '0_0' out)
    const rng = cyclingRng([0.1, 0.5, 0.5, /* IN  */ 0.9, 0.5, 0.5 /* OUT */]);
    let calls = 0;
    const spawned = runSpawnPlacement({
      candidateChunks: CHUNKS, spawnCount: 99, maxAttempts: 4,
      playerX: 0, playerZ: 0, rng, trySpawn: () => { calls++; return true; },
    });
    // Fixed: 4 iterations (IN,OUT,IN,OUT) -> 2 in-range spawns.
    // Buggy (attempts++ inside the guard): attempts advances only on IN, so it runs 7 iterations
    // (IN,OUT,IN,OUT,IN,OUT,IN) -> 4 spawns. So 2 vs 4 cleanly distinguishes the fix.
    expect(spawned).toBe(2);
    expect(calls).toBe(2);
  });

  it('an all-out-of-range candidate set terminates at maxAttempts and spawns nothing', () => {
    // Only the too-close chunk: every pick is out of range. The fixed loop still terminates (attempts
    // advances every iteration); the buggy loop would spin forever here.
    let calls = 0;
    const spawned = runSpawnPlacement({
      candidateChunks: ['0_0'], spawnCount: 5, maxAttempts: 6,
      playerX: 0, playerZ: 0, rng: () => 0.5, trySpawn: () => { calls++; return true; },
    });
    expect(spawned).toBe(0);
    expect(calls).toBe(0);
  });

  it('a successful in-range run spawns up to spawnCount and stops early', () => {
    // Always in-range; spawnCount 2 reached before maxAttempts 6.
    let calls = 0;
    const spawned = runSpawnPlacement({
      candidateChunks: ['3_2'], spawnCount: 2, maxAttempts: 6,
      playerX: 0, playerZ: 0, rng: () => 0.5, trySpawn: () => { calls++; return true; },
    });
    expect(spawned).toBe(2);
    expect(calls).toBe(2);
  });

  it('empty candidate set is a no-op', () => {
    expect(runSpawnPlacement({
      candidateChunks: [], spawnCount: 3, maxAttempts: 6,
      playerX: 0, playerZ: 0, rng: () => 0.5, trySpawn: () => true,
    })).toBe(0);
  });
});
