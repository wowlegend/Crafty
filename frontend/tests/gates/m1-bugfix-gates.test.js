import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.resolve(__dirname, '../../', p), 'utf8');

// M1 quick-win bug cluster (SOTA audit Theme-2 "built but unwired" + verified bugs). Lock the fixes so a
// future edit can't silently re-break them.
describe('M1 bug cluster', () => {
  it('ore-debris is colored (codes 10-13 in worker BLOCK_COLORS — no more WHITE shatter)', () => {
    const w = read('src/world/terrain.worker.js');
    const i = w.indexOf('const BLOCK_COLORS');
    const block = w.slice(i, i + 900);
    for (const code of ['10:', '11:', '12:', '13:']) {
      expect(block.includes(code), `BLOCK_COLORS missing ${code}`).toBe(true);
    }
  });

  it('playSpatialSound applies +/-7% pitch jitter (machine-gun-fatigue fix)', () => {
    const g = read('src/GameScene.jsx');
    expect(/playSpatialSound:\s*\([^)]*jitter\s*=\s*true/.test(g)).toBe(true);
    expect(g.includes('0.93 + Math.random() * 0.14')).toBe(true);
  });

  it('crafting is no longer silent: playCraft is bridged onto window AND called in doCraft', () => {
    const app = read('src/App.jsx');
    expect(/window\.playCraft\s*=\s*playCraft/.test(app)).toBe(true);
    const ct = read('src/ui/panels/CraftingTable.jsx');
    expect(ct.includes('window.playCraft()')).toBe(true);
  });

  it('`npm test` runs the real vitest suite, not the test_swarm.js rubber-stamp', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.test).toBe('vitest run');
    expect(pkg.scripts.test).not.toContain('test_swarm');
  });
});
