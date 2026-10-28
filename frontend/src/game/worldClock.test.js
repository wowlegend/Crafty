import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isPlayPaused, tickWorldClock, worldDelta, isWorldFrozen, isWorldFrozenNow, worldNow } from './worldClock.js';
import { useGameStore } from '../store/useGameStore';
import { setActive } from '../input/inputState';
import { enterCaptureMode, exitCaptureMode } from '../devtest/captureMode';

// Mutation-Proof: in commit trailers, not here (DECISIONS 2026-10-28 15c).

// Each test ticks on its own stretch of the clock, far past the last one: the clock's pause total is module state, and
// a tick earlier than the previous one would read as time running backwards across a pause.
let T = 1e9;
const at = (ms) => T + ms;

const playing = () => { useGameStore.setState({ gameStarted: true, isAlive: true }); setActive(true); };
const noHitstop = () => useGameStore.setState({ hitstopUntil: 0, hitstopStart: 0, hitstopFrozenTotal: 0 });

beforeEach(() => { T += 1e6; exitCaptureMode(); noHitstop(); playing(); tickWorldClock(at(0)); });
afterEach(() => { exitCaptureMode(); noHitstop(); playing(); tickWorldClock(at(900000)); useGameStore.setState({ gameStarted: false }); setActive(false); });

describe('isPlayPaused — the player has stopped the game', () => {
  const PAUSED = { gameStarted: true, isAlive: true, active: false, captureMode: false };

  it('is paused only when play has begun, the player is alive, input is dead and the visual harness is not running', () => {
    expect(isPlayPaused(PAUSED)).toBe(true);
    expect(isPlayPaused({ ...PAUSED, active: true }), 'live input is play, not a pause').toBe(false);
    expect(isPlayPaused({ ...PAUSED, gameStarted: false }), 'the world behind the title runs').toBe(false);
    expect(isPlayPaused({ ...PAUSED, isAlive: false }), 'the death screen is not a pause').toBe(false);
    expect(isPlayPaused({ ...PAUSED, captureMode: true }), 'the capture harness holds the world its own way').toBe(false);
    expect(isPlayPaused({ ...PAUSED, isAlive: undefined }), 'an unset isAlive reads alive, as everywhere else').toBe(true);
    expect(isPlayPaused(), 'no state is not a pause').toBe(false);
  });
});

describe('the pause freezes the world through the one scale', () => {
  it('input going dead in play makes the frame scale 0, and live input makes it 1 again, as of the next tick', () => {
    expect(worldDelta(0.016)).toBe(0.016);
    setActive(false);
    expect(worldDelta(0.016), 'a pause that begins mid-frame waits for the next tick, like a hitstop').toBe(0.016);
    tickWorldClock(at(16));
    expect(worldDelta(0.016)).toBe(0);
    expect(isWorldFrozen()).toBe(true);
    setActive(true);
    tickWorldClock(at(32));
    expect(worldDelta(0.016)).toBe(0.016);
    expect(isWorldFrozen()).toBe(false);
  });

  it('does not freeze the world behind the title, on the death screen, or under capture', () => {
    setActive(false);
    useGameStore.setState({ gameStarted: false });
    tickWorldClock(at(16));
    expect(isWorldFrozen(), 'the title').toBe(false);
    useGameStore.setState({ gameStarted: true, isAlive: false });
    tickWorldClock(at(32));
    expect(isWorldFrozen(), 'the death screen').toBe(false);
    useGameStore.setState({ isAlive: true });
    enterCaptureMode();
    tickWorldClock(at(48));
    expect(isWorldFrozen(), 'capture').toBe(false);
    exitCaptureMode();
    tickWorldClock(at(64));
    expect(isWorldFrozen(), 'the same state, out of capture, is a pause').toBe(true);
  });
});

describe('worldNow — the world clock does not advance through a pause', () => {
  it('holds from the tick the pause is seen to the tick it ends, then carries on without a jump', () => {
    const w0 = worldNow();
    tickWorldClock(at(100));
    expect(worldNow() - w0).toBeCloseTo(100, 9);
    setActive(false);
    tickWorldClock(at(200));
    const held = worldNow();
    expect(held - w0).toBeCloseTo(200, 9);
    tickWorldClock(at(300));
    tickWorldClock(at(5000));
    expect(worldNow(), 'the world clock ran while paused').toBe(held);
    setActive(true);
    tickWorldClock(at(5100));
    expect(worldNow(), 'the world clock jumped at the resume').toBe(held);
    tickWorldClock(at(5200));
    expect(worldNow() - held, 'the world clock did not run again after the resume').toBeCloseTo(100, 9);
  });

  it('a hitstop overlapping a pause is subtracted once, so the clock never runs backwards', () => {
    const w0 = worldNow();
    useGameStore.setState({ hitstopStart: at(150), hitstopUntil: at(350), hitstopFrozenTotal: 0 });
    tickWorldClock(at(100));
    setActive(false);
    const reads = [];
    for (const t of [200, 300, 400, 500]) { tickWorldClock(at(t)); reads.push(worldNow() - w0); }
    setActive(true);
    for (const t of [600, 700]) { tickWorldClock(at(t)); reads.push(worldNow() - w0); }
    // Ran 0..150, frozen by the hitstop 150..200, paused 200..600 (the hitstop's tail inside it counted once), ran on.
    expect(reads.map((r) => +r.toFixed(6))).toEqual([150, 150, 150, 150, 150, 250]);
  });

  it('a pause that begins and ends between two ticks is never seen, so it costs the world nothing', () => {
    const w0 = worldNow();
    setActive(false);
    setActive(true);
    tickWorldClock(at(100));
    expect(worldNow() - w0).toBeCloseTo(100, 9);
  });
});

describe('isWorldFrozenNow — the same rule, read at the call, for a timer tick', () => {
  it('sees a pause or a hitstop the moment it begins, without waiting for a frame', () => {
    const now = performance.now();
    expect(isWorldFrozenNow(now)).toBe(false);
    setActive(false);
    expect(isWorldFrozen(), 'the frame answer is stale until the next tick').toBe(false);
    expect(isWorldFrozenNow(now), 'the timer answer is not').toBe(true);
    setActive(true);
    useGameStore.setState({ hitstopUntil: now + 1000 });
    expect(isWorldFrozenNow(now), 'a hitstop holds a timer tick too').toBe(true);
    expect(isWorldFrozenNow(now + 1000), 'and lets go the instant it ends').toBe(false);
  });

  it('agrees with the frame answer over every pause input and a hitstop on or off', () => {
    let checked = 0;
    for (const gameStarted of [false, true]) for (const isAlive of [false, true]) for (const active of [false, true])
      for (const capture of [false, true]) for (const hit of [false, true]) {
        T += 1000;
        if (capture) enterCaptureMode(); else exitCaptureMode();
        setActive(active);
        useGameStore.setState({ gameStarted, isAlive, hitstopStart: at(0), hitstopUntil: hit ? at(500) : 0 });
        tickWorldClock(at(100));
        expect(isWorldFrozenNow(at(100)), JSON.stringify({ gameStarted, isAlive, active, capture, hit })).toBe(isWorldFrozen());
        checked += 1;
      }
    expect(checked).toBe(32);
  });
});
