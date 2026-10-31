import { test, expect } from './_fixtures.js';
import { bootDev, startPlayActive } from './_boot.js';

// THE SOUNDTRACK THROUGH THE WEB AUDIO GRAPH, IN A REAL ENGINE (deep audit 2026-10-30, lane L10).
//
// src/ui/MusicPlayer.jsx routes its three tracks through the shared AudioContext (createMediaElementSource, then a
// GainNode each), so its fade, the music slider and Mute All act on a gain an iPhone cannot lock. jsdom has no Web
// Audio, so tests/gates/apple-audio-gates.test.jsx runs that route on a model; this runs it in Chromium. Before any
// script on the page, the media element, the context and createMediaElementSource are wrapped so the spec can see them,
// and each wrapper calls the real one (eslint.config.js bans a stub here). The spec enters play the way the suite does
// (_boot.js startPlayActive: the `low` tier, the input gate held), makes one trusted key press (F2, which the game binds
// to nothing; a keydown carries user activation), and reads that the day track plays through a running context and its
// clock advances, that Mute All pauses every track and that unmute brings the day track back. Every read of the page is
// bounded, so a page that stops answering fails naming the step rather than at the test's budget.
//
// Entered from the title instead (a trusted click on Start Adventure), it timed out on two of its first three CI runs
// (41203933423 and 41208277637, shard 6) with the page not answering, and passed in 53.8 s on the other (41206449396);
// the Start tap is tests/gates/apple-audio-gates.test.jsx's, on the real title menu.
//
// WHAT THIS DOES NOT CHECK: WebKit or iOS (CI runs Chromium only; the device run is Kevin's, registry
// AUDIT:lane:L10-apple-audio-and-device-run); what reaches the speakers (Playwright's Chromium runs with its audio
// muted, so the level is read from the model in the jsdom gate); the 1 s bound on Mute All, which the jsdom gate holds
// on a fake clock, where this allows 3 s for a loaded runner; the title's Start, which the jsdom gate drives.

/** A page read that fails naming its step when the page stops answering, instead of hanging to the test's budget. */
async function read(page, step, fn, ms = 15000) {
  let timer;
  const stalled = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`the page did not answer within ${ms} ms at: ${step}`)), ms);
  });
  try { return await Promise.race([page.evaluate(fn), stalled]); } finally { clearTimeout(timer); }
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
  test('plays through the Web Audio graph after a gesture, and Mute All pauses every track', async ({ page }) => {
    test.setTimeout(240000);
    await page.addInitScript(probeMusic);
    await bootDev(page);
    const state = (step) => read(page, step, musicState);
    await page.waitForFunction(() => window.__musicProbe.routes === 3, null, { timeout: 30000, polling: 250 })
      .catch(async (e) => { throw new Error(`the three tracks were never routed into the context: ${JSON.stringify(await state('routes'))} — ${e.message}`); });
    expect((await state('the tracks')).tracks.map((t) => t.src).sort(), 'SETUP: the tracks the MusicPlayer made')
      .toEqual(['boss.mp3', 'day.mp3', 'night.mp3']);

    await startPlayActive(page);
    await page.keyboard.press('F2');
    await page.waitForFunction(dayPlaying, null, { timeout: 30000, polling: 250 })
      .catch(async (e) => { throw new Error(`the day track is not playing through a running context after a key press: ${JSON.stringify(await state('after the key press'))} — ${e.message}`); });

    await read(page, 'Mute All', () => window.useGameStore.getState().setMasterMuted(true));
    await page.waitForFunction(() => window.__musicProbe.audios.every((a) => a.paused), null, { timeout: 3000, polling: 100 })
      .catch(async (e) => { throw new Error(`a track is still playing 3 s after Mute All: ${JSON.stringify(await state('after Mute All'))} — ${e.message}`); });

    await read(page, 'unmute', () => window.useGameStore.getState().setMasterMuted(false));
    await page.waitForFunction(dayPlaying, null, { timeout: 10000, polling: 250 })
      .catch(async (e) => { throw new Error(`the day track did not come back after unmute: ${JSON.stringify(await state('after unmute'))} — ${e.message}`); });
  });
});
