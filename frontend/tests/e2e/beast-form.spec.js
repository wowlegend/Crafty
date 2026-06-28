import { test, expect } from '@playwright/test';
import { bootDev, startPlay, store } from './_boot.js';

// The WILDHEART beast-form transform — a signature Aspect feature — driven end-to-end through the REAL
// booted game store. enterBeastForm gates on (valid element) AND (alive) AND (not already transformed),
// returns true ONLY on a real transform (the caller spends Ferocity on that), and exitBeastForm clears
// it (the no-permanent-beast invariant). The audit had the transform state-machine proven only by an
// isolated store unit; this exercises it in the running game. Each flow runs in one page.evaluate (atomic
// — nothing auto-drives beast-form, and Playwright gives each test a fresh page so no cross-test leak).
test.beforeEach(async ({ page }) => {
  await bootDev(page);
  await startPlay(page);
});

test('beast-form: a valid element transforms, and exit clears it (no-permanent-beast invariant)', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();
    window.useGameStore.setState({ isAlive: true, beastFormActive: false, activeBeastForm: null });
    const entered = g().enterBeastForm('fire'); // BEAST_FORMS.fire -> comet
    const active = g().beastFormActive;
    const form = g().activeBeastForm;
    g().exitBeastForm();
    return { entered, active, form, afterExitActive: g().beastFormActive, afterExitForm: g().activeBeastForm };
  });
  expect(res.entered).toBe(true); // real transform -> caller may spend Ferocity
  expect(res.active).toBe(true);
  expect(res.form).toBe('fire');
  expect(res.afterExitActive).toBe(false); // exit clears
  expect(res.afterExitForm).toBeNull();
});

test('beast-form: rejects a double-transform, an unknown element, and transforming while dead', async ({ page }) => {
  const res = await store(page, () => {
    const g = () => window.useGameStore.getState();

    // already transformed -> no double-transform, existing form untouched
    window.useGameStore.setState({ isAlive: true, beastFormActive: true, activeBeastForm: 'ice' });
    const whileActive = g().enterBeastForm('fire');
    const formUnchanged = g().activeBeastForm;

    // unknown element -> getBeastForm null -> reject, no transform
    window.useGameStore.setState({ isAlive: true, beastFormActive: false, activeBeastForm: null });
    const unknown = g().enterBeastForm('banana');
    const afterUnknown = g().beastFormActive;

    // dead -> can't transform
    window.useGameStore.setState({ isAlive: false, beastFormActive: false, activeBeastForm: null });
    const whileDead = g().enterBeastForm('fire');
    const afterDead = g().beastFormActive;

    return { whileActive, formUnchanged, unknown, afterUnknown, whileDead, afterDead };
  });
  expect(res.whileActive).toBe(false); // no double-transform (the rejected enter spends no Ferocity)
  expect(res.formUnchanged).toBe('ice'); // existing form preserved
  expect(res.unknown).toBe(false); // unknown element rejected
  expect(res.afterUnknown).toBe(false);
  expect(res.whileDead).toBe(false); // dead can't transform
  expect(res.afterDead).toBe(false);
});
