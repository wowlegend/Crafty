import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loreQuestIds, loreFor, themedDescription } from '../../src/game/questLore.js';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
describe('quest lore wiring', () => {
  // THE DATA IS EXECUTED; ONLY THE CALL SITE IS READ.
  //
  // This was one alternation, `/loreFor|themedDescription/`, against the whole 900-line QuestSystem — so
  // an import line, a comment, or one of the two functions being called while the other was dropped all
  // satisfied it equally. The lore module is directly importable, so its coverage is a real assertion
  // rather than a token hunt.
  it('every lore-carrying quest resolves to real lore and a themed description', () => {
    const ids = loreQuestIds();
    expect(ids.length, 'the lore table is empty — this asserts nothing').toBeGreaterThan(3);
    for (const id of ids) {
      const lore = loreFor(id);
      expect(lore, `${id} is listed in the lore table but loreFor returns nothing`).toBeTruthy();
      const themed = themedDescription({ id, description: 'FALLBACK' });
      expect(typeof themed).toBe('string');
      expect(themed.length, `${id} has an empty themed description`).toBeGreaterThan(0);
      expect(themed, `${id} fell through to the raw description — the theming never applied`).not.toBe('FALLBACK');
    }
  });

  it('an unknown quest falls back to its own description rather than throwing or blanking', () => {
    expect(loreFor('no_such_quest')).toBeNull();
    expect(themedDescription({ id: 'no_such_quest', description: 'plain text' })).toBe('plain text');
    expect(themedDescription(null)).toBe('');
  });

  it('QuestSystem calls BOTH lore seams, not just whichever one the old alternation matched', () => {
    const qs = read('QuestSystem.jsx');
    const stripped = qs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(stripped, 'loreFor is never called').toMatch(/\bloreFor\s*\(/);
    expect(stripped, 'themedDescription is never called').toMatch(/\bthemedDescription\s*\(/);
  });
});
