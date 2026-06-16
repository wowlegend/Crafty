import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(__dirname, '../../src/world/Terrain.jsx'), 'utf8');

// S6 Slice 3: mined ore drops its item (closes the mining-payoff loop). The `block_broken` handler maps the
// worker block code -> an inventory key via BLOCK_ID_MAP, then addToInventory(key). S6 generates ore codes
// 10..13, so the map must include them. GROUNDED: addToInventory uses the string as a raw inventory KEY,
// existing mined blocks drop LOWERCASE block keys ('stone'/'wood'/'sand'), and recipes.js patterns match
// lowercase 'coal'/'iron'/'gold'/'diamond' (incl. a Gold Helmet recipe) -> the ore drops MUST be those
// lowercase keys (NOT display names like 'Iron Nugget', which wouldn't match the primary recipes).
describe('S6 Slice 3 — mined ore drops its (craftable) item', () => {
  const block = src.slice(src.indexOf('BLOCK_ID_MAP'), src.indexOf('BLOCK_ID_MAP') + 320);

  it('BLOCK_ID_MAP maps the 4 ore codes to their lowercase block keys', () => {
    expect(/10:\s*'coal'/.test(block)).toBe(true);
    expect(/11:\s*'iron'/.test(block)).toBe(true);
    expect(/12:\s*'gold'/.test(block)).toBe(true);
    expect(/13:\s*'diamond'/.test(block)).toBe(true);
  });

  it('the existing block codes are untouched (no regression)', () => {
    for (const [code, name] of [[1, 'grass'], [3, 'stone'], [6, 'wood'], [8, 'cactus']]) {
      expect(new RegExp(`${code}:\\s*'${name}'`).test(block), `${code}->${name}`).toBe(true);
    }
  });
});
