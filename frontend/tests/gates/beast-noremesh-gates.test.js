import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');

// S2-B1-M1 no-re-mesh gate: WILDHEART must touch ZERO voxels (the engine's re-mesh kill-risk —
// a block edit re-meshes a whole chunk, the worst per-frame op). The beast-form collider swap is a
// Rapier `setShape` + (later) a mesh-shell + particles — NEVER a block edit. This gate keeps the
// pure beast-form module off every voxel-editing / chunk-worker seam so a future edit can't
// silently re-introduce a re-mesh into the transform path.
describe('beast-form no-re-mesh gate', () => {
  const FORBIDDEN = /setWorldBlocks|terrain\.worker|createChunk|setBlock|postMessage/;

  it('src/game/beasts.js references no voxel-edit / chunk-worker seam', () => {
    const src = readFileSync(resolve(SRC, 'game/beasts.js'), 'utf8');
    const hit = FORBIDDEN.exec(src);
    expect(hit, hit ? `forbidden voxel seam "${hit[0]}" in beasts.js` : '').toBeNull();
  });
});
