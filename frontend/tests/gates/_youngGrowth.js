// What a call allocates, read from V8's young generation (node:v8 getHeapSpaceStatistics, the new space).
//
// Each run measures how far the new space grows over `calls` calls. A run that a collection interrupted is discarded
// (node:v8 GCProfiler records it), since a scavenge empties the new space and the run would read low; every run kept is
// exact. The optimiser compiles a hot function on a background thread, and until its code is installed the call runs
// unoptimised, which boxes its doubles and allocates where the compiled code does not; on a loaded machine that can take
// thousands of calls. So runs continue until the median of the last `window` kept runs is under `settleUnder` bytes a
// call, or `budgetMs` has passed, and that median is returned: a call that allocates in its compiled code reads high to
// the end of its budget. A run carries the probe's own few kilobytes (the statistics it reads are themselves
// allocated), under a byte a call at 5000 calls; an object of the smallest shape costs about 16.
import v8 from 'node:v8';

function newSpaceUsed() {
  const spaces = v8.getHeapSpaceStatistics();
  for (let i = 0; i < spaces.length; i++) if (spaces[i].space_name === 'new_space') return spaces[i].space_used_size;
  throw new Error('_youngGrowth: V8 reports no new_space');
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** Under this a call allocates nothing: the probe's own share is under 1 byte a call, the smallest object 16. */
export const NO_ALLOCATION_BYTES = 8;

/**
 * Bytes per call `fn(i)` grows the young generation by: the median of the last `window` runs no collection interrupted,
 * once it settles under `settleUnder` or `budgetMs` has passed (0: as soon as `window` runs are kept).
 */
export function youngBytesPerCall(fn, { calls = 5000, window = 5, budgetMs = 3000, settleUnder = NO_ALLOCATION_BYTES } = {}) {
  const kept = [];
  const start = Date.now();
  for (;;) {
    const gc = new v8.GCProfiler();
    gc.start();
    const before = newSpaceUsed();
    for (let i = 0; i < calls; i++) fn(i);
    const after = newSpaceUsed();
    if (gc.stop().statistics.length === 0) kept.push((after - before) / calls);
    // A call that allocates so much that collections interrupt nearly every run allocates.
    if (kept.length < window && Date.now() - start >= 2 * budgetMs + 1000) return Infinity;
    if (kept.length >= window) {
      const m = median(kept.slice(-window));
      if (m < settleUnder || Date.now() - start >= budgetMs) return m;
    }
  }
}
