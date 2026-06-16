import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// SOTA M3 #6 (touch dodge): touch had no dodge (Shift-only, unreachable on iPad). A dodge button now
// dispatches the SAME edge-triggered dodge intent the keyboard uses; the roll/i-frame state machine in
// Components is unchanged.
describe('touch-dodge gates (M3 #6 S4)', () => {
  const surface = read('ui/TouchControlsSurface.jsx');
  const controls = read('ui/TouchControls.jsx');
  const comp = read('Components.jsx');

  it('the touch surface draws a dodge glyph (Wind)', () => {
    expect(surface).toMatch(/import \{[^}]*\bWind\b[^}]*\} from 'lucide-react'/);
    expect(surface).toMatch(/<Wind size=/);
  });

  it('the live touch overlay has a Dodge hit-button dispatching the dodge intent', () => {
    expect(/aria-label="Dodge"[\s\S]{0,120}onPointerDown=\{\(\) => setIntent\('dodge', true\)\}/.test(controls)).toBe(true);
  });

  it('it routes to the SAME dodge intent the keyboard (Shift) uses (no gameplay fork)', () => {
    expect(comp).toMatch(/setIntent\('dodge', true\)/); // the Shift path + the dodge state machine are unchanged
  });
});
