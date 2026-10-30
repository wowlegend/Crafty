// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { render, renderHook, act, cleanup } from '@testing-library/react';
import { SoundProvider, useSounds } from '../../src/SoundManager';
import { useSimpleExperience } from '../../src/SimpleExperienceSystem';
import { useQuestSystem } from '../../src/QuestSystem';
import { VictoryOverlay } from '../../src/GameSystems.jsx';
import { GameMethods } from '../../src/GameMethods';
import { useGameStore } from '../../src/store/useGameStore';
import { emitMobKill } from '../../src/game/mobKillBus.js';
import { EVENT_VOICES } from '../../src/audio/soundEvents.js';

// A reward beat reaches the ear through one path: the system that knows the moment emits an event on the bus
// (game/eventBus.js), and the sound layer, SoundProvider, subscribes and plays the voice. Level-up was once silent
// because its caller read a window global nothing assigned; these drive the REAL emitter (the hook or overlay that
// owns the moment), the REAL bus and the REAL provider, and read which voice's buffer the provider started. The
// AudioContext is the one fake: jsdom has none, so it records each started buffer source.

let started;
let gains;
const audioParam = { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} };
const PARAMS = new Set(['gain', 'threshold', 'knee', 'ratio', 'attack', 'release', 'frequency', 'Q', 'detune', 'pan', 'delayTime', 'playbackRate']);
const makeNode = () => new Proxy(function noop() {}, {
  get(_t, p) {
    if (PARAMS.has(p)) return audioParam;
    if (p === 'then') return undefined;
    return () => makeNode();
  },
  set() { return true; },
});
const makeSource = () => {
  // playSound writes its gain node's value just before start(), and every param here is the one audioParam, so the
  // value read at start() is the volume that play used.
  const base = { buffer: null, playbackRate: audioParam, start() { started.push(base.buffer); gains.push(audioParam.value); } };
  return new Proxy(base, {
    get(t, p) { return p in t ? t[p] : () => makeNode(); },
    set(t, p, v) { t[p] = v; return true; },
  });
};
function makeCtx() {
  const base = {
    sampleRate: 44100, currentTime: 0, state: 'running', destination: makeNode(),
    createBuffer: (ch, len) => {
      const data = Array.from({ length: ch || 1 }, () => new Float32Array(len));
      return { length: len, numberOfChannels: ch, getChannelData: (i) => data[i] || data[0] };
    },
    createBufferSource: makeSource,
    resume: () => Promise.resolve(), close: () => Promise.resolve(), suspend: () => Promise.resolve(),
    addEventListener() {}, removeEventListener() {},
  };
  return new Proxy(base, { get(t, p) { return p in t ? t[p] : () => makeNode(); } });
}

let sounds;
let settings;
function SoundsProbe() { settings = useSounds(); sounds = settings.sounds; return null; }
const starts = (voice) => started.filter((b) => b && b === sounds[voice]).length;
const gainsOf = (voice) => gains.filter((_, i) => started[i] && started[i] === sounds[voice]);
const withSound = ({ children }) => createElement(SoundProvider, null, createElement(SoundsProbe), children);

function LevelProbe() { useSimpleExperience(); return null; }

const STATS = { kills: 0, kills_by_type: {}, spells: 0, blocks_placed: 0, blocks_broken: 0, chests: 0, distance: 0, deaths: 0, level: 1 };

beforeEach(() => {
  started = [];
  gains = [];
  sounds = undefined;
  settings = undefined;
  globalThis.AudioContext = function AudioContext() { return makeCtx(); };
  globalThis.webkitAudioContext = globalThis.AudioContext;
  GameMethods.grantXP = vi.fn();
  GameMethods.spawnLootDrop = vi.fn();
  useGameStore.setState({ level: 1, coins: 0, questState: null, onLevelChanged: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('the voices the bus plays are real', () => {
  it('every event with a sound names a voice the provider synthesises', () => {
    render(createElement(withSound));
    const names = Object.values(EVENT_VOICES);
    expect(names.length, 'the event-to-voice table is empty').toBeGreaterThanOrEqual(3);
    for (const voice of names) expect(sounds[voice], `${voice} has no buffer: its event would play nothing`).toBeTruthy();
  });
});

describe('a level-up plays the levelUp voice', () => {
  it('the level rising under the real hook starts the levelUp buffer once per rise', () => {
    render(createElement(withSound, null, createElement(LevelProbe)));
    expect(sounds.levelUp, 'presence: the levelUp voice was not synthesised').toBeTruthy();
    expect(starts('levelUp'), 'SETUP: a levelUp played before any level was gained').toBe(0);
    act(() => useGameStore.setState({ level: 2 }));
    expect(starts('levelUp'), 'a level-up reached no sound subscriber: the bus or the provider\'s subscription is gone').toBe(1);
    act(() => useGameStore.setState({ level: 4 }));
    expect(starts('levelUp')).toBe(2);
  });

  it('control: a change that is not a level gained plays nothing', () => {
    render(createElement(withSound, null, createElement(LevelProbe)));
    act(() => useGameStore.setState({ coins: 50 }));
    act(() => useGameStore.setState({ level: 3 }));
    act(() => useGameStore.setState({ level: 1 })); // a lower save loaded: no fanfare for losing levels
    expect(starts('levelUp'), 'the level-up voice played for something other than a level gained').toBe(1);
  });

  it('mute and volume set after the subscription govern the next level-up', () => {
    render(createElement(withSound, null, createElement(LevelProbe)));
    act(() => settings.setSoundEnabled(false));
    act(() => useGameStore.setState({ level: 2 }));
    act(() => settings.setSoundEnabled(true));
    act(() => settings.setVolume(0.2));
    act(() => useGameStore.setState({ level: 3 }));
    expect(starts('levelUp'), 'presence: unmuted, the level-up did not play').toBeGreaterThanOrEqual(1);
    expect(starts('levelUp'), 'the level-up played while sound was off').toBe(1);
    expect(gainsOf('levelUp'), 'the level-up played at the volume it was subscribed with, not the one set since').toEqual([0.2]);
  });
});

describe('an achievement and a completed quest play the fanfare', () => {
  it('reaching level 5 unlocks Rising Star and plays the fanfare once', () => {
    useGameStore.setState({ questState: { quests: [], completedQuestIds: [], stats: { ...STATS }, unlockedAchievements: ['first_step'] } });
    const { result } = renderHook(() => useQuestSystem(), { wrapper: withSound });
    act(() => useGameStore.getState().onLevelChanged(5));
    expect(result.current.unlockedAchievements, 'SETUP: the achievement did not unlock').toContain('level5');
    expect(starts('fanfare'), 'the achievement unlocked in silence').toBe(1);
  });

  it('a kill that completes First Blood plays the fanfare once', () => {
    // Warrior (first_kill) is already held, so the one fanfare is the quest's, not the achievement's.
    useGameStore.setState({ questState: {
      quests: [{ id: 'first_blood', title: 'First Blood', type: 'kill', target: 1, xpReward: 30, tier: 1, progress: 0, completed: false, claimed: false }],
      completedQuestIds: [], stats: { ...STATS }, unlockedAchievements: ['first_step', 'first_kill'],
    } });
    renderHook(() => useQuestSystem(), { wrapper: withSound });
    act(() => emitMobKill('zombie', [0, 0, 0], 'player'));
    expect(useGameStore.getState().questState.completedQuestIds, 'SETUP: First Blood did not complete').toContain('first_blood');
    expect(starts('fanfare'), 'the quest completed in silence').toBe(1);
  });
});

describe('the win screen plays the victory sting', () => {
  it('the overlay appearing over a running game starts the victory buffer once, and a re-render does not again', () => {
    // The game runs first and the win screen appears later, as in play: the provider's audio exists before the
    // overlay mounts.
    const view = render(createElement(withSound));
    expect(starts('victory'), 'SETUP: a victory played before the win').toBe(0);
    view.rerender(createElement(withSound, null, createElement(VictoryOverlay, { onDismiss: () => {} })));
    expect(view.container.textContent, 'presence: the overlay rendered no VICTORY headline').toContain('VICTORY');
    expect(starts('victory'), 'the win screen is silent').toBe(1);
    view.rerender(createElement(withSound, null, createElement(VictoryOverlay, { onDismiss: () => {} })));
    expect(starts('victory'), 'the sting re-fired on a re-render').toBe(1);
  });

  it('renders without an audio context: audio can be unavailable', () => {
    globalThis.AudioContext = function AudioContext() { throw new Error('no audio here'); };
    globalThis.webkitAudioContext = globalThis.AudioContext;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => render(createElement(withSound, null, createElement(VictoryOverlay, { onDismiss: () => {} })))).not.toThrow();
  });
});
