import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

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

  // Read the intent ALONGSIDE the two gates that decide whether the press is even considered:
  // Components.jsx:366 requires `active` AND `isAlive`. A bare `.dodge` read cannot tell a broken
  // latch from a refused press — which is exactly how CI run 31733744537 reported "the verb is dead"
  // when the player was simply dead. Every assertion below carries this state in its message so the
  // next failure names its own cause instead of accusing the feature.
  const dodgeState = (page) =>
    page.evaluate(() => {
      const intents = window.__craftyTest.call('readIntents');
      const s = window.useGameStore.getState();
      return { dodge: intents.dodge, active: intents.active, alive: s.isAlive, health: s.playerHealth };
    });
  const dodge = async (page) => (await dodgeState(page)).dodge;
  // PRESS AND READ IN ONE EVALUATE. As two round trips, a frame could run between them — and the controller spends a
  // held dodge intent into a roll on its next frame (edge-triggered: one press, one roll), so a press that WORKED read
  // back as "refused" (local run 2026-09-23, dodge-latch:73, under a load of ~25). Nothing renders inside one
  // synchronous evaluate, so the read is of the latch itself, not of whether a frame happened to intervene.
  const pressShift = (page) =>
    page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
      const intents = window.__craftyTest.call('readIntents');
      const s = window.useGameStore.getState();
      return { dodge: intents.dodge, active: intents.active, alive: s.isAlive, health: s.playerHealth };
    });

  // PRESS, (optionally) LOSE INPUT, RELEASE — and read after each — in ONE evaluate. The release's clear used to be read
  // a round trip later, and the controller's next frame clears a held dodge on its own (it spends it as a roll), so a
  // mutant that DELETED the keyup clear stayed green (review #8, finding 5). Inside one synchronous evaluate no frame
  // runs, so what is read after the keyup is the keyup's doing. `loseInput` dispatches the same pointerlockerror the
  // game's own listener handles, clearing the input gate between the press and the release.
  const pressLoseRelease = (page, { loseInput = false } = {}) =>
    page.evaluate((lose) => {
      const read = () => ({ ...window.__craftyTest.call('readIntents') });
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', bubbles: true }));
      const pressed = read();
      if (lose) document.dispatchEvent(new Event('pointerlockerror'));
      const lost = read();
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', bubbles: true }));
      const released = read();
      return { pressed: { dodge: pressed.dodge, active: pressed.active }, lost: { dodge: lost.dodge, active: lost.active }, released: { dodge: released.dodge, active: released.active }, alive: window.useGameStore.getState().isAlive };
    }, loseInput);

  // THE SUBJECT OF THIS SPEC IS THE INPUT LATCH, NOT SURVIVAL — so state the survival precondition
  // rather than inheriting it by accident. SpawnerSystem.jsx:94 spawns 20 hostiles the moment
  // isSpawnChunkLoaded flips, and startPlayActive waits for exactly that flag, so on a slow runner
  // the player can be dead before the presence control runs.
  //
  // Until 2026-08-13 this spec passed for a reason worth recording: `startPlay` swallowed its world
  // wait, so the test ran BEFORE the world was built — in a world with no terrain and therefore no
  // mobs. The green came from the absence of the game, and fixing the boot helper is what revealed it.
  const declareAlive = (page) =>
    page.evaluate(() =>
      window.useGameStore.setState({ isAlive: true, playerHealth: window.useGameStore.getState().maxHealth })
    );

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
    await startPlayActive(page);
    await declareAlive(page);
    const r = await pressLoseRelease(page);
    expect(r.pressed.dodge, `Shift no longer arms a dodge at all — the instrument is dead, or the verb is. State: ${JSON.stringify(r)}`).toBe(true);
    expect(
      r.released.dodge,
      `releasing Shift left the intent set — it survives into the next lock and rolls unbidden: ${JSON.stringify(r)}`
    ).toBe(false);
  });

  test('a Shift held ACROSS losing input does not queue a roll', async ({ page }) => {
    // The lived sequence: hold Shift, open a panel (lock released), let go, close the panel. The release
    // arrived while inactive, so the clear has to happen regardless of the active gate that refused the
    // press — otherwise the refusal and the clear disagree and the intent survives.
    await bootDev(page);
    await startPlayActive(page);
    await declareAlive(page);

    const r = await pressLoseRelease(page, { loseInput: true });
    expect(r.pressed.dodge, `the press was refused — State: ${JSON.stringify(r)}`).toBe(true);
    expect(r.lost.active, `SETUP: input was not lost between the press and the release: ${JSON.stringify(r)}`).toBe(false);
    expect(r.released.dodge, `the release, arriving while input was lost, did not clear the intent: ${JSON.stringify(r)}`).toBe(false);
  });
});
