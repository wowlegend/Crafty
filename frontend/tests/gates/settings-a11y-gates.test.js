import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { motionIntensity } from '../../src/game/a11y.js';

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

// S2: prefers-reduced-motion is auto-respected (drives the dial to 0) + an explicit Settings toggle.
describe('settings a11y gates (M3 #3 S2 -- reduced motion)', () => {
  const app = read('App.jsx');
  const panels = read('ui/GamePanels.jsx');

  it('motionIntensity maps reduced-motion -> 0, else the user scale', () => {
    expect(motionIntensity(true, 1)).toBe(0);
    expect(motionIntensity(false, 0.5)).toBe(0.5);
  });

  it('App mounts a prefers-reduced-motion listener that drives setJuiceIntensity (capture-gated)', () => {
    expect(app).toMatch(/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
    expect(app).toMatch(/setJuiceIntensity\(motionIntensity\(mq\.matches/);
    expect(/isCaptureMode\(\)[\s\S]{0,160}matchMedia\('\(prefers-reduced-motion/.test(app)).toBe(true);
    expect(app).toMatch(/addEventListener\('change', apply\)/);
  });

  it('SettingsPanel has an explicit Reduced Motion toggle wired to the dial', () => {
    expect(panels).toMatch(/Reduced Motion/);
    expect(/Reduced Motion[\s\S]{0,260}setJuiceIntensity\(\(gameState\.juiceIntensity \?\? 1\) === 0 \? 1 : 0\)/.test(panels)).toBe(true);
  });
});
