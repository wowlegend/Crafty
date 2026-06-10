import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');

// S2-B2-M1 no-re-mesh gate (cloned from beast-noremesh-gates): VOIDHAND's LOAD-BEARING invariant is that a
// combat grab touches ZERO voxels — it spawns a pooled PHANTOM proxy, never a block edit. A block edit
// re-meshes a whole chunk (the worst per-frame op, the engine's re-mesh kill-risk). This gate keeps the
// VOIDHAND-isolated modules off every voxel-editing / chunk-worker seam so a future edit can't silently
// re-introduce a combat re-mesh into the grab/orbit/hurl path. (The optional CALM real-edit grab is a
// deferred fast-follow that lives in the out-of-combat Terrain build path, NOT among these gated files.)
describe('voidhand no-re-mesh gate', () => {
  const FORBIDDEN = /setWorldBlocks|terrain\.worker|createChunk|setBlock|postMessage|update_block/;
  const GATED = [
    'game/voidhand.js',           // the pure grab SM
    'game/kinetic.js',            // the kinetic economy
    'world/PhantomBlockSystem.jsx', // the held-phantom render proxy
    'Components.jsx',             // the SM WIRING surface — where M3 HURL/SLAM lands; was un-gated
                                  // (STATE-REVIEW-2026-06-10 #9; full repo-wide inversion = #69)
    'devtest/perfProbe.js',         // M2 probe mode/channel — drives the combat path, voxel-clean
    'devtest/PerfProbeRunner.jsx',  // M2 scenario driver
    'devtest/PerfProbeSystem.jsx',  // M2 dynamic hurl stand-in
    'game/hurl.js',                 // M3 pure flight/impact core
    'game/hurlChannel.js',          // M3 transient verb channel
    'world/HurlSystem.jsx',         // M3 flight mesh + impact application
  'world/SnareTetherSystem.jsx', // S2-B3-M4: the snare tether (transient-driven; voxel-free)
];

  for (const rel of GATED) {
    it(`src/${rel} references no voxel-edit / chunk-worker seam`, () => {
      const src = readFileSync(resolve(SRC, rel), 'utf8');
      const hit = FORBIDDEN.exec(src);
      expect(hit, hit ? `forbidden voxel seam "${hit[0]}" in ${rel}` : '').toBeNull();
    });
  }
});
