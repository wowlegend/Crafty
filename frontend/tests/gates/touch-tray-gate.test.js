import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { TRAY_PANELS } from '../../src/ui/touchTray.js';

// The "signature-fires-in-prod" insurance: every tray opener maps to a REAL store action + boolean.
// A renamed/removed store setter turns this red instead of leaving the touch tray with dead buttons.
const __dir = dirname(fileURLToPath(import.meta.url));
const store = readFileSync(resolve(__dir, '../../src/store/useGameStore.jsx'), 'utf8');

describe('touch tray openers map to real store actions', () => {
  it('every TRAY_PANELS action + show key exists in the store', () => {
    for (const p of TRAY_PANELS) {
      expect(store, `${p.action} missing`).toMatch(new RegExp(`${p.action}\\s*:`));
      expect(store, `${p.show} missing`).toMatch(new RegExp(`${p.show}\\s*:`));
    }
  });
});
