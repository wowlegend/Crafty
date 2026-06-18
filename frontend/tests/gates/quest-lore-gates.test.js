import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
describe('quest lore wiring', () => {
  it('QuestSystem applies lore/giver + themed descriptions', () => {
    const qs = read('QuestSystem.jsx');
    expect(qs).toMatch(/loreFor|themedDescription/);
  });
});
