import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = () => readFileSync(resolve(here, '../../src/input/touchMath.js'), 'utf8');

describe('touchMath.js purity (M0 contract — node-testable, no framework)', () => {
  it('has ZERO react / three / R3F / inputState imports (stays pure like inputState.js)', () => {
    const code = src();
    const banned = [/from\s+['"]react['"]/, /from\s+['"]three['"]/, /@react-three/, /from\s+['"].*inputState/];
    for (const re of banned) expect(re.test(code), `must not import ${re}`).toBe(false);
    // no direct DOM globals referenced
    expect(/\bdocument\.|\bwindow\.|\bnavigator\./.test(code), 'no DOM globals').toBe(false);
  });

  it('exports the three pure units + the shared look constants', () => {
    const code = src();
    for (const name of ['joystickToMove', 'applyLook', 'makeTouchRouter', 'LOOK_BASE_SENSITIVITY', 'MAX_PITCH', 'DEFAULT_DEADZONE']) {
      expect(
        code.includes(`export function ${name}`) || code.includes(`export const ${name}`),
        `exports ${name}`,
      ).toBe(true);
    }
  });
});
