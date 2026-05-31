import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('M2b static gates', () => {
  it('mob AI worker tick is capture-gated (deterministic closeup)', () => {
    const src = read('src/SimplifiedNPCSystem.jsx');
    // The worker-tick useFrame must early-return in capture mode BEFORE it posts the
    // AI TICK to the worker, so a spawned closeup mob never moves. Asserted as two
    // length-independent facts (guard exists + precedes the post) rather than a
    // brittle length-bounded span. Both anchors are unique in the file: the only
    // brace-less `if (isCaptureMode()) return;` is the worker-tick guard (the spawn
    // guard at ~line 556 is braced), and there is exactly one `postMessage`.
    const guardIdx = src.indexOf('if (isCaptureMode()) return;');
    const postIdx = src.indexOf('workerRef.current.postMessage');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(postIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(postIdx); // capture guard precedes the AI TICK post
  });
});
