import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const idx = readFileSync(resolve(HERE, '../../src/index.jsx'), 'utf8');

// M6 #8: the ErrorBoundary fallback was a raw inline-style red debug box that always dumped the React
// component stack to the player. Rebuilt bold-flat (self-contained palette hex, robust during a crash) +
// a Reload affordance + the component stack DEV-gated. It is never in a capture state (off the visual gate).
describe('M6 #8 ErrorBoundary bold-flat crash screen', () => {
  it('dropped the raw red debug box', () => {
    expect(idx).not.toMatch(/backgroundColor: '#fee'/);
    expect(idx).not.toMatch(/color: 'red'/);
  });

  it('uses the bold-flat palette (ink border + hard offset shadow) + a Reload affordance', () => {
    expect(idx).toMatch(/border: '4px solid #0A0F1A'/);
    expect(idx).toMatch(/boxShadow: '8px 8px 0 #0A0F1A'/);
    expect(idx).toMatch(/window\.location\.reload/);
  });

  it('DEV-gates the component stack (players never see the internals dump)', () => {
    expect(idx).toMatch(/import\.meta\.env\.DEV && this\.state\.errorInfo/);
  });
});
