import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// "Signature-fires" insurance: the unlock path sets aspectHint + the toast renders + auto-clears it.
const __dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(__dir, '../../src', p), 'utf8');
const store = read('store/useGameStore.jsx');
const toast = read('ui/AspectHintToast.jsx');

describe('just-in-time Aspect-unlock hint is wired', () => {
  it('spendTalentPoint sets aspectHint via aspectUnlockHint on first unlock', () => {
    expect(store).toMatch(/import \{ aspectUnlockHint \}/);
    expect(store).toMatch(/aspectHint: hint \|\| state\.aspectHint/);
    expect(store).toMatch(/currentVal === 0 \? aspectUnlockHint\(talentId\)/);
  });
  it('AspectHintToast reads aspectHint + auto-clears via setAspectHint(null)', () => {
    expect(toast).toMatch(/s\.aspectHint/);
    expect(toast).toMatch(/setTimeout\(\(\) => setAspectHint\(null\)/);
  });
});
