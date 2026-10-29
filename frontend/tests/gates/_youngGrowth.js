// What a call allocates, read from V8's young generation (node:v8 getHeapSpaceStatistics, the new space).
//
// The call is warmed first, so the optimiser has compiled it (an unoptimised function boxes its doubles and allocates
// where the compiled one does not). Then `trials` runs of `calls` calls each measure how far the new space grew, and the
// MEDIAN is returned in bytes per call: a scavenge inside a run empties the new space and makes that run read low or
// negative, and it lands in at most one run of a few, so the median is a run with no collection in it. The reading
// carries the probe's own few kilobytes per run (the statistics it reads are themselves allocated), about 0.6 bytes a
// call at 5000 calls; an object of the smallest shape costs about 16.
import v8 from 'node:v8';

function newSpaceUsed() {
  const spaces = v8.getHeapSpaceStatistics();
  for (let i = 0; i < spaces.length; i++) if (spaces[i].space_name === 'new_space') return spaces[i].space_used_size;
  throw new Error('_youngGrowth: V8 reports no new_space');
}

/** Bytes per call `fn(i)` grows the young generation by, the median of `trials` runs, after a warm-up. */
export function youngBytesPerCall(fn, { calls = 5000, trials = 7, warm = 100000 } = {}) {
  for (let i = 0; i < warm; i++) fn(i);
  const runs = [];
  for (let t = 0; t < trials; t++) {
    const before = newSpaceUsed();
    for (let i = 0; i < calls; i++) fn(i);
    runs.push((newSpaceUsed() - before) / calls);
  }
  runs.sort((a, b) => a - b);
  return runs[Math.floor(trials / 2)];
}

/** Under this a call allocates nothing: the probe's own share is under 1 byte a call, the smallest object 16. */
export const NO_ALLOCATION_BYTES = 8;
