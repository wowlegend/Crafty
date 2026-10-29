import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// THREE PANELS, THE CONTROLS PANEL AND THE TRAY, BY REAL INPUT (the HUD lane, DECISIONS 2026-10-29 item 96).
//   desktop: Tab opens Character on its gear tab, its strip reaches spells and talents, Tab closes it; J opens the
//     Journal on its quests, its strip reaches the feats, J closes it; B opens Build; H opens the controls panel; E, M,
//     U, L and Q open nothing. A fresh profile shows the controls card and the "H Controls" hint; once H has opened the
//     panel, a reload shows neither (STATUS C1/c).
//   phone 390x844: the tray's Character and Journal buttons, by real taps, open the gear and the quest log.
// NOT RUN LOCALLY (no local e2e); its browser mutants are argued from tests/gates/panel-groups-gates and
// controls-panel-gates.

const shown = (page, id) => page.getByTestId(id);
const press = async (page, key) => { await startPlayActive(page); await page.keyboard.press(key); };

test.describe('desktop', () => {
  test('Tab, J, B and H open their panels; the strips switch tabs; the old keys open nothing; the controls hint clears', async ({ page }) => {
    test.setTimeout(300000);
    // A fresh profile on the first load only: an init script runs on every navigation, so the reload below would clear
    // the flag again (CI run 40937922439 read exactly that); sessionStorage survives the reload and marks it done.
    await page.addInitScript(() => {
      try {
        if (!sessionStorage.getItem('e2e-fresh-profile')) {
          localStorage.removeItem('crafty_controls_seen');
          sessionStorage.setItem('e2e-fresh-profile', '1');
        }
      } catch { /* storage blocked */ }
    });
    await bootDev(page);
    await startPlayActive(page);
    await expect(shown(page, 'controls-card'), 'a fresh profile is not shown the controls card').toBeVisible({ timeout: 20000 });
    await expect(shown(page, 'controls-hint'), 'a fresh profile is not shown the H hint').toBeVisible();

    for (const k of ['e', 'm', 'u', 'l', 'q']) {
      await press(page, k);
      await page.waitForTimeout(300);
    }
    for (const id of ['inventory-modal', 'magic-panel', 'progression-panel', 'quest-log-panel']) {
      await expect(shown(page, id), `an old key opened ${id}`).toHaveCount(0);
    }

    await press(page, 'Tab');
    await expect(shown(page, 'inventory-modal'), 'Tab did not open Character on its gear tab').toBeVisible({ timeout: 15000 });
    await expect(shown(page, 'panel-tab-gear')).toHaveAttribute('aria-selected', 'true');
    await shown(page, 'panel-tab-spells').click();
    await expect(shown(page, 'magic-panel'), 'the spells tab did not open the spells').toBeVisible();
    await expect(shown(page, 'inventory-modal')).toHaveCount(0);
    await shown(page, 'panel-tab-talents').click();
    await expect(shown(page, 'progression-panel'), 'the talents tab did not open the talents').toBeVisible();
    await page.keyboard.press('Tab');
    await expect(shown(page, 'panel-tabs-character'), 'Tab did not close Character from its talents tab').toHaveCount(0);

    await press(page, 'j');
    await expect(shown(page, 'quest-log-panel'), 'J did not open the Journal on its quests').toBeVisible({ timeout: 15000 });
    await shown(page, 'panel-tab-feats').click();
    await expect(shown(page, 'achievements-panel'), 'the feats tab did not open the feats').toBeVisible();
    await page.keyboard.press('j');
    await expect(shown(page, 'panel-tabs-journal')).toHaveCount(0);

    await press(page, 'b');
    await expect(shown(page, 'building-panel'), 'B did not open Build').toBeVisible({ timeout: 15000 });
    await page.keyboard.press('b');
    await expect(shown(page, 'building-panel')).toHaveCount(0);

    await press(page, 'h');
    await expect(shown(page, 'controls-panel'), 'H did not open the controls panel').toBeVisible({ timeout: 15000 });
    const rows = await page.locator('[data-testid="controls-panel"] [data-controls-key]').count();
    expect(rows, 'the controls panel lists too few keys').toBeGreaterThan(15);
    expect(await page.evaluate(() => localStorage.getItem('crafty_controls_seen')), 'opening the panel was not remembered').toBe('1');

    await page.reload();
    await bootDev(page);
    await startPlayActive(page);
    await expect(shown(page, 'stat-stack'), 'SETUP: the HUD did not come back after the reload').toBeVisible({ timeout: 30000 });
    await expect(shown(page, 'controls-card'), 'the card came back after the panel was opened').toHaveCount(0);
    await expect(shown(page, 'controls-hint'), 'the hint came back after the panel was opened').toHaveCount(0);
  });
});

test.describe('phone 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the tray offers Character, Talk, Build and Journal; Character and Journal open by real taps', async ({ page }) => {
    test.setTimeout(240000);
    await bootDev(page);
    await page.waitForFunction(() => window.useGameStore.getState().isSpawnChunkLoaded === true, null, { timeout: 90000 });
    let ready = false;
    for (let i = 0; i < 25 && !ready; i++) {
      await page.evaluate(() => window.__craftyTest.call('forcePlay'));
      await page.waitForTimeout(600);
      ready = await page.evaluate(() => !!document.querySelector('[data-testid="touch-panels"]'));
    }
    expect(ready, 'SETUP: the touch overlay never showed its tray button').toBe(true);
    await shown(page, 'touch-panels').tap();
    const ids = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="touch-tray-"]')].map((el) => el.getAttribute('data-testid')));
    expect(ids).toEqual(['touch-tray-character', 'touch-tray-talk', 'touch-tray-build', 'touch-tray-journal']);
    await shown(page, 'touch-tray-character').tap();
    await expect(shown(page, 'inventory-modal'), 'the tray\'s Character did not open the gear').toBeVisible({ timeout: 15000 });
    await expect(shown(page, 'panel-tabs-character')).toBeVisible();
  });
});
