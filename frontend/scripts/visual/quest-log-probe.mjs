// quest-log-probe.mjs — LIVE-LOOK at the M-NARRATIVE.3 QuestLog panel (L). Capture-suppressed (a modal,
// never in the diorama baselines), so the only way to SEE it is to drive the real game, open the log via
// store injection (showQuestLog — the L key is keyboard-driven and headless puppeteer can't fire it), and
// screenshot. Confirms giver + lore + themed objective + progress per active quest. Saves to /tmp/crafty-ql/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
const PORT = 4201, URL = `http://localhost:${PORT}`;
const OUT = '/tmp/crafty-ql';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const done = (c) => { try { server.kill('SIGKILL'); } catch {} process.exit(c); };
try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(URL); if (r.ok) break; } catch {} await delay(250); }
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URL, { waitUntil: 'networkidle2' });
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
