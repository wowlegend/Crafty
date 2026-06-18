import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// #52 S1: the non-captured panel modals adopt the shared Modal primitive (role=dialog/aria-modal/label),
// replacing their hand-rolled backdrop divs. Zero-pixel (the backdrop classes pass through verbatim).
const S1_PANELS = [
  ['ui/CreditsScreen.jsx', 'CreditsScreen'],
  ['ui/panels/CraftingTable.jsx', 'CraftingTable'],
  ['ui/TradingInterface.jsx', 'TradingInterface'],
  ['ui/GamePanels.jsx', 'GamePanels (BuildingTools + Settings)'],
];

describe('#52 S1 modals use the shared Modal primitive', () => {
  for (const [rel, name] of S1_PANELS) {
    it(`${name} imports + renders <Modal label=...>`, () => {
      const src = read(rel);
      expect(src).toMatch(/import \{[^}]*\bModal\b[^}]*\} from '\.\.?\/primitives\/index\.js'/);
      expect(src).toMatch(/<Modal[\s\S]{0,180}label=/);
    });
  }

  it('MagicSystem (GamePanels, M-key) is a <Modal label="Magic Spells"> (was the last raw-div backdrop)', () => {
    const src = read('ui/GamePanels.jsx');
    expect(src).toMatch(/<Modal[\s\S]{0,180}label="Magic Spells"/);
  });

  it('the Modal primitive renders a role=dialog with aria-modal + capture-gated focus', () => {
    const m = read('ui/primitives/Modal.jsx');
    expect(m).toMatch(/role="dialog"/);
    expect(m).toMatch(/aria-modal="true"/);
    expect(m).toMatch(/aria-label=\{label\}/);
    expect(m).toMatch(/if \(!isCaptureMode\(\)\) dialogRef\.current\?\.focus\(\)/);
  });
});

// #52 S2: the 3 capture-state modals + the chest panel get the same a11y win without ANY pixel drift.
// The two plain-div backdrops (Inventory, Achievements) become <Modal> (its rendered div is byte-identical
// to the old backdrop + role/aria + capture-gated focus). The two framer motion.div backdrops
// (SpellUpgrade [progression-open capture], Chest) keep their element + the load-bearing overflow-y-auto
// (capture.mjs scrolls .closest('.overflow-y-auto')) and gain role/aria/tabIndex inline.
describe('#52 S2 capture-state modals carry role=dialog (zero-pixel a11y)', () => {
  it('Inventory (GamePanels) is a <Modal> keeping the inventory-modal testId on the backdrop', () => {
    const src = read('ui/GamePanels.jsx');
    expect(src).toMatch(/<Modal[\s\S]{0,140}testId="inventory-modal"/);
    expect(src).toMatch(/<Modal[\s\S]{0,200}label=\{t\('ui\.inventory'\)\}/);
  });

  it('AchievementsPanel (QuestSystem) is a <Modal> keeping the achievements-panel testId', () => {
    const src = read('QuestSystem.jsx');
    expect(src).toMatch(/import \{[^}]*\bModal\b[^}]*\} from '\.\/ui\/primitives\/index\.js'/);
    expect(src).toMatch(/<Modal[\s\S]{0,140}testId="achievements-panel"/);
    expect(src).toMatch(/<Modal[\s\S]{0,200}label="Achievements"/);
  });

  it('SpellUpgradePanel motion.div backdrop gains role=dialog + keeps overflow-y-auto (progression-open capture)', () => {
    const src = read('ui/SpellUpgradePanel.jsx');
    expect(src).toMatch(/role="dialog"[\s\S]{0,120}aria-modal="true"[\s\S]{0,120}aria-label="Progression"[\s\S]{0,120}tabIndex=\{-1\}/);
    expect(src).toMatch(/role="dialog"[\s\S]{0,200}overflow-y-auto/);
  });

  it('ChestInventoryPanel motion.div backdrop gains role=dialog + keeps overflow-y-auto', () => {
    const src = read('ui/ChestInventoryPanel.jsx');
    expect(src).toMatch(/role="dialog"[\s\S]{0,120}aria-modal="true"[\s\S]{0,120}aria-label="Chest"[\s\S]{0,120}tabIndex=\{-1\}/);
    expect(src).toMatch(/role="dialog"[\s\S]{0,200}overflow-y-auto/);
  });
});
