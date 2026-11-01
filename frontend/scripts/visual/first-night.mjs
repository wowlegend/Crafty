// first-night.mjs — the First Night, PLAYED: ten minutes in real time on the production build (or --url), as a fresh
// player, on real input (the W3-A task script's U0; the brief's acceptance 2; DECISIONS 2026-11-01 (W3-A PR C) item 484).
//
//   node scripts/visual/first-night.mjs [--url <base>] [--out <dir>] [--seconds <n>] [--allow-software]
//
// It serves build/ with `vite preview` (run `npm run build` first) unless --url names a deployment, opens the page with
// ?lookbook=1 for the production seam's read-only views (render/lookbookSeam.js night(), info(), mobs()), clicks Start,
// and plays: walks to the cold brazier and presses G, then fights what comes, aiming by mouse moves computed from the
// seam's mob list (_firstNight.mjs aimStep) and attacking with the left button, and roars on R when the bar is full. It
// writes, under --out (default docs/superpowers/masterpiece-2026-10/evidence/first-night/, beside the eye-level frames):
//   first-night.json   the beat log, the pressure numbers (lowest health, hits taken, seconds engaged, the flame's low),
//                      the verdict and the renderer; clip.webm, the eye-level clip of the whole run; hero.jpg, the
//                      captain-kill frame (W3-G's README hero); frames/ and contact-sheet.{html,png}, a frame every 30 s.
// Exit 0: every beat seen on time and the pressure in band. 1: a beat missed or the pressure out of band (the report
// names each, misses first). 3: COULD NOT CHECK (no build, a stale build served, no hardware renderer, no seam, no play).
//
// INPUT, AND WHAT IS STOOD IN. Keys (W, G, R) and the mouse buttons are Playwright's trusted input. Playwright's browsers
// refuse a pointer lock, so the lock is stood in (_probe.mjs standInPointerLock): the game's own listener opens its gate.
// The mouse moves are real moves, whose movementX/Y the game's mouse look reads (input/pointerLook.js); between moves the
// cursor is put back at the centre with the stood-in lock answering null for that one move, so the return leg does not
// turn the view back. Nothing else is written to the game: the seam is read only.
//
// BLIND SPOTS. One Chromium on this Mac, not an iPad. The fight is a bot's, so the pressure numbers say what a steady,
// greedy player meets, not a new one; a reviewer who did not build the lane judges the clip (brief, acceptance 2). A run
// cut short by --seconds misses every beat after it, and says so.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveVite, probePort } from './_serve.mjs';
import { resolveChromium } from './_lookbookPage.mjs';
import { standInPointerLock } from './_probe.mjs';
import { aimAt, indexChunkOf, servedBuildProblem } from './_lookbook.mjs';
import { profileSeed, seedStorage } from './_profile.mjs';
import { firstNightVerdict, aimStep, FIRST_NIGHT_BEATS } from './_firstNight.mjs';
import { HEARTH_Y, HEARTH_FIRE } from '../../src/world/homeAnchor.js';

const PORT = probePort(import.meta.url);
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const URL_ARG = arg('--url');
const OUT = resolve(arg('--out') || join(APP, '../docs/superpowers/masterpiece-2026-10/evidence/first-night'));
const SECONDS = Number(arg('--seconds')) > 0 ? Number(arg('--seconds')) : 600;
const ALLOW_SOFTWARE = process.argv.includes('--allow-software');
const VIEWPORT = Object.freeze({ width: 1280, height: 800 });
const TICK_MS = 250;
const FRAME_EVERY_S = 30;
const BRAZIER_FIRE = [2.4, HEARTH_Y + 0.5 + HEARTH_FIRE.height, 2.4]; // world/Terrain.jsx HomeAnchorRender
const KINDLE_REACH_M = 2.5; // inside D2's 3 m
const FIGHT_REACH_M = 2.6;
const DEFEND_M = 20; // the bot chases no further from the Hearth than this
const THREAT_M = 6; // a hostile this near ends a kindle walk: the bot fights it first
const OWN_SIGNALS = Object.freeze({ handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

class CouldNotCheck extends Error {}
const cannot = (msg) => { throw new CouldNotCheck(msg); };

/** IN-PAGE: a mouse move that the view must not follow (the cursor's way back to the centre): the stood-in lock answers
 *  null for it, and no pointerlockchange fires, so nothing but the look sees the difference. */
function lookPause(on) {
  const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => (on ? null : canvas) });
}

const lb = (page, verb, a) => page.evaluate(([v, x]) => window.__craftyLookbook[v](x), [verb, a]);
const distXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

async function main() {
  mkdirSync(join(OUT, 'frames'), { recursive: true });
  let url = URL_ARG ? URL_ARG.replace(/\/$/, '') : null;
  let build = null;
  let server = null;
  if (!url) {
    const html = join(APP, 'build/index.html');
    if (!existsSync(html)) cannot('no production build at build/index.html: run `npm run build` first, or pass --url');
    build = indexChunkOf(readFileSync(html, 'utf8'));
    server = serveVite(PORT, { cwd: APP, preview: true });
    url = server.url;
  }
  let live = null;
  let stopping = false;
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
    process.on(signal, async () => {
      if (stopping) process.exit(code);
      stopping = true;
      console.error(`first-night: ${signal}, closing the browser${server ? ' and vite' : ''}`);
      if (server) await server.shutdown(live); else await live?.close().catch(() => {});
      process.exit(code);
    });
  }
  const report = { url, build, profile: 'fresh', seconds: SECONDS, cutShort: SECONDS < 600, renderer: null, gate: null, log: [], notes: [], frames: [] };
  try {
    if (server) {
      await server.waitReady();
      const problem = servedBuildProblem(await (await fetch(url)).text(), build);
      if (problem) cannot(problem);
    }
    const { results, chosen } = await resolveChromium({
      launch: async (engine, opts) => { live = await chromium.launch({ ...opts, ...OWN_SIGNALS }); return live; },
      close: async (b) => { await b?.close().catch(() => {}); if (live === b) live = null; },
    });
    for (const c of results) console.log(`  ${c.id.padEnd(20)} ${c.error ? `LAUNCH FAILED: ${c.error}` : `${c.gpu.padEnd(9)} ${c.renderer}`}`);
    if (!chosen && !ALLOW_SOFTWARE) cannot('no Chromium candidate gives the game a hardware renderer (--allow-software runs it anyway, for a smoke run only)');
    live = await chromium.launch({ ...(chosen ? chosen.launch : { headless: true }), ...OWN_SIGNALS });
    report.renderer = chosen ? results.find((r) => r.id === chosen.id)?.renderer ?? null : 'software (--allow-software)';
    const context = await live.newContext({ viewport: VIEWPORT, recordVideo: { dir: join(OUT, 'video'), size: VIEWPORT } });
    const page = await context.newPage();
    await page.addInitScript(seedStorage, profileSeed('fresh'));
    page.on('pageerror', (e) => report.notes.push(`pageerror: ${e.message.slice(0, 200)}`));
    await page.goto(`${url}/?lookbook=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.__craftyLookbook?.night === 'function', null, { timeout: 60000 })
      .catch(() => cannot('the production seam never came up with night() (a build from before W3-A U0?)'));
    const start = page.getByTestId('title-start');
    await start.waitFor({ state: 'visible', timeout: 60000 }).catch(() => cannot('the title never showed its Start button'));
    await start.click();
    const t0 = Date.now();
    const t = () => (Date.now() - t0) / 1000;
    await page.waitForFunction(() => window.__craftyLookbook.info().worldBuilt, null, { timeout: 120000 })
      .catch(() => cannot('the world never built after Start'));
    report.gate = await page.evaluate(standInPointerLock);
    await delay(300);
    if (!(await lb(page, 'info')).active) { await lb(page, 'play'); report.gate += ', then the seam\'s play()'; }
    if (!(await lb(page, 'info')).active) cannot('play never went live (the input gate stayed shut)');

    const cx = VIEWPORT.width / 2, cy = VIEWPORT.height / 2;
    await page.mouse.move(cx, cy);
    const turn = async (target, eye, heading, pitch) => {
      const want = aimAt(eye, target);
      const { dx, dy } = aimStep({ heading, pitch }, want);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return Math.abs(dx) + Math.abs(dy);
      await page.mouse.move(cx + dx, cy + dy, { steps: 4 });
      await page.evaluate(lookPause, true);
      await page.mouse.move(cx, cy);
      await page.evaluate(lookPause, false);
      return Math.hypot(dx, dy);
    };
    const keys = new Set();
    const hold = async (k, on) => {
      if (on && !keys.has(k)) { await page.keyboard.down(k); keys.add(k); }
      if (!on && keys.has(k)) { await page.keyboard.up(k); keys.delete(k); }
    };

    const p = { lowest: 1, hits: 0, engagedSec: 0, flameLow: null, flameAtDawn: null, deaths: 0 };
    let prev = null;
    let form = null; // { since, behindSec }
    let lastG = -10, lastClick = -10, lastFrame = -FRAME_EVERY_S, lastRoar = -10;
    let captainSeen = null;
    let dawnAt = null;
    while (t() < SECONDS && !(dawnAt !== null && t() > dawnAt + 20)) {
      const now = t();
      const [n, i, mobs] = await page.evaluate(() => [window.__craftyLookbook.night(), window.__craftyLookbook.info(), window.__craftyLookbook.mobs() || []]);
      const dt = prev ? now - prev.at : 0;
      // The beats, from what the seam reads: transitions only, so a load is never counted as a dusk or a dawn.
      if (n.hearthLit === true && !report.log.some((e) => e.beat === 'kindle')) report.log.push({ beat: 'kindle', t: now });
      if (prev && prev.n.isDay && !n.isDay) report.log.push({ beat: 'horn', t: now, night: n.nightCount });
      if (prev && !prev.n.isDay && n.isDay) {
        dawnAt = now;
        p.flameAtDawn = n.hearthFlame;
        report.log.push({ beat: 'dawn', t: now, night: n.nightCount });
      }
      const wave = n.siege?.wave ?? 0;
      if (prev && wave > (prev.n.siege?.wave ?? 0)) report.log.push({ beat: 'wave', t: now, wave });
      if (n.siege?.captainId != null) captainSeen = n.siege.captainId;
      if (captainSeen !== null && !mobs.some((m) => m.id === captainSeen)) {
        report.log.push({ beat: 'captain', t: now });
        await page.screenshot({ path: join(OUT, 'hero.jpg'), type: 'jpeg', quality: 88 });
        captainSeen = null;
      }
      // The beast: held while the eye is 3 m or more off the body (the third-person view), timed on the run's clock.
      if (i.form && !form) form = { since: now, behindSec: 0 };
      if (form && i.form && i.eye && i.body && distXZ(i.eye, i.body) >= 3) form.behindSec += dt;
      if (form && !i.form) { report.log.push({ beat: 'beast', t: now, heldSec: +form.behindSec.toFixed(2), formSec: +(now - form.since).toFixed(2) }); form = null; }
      // The pressure.
      if (n.alive && n.maxHealth > 0) p.lowest = Math.min(p.lowest, n.health / n.maxHealth);
      if (prev && n.alive && n.health < prev.n.health) p.hits += 1;
      if (i.hostiles?.within8m > 0) p.engagedSec += dt;
      if (!n.isDay && Number.isFinite(n.hearthFlame)) p.flameLow = Math.min(p.flameLow ?? 1, n.hearthFlame);
      if (now - lastFrame >= FRAME_EVERY_S) {
        lastFrame = now;
        const file = `frames/${String(report.frames.length).padStart(3, '0')}-${Math.floor(now / 60)}m${String(Math.floor(now % 60)).padStart(2, '0')}s.jpg`;
        await page.screenshot({ path: join(OUT, file), type: 'jpeg', quality: 80 });
        report.frames.push({ file, t: +now.toFixed(1), isDay: n.isDay, health: n.health, hostilesNear: i.hostiles?.within8m ?? null });
      }

      // The player.
      if (!n.alive) {
        await hold('KeyW', false);
        if (prev?.n.alive) { p.deaths += 1; p.lowest = 0; }
        const respawn = page.getByTestId('death-respawn');
        if (await respawn.isVisible().catch(() => false)) await respawn.click().catch(() => {});
      } else if (i.eye && i.body) {
        const foes = mobs.filter((m) => m.hostile && Math.hypot(m.position[0] - i.body[0], m.position[2] - i.body[2]) < 30)
          .sort((a, b) => distXZ(a.position, i.body) - distXZ(b.position, i.body));
        // The kindle first, unless something is already on the player: a player at a cold Hearth turns to a husk at arm's length.
        const kindling = n.hearthLit !== true && now < 90 && !(foes.length && distXZ(foes[0].position, i.body) < THREAT_M);
        if (kindling) {
          await turn(BRAZIER_FIRE, i.eye, i.heading, i.pitch);
          const d = distXZ(BRAZIER_FIRE, i.body);
          await hold('KeyW', d > KINDLE_REACH_M);
          if (d <= KINDLE_REACH_M + 0.5 && now - lastG > 2) {
            lastG = now;
            await page.keyboard.press('KeyG');
            report.notes.push(`G pressed ${d.toFixed(1)} m from the brazier at ${now.toFixed(1)} s (hearthLit ${JSON.stringify(n.hearthLit)})`);
          }
        } else if (foes.length) {
          const foe = foes[0];
          const aim = [foe.position[0], foe.position[1] + 1, foe.position[2]];
          await turn(aim, i.eye, i.heading, i.pitch);
          const d = distXZ(foe.position, i.body);
          await hold('KeyW', d > FIGHT_REACH_M && Math.hypot(foe.position[0], foe.position[2]) < DEFEND_M);
          if (d <= FIGHT_REACH_M + 0.6 && now - lastClick > 0.33) { lastClick = now; await page.mouse.down(); await page.mouse.up(); }
        } else {
          await hold('KeyW', false);
        }
        if (n.ember >= 100 && !i.form && now - lastRoar > 3) {
          lastRoar = now;
          await page.keyboard.down('KeyR');
          await delay(1500);
          await page.keyboard.up('KeyR');
        }
      }
      prev = { at: now, n };
      await delay(TICK_MS);
    }
    for (const k of [...keys]) await hold(k, false);
    if (!existsSync(join(OUT, 'hero.jpg'))) await page.screenshot({ path: join(OUT, 'hero.jpg'), type: 'jpeg', quality: 88 });
    report.pressure = { lowestHealth: +p.lowest.toFixed(3), hitsTaken: p.hits, engagedSec: +p.engagedSec.toFixed(1), flameLow: p.flameLow, flameAtDawn: p.flameAtDawn, deaths: p.deaths };
    report.verdict = firstNightVerdict({ log: report.log, pressure: report.pressure });
    await page.close();
    await context.close(); // the clip is written on close
    const video = readdirSync(join(OUT, 'video')).filter((f) => f.endsWith('.webm'));
    if (video.length) { renameSync(join(OUT, 'video', video[video.length - 1]), join(OUT, 'clip.webm')); report.clip = 'clip.webm'; }
    writeFileSync(join(OUT, 'first-night.json'), `${JSON.stringify(report, null, 2)}\n`);
    await contactSheet(live, report);
    console.log(`first-night: ${report.verdict.ok ? 'PASS' : 'MISS'} after ${SECONDS < 600 ? `${SECONDS} s (cut short)` : 'the night'}; ${report.renderer}`);
    for (const line of report.verdict.lines) console.log(`  ${line}`);
    for (const line of report.notes.slice(0, 12)) console.log(`  note: ${line}`);
    console.log(`  wrote ${OUT}`);
    return report.verdict.ok ? 0 : 1;
  } finally {
    if (server) await server.shutdown(live); else await live?.close().catch(() => {});
  }
}

/** The frames and the verdict on one page, saved as HTML and shot as a PNG in the run's own browser. */
async function contactSheet(browser, report) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cells = report.frames.map((f) => `<figure><img src="${esc(f.file)}"><figcaption>${esc(`${f.t} s · ${f.isDay ? 'day' : 'night'} · health ${f.health} · ${f.hostilesNear ?? '?'} near`)}</figcaption></figure>`).join('');
  const beats = FIRST_NIGHT_BEATS.map((b) => b.says).join(' · ');
  const html = `<!doctype html><meta charset="utf-8"><title>First Night contact sheet</title><style>body{background:#111;color:#ddd;font:13px system-ui;margin:16px}`
    + `div.g{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}img{width:100%;display:block}figure{margin:0}pre{white-space:pre-wrap}</style>`
    + `<h1>The First Night</h1><p>${esc(report.renderer)} · ${esc(report.build || report.url)} · ${esc(beats)}</p><pre>${esc(report.verdict.lines.join('\n'))}</pre><div class="g">${cells}</div>`;
  writeFileSync(join(OUT, 'contact-sheet.html'), html);
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  try {
    const sheet = await ctx.newPage();
    await sheet.goto(`file://${join(OUT, 'contact-sheet.html')}`);
    await sheet.screenshot({ path: join(OUT, 'contact-sheet.png'), fullPage: true });
  } finally {
    await ctx.close();
  }
}

main().then((code) => process.exit(code), (e) => {
  console.error(e instanceof CouldNotCheck ? `first-night: COULD NOT CHECK: ${e.message}` : e);
  process.exit(e instanceof CouldNotCheck ? 3 : 1);
});
