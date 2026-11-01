// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/**
 * THE BOSS BAR LOADS WHEN A FIGHT NEEDS IT (W3-A C0, DECISIONS 2026-11-01 (W3-A PR C) item 480). The bar left the boot
 * chunk for the lazy panel chunk (ui/panels/lazyPanels.js). scripts/ci/bundle-budget.mjs proves the split on the BUILT
 * bundle (its marker absent from the boot chunk, present in one lazy chunk); this proves what a bundle cannot: the HUD's
 * encounter column mounts the lazy bar, and the lazy bar resolves to the real one through the panel chunk's own import,
 * so a fight still shows its bar. The panel chunk is NOT loaded first here, which is the case the idle prefetch has not
 * reached (a fight a save restored at boot).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, 1 test, each observed RED:
 *   R1 HUD.jsx imports the bar statically again -> "rendered in the first commit"
 *   R2 lazyPanels.js names a bar the panel chunk does not export -> "never resolved to the real bar"
 *   R3 panelBundle.js drops its BossHealthBar export -> the same test
 *   I0 identity (a comment edit in lazyPanels.js) SURVIVED.
 *
 * NOT CHECKED HERE: the chunk boundary itself (bundle-budget.mjs), and the bar's layout (tests/e2e/hud-at-rest.spec.js).
 */
import { Encounter } from '../../src/HUD.jsx';

const boss = (bossActive) => ({ bossActive, bossHealth: 500, bossMaxHealth: 700, bossPhase: 0, bossTier: 0 });
afterEach(cleanup);

describe('the boss bar, lazy', () => {
  it('is absent from the first commit of a fight, then resolves to the real bar through the panel chunk', async () => {
    render(<Encounter bossSystem={boss(true)} notifications={[]} />);
    expect(screen.queryByTestId('boss-health-bar'), 'the bar rendered in the first commit: it is statically imported, not lazy')
      .toBeNull();
    const bar = await screen.findByTestId('boss-health-bar', {}, { timeout: 15000 })
      .catch(() => { throw new Error('the lazy bar never resolved to the real bar through the panel chunk'); });
    expect(bar.textContent, 'presence: the real bar names the boss and reads its health').toMatch(/^Shadow Dragon.*HP 500 \/ 700/);
  });
});
