// LOOK probe (M6 #17): force the rebuilt bold-flat AuthModal open + screenshot it. showAuthModal is
// App useState (not the store), so use the DEV `openAuth` test-hook. enterCapture builds the world behind
// so the modal reads in its real first-impression context. Not part of the gate (the static conformance
// gate brand-conformance-gates.test.js is the regression lock); this is the one-time human eyeball.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';

const PORT = 5198;
const URL = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = '/tmp/crafty-auth';
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--no-open'], { cwd: process.cwd(), stdio: 'ignore' });
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 860 });
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  for (let i = 0; i < 120; i++) { try { const r = await fetch(URL); if (r.ok) break; } catch {} await delay(250); }
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });
  await page.evaluate(() => window.__craftyTest.call('enterCapture', {}));
  await delay(1500);
  await page.evaluate(() => window.__craftyTest.call('openAuth'));
  await page.waitForFunction(() => !!document.querySelector('[data-testid="auth-modal"]'), { timeout: 8000 });
  await page.evaluate(() => document.fonts.ready);
  await delay(700);
  await page.screenshot({ path: `${OUT}/auth-login.png` });
  // also shot the register variant (the email field + Create Account button)
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /create one here/i.test(x.textContent)); if (b) b.click(); });
  await delay(500);
  await page.screenshot({ path: `${OUT}/auth-register.png` });
  console.log('shot auth; modal present =', await page.evaluate(() => !!document.querySelector('[data-testid="auth-modal"]')));
} catch (e) { console.error('AUTH-PROBE ERROR:', e); } finally {
  await browser.close();
  server.kill();
}
