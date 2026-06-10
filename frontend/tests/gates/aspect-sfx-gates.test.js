import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// The 2026-06-10 audio design doc (the §2.5 interleave unit): the Aspect verb SFX must stay
// REGISTERED + WIRED. Headless tests can't hear (no WebAudio in jsdom), so the testable truth
// is the registry/call-site shape — every named sound has a generator, a registry line, and a
// live call site. The OWED roar (WILDHEART shipped audio-silent) is pinned here for good.
const NAMES = ['roar', 'grab', 'hurl', 'slam', 'anvilHit', 'bind'];

describe('Aspect SFX wiring gates', () => {
  const sound = read('SoundManager.jsx');

  it('every Aspect SFX is generated + registered in SoundManager', () => {
    for (const n of NAMES) {
      expect(sound, `missing registry line for '${n}'`).toMatch(new RegExp(`sounds\\.current\\.${n}\\s*=`));
    }
    for (const g of ['generateRoarSound', 'generateGrabSound', 'generateHurlSound', 'generateSlamSound', 'generateAnvilSound', 'generateBindSound']) {
      expect(sound, `missing builder ${g}`).toMatch(new RegExp(`const ${g} = `));
    }
  });

  it('the roar SOUNDS at the beast-enter site (the owed B1 backfill)', () => {
    expect(read('Components.jsx')).toMatch(/playSpatialSound\('roar'/);
  });

  it('the VOIDHAND verbs sound at their apply/impact sites', () => {
    const comp = read('Components.jsx');
    expect(comp).toMatch(/playSpatialSound\('grab'/);
    expect(comp).toMatch(/playSpatialSound\('hurl'/);
    expect(comp).toMatch(/playSpatialSound\('slam'/);
    expect(comp).toMatch(/playSpatialSound\('bind'/); // S2-B3-M4: the SOULBIND bind chime
    expect(read('world/HurlSystem.jsx')).toMatch(/playSpatialSound\('anvilHit'/);
  });
});
