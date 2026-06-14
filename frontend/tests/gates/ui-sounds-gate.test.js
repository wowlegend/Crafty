import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { VOICES } from '../../src/audio/synthVoices.js';

// "Signature-fires" insurance: the UI foley voices exist + the watcher fires them on the panel-layer edge.
const __dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(__dir, '../../src', p), 'utf8');
const ui = read('ui/UISounds.jsx');
const sm = read('SoundManager.jsx');

describe('UI panel-open/close foley is wired', () => {
  it('the uiOpen/uiClose voices are registered', () => {
    expect(typeof VOICES.uiOpen).toBe('function');
    expect(typeof VOICES.uiClose).toBe('function');
  });
  it('SoundManager exposes playUIOpen / playUIClose', () => {
    expect(sm).toMatch(/playUIOpen:/);
    expect(sm).toMatch(/playUIClose:/);
  });
  it('UISounds watches the panel layer + plays on the open/close edge', () => {
    expect(ui).toMatch(/showInventory\s*\|\|\s*s\.showCrafting/);
    expect(ui).toMatch(/playUIOpen\?\.\(\)/);
    expect(ui).toMatch(/playUIClose\?\.\(\)/);
  });
});
