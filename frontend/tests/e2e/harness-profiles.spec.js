import { test, expect } from './_fixtures.js';
import { bootDev } from './_boot.js';

// THE HARNESS PROFILES, IN THE PAGE (first-minute D11, the W3-A task script's U0b; DECISIONS 2026-11-01 (W3-A PR C)
// item 481). tests/scripts/harness-profiles.test.js drives the seeding table; this proves the fixture (tests/e2e/_fixtures.js)
// hands it to every page: a recorder added after the fixture's seed (init scripts run in the order they were added, and
// all of them before the page's own scripts) reads what the game will find, before the game can write anything itself.
// The fresh case is the presence control's twin: the same recorder, the same read, and nothing stored.
//
// Mutation-Proof: run locally, one browser at a time, each observed RED:
//   E1 the fixture seeds nothing (its addInitScript line deleted) -> "a returning player boots onboarded"
//   E2 the fixture ignores the option and always seeds returning -> "a fresh player boots with nothing stored"

const recordBootStorage = () => {
  window.__profileAtBoot = { onboarded: localStorage.getItem('crafty_onboarded'), keys: localStorage.length };
};
const atBoot = async (page) => {
  await page.addInitScript(recordBootStorage);
  await bootDev(page);
  const at = await page.evaluate(() => window.__profileAtBoot ?? null);
  expect(at, 'SETUP: the boot recorder never ran in the page').not.toBeNull();
  return at;
};

test('a returning player (the default profile) boots onboarded, before the game writes anything', async ({ page }) => {
  const at = await atBoot(page);
  expect(at, `a returning player boots onboarded: ${JSON.stringify(at)}`).toEqual({ onboarded: '1', keys: 1 });
});

test.describe('a fresh player', () => {
  test.use({ profile: 'fresh' });
  test('boots with nothing stored', async ({ page }) => {
    const at = await atBoot(page);
    expect(at, `a fresh player boots with nothing stored: ${JSON.stringify(at)}`).toEqual({ onboarded: null, keys: 0 });
  });
});
