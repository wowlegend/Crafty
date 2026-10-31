// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { render, act, cleanup, screen } from '@testing-library/react';
import { installIosDocument } from '../_support/iosDocument.js';
import { SoundProvider, useSounds } from '../../src/SoundManager';
import MusicPlayer from '../../src/ui/MusicPlayer';
import { MenuSystem } from '../../src/MenuSystem.jsx';
import { useGameStore } from '../../src/store/useGameStore';
import { FROZEN_CLOCK_MS } from '../../src/audio/audioRecovery.js';
import { enterCaptureMode, exitCaptureMode } from '../../src/devtest/captureMode.js';

// The title's 3D backdrop is an R3F canvas that MenuSystem loads lazily; jsdom has no WebGL or ResizeObserver, and
// whether its chunk resolved inside a case depended on the machine's load (one full-suite run rendered it and threw).
// The backdrop is not this gate's subject, so it is replaced with nothing, as boot-guard-gates does.
vi.mock('../../src/render/TitleDiorama.jsx', () => ({ TitleDiorama: () => null }));

/**
 * APPLE AUDIO, ON AN iOS DOCUMENT (deep audit 2026-10-30, lane L10; AUDIT:silent:ios-audiocontext-interrupted-never-resumed
 * and AUDIT:silent:ios-music-refused-play-swallowed-and-unmutable).
 *
 * The real SoundProvider, the real MusicPlayer and the real title menu run on tests/_support/iosDocument.js: no Pointer
 * Lock, a context that starts suspended and can be left 'interrupted' or frozen, and media elements that refuse play()
 * outside a gesture, with an iPhone's locked volume. A tap is the event sequence a finger sends, and only the dispatch
 * of an activation event counts as the gesture.
 *
 * The context half: once the platform stops the context (an app switch, a call, Siri), the next tap, the page coming
 * back, or the game's own entry paths bring it back to a running clock, with music on or off; a healthy context on a
 * returning tab is left alone.
 *
 * The music half: a track is playing after the Start tap, the music slider sets its level, every track is paused
 * within 1 s of Mute All and comes back on unmute, and a dusk crossfade starts the night track from a timer. While no
 * track can be heard (music off, the slider at 0) a tap asks no track to play, and in capture mode a tap starts none
 * and pauses one already playing.
 *
 * Not covered here: what a real iPhone or iPad does. The fixture models WebKit's source and three open WebKit bugs; the
 * lived proof is Kevin's device run (registry REVIEW:l1:ios-device-run). Nor what Chromium's
 * createMediaElementSource does: jsdom has no Web Audio, so the route the tracks take is the fixture's.
 *
 * Mutation-Proof: see the commit trailer.
 */

let ios;
let api;
function Probe() { api = useSounds(); return null; }

const advance = async (ms) => { await act(async () => { vi.advanceTimersByTime(ms); await Promise.resolve(); }); };
const clockMoves = async (ctx) => { const t = ctx.currentTime; await advance(50); return ctx.currentTime > t; };

beforeEach(() => {
  vi.useFakeTimers();
  useGameStore.setState({
    isDay: true, bossActive: false, musicVolume: 1, masterMuted: false, gameStarted: false, isAlive: true,
    requestPointerLock: null,
  });
});
afterEach(() => {
  cleanup();
  exitCaptureMode();
  ios?.restore();
  ios = null;
  vi.useRealTimers();
});

describe('the audio context comes back after the platform stops it', () => {
  async function enterRunning() {
    ios = installIosDocument({ device: 'iphone' });
    render(createElement(SoundProvider, null, createElement(Probe)));
    const ctx = ios.ctx;
    expect(ctx, 'SETUP: the SoundProvider made no AudioContext').toBeTruthy();
    expect(ctx.state, 'SETUP: a fresh context on iOS starts suspended').toBe('suspended');
    // The entry path App takes on the Start tap (App.jsx resumes on the active gate's rising edge).
    ios.gesture(() => api.resumeAudio());
    expect(ctx.state, 'SETUP: the entry gesture did not start the context').toBe('running');
    expect(await clockMoves(ctx), 'SETUP: a running context whose clock does not move').toBe(true);
    return ctx;
  }

  it('a suspended context is only resumed: nothing asks it to suspend first', async () => {
    const ctx = await enterRunning();
    expect(ctx.calls.filter((c) => c === 'resume').length, 'SETUP: the entry never called resume()').toBeGreaterThan(0);
    act(() => ios.tap(document.body));
    expect(ctx.calls, 'a context that was only suspended was asked to suspend again before it started').not.toContain('suspend');
  });

  it('an interrupted context is running again after the next tap', async () => {
    const ctx = await enterRunning();
    ctx.interrupt();
    expect(ctx.state).toBe('interrupted');
    act(() => ios.tap(document.body));
    expect(ctx.state, `a tap left the context ${ctx.state}: every sound effect stays silent (calls ${ctx.calls})`).toBe('running');
    expect(await clockMoves(ctx), 'running, but its clock is not moving').toBe(true);
  });

  it('the game\'s own resume paths recover an interrupted context, not only a suspended one', async () => {
    const ctx = await enterRunning();
    ctx.interrupt();
    ios.gesture(() => api.resumeAudio());
    expect(ctx.state, `resumeAudio() left the context ${ctx.state}`).toBe('running');
    ctx.interrupt();
    ios.gesture(() => api.playBackgroundMusic());
    expect(ctx.state, `playBackgroundMusic() left the context ${ctx.state}`).toBe('running');
  });

  it('returning to the page recovers it without a tap, by visibilitychange and by pageshow', async () => {
    const ctx = await enterRunning();
    ctx.interrupt();
    act(() => { ios.setVisible(false); });
    act(() => { ios.setVisible(true); });
    expect(ctx.state, `coming back to the page left the context ${ctx.state}`).toBe('running');
    ctx.interrupt();
    act(() => ios.pageshow());
    expect(ctx.state, `pageshow (a back-forward cache restore) left the context ${ctx.state}`).toBe('running');
  });

  it('a running context whose clock stopped is restarted on return, and a healthy one is left alone', async () => {
    const ctx = await enterRunning();
    const suspendsBefore = ctx.calls.filter((c) => c === 'suspend').length;
    act(() => { ios.setVisible(false); });
    act(() => { ios.setVisible(true); });
    await advance(FROZEN_CLOCK_MS + 100);
    expect(ctx.calls.filter((c) => c === 'suspend').length, 'a healthy context was restarted on a tab return').toBe(suspendsBefore);
    ctx.freeze();
    expect(await clockMoves(ctx), 'SETUP: freeze() did not stop the clock').toBe(false);
    act(() => { ios.setVisible(false); });
    act(() => { ios.setVisible(true); });
    await advance(FROZEN_CLOCK_MS + 100);
    expect(ctx.state).toBe('running');
    expect(await clockMoves(ctx), 'a context reporting running with a stopped clock was not restarted on return').toBe(true);
  });

  it('with music off, a tap still recovers the context, so sound effects do not depend on music', async () => {
    const ctx = await enterRunning();
    act(() => api.setMusicEnabled(false));
    ctx.interrupt();
    act(() => ios.tap(document.body));
    expect(ctx.state, `with music off a tap left the context ${ctx.state}`).toBe('running');
  });
});

const PANELS_CLOSED = {
  showInventory: false, showForge: false, showMagic: false, showBuildingTools: false, showSettings: false,
  showChestInterface: false, showTradingInterface: false, showWorldManager: false, showCredits: false, showQuestLog: false,
};
const NOOP = () => {};
function titleMenu() {
  return createElement(MenuSystem, {
    showAchievements: false, setShowAchievements: NOOP, showSpellUpgrades: false, setShowSpellUpgrades: NOOP,
    showStats: false, setShowStats: NOOP, isPointerLocked: false, setIsPointerLocked: vi.fn(),
    questSystem: { achievements: [], unlockedAchievements: [], stats: {}, quests: [] },
    gameState: { ...PANELS_CLOSED, gameStarted: false, isAlive: true, requestPointerLock: undefined },
  });
}

function bootGame(device) {
  ios = installIosDocument({ device });
  useGameStore.setState(PANELS_CLOSED);
  render(createElement(SoundProvider, null, createElement(Probe), createElement(MusicPlayer), titleMenu()));
  const tracks = ios.audios;
  expect(tracks.length, 'SETUP: the MusicPlayer made no tracks').toBe(3);
  return tracks;
}
const name = (el) => el.src.split('/').pop();
const track = (tracks, file) => tracks.find((el) => name(el) === file);
const playing = (tracks) => tracks.filter((el) => !el.paused).map(name);
const state = (tracks) => tracks.map((el) => `${name(el)} paused=${el.paused} audible=${ios.audible(el).toFixed(2)}`).join(' | ');

describe.each(['iphone', 'ipad'])('the soundtrack on an %s', (device) => {
  it('a track is playing after the Start tap, though the platform stopped it at boot', async () => {
    const tracks = bootGame(device);
    await advance(1000);
    const day = track(tracks, 'day.mp3');
    // An iPhone refuses the boot play(); an iPad lets a silent element start and pauses it at its first audible volume.
    expect(day.refused + day.autoPaused, `SETUP: the platform let the day track play before a gesture — ${state(tracks)}`)
      .toBeGreaterThan(0);
    expect(playing(tracks), 'SETUP: a track plays before any gesture').toEqual([]);
    act(() => ios.tap(screen.getByRole('button', { name: /start adventure/i })));
    expect(useGameStore.getState().gameStarted, 'SETUP: the Start tap did not start the run').toBe(true);
    await advance(1000);
    expect(playing(tracks), `no track is playing after Start: ${state(tracks)}`).toEqual(['day.mp3']);
    expect(ios.audible(day), `the day track plays but reaches the speakers at 0: ${state(tracks)}`).toBeGreaterThan(0);
  });
});

describe('the soundtrack obeys the music slider and Mute All on an iPhone, whose media volume is locked', () => {
  async function startedAt(volume) {
    const tracks = bootGame('iphone');
    useGameStore.setState({ musicVolume: volume });
    act(() => ios.tap(screen.getByRole('button', { name: /start adventure/i })));
    await advance(2000);
    const day = track(tracks, 'day.mp3');
    expect(playing(tracks), `SETUP: no track playing after Start: ${state(tracks)}`).toEqual(['day.mp3']);
    return { tracks, day };
  }

  // WebKit main can let an iPhone's boot play() through (deep audit row 34), so a track can be playing before any tap.
  async function playingOnAPermissivePlatform() {
    const tracks = bootGame('iphone');
    ios.unlockMedia();
    act(() => ios.tap(document.body));
    act(() => ios.gesture(() => useGameStore.getState().setMusicVolume(1)));
    act(() => ios.gesture(() => useGameStore.getState().setMusicVolume(0.9)));
    await advance(2000);
    const day = track(tracks, 'day.mp3');
    expect(playing(tracks), `SETUP: ${state(tracks)}`).toEqual(['day.mp3']);
    return { tracks, day };
  }

  it('the music slider sets the level the track reaches the speakers at', async () => {
    const { tracks, day } = await playingOnAPermissivePlatform();
    const full = ios.audible(day);
    const slider = useGameStore.getState().musicVolume;
    expect(full, `SETUP: ${state(tracks)}`).toBeGreaterThan(0);
    act(() => ios.gesture(() => useGameStore.getState().setMusicVolume(0.5)));
    await advance(2000);
    expect(ios.audible(day) / full, `the slider from ${slider} to 0.5 took the track from ${full} to ${ios.audible(day)}`)
      .toBeCloseTo(0.5 / slider, 2);
  });

  it('every track is paused within 1 s of Mute All, after a fade, and the track comes back on unmute', async () => {
    const { tracks, day } = await startedAt(1);
    expect(ios.audible(day), `SETUP: ${state(tracks)}`).toBeGreaterThan(0);
    const ctx = ios.ctx;
    const mutedAt = ctx.currentTime;
    act(() => ios.gesture(() => useGameStore.getState().setMasterMuted(true)));
    // A crossfade, not a cut: the day track's gain ramps to 0 over more than a quarter second of audio time.
    const ramp = day.routedBy.outputs[0].gain.ramps.at(-1);
    expect(ramp?.to, `the day track's gain was not ramped to 0 on Mute All: ${JSON.stringify(ramp)}`).toBe(0);
    expect(ramp.at - mutedAt, `Mute All cut the track instead of fading it: ${JSON.stringify(ramp)}`).toBeGreaterThan(0.25);
    await advance(100);
    expect(day.paused, 'Mute All paused the day track before its fade had run').toBe(false);
    await advance(900);
    expect(playing(tracks), `1 s after Mute All: ${state(tracks)}`).toEqual([]);
    expect(tracks.map((el) => ios.audible(el)), 'a muted track still reaches the speakers').toEqual([0, 0, 0]);
    act(() => ios.gesture(() => useGameStore.getState().setMasterMuted(false)));
    await advance(2000);
    expect(playing(tracks), `after unmute: ${state(tracks)}`).toEqual(['day.mp3']);
    expect(ios.audible(day), `after unmute: ${state(tracks)}`).toBeGreaterThan(0);
  });

  it('after the Start tap, dusk starts the night track from a timer, with no tap', async () => {
    const { tracks } = await startedAt(1);
    act(() => useGameStore.setState({ isDay: false }));
    await advance(2000);
    const night = track(tracks, 'night.mp3');
    expect(playing(tracks), `2 s after dusk: ${state(tracks)}`).toEqual(['night.mp3']);
    expect(ios.audible(night), `2 s after dusk: ${state(tracks)}`).toBeGreaterThan(0);
  });

  it('on a platform that let the track play before any tap, Mute All still pauses every track within 1 s', async () => {
    const { tracks, day } = await playingOnAPermissivePlatform();
    expect(ios.audible(day), `SETUP: ${state(tracks)}`).toBeGreaterThan(0);
    act(() => ios.gesture(() => useGameStore.getState().setMasterMuted(true)));
    await advance(1000);
    expect(playing(tracks), `1 s after Mute All: ${state(tracks)}`).toEqual([]);
    expect(tracks.map((el) => ios.audible(el)), 'a muted track still reaches the speakers').toEqual([0, 0, 0]);
  });

  it('with the music slider at 0, a tap plays no track again, and raising the slider brings the day track back', async () => {
    const { tracks, day } = await startedAt(1);
    act(() => ios.gesture(() => useGameStore.getState().setMusicVolume(0)));
    await advance(2000);
    expect(playing(tracks), `SETUP: the slider at 0 left a track playing: ${state(tracks)}`).toEqual([]);
    const plays = tracks.map((el) => el.plays);
    act(() => ios.tap(document.body));
    await advance(1000);
    expect(playing(tracks), `a tap with the slider at 0 played a track nobody can hear: ${state(tracks)}`).toEqual([]);
    expect(tracks.map((el) => el.plays), `a tap with the slider at 0 asked a track to play: ${state(tracks)}`).toEqual(plays);
    act(() => ios.gesture(() => useGameStore.getState().setMusicVolume(0.5)));
    await advance(2000);
    expect(playing(tracks), `the slider raised to 0.5: ${state(tracks)}`).toEqual(['day.mp3']);
    expect(ios.audible(day), `the slider raised to 0.5: ${state(tracks)}`).toBeGreaterThan(0);
  });

  it('with music off, the Start tap asks no track to play; with music on again, the next tap starts the day track', async () => {
    const tracks = bootGame('iphone');
    act(() => api.setMusicEnabled(false));
    await advance(1000);
    const plays = tracks.map((el) => el.plays);
    act(() => ios.tap(screen.getByRole('button', { name: /start adventure/i })));
    expect(useGameStore.getState().gameStarted, 'SETUP: the Start tap did not start the run').toBe(true);
    await advance(1000);
    expect(tracks.map((el) => el.plays), `with music off the Start tap asked a track to play: ${state(tracks)}`).toEqual(plays);
    act(() => api.setMusicEnabled(true));
    act(() => ios.tap(document.body));
    await advance(2000);
    expect(playing(tracks), `music on again, then a tap: ${state(tracks)}`).toEqual(['day.mp3']);
  });
});

describe('capture mode holds the soundtrack silent on the gesture path too', () => {
  it('in capture mode a tap starts no track and pauses one already playing; out of it the same tap starts the day track', async () => {
    const tracks = bootGame('iphone');
    await advance(1000);
    expect(playing(tracks), `SETUP: a track plays before any gesture: ${state(tracks)}`).toEqual([]);
    act(() => { enterCaptureMode(); });
    const plays = tracks.map((el) => el.plays);
    act(() => ios.tap(document.body));
    await advance(1000);
    expect(playing(tracks), `a tap in capture mode started a track: ${state(tracks)}`).toEqual([]);
    expect(tracks.map((el) => el.plays), `a tap in capture mode asked a track to play: ${state(tracks)}`).toEqual(plays);
    act(() => { exitCaptureMode(); });
    act(() => ios.tap(document.body));
    await advance(1000);
    expect(playing(tracks), `out of capture mode, a tap: ${state(tracks)}`).toEqual(['day.mp3']);
    act(() => { enterCaptureMode(); });
    act(() => ios.tap(document.body));
    await advance(1000);
    expect(playing(tracks), `a tap in capture mode left a playing track playing: ${state(tracks)}`).toEqual([]);
  });
});
