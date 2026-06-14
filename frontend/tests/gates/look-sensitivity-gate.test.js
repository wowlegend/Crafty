import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// "Signature-fires" insurance: the one lookSensitivity setting reaches BOTH look consumers
// (desktop PLC pointerSpeed + touch applyLook) AND is editable in SettingsPanel.
const __dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(__dir, '../../src', p), 'utf8');
const scene = read('GameScene.jsx');
const touch = read('ui/TouchControls.jsx');
const panels = read('ui/GamePanels.jsx');
const store = read('store/useGameStore.jsx');

describe('look-sensitivity wires mouse + touch + settings', () => {
  it('store defines lookSensitivity + a clamped setter', () => {
    expect(store).toMatch(/lookSensitivity:\s*1/);
    expect(store).toMatch(/setLookSensitivity:/);
  });
  it('desktop PLC uses pointerSpeed={lookSensitivity}', () => {
    expect(scene).toMatch(/pointerSpeed=\{lookSensitivity\}/);
  });
  it('touch onMove feeds lookSensitivity into applyLook', () => {
    expect(touch).toMatch(/sensitivity:\s*useGameStore\.getState\(\)\.lookSensitivity/);
  });
  it('SettingsPanel edits it via setLookSensitivity', () => {
    expect(panels).toMatch(/setLookSensitivity\(/);
  });
});
