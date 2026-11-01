// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { SoundProvider, useSounds, registerVoices } from '../../src/SoundManager';
import { VOICES } from '../../src/audio/synthVoices';
import { t, tIn } from '../../src/i18n/i18n.js';
import { mergeStrings } from '../../src/night/nightStrings.js';
import { STRINGS } from '../../src/i18n/strings.js';
import { useGameStore } from '../../src/store/useGameStore';

/**
 * A LAZY CHUNK BRINGS ITS OWN VOICES AND STRINGS (W3-A task script, unit U1; DECISIONS 2026-11-01 (W3-A PR C) item 498).
 * The night's code loads after the world is built (src/night/index.js), so the sound bank and the string tables take
 * additions at run time:
 *   - registerVoices (SoundManager.jsx): a voice added while the provider is up is synthesised into its bank at once and
 *     plays through playSound; one added before the provider mounts is built when it does; a name the bank already holds
 *     is refused, so a chunk can never replace a voice the game ships.
 *   - mergeStrings (night/nightStrings.js, in the night chunk): en and zh-CN together, never one without the other; a key the tables hold keeps its
 *     text (a different text throws), and merging the same table again changes nothing (a chunk retried after a failed
 *     load).
 * The AudioContext is the one fake (jsdom has none): it records each started buffer source, as event-sound-gates does.
 * Mutation-Proof: via scripts/dev/mutate.sh; the mutants and their reds are in the commit that adds this file.
 * NOT CHECKED HERE: the night's own voices and strings (S1, R1, D2, D3), and the ear (Kevin's, STATUS #44).
 */
let started;
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
  const base = { buffer: null, playbackRate: audioParam, start() { started.push(base.buffer); } };
  return new Proxy(base, { get(tg, p) { return p in tg ? tg[p] : () => makeNode(); }, set(tg, p, v) { tg[p] = v; return true; } });
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
  return new Proxy(base, { get(tg, p) { return p in tg ? tg[p] : () => makeNode(); } });
}
let bank;
function Probe() { bank = useSounds(); return null; }
/** A voice maker that records which context it was built on, and a buffer only it returns. */
const maker = (tag) => {
  const fn = (ctx) => { fn.builtOn.push(ctx); return { tag, length: 1 }; };
  fn.builtOn = [];
  return fn;
};

beforeEach(() => {
  started = [];
  bank = undefined;
  globalThis.AudioContext = function AudioContext() { return makeCtx(); };
  globalThis.webkitAudioContext = globalThis.AudioContext;
});
afterEach(() => { cleanup(); act(() => useGameStore.setState({ locale: 'en' })); });

describe('registerVoices', () => {
  it('builds a voice added before the provider mounts, once it does', () => {
    const early = maker('early');
    expect(registerVoices({ gateEarlyVoice: early }), 'the early voice was refused').toEqual(['gateEarlyVoice']);
    expect(early.builtOn.length, 'a voice was built with no provider up').toBe(0);
    render(createElement(SoundProvider, null, createElement(Probe)));
    expect(bank?.sounds?.zombie ?? bank?.sounds?.[Object.keys(VOICES)[0]], 'SETUP: the provider built no bank').toBeTruthy();
    expect(bank.sounds.gateEarlyVoice?.tag, 'the voice added before the mount is not in the bank').toBe('early');
  });

  it('builds a voice added while the provider is up into its bank at once, and plays it', () => {
    render(createElement(SoundProvider, null, createElement(Probe)));
    const late = maker('late');
    act(() => { registerVoices({ gateLateVoice: late }); });
    expect(late.builtOn.length, 'the voice was not built on the live context exactly once').toBe(1);
    expect(bank.sounds.gateLateVoice?.tag, 'the live bank does not hold the added voice').toBe('late');
    act(() => { bank.playSound('gateLateVoice'); });
    expect(started.filter((b) => b?.tag === 'late').length, 'playSound did not start the added voice').toBe(1);
  });

  it('refuses a name the bank already holds, so a chunk cannot replace a shipped voice', () => {
    render(createElement(SoundProvider, null, createElement(Probe)));
    const shipped = Object.keys(VOICES)[0];
    const before = bank.sounds[shipped];
    expect(before, 'SETUP: the shipped voice has no buffer').toBeTruthy();
    const usurper = maker('usurper');
    let added;
    act(() => { added = registerVoices({ [shipped]: usurper, gateLateVoice: maker('again') }); });
    expect(added, 'a name the bank holds was taken').toEqual([]);
    expect(usurper.builtOn.length, 'the refused voice was built').toBe(0);
    expect(bank.sounds[shipped], 'a shipped voice was replaced').toBe(before);
    expect(bank.sounds.gateLateVoice?.tag, 'an added voice was replaced by a second registration').toBe('late');
  });
});

describe('mergeStrings', () => {
  it('merges en and zh-CN together, and t() reads each in its locale', () => {
    const before = { en: Object.keys(STRINGS.en).length, zh: Object.keys(STRINGS['zh-CN']).length };
    expect(mergeStrings({ en: { 'gate.night.line': 'The night line' }, 'zh-CN': { 'gate.night.line': '夜之言' } }), 'the keys added')
      .toEqual(['gate.night.line']);
    expect({ en: Object.keys(STRINGS.en).length, zh: Object.keys(STRINGS['zh-CN']).length }).toEqual({ en: before.en + 1, zh: before.zh + 1 });
    expect(t('gate.night.line')).toBe('The night line');
    act(() => useGameStore.setState({ locale: 'zh-CN' }));
    expect(t('gate.night.line'), 'the zh-CN text is not read in zh-CN').toBe('夜之言');
    expect(tIn('en', 'gate.night.line')).toBe('The night line');
  });

  it('refuses a table whose locales hold different keys, and a different text for a key the tables hold', () => {
    const one = Object.keys(STRINGS.en)[0];
    expect(() => mergeStrings({ en: { 'gate.only.en': 'x' }, 'zh-CN': {} }), 'an English-only key was merged').toThrow(/gate\.only\.en/);
    expect(() => mergeStrings({ en: {}, 'zh-CN': { 'gate.only.zh': 'x' } }), 'a Chinese-only key was merged').toThrow(/gate\.only\.zh/);
    expect('gate.only.zh' in STRINGS['zh-CN'], 'the refused table left a key behind').toBe(false);
    expect('gate.only.en' in STRINGS.en, 'the refused table left a key behind').toBe(false);
    expect(() => mergeStrings({ en: { [one]: 'replaced' }, 'zh-CN': { [one]: STRINGS['zh-CN'][one] } }), 'a shipped string was replaced')
      .toThrow(new RegExp(one.replace(/\./g, '\\.')));
    expect(STRINGS.en[one], 'the refused text replaced the shipped one').not.toBe('replaced');
    expect(() => mergeStrings({ en: { [one]: STRINGS.en[one] }, 'zh-CN': { [one]: 'replaced' } }), 'a shipped zh-CN string was replaced')
      .toThrow(new RegExp(one.replace(/\./g, '\\.')));
    expect(STRINGS['zh-CN'][one], 'the refused text replaced the shipped zh-CN one').not.toBe('replaced');
  });

  it('changes nothing when the same table is merged again', () => {
    const table = { en: { 'gate.night.again': 'Again' }, 'zh-CN': { 'gate.night.again': '又' } };
    expect(mergeStrings(table)).toEqual(['gate.night.again']);
    expect(mergeStrings(table), 'a second merge of the same table added keys').toEqual([]);
    expect(t('gate.night.again')).toBe('Again');
  });
});
