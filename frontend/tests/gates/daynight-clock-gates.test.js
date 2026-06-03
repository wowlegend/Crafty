import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

// M3a: the day/night CLOCK ticker advances gameTime over real time. Two contracts
// must NOT silently regress:
//   1. DETERMINISM  -- the ticker is paused in visual-capture via !isCaptureMode(),
//      so capture frames stay byte-stable (the load-bearing 12/12 visual gate).
//   2. PAUSE        -- the ticker is gated on the M2d active SoT (getInput().active)
//      so time stops in menus / at click-to-play.
//   3. GAME-LOOP ISOLATION -- it is a coarse setInterval, NOT a per-frame useFrame.
describe('day/night clock pause + determinism contract (static gate)', () => {
  const src = read('src/game/useDayNightClock.js');

  it('references isCaptureMode (determinism: paused during visual capture)', () => {
    expect(src.includes('isCaptureMode')).toBe(true);
  });

  it('references getInput (pause: gated on the M2d active SoT)', () => {
    expect(src.includes('getInput')).toBe(true);
  });

  it('uses setInterval, NOT useFrame (Game-Loop Isolation: no per-frame set)', () => {
    expect(src.includes('setInterval')).toBe(true);
    // Forbid an actual useFrame IMPORT or CALL (a useFrame(...) invocation or an
    // import that pulls it in) -- a bare mention in a comment is allowed so the
    // contract can be documented. \buseFrame\s*\( catches the call; the import
    // alternative catches `import { useFrame }` / `from '@react-three/fiber'`.
    expect(/useFrame\s*\(/.test(src)).toBe(false);
    expect(/import[^;]*useFrame/.test(src)).toBe(false);
  });
});
