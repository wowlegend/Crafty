import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip, carriersOf } from './_srcWalk.js';

const menu = strip(readFileSync(resolve(SRC, 'MenuSystem.jsx'), 'utf8'));

/**
 * W2-T3 — the title screen is the cinematic 3D vista, not the old flat menu.
 *
 * NARROWED 2026-09-22, selected by `gate-census.mjs` at 0/5. Three of its four assertions were
 * duplicates of `chrome-brand-conformance-gates` — the same `menu-particle`, `shimmer-text` and purple
 * gradient exclusions against the same file. Those now run REPO-WIDE in that gate, which is strictly
 * stronger than checking one file here, so keeping a weaker second copy would be two places to maintain
 * and one coverage. They are gone, not re-implemented.
 *
 * What is left is this gate's own claim, and it is the one nothing else makes: the title screen MOUNTS
 * the diorama. A brand blocklist can confirm the old chrome is absent while the new chrome was never
 * added — an empty screen passes every exclusion in the estate.
 *
 * BLIND SPOT, stated (R7): mounting is asserted from source. Nothing here renders the title screen, and
 * the diorama failing to load its scene, rendering black, or being hidden behind an overlay would all
 * pass. `TitleDiorama` is dev-visible in the capture corpus as `title-mascot`, but that frame is one of
 * the three that cannot exist in the shipped bundle.
 *
 * Mutation-Proof: 2 mutations, recorded on the commit.
 */
describe('W2-T3 title screen is the cinematic 3D vista on bold-flat tokens', () => {
  it('MenuSystem was read as code', () => {
    expect(menu.length, 'MenuSystem.jsx read as empty').toBeGreaterThan(2000);
  });

  it('mounts the full-bleed TitleDiorama — the POSITIVE claim no blocklist can make', () => {
    // Anchored to the JSX element, not the bare word: an import left behind after the mount was deleted
    // would satisfy a token match while the title screen renders nothing.
    expect(menu, 'the title diorama is no longer mounted — the vista is gone').toMatch(/<TitleDiorama\b/);
    expect(carriersOf(/<TitleDiorama\b/), 'the diorama is mounted in more than one place')
      .toEqual(['MenuSystem.jsx']);
  });
});
