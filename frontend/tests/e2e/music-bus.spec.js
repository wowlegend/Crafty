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
    test.setTimeout(180000);
    await page.addInitScript(probeMusic);
    await bootDev(page);
    await page.waitForFunction(() => window.__musicProbe.routes === 3, null, { timeout: 30000 })
      .catch(async (e) => { throw new Error(`the three tracks were never routed into the context: ${JSON.stringify(await page.evaluate(musicState))} — ${e.message}`); });
    expect((await page.evaluate(musicState)).tracks.map((t) => t.src).sort(), 'SETUP: the tracks the MusicPlayer made')
      .toEqual(['boss.mp3', 'day.mp3', 'night.mp3']);

    await page.getByRole('button', { name: /start adventure/i }).click();
    await page.waitForFunction(dayPlaying, null, { timeout: 30000 })
      .catch(async (e) => { throw new Error(`the day track is not playing through a running context after Start: ${JSON.stringify(await page.evaluate(musicState))} — ${e.message}`); });

    await page.evaluate(() => window.useGameStore.getState().setMasterMuted(true));
    await page.waitForFunction(() => window.__musicProbe.audios.every((a) => a.paused), null, { timeout: 3000 })
      .catch(async (e) => { throw new Error(`a track is still playing 3 s after Mute All: ${JSON.stringify(await page.evaluate(musicState))} — ${e.message}`); });

    await page.evaluate(() => window.useGameStore.getState().setMasterMuted(false));
    await page.waitForFunction(dayPlaying, null, { timeout: 10000 })
      .catch(async (e) => { throw new Error(`the day track did not come back after unmute: ${JSON.stringify(await page.evaluate(musicState))} — ${e.message}`); });
  });
});
