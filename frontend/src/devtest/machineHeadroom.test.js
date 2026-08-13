import { describe, it, expect } from 'vitest';
import { evaluateMachineHeadroom, LOW_MEM_MB, LOW_MEM_FRACTION } from './machineHeadroom.js';

// The readings are injected, which is the point: the OOM case can be driven on a healthy machine, and
// the "high load, idle CPU" case can be driven on a quiet one. A preflight that could only be tested by
// reproducing the condition would be tested by nobody.
const healthy = { freeMemMB: 20000, totalMemMB: 36864, loadAvg1: 2.0, cores: 14 };

describe('machine headroom — recorded, not enforced', () => {
  it('says nothing about a machine with room', () => {
    const v = evaluateMachineHeadroom(healthy);
    expect(v.warnings).toEqual([]);
    expect(v.loadPerCore).toBeCloseTo(0.143, 2);
  });

  it('warns on low free memory — the signal that points at a KILLED renderer', () => {
    const v = evaluateMachineHeadroom({ ...healthy, freeMemMB: 3500 });
    expect(v.warnings.length).toBeGreaterThan(0);
    expect(v.warnings[0]).toMatch(/3500MB free/);
    expect(v.warnings[0], 'it reads as a refusal — the threshold is a guess and must not gate the run')
      .toMatch(/WARNING, not a refusal/);
  });

  it('warns on a low memory FRACTION even when the absolute figure looks generous', () => {
    // A 256GB box with 8GB free is under pressure; the absolute number alone would call it healthy.
    const v = evaluateMachineHeadroom({ freeMemMB: 8000, totalMemMB: 262144, loadAvg1: 2, cores: 14 });
    expect(v.freeMemPct).toBeLessThan(LOW_MEM_FRACTION);
    expect(v.warnings.length).toBeGreaterThan(0);
  });

  it('does NOT warn on high load alone — the exact reading that would have been wrong', () => {
    // Measured 2026-08-13: load 21.25 on 14 cores with 39% of the CPU idle and memory fine. The repo's
    // note says captures crash "at load 13-37"; gating on that would refuse this machine for no reason.
    const v = evaluateMachineHeadroom({ ...healthy, loadAvg1: 21.25 });
    expect(v.loadPerCore).toBeGreaterThan(1.5);
    expect(v.warnings, 'load alone triggered a warning — that is the instrument this file rejects').toEqual([]);
  });

  it('adds the load note only ALONGSIDE the memory signal', () => {
    const v = evaluateMachineHeadroom({ ...healthy, freeMemMB: 3000, loadAvg1: 21.25 });
    expect(v.warnings).toHaveLength(2);
    expect(v.warnings[1]).toMatch(/on 14 cores/);
  });

  it('reports the numbers whether or not it warns, because the record is the product', () => {
    const v = evaluateMachineHeadroom(healthy);
    expect(v.freeMemMB).toBe(20000);
    expect(v.freeMemPct).toBeCloseTo(0.5425, 3);
  });

  it('survives a machine that reports nothing rather than dividing by zero', () => {
    const v = evaluateMachineHeadroom({ freeMemMB: 0, totalMemMB: 0, loadAvg1: 0, cores: 0 });
    expect(v.freeMemPct).toBe(0);
    expect(v.loadPerCore).toBe(0);
    expect(Number.isNaN(v.freeMemPct)).toBe(false);
  });

  it('the threshold is a named constant, so changing it is visible in a diff', () => {
    expect(LOW_MEM_MB).toBe(4096);
    expect(LOW_MEM_FRACTION).toBe(0.12);
  });
});
