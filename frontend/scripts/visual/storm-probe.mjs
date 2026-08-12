// storm-probe.mjs — LIVE-LOOK (W4-T8): the storm sky-darken. The mood boost is store-driven (the
// WeatherSystem sets weatherMoodBoost on a weather transition; the Atmosphere driver MAXes it into
// moodTarget so a daytime storm reads overcast/moody). Capture-suppressed (capture weather=clear), so the
// only way to SEE it is to drive the real game, pin a clear midday, screenshot, then inject the storm boost
// (== what stormMoodBoost('rain') yields) and screenshot again. Confirms the sky/grade darkens. /tmp/crafty-storm/.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { serveVite, probePort } from './_serve.mjs';
const PORT = probePort(import.meta.url);
const OUT = '/tmp/crafty-storm';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const { url, waitReady, shutdown } = serveVite(PORT);
let browser = null, code = 0;
try {
  await waitReady();
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });
  await page.evaluate(() => window.__craftyTest.call('start'));
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5)); // midday
  await page.evaluate(() => window.useGameStore.setState({ isDay: true })); // pin clear day (flip-not-set quirk)
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(4000); // settle + let the mood lerp reach clear-day
  await page.screenshot({ path: `${OUT}/clear-day.png` });
  console.log('captured clear-day (weatherMoodBoost=0)');
  // Inject the storm boost == stormMoodBoost('rain') and let the Atmosphere mood lerp converge (~delta*2/frame).
  await page.evaluate(() => window.useGameStore.getState().setWeatherMoodBoost(0.85));
  await delay(3000);
  const boost = await page.evaluate(() => window.useGameStore.getState().weatherMoodBoost);
  console.log('weatherMoodBoost =', boost);
  await page.screenshot({ path: `${OUT}/storm-day.png` });
  console.log('captured storm-day (weatherMoodBoost=0.85)');
} catch (e) { console.error('PROBE ERROR:', e.message); code = 1; }
finally { await shutdown(browser); }
process.exit(code);
