import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const SRC = readFileSync(resolve(process.cwd(), 'src/render/playerRender.jsx'), 'utf8');
describe('W2-T6 stylized FPV hands (character render language)', () => {
  it('the raw flesh-box hex #fdbcb4 is gone', () => { expect(SRC.toLowerCase()).not.toMatch(/#fdbcb4/); });
  it('the hands use drei Outlines (the character render language)', () => { expect(SRC).toMatch(/Outlines/); });
  it('a white-gold accent is present on the hands', () => { expect(SRC).toMatch(/#FFF|#F8E|gold|FFD700|E8D9|accent/i); });
});
