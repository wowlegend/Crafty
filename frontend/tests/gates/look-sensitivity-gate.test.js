import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// "Signature-fires" insurance: the one lookSensitivity setting reaches BOTH look consumers
// (desktop own-pointer-lock handler + touch applyLook) AND is editable in SettingsPanel.
const __dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(__dir, '../../src', p), 'utf8');
const scene = read('GameScene.jsx') + read('render/PointerLook.jsx'); // A2.4: PointerLook handler moved -> src/render/
const touch = read('ui/TouchControls.jsx');
const panels = read('ui/GamePanels.jsx');
const store = read('store/useGameStore.jsx');

describe('look-sensitivity wires mouse + touch + settings', () => {
  it('store defines lookSensitivity + a clamped setter', () => {
    expect(store).toMatch(/lookSensitivity:\s*1/);
    expect(store).toMatch(/setLookSensitivity:/);
  });
  it('desktop mouse-look (own pointer-lock handler) reads lookSensitivity', () => {
    // drei <PointerLockControls> was REPLACED by src/input/pointerLook.js (it was element-match-fragile +
    // untestable headless -> a dead camera slipped with no gate). GameScene mounts <PointerLook/> which
    // attaches the handler with getSensitivity pulling the live store value while pointer-locked.
    expect(scene).toMatch(/<PointerLook\s*\/>/);
    expect(scene).toMatch(/attachPointerLook\(\{[\s\S]*lookSensitivity/);
    const look = read('input/pointerLook.js');
    expect(look).toMatch(/getSensitivity/);
    expect(look).toMatch(/pointerLockElement/); // only rotates while locked
  });
  it('drei PointerLockControls is fully removed (the replaced black box)', () => {
    expect(scene).not.toMatch(/PointerLockControls/);
  });
  it('touch onMove feeds lookSensitivity into applyLook', () => {
    expect(touch).toMatch(/sensitivity:\s*useGameStore\.getState\(\)\.lookSensitivity/);
  });
  it('SettingsPanel edits it via setLookSensitivity', () => {
    expect(panels).toMatch(/setLookSensitivity\(/);
  });
});
