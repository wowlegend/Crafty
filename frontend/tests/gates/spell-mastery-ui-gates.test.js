import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(resolve(HERE, '../../src/ui/SpellUpgradePanel.jsx'), 'utf8');

// #51 S2: the player-facing Spell Mastery upgrade UI (a section in the progression panel) -- the reachable
// surface that lets the player trigger store.upgradeSpell (which S1 wires to cast damage + S3 persists).
describe('#51 S2 Spell Mastery upgrade UI', () => {
  it('renders a Spell Mastery section per spell', () => {
    expect(panel).toMatch(/Spell Mastery/);
    expect(panel).toMatch(/SPELL_MASTERY\.map/);
  });

  it('the Upgrade button calls store.upgradeSpell (null-guarded)', () => {
    expect(panel).toMatch(/upgradeSpell\?\.\(key\)/);
  });

  it('reads spellLevels + the upgrade table + the display level-gate', () => {
    expect(panel).toMatch(/spellLevels\[key\]/);
    expect(panel).toMatch(/SPELL_UPGRADES\[key\]\.levels/);
    expect(panel).toMatch(/requiredLevelFor/);
  });
});
