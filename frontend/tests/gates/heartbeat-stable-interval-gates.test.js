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
describe('HeartbeatAudio — interval re-arms only on the danger bucket change', () => {
  const src = read('ui/HeartbeatAudio.jsx');

  it('the effect dep array is [bucket] only (not playHeartbeat)', () => {
    expect(src).toMatch(/\}, \[bucket\]\);/);
    expect(src).not.toMatch(/\[bucket, playHeartbeat\]/);
  });

  it('reads playHeartbeat through a ref (latest value without re-arming)', () => {
    expect(src).toMatch(/playRef\.current/);
  });
});
