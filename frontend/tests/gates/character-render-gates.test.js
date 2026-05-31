import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('M2b static gates', () => {
  it('mob AI worker tick is capture-gated (deterministic closeup)', () => {
    const src = read('src/SimplifiedNPCSystem.jsx');
    // the per-frame TICK useFrame must early-return in capture mode, before it
    // builds the mob snapshot and posts the TICK to the worker (the body between
    // the guard and postMessage is the real knockback + mobsData mapping, ~1.8KB)
    expect(src).toMatch(/if \(isCaptureMode\(\)\) return;[\s\S]{0,2000}workerRef\.current\.postMessage/);
  });
});
