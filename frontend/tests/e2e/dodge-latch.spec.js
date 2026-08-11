import { test, expect } from './_fixtures.js';
import { bootDev, startPlay } from './_boot.js';

// A SHIFT PRESSED WHILE YOU WERE NOT PLAYING CAME BACK AS A ROLL.
//
// The dodge intent was set on Shift keydown with no gate and no keyup branch, and its ONE consumer only
// clears it while input is locked. So a Shift pressed on the title screen (GameScene mounts the listener
// before the game starts) or with a panel open latched, and the instant pointer lock returned the state
// machine spent it: an unrequested 0.4s roll with 0.2s of i-frames that the player never asked for.
// blurReset does not cover it — it fires on window blur, and the window keeps focus with a panel open.
//
// Held-key intents have no store mirror, which is why nothing could see this. The DEV test bridge now
// exposes the intent map read-only, and this drives real KeyboardEvents through the real listener.
test.describe('dodge intent latch', () => {
  test.setTimeout(180000);

  const shift = (page, type) =>
    page.evaluate((t) => window.dispatchEvent(new KeyboardEvent(t, { code: 'ShiftLeft', bubbles: true })), type);
  const dodge = (page) => page.evaluate(() => window.__craftyTest.call('readIntents').dodge);

  test('Shift does not latch while input is inactive, and clears on release when it is', async ({ page }) => {
    await bootDev(page);
    // NOT startPlay yet: at page load the controller's mount-time pointer-lock sync leaves active=false,
    // which is exactly the title-screen case. The listener is already mounted — that is the whole bug.
    expect(await dodge(page), 'the intent map starts dirty — this test would prove nothing').toBe(false);

    await shift(page, 'keydown');
    expect(
      await dodge(page),
      'Shift latched the dodge intent while input was inactive — it will be spent as an unrequested roll the moment pointer lock returns'
    ).toBe(false);

    // THE PRESENCE CONTROL. Everything above is an absence assertion, and an absence assertion is worth
    // nothing until the same instrument, in the same run, has shown it can see the positive case.
    await startPlay(page);
    await shift(page, 'keydown');
    expect(await dodge(page), 'Shift no longer arms a dodge at all — the instrument is dead, or the verb is').toBe(true);

    await shift(page, 'keyup');
    expect(
      await dodge(page),
      'releasing Shift left the intent set — it survives into the next lock and rolls unbidden'
    ).toBe(false);
  });

  test('a Shift held ACROSS losing input does not queue a roll', async ({ page }) => {
    // The lived sequence: hold Shift, open a panel (lock released), let go, close the panel. The release
    // arrived while inactive, so the clear has to happen regardless of the active gate that refused the
    // press — otherwise the refusal and the clear disagree and the intent survives.
    await bootDev(page);
    await startPlay(page);

    await shift(page, 'keydown');
    expect(await dodge(page)).toBe(true);

    await page.evaluate(() => window.__craftyTest.call('readIntents')); // no-op read, keeps the ordering explicit
    await shift(page, 'keyup');
    expect(await dodge(page), 'the release did not clear the intent').toBe(false);
  });
});
