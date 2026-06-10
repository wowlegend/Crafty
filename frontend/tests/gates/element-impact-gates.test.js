import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPELL_TO_ELEMENT } from '../../src/game/beasts.js';
import { requestHurl, consumeHurlRequest, requestSlam, consumeSlamRequest } from '../../src/game/hurlChannel.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// S2-B2-M5 (element-charge transparency) — VERIFIED-BY-CONSTRUCTION since M3, locked here:
// the element of a HURL/SLAM is read from `activeSpell` AT IMPACT (never stored at grab or
// launch), so a mid-hold spell-switch can NEVER desync the verb's element. These gates pin
// the construction so a refactor can't silently regress it.
describe('M5 element-at-impact gates', () => {
  it('the hurl/slam channel carries NO element (the no-desync mechanism)', () => {
    requestHurl({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, '#fff');
    const h = consumeHurlRequest();
    expect(Object.keys(h).sort()).toEqual(['color', 'dir', 'origin']);
    requestSlam({ x: 0, y: 0, z: 0 }, '#fff');
    const s = consumeSlamRequest();
    expect(Object.keys(s).sort()).toEqual(['center', 'color']);
  });

  it('HurlSystem reads activeSpell at the impact sites (not at launch)', () => {
    const src = read('world/HurlSystem.jsx');
    expect((src.match(/store\.activeSpell/g) || []).length).toBeGreaterThanOrEqual(2); // slam + hurl impact
    expect(src).not.toMatch(/req\.element|request\.element/); // nothing element-shaped rides the channel
  });

  it('every spell element has a distinct impact case in the mob damage layer (all 4 re-skin)', () => {
    const npc = read('SimplifiedNPCSystem.jsx');
    for (const spell of Object.keys(SPELL_TO_ELEMENT)) {
      expect(npc, `missing impact case for '${spell}'`).toMatch(new RegExp(`case '${spell}':`));
    }
  });
});
