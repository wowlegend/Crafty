import { describe, it, expect } from 'vitest';
import { parsePowermetrics, stats, summarise, main, MIN_SAMPLES } from '../../scripts/dev/power-summary.mjs';

/**
 * THE POWER A/B'S ARITHMETIC (scripts/dev/power-summary.mjs, read by scripts/dev/power-ab.sh; plan
 * docs/superpowers/plans/2026-10-27-crafty-instruments.md, part c). Kevin runs powermetrics with sudo on his Mac; this
 * turns its TEXT log into a mean and a median per rail, and two logs into a B - A delta. The agent cannot run
 * powermetrics, so the fixture below is built from the line shapes three independent published logs agree on:
 * `*** Sampled system activity (...) (N ms elapsed) ***` opening each sample, `CPU Power: N mW`, `GPU Power: N mW`
 * (printed in BOTH the processor and the GPU section when both samplers run), `Combined Power (CPU + GPU + ANE): N mW`,
 * and the thermal sampler's `Current pressure level: <level>`.
 *
 * What it must not get wrong: the preamble before the first sample is not a sample; the median of unsorted samples;
 * an even count's median; the mean's denominator; the thermal counts; a log with no samples, or with no GPU rail —
 * the rail the A/B exists for — is COULD NOT SUMMARISE (exit 3), never a table of nulls; and the sign of B - A.
 *
 * BLIND SPOT: the fixture is reconstructed, not captured from this Mac (macOS 27, M3 Max). power-ab.sh keeps the raw
 * log beside the summary, and the parser prints how many samples it read for each rail, so a format drift shows as a
 * short denominator on Kevin's first run rather than as a silent number.
 */

function sample({ cpu, gpu, combined, thermal, ms = 1003.4 }) {
  return [
    `*** Sampled system activity (Tue Oct 27 10:00:00 2026 +0800) (${ms}ms elapsed) ***`,
    '',
    '**** Processor usage ****',
    '',
    'E-Cluster HW active frequency: 1031 MHz',
    'E-Cluster HW active residency:  11.15% (600 MHz: 2.8% 972 MHz:  88%)',
    `CPU Power: ${cpu} mW`,
    `GPU Power: ${gpu} mW`,
    'ANE Power: 0 mW',
    `Combined Power (CPU + GPU + ANE): ${combined} mW`,
    '',
    '**** GPU usage ****',
    '',
    'GPU HW active frequency: 1398 MHz',
    'GPU HW active residency:  62.10% (444 MHz: 0% 1398 MHz: 62%)',
    'GPU idle residency:  37.90%',
    `GPU Power: ${gpu} mW`,
    '',
    '**** Thermal pressure ****',
    '',
    `Current pressure level: ${thermal}`,
    '',
  ].join('\n');
}
const PREAMBLE = 'Machine model: Mac15,8\nOS version: 26A434\nBoot arguments:\nBoot time: Tue Oct 27 09:00:00 2026\n\n';
const THREE = [
  { cpu: 1200, gpu: 3100, combined: 4300, thermal: 'Nominal' },
  { cpu: 2100, gpu: 2500, combined: 4600, thermal: 'Nominal' },
  { cpu: 900, gpu: 4000, combined: 4900, thermal: 'Moderate' },
];
const log = (rows) => PREAMBLE + rows.map(sample).join('\n');
const arm = (gpuBase, n = 12) => log(Array.from({ length: n }, (_, i) => ({ cpu: 1000 + i, gpu: gpuBase + (i % 2 ? 100 : -100), combined: gpuBase + 1000, thermal: 'Nominal' })));
const io = (files) => {
  const out = [], err = [];
  return { out, err, io: { read: (p) => { if (!(p in files)) throw new Error(`ENOENT ${p}`); return files[p]; }, out: (s) => out.push(s), err: (s) => err.push(s) } };
};

describe('parsing the text log', () => {
  it('one record per sample — the preamble is not a sample — with each rail and the thermal level', () => {
    const recs = parsePowermetrics(log(THREE));
    expect(recs).toHaveLength(3);
    expect(recs.map((r) => [r.cpu, r.gpu, r.combined, r.thermal])).toEqual([
      [1200, 3100, 4300, 'Nominal'], [2100, 2500, 4600, 'Nominal'], [900, 4000, 4900, 'Moderate'],
    ]);
    expect(recs[0].elapsedMs).toBeCloseTo(1003.4, 6);
  });
  it('a sample without a rail reads null for it, not 0', () => {
    const noGpu = log([{ cpu: 1200, gpu: 1, combined: 1, thermal: 'Nominal' }]).replace(/^GPU Power:.*$/gm, '');
    expect(parsePowermetrics(noGpu)[0]).toMatchObject({ cpu: 1200, gpu: null });
  });
});

describe('the statistics', () => {
  it('median of unsorted samples, an even count\'s median, the mean, min and max', () => {
    expect(stats([3100, 2500, 4000])).toEqual({ n: 3, mean: 3200, median: 3100, min: 2500, max: 4000 });
    expect(stats([4, 1, 3, 2]).median).toBe(2.5);
    expect(stats([null, 5, NaN, 7]).n, 'a missing value counted as a sample').toBe(2);
    expect(stats([])).toEqual({ n: 0, mean: null, median: null, min: null, max: null });
  });
  it('summarise: the per-rail stats and the thermal pressure counts', () => {
    const s = summarise(parsePowermetrics(log(THREE)));
    expect(s.samples).toBe(3);
    expect(s.gpu).toMatchObject({ n: 3, mean: 3200, median: 3100 });
    expect(s.cpu).toMatchObject({ n: 3, mean: 1400, median: 1200 });
    expect(s.combined).toMatchObject({ n: 3, mean: 4600, median: 4600 });
    expect(s.thermal).toEqual({ Nominal: 2, Moderate: 1 });
  });
});

describe('the command', () => {
  it('one arm: exit 0, the denominator and the GPU mean and median printed', () => {
    const h = io({ 'a.txt': arm(3000) });
    expect(main(['a.txt'], h.io)).toBe(0);
    const text = h.out.join('\n');
    expect(text).toMatch(/12 samples/);
    expect(text).toMatch(/GPU\s+3000\s+3000/); // mean 3000, median 3000 (alternating 2900 / 3100)
  });
  it(`COULD NOT SUMMARISE (exit 3) on a log with fewer than ${MIN_SAMPLES} samples, or with no GPU rail`, () => {
    const empty = io({ 'e.txt': 'powermetrics: must be invoked as the superuser\n' });
    expect(main(['e.txt'], empty.io)).toBe(3);
    expect(empty.err.join('\n')).toMatch(/COULD NOT SUMMARISE.*0 samples/);
    const short = io({ 's.txt': arm(3000, MIN_SAMPLES - 1) });
    expect(main(['s.txt'], short.io)).toBe(3);
    const noGpu = io({ 'g.txt': arm(3000).replace(/^GPU Power:.*$/gm, '') });
    expect(main(['g.txt'], noGpu.io)).toBe(3);
    expect(noGpu.err.join('\n')).toMatch(/COULD NOT SUMMARISE.*GPU/);
    expect(main([], io({}).io), 'no file named').toBe(3);
  });
  it('two arms: B - A, signed, in mW and percent', () => {
    const h = io({ 'a.txt': arm(3200), 'b.txt': arm(2400) });
    expect(main(['a.txt', 'b.txt'], h.io)).toBe(0);
    const text = h.out.join('\n');
    expect(text).toMatch(/GPU\s+3200\s+2400\s+-800\s+-25\.0%/);
  });
});

/*
 * Mutation-Proof: via scripts/dev/mutate.sh on scripts/dev/power-summary.mjs, 7 tests, one batch, each observed RED:
 *   W1 plausible-wrong: the median of UNSORTED samples -> the stats and summarise tests
 *   W2 plausible-wrong: an even count's median takes the upper middle -> the stats and one-arm tests
 *   W3 plausible-wrong: the mean divides by n + 1 -> four tests
 *   W4 the thermal count is a flag (= 1) -> the summarise test
 *   W5 the sample floor removed -> "COULD NOT SUMMARISE ... fewer than 10 samples"
 *   W6 the delta's sign flipped (A - B) -> "two arms: B - A, signed"
 *   W7 a log with no GPU rail accepted -> the COULD NOT SUMMARISE test
 *   W8 plausible-wrong: the preamble counted as a sample -> five tests
 *   W9 plausible-wrong: absent values (null) counted as 0 -> the stats and COULD NOT SUMMARISE tests
 *   I0 identity (a comment edit in power-summary.mjs) SURVIVED.
 * NOT mutated, on purpose: which of the two `GPU Power` lines is taken. Every published log shows the same estimate in
 * both sections, so first-vs-last is equivalent on any fixture this file can honestly build.
 */
