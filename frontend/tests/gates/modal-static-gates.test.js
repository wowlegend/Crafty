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

  it('the Modal primitive renders a role=dialog with aria-modal + capture-gated focus', () => {
    const m = read('ui/primitives/Modal.jsx');
    expect(m).toMatch(/role="dialog"/);
    expect(m).toMatch(/aria-modal="true"/);
    expect(m).toMatch(/aria-label=\{label\}/);
    expect(m).toMatch(/if \(!isCaptureMode\(\)\) dialogRef\.current\?\.focus\(\)/);
  });
});
