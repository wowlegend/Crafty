// quest-log-probe.mjs — LIVE-LOOK at the M-NARRATIVE.3 QuestLog panel (L). Capture-suppressed (a modal,
// never in the diorama baselines), so the only way to SEE it is to drive the real game, open the log via
// store injection (showQuestLog — the L key is keyboard-driven and headless puppeteer can't fire it), and
// screenshot. Confirms giver + lore + themed objective + progress per active quest. Saves to /tmp/crafty-ql/.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { serveVite } from './_serve.mjs';
const PORT = 4201;
const OUT = '/tmp/crafty-ql';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const { url, waitReady, shutdown } = serveVite(PORT);
let browser = null;
const done = async (c) => { await shutdown(browser); process.exit(c); };
try {
  await waitReady();
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });
  await page.evaluate(() => window.__craftyTest.call('start'));
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5)); // midday for clarity
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(4000); // let terrain stream + the quest system seed the active chain
  // Open the quest log via store injection (the L-key path is keyboard-driven; headless can't dispatch it).
  await page.evaluate(() => window.useGameStore.setState({ showQuestLog: true }));
  await delay(1000);
  const open = await page.evaluate(() => window.useGameStore.getState().showQuestLog);
  console.log('showQuestLog =', open);
  await page.screenshot({ path: `${OUT}/quest-log.png` });
  console.log('captured quest-log.png');
  done(0);
} catch (e) { console.error('PROBE ERROR:', e.message); done(1); }
