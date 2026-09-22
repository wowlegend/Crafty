import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(HERE, '../../src/', rel), 'utf8');

// Regression (2026-06-28 audit, MEDIUM): useGameSounds returns a FRESH object each render, so
// playHeartbeat's identity changed every render -> the heartbeat useEffect (which listed playHeartbeat
// as a dep) re-armed the setInterval on EVERY re-render (every HP tick at low health) — nullifying the
// bucket quantization + firing extra immediate beats. The effect now depends ONLY on [bucket] and reads
// the latest playHeartbeat through a ref.
/*
 * ENHANCED 2026-09-22, selected by `gate-census.mjs` at 0/5. The two assertions were already precise —
 * the dep array by exact shape, the ref read by name — so neither was rewritten. What was missing was a
 * read-control and a stated blind spot.
 *
 * BLIND SPOT, stated (R7): both cases read `HeartbeatAudio.jsx` as text. Nothing here mounts the
 * component, arms an interval, or counts beats. The defect this file exists for was a TIMING one — the
 * interval re-arming on every HP tick, nullifying the bucket quantization and firing extra immediate
 * beats — and timing is exactly what a source assertion cannot observe. A real check would render the
 * component with fake timers, drive the health prop, and count invocations; jsdom could do that, and it
 * is the honest upgrade if this ever regresses again.
 *
 * Mutation-Proof: 2 mutations, recorded on the commit.
 */
describe('HeartbeatAudio — interval re-arms only on the danger bucket change', () => {
  const src = read('ui/HeartbeatAudio.jsx');

  it('the subject was read — the case below is a negative assertion', () => {
    // R3a: `not.toMatch` over an empty read reports the regression as fixed.
    expect(src.length, 'HeartbeatAudio.jsx read as empty').toBeGreaterThan(500);
    expect(src).toContain('useEffect');
  });

  it('the effect dep array is [bucket] only (not playHeartbeat)', () => {
    expect(src).toMatch(/\}, \[bucket\]\);/);
    expect(src).not.toMatch(/\[bucket, playHeartbeat\]/);
  });

  it('reads playHeartbeat through a ref (latest value without re-arming)', () => {
    expect(src).toMatch(/playRef\.current/);
  });
});
