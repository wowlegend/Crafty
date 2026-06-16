import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// SOTA M3 #3 (settings/a11y): the M1 juiceIntensity dial (screenshake + hitstop strength) is now
// player-tunable from the SettingsPanel -- the audit's "no feedback-intensity toggle" gap.
describe('settings a11y gates (M3 #3 S1 -- feedback-intensity slider)', () => {
  const panels = read('ui/GamePanels.jsx');
  const store = read('store/useGameStore.jsx');

  it('the store dial it drives still exists (M1) -- clamped 0..1', () => {
    expect(store).toMatch(/juiceIntensity:\s*1/);
    expect(store).toMatch(/setJuiceIntensity:/);
  });

  it('SettingsPanel has a Feedback Intensity slider', () => {
    expect(panels).toMatch(/Feedback Intensity/);
    // a range input bound to the dial
    expect(/type="range"[\s\S]{0,200}value=\{gameState\.juiceIntensity/.test(panels)).toBe(true);
  });

  it('the slider writes through setJuiceIntensity (the clamped store setter)', () => {
    expect(panels).toMatch(/gameState\.setJuiceIntensity\(parseFloat\(e\.target\.value\)\)/);
  });
});
