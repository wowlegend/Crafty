import { test, expect } from './_fixtures.js';
import { bootDev } from './_boot.js';

// THE SOUNDTRACK THROUGH THE WEB AUDIO GRAPH, IN A REAL ENGINE (deep audit 2026-10-30, lane L10).
//
// src/ui/MusicPlayer.jsx routes its three tracks through the shared AudioContext (createMediaElementSource, then a
// GainNode each), so its fade, the music slider and Mute All act on a gain an iPhone cannot lock. jsdom has no Web
// Audio, so tests/gates/apple-audio-gates.test.jsx runs that route on a model; this runs it in Chromium. Before any
// script on the page, the media element, the context and createMediaElementSource are wrapped so the spec can see them,
// and each wrapper calls the real one (eslint.config.js bans a stub here). The spec then makes a trusted click on Start
// Adventure, reads that the day track plays through a running context and its clock advances, and that Mute All
// pauses every track and unmute brings the day track back.
//
// WHAT THIS DOES NOT CHECK: WebKit or iOS (CI runs Chromium only; the device run is Kevin's, registry
// AUDIT:lane:L10-apple-audio-and-device-run); what reaches the speakers (Playwright's Chromium runs with its audio
// muted, so the level is read from the model in the jsdom gate); the 1 s bound on Mute All, which the jsdom gate holds
// on a fake clock, where this allows 3 s for a loaded runner.

/** In the page, before any of its scripts: a pointer lock only for a request made inside a trusted input event, as a
 *  player's browser grants it (continue.spec.js's lockOnGestureOnly, which says why). Without it CI's headless Chromium
 *  granted App's timer request once the world was built, play began on its own, and the title's Start was gone before
 *  the spec could click it: this spec's first CI run (41203933423, shard 6) timed out waiting on that click. */
function lockOnGestureOnly() {
  const real = HTMLCanvasElement.prototype.requestPointerLock;
  const GESTURES = new Set(['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'touchend']);
  HTMLCanvasElement.prototype.requestPointerLock = function gated(...args) {
    const ev = window.event;
    if (document.pointerLockElement === this || (ev && ev.isTrusted && GESTURES.has(ev.type))) return real.apply(this, args);
    setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
    return Promise.reject(new DOMException('pointer lock refused (e2e: no lock without a gesture)', 'NotAllowedError'));
  };
}

function probeMusic() {
  const probe = { audios: [], routes: 0, routeCtx: null };
  window.__musicProbe = probe;
  const RealAudio = window.Audio;
  window.Audio = class ProbedAudio extends RealAudio {
    constructor(...args) { super(...args); probe.audios.push(this); }
  };
  const route = AudioContext.prototype.createMediaElementSource;
  AudioContext.prototype.createMediaElementSource = function probedRoute(el) {
    probe.routes += 1;
    probe.routeCtx = this;
    return route.call(this, el);
  };
}

/** In the page: every track and the context the tracks are routed through, for every failure message. */
function musicState() {
  const p = window.__musicProbe;
  return {
    routes: p.routes,
    ctx: p.routeCtx?.state ?? null,
    mp3: document.createElement('audio').canPlayType('audio/mpeg'),
    tracks: p.audios.map((a) => ({
      src: a.src.split('/').pop(), paused: a.paused, t: Math.round(a.currentTime * 100) / 100, error: a.error?.code ?? null,
    })),
    muted: window.useGameStore.getState().masterMuted,
  };
}

const dayPlaying = () => {
  const p = window.__musicProbe;
  const day = p.audios.find((a) => a.src.endsWith('/music/day.mp3'));
  return !!day && !day.paused && day.currentTime > 0.25 && p.routeCtx?.state === 'running';
};

test.describe('the soundtrack in Chromium', () => {
  test('plays through the Web Audio graph after Start, and Mute All pauses every track', async ({ page }) => {
    test.setTimeout(240000);
    await page.addInitScript(lockOnGestureOnly);
    await page.addInitScript(probeMusic);
    await bootDev(page);
    await page.waitForFunction(() => window.__musicProbe.routes === 3, null, { timeout: 30000, polling: 250 })
      .catch(async (e) => { throw new Error(`the three tracks were never routed into the context: ${JSON.stringify(await page.evaluate(musicState))} — ${e.message}`); });
    expect((await page.evaluate(musicState)).tracks.map((t) => t.src).sort(), 'SETUP: the tracks the MusicPlayer made')
      .toEqual(['boss.mp3', 'day.mp3', 'night.mp3']);

    const start = page.getByTestId('title-start');
    await expect(start, 'SETUP: the title shows no Start').toBeVisible({ timeout: 30000 });
    await start.click({ timeout: 60000 });
    await page.waitForFunction(dayPlaying, null, { timeout: 30000, polling: 250 })
      .catch(async (e) => { throw new Error(`the day track is not playing through a running context after Start: ${JSON.stringify(await page.evaluate(musicState))} — ${e.message}`); });

    await page.evaluate(() => window.useGameStore.getState().setMasterMuted(true));
    await page.waitForFunction(() => window.__musicProbe.audios.every((a) => a.paused), null, { timeout: 3000, polling: 100 })
      .catch(async (e) => { throw new Error(`a track is still playing 3 s after Mute All: ${JSON.stringify(await page.evaluate(musicState))} — ${e.message}`); });

    await page.evaluate(() => window.useGameStore.getState().setMasterMuted(false));
    await page.waitForFunction(dayPlaying, null, { timeout: 10000, polling: 250 })
      .catch(async (e) => { throw new Error(`the day track did not come back after unmute: ${JSON.stringify(await page.evaluate(musicState))} — ${e.message}`); });
  });
});
