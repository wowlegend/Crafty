// What each e2e test keeps of V8's coverage (tests/e2e/_fixtures.js writes it, scripts/ci/runtime-reach.mjs --emit reads
// it). Apart from the fixture so the unit suite can drive it (tests/scripts/runtime-reach-merge.test.js): a Playwright
// fixture file cannot be imported there.

/**
 * The url, and per function its V8 name and its range counts. The name is how runtime-reach checks MUST_REACH's entry
 * points: a mounted component or a called function ran when its first range (the whole function, with its call count)
 * counted above 0. Dropped: `source`, the FULL module text per entry, which would make a shard's coverage tens of MB of
 * the repo's own source, and the offsets, which nothing reads.
 * @param {Array<{url: string, functions?: Array<{functionName?: string, ranges?: Array<{count: number}>}>}>} entries
 */
export function slimCoverage(entries) {
  return (entries || []).map((e) => ({
    url: e.url,
    functions: (e.functions || []).map((f) => ({ functionName: f.functionName ?? '', ranges: (f.ranges || []).map((r) => ({ count: r.count })) })),
  }));
}
