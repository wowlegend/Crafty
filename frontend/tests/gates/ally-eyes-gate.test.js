import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(__dirname, '../../src/render/MobModel.jsx'), 'utf8');

describe('W1 — bound allies do not render hostile red eyes', () => {
  it('the hostile-eyes gate excludes isAlly', () => {
    // the red-eye block must be gated on !entity.isAlly so a captured companion is not red-eyed
    expect(/!entity\.isAlly/.test(src)).toBe(true);
    // and the #ff0000 eye mesh still exists (we did not delete eyes wholesale)
    expect(src.includes("#ff0000")).toBe(true);
  });
});
