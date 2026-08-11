import { test, expect } from './_fixtures.js';
import { bootDev, startPlay } from './_boot.js';

// THE IMBUE LATCH CONSUMED THE WRONG CAST, AND ON THE ADVERTISED KEY IT CONSUMED NOTHING AT ALL.
//
// Two audit findings, one mechanism. The latch decided 'consume' inside useFrame, one frame AFTER the
// projectile had already been spawned and had already read the element slot — so the cast that PAID got
// `imbueKind: null` and the kind sat parked for the NEXT cast to take for free (elemancer.js:21). And the
// F key — the advertised prime cast key — never stamped the latch's input at all, so on that path the
// stance idled armed forever and never fired (Components.jsx:366).
//
// WHY THIS HAS TO BE AN E2E, AND WHY THE ASSERTION IS INSIDE ONE page.evaluate.
// The bug is pure ORDERING: what has happened by the time the projectile spawns. Any assertion made
// after a frame boundary reads identical values in the broken and fixed builds — the old code reached
// the same end state, just one frame late. A synthetic keydown dispatched synchronously runs the real
// listener in the same JS turn, so reading the store immediately afterwards asks exactly the right
// question: did the cast itself consume the latch, or did something later clean up after it?
test.describe('elemancer imbue latch', () => {
  test.setTimeout(180000);

  test('the cast that pays is the cast that consumes — synchronously, on the F key', async ({ page }) => {
    await bootDev(page);
    await startPlay(page);
    await page.waitForFunction(() => !!window.useGameStore, null, { timeout: 60000 });

    // Grant the talent and a full bank, then ARM through the real Z path. Arming is a stance toggle
    // decided in useFrame and that timing is correct — only the CONSUME had to move — so this half is
    // legitimately awaited across a frame.
    await page.evaluate(() => {
      const S = window.useGameStore;
      S.setState({
        unlockedTalents: { ...(S.getState().unlockedTalents || {}), elemancer_imbue: 1 },
        resonanceBanked: 100,
      });
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', bubbles: true }));
    });
    await page.waitForFunction(() => window.useGameStore.getState().imbueArmed === true, null, { timeout: 15000 });

    const cast = await page.evaluate(() => {
      const S = () => window.useGameStore.getState();
      const bankBefore = S().resonanceBanked;
      // Synchronous: the listener, triggerSpellCast, the latch and the projectile spawn all run inside
      // this dispatch. Nothing can schedule a frame in between.
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
      return { armed: S().imbueArmed, spent: bankBefore - S().resonanceBanked };
    });

    expect(
      cast.armed,
      'the latch was still armed the instant the cast returned — the projectile was spawned before the latch resolved, so it carries no element and the NEXT cast steals the zone'
    ).toBe(false);
    expect(
      cast.spent,
      'the imbued cast did not spend its Resonance in the same call that spawned it'
    ).toBe(30);

    // The other half of the off-by-one: an UNARMED cast must be an ordinary cast. It must not pick up a
    // parked element, and it must not be charged for one.
    await page.waitForTimeout(400); // CAST_COOLDOWN is 333ms; a swallowed cast would fake this pass
    const second = await page.evaluate(() => {
      const S = () => window.useGameStore.getState();
      const bankBefore = S().resonanceBanked;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
      return { armed: S().imbueArmed, spent: bankBefore - S().resonanceBanked, bank: S().resonanceBanked };
    });

    expect(second.armed, 'an unarmed cast armed the latch').toBe(false);
    expect(second.spent, 'an unarmed cast was charged the zone cost').toBe(0);
    expect(second.bank, 'the bank drifted — the control for the assertion above').toBe(70);
  });
});
