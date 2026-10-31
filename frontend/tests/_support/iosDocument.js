/**
 * AN iOS DOCUMENT FOR jsdom GATES: what WebKit on an iPhone or an iPad gives a page that a desktop Chromium does not,
 * in one place, so a gate meets the platform's absences and refusals instead of a stub that hides them.
 *
 * - No Pointer Lock: requestPointerLock, exitPointerLock and pointerLockElement are absent (deleted where a test or
 *   jsdom put one), never replaced by a function that does nothing.
 * - Touch: navigator.maxTouchPoints 5, ontouchstart, and matchMedia answering a coarse pointer with no hover.
 * - AudioContext: starts 'suspended', and resume() starts it only inside a gesture until it has run once (WebKit
 *   AudioContext::willBeginPlayback). interrupt() leaves it 'interrupted', where resume() alone keeps it (WebKit bugs
 *   273511 and 276016) and suspend() then resume() brings it back; freeze() keeps 'running' with a clock that has
 *   stopped (bug 263627). Its nodes record what they connect to and hold their gain values.
 * - Audio: play() is refused outside a gesture until that element has been played inside one (MediaElementSession's
 *   RequireUserGestureForAudioRateChange, lifted by HTMLMediaElement::play in a gesture; an iPad also lets an element at
 *   volume 0 start, and pauses a playing one given an audible volume outside a gesture, HTMLMediaElement::setVolume).
 *   On an iPhone the volume reads 1 and ignores writes (WebKit locks it on a small screen).
 *
 * A gesture is the dispatch of an activation-triggering event (HTML: keydown other than Escape, mousedown, pointerdown
 * from a mouse, pointerup from anything else, touchend) or a click, for as long as its listeners run. Work a listener
 * defers (a React effect flushed after the dispatch, a timer) is outside it, which is stricter than a browser that
 * flushes an effect inside the event and is the side a gate should err on.
 *
 * `installIosDocument({ device })` returns the handle; `restore()` puts every global back.
 */
const GESTURE = new Set(['keydown', 'mousedown', 'pointerdown', 'pointerup', 'touchend', 'click']);

function isActivation(event) {
  if (!GESTURE.has(event.type)) return false;
  if (event.type === 'keydown') return event.key !== 'Escape';
  if (event.type === 'pointerdown') return event.pointerType === 'mouse';
  if (event.type === 'pointerup') return event.pointerType !== 'mouse';
  return true;
}

class FakeParam {
  constructor(value = 0) { this.value = value; }
  setValueAtTime(v) { this.value = v; return this; }
  linearRampToValueAtTime(v) { this.value = v; return this; }
  exponentialRampToValueAtTime(v) { this.value = v; return this; }
  setTargetAtTime(v) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
}

const PARAMS = {
  gain: ['gain'], biquad: ['frequency', 'Q', 'gain', 'detune'], oscillator: ['frequency', 'detune'],
  buffer: ['playbackRate', 'detune'], compressor: ['threshold', 'knee', 'ratio', 'attack', 'release'], media: [],
  destination: [],
};

class FakeNode {
  constructor(ctx, kind) {
    this.context = ctx; this.kind = kind; this.outputs = []; this.started = false; this.type = '';
    for (const p of PARAMS[kind]) this[p] = new FakeParam(kind === 'gain' && p === 'gain' ? 1 : 0);
  }
  connect(node) { this.outputs.push(node); return node; }
  disconnect() { this.outputs = []; }
  start() { this.started = true; }
  stop() { this.started = false; }
}

function makeAudioContextClass(world) {
  return class FakeAudioContext {
    constructor() {
      this.sampleRate = 44100; this.state = 'suspended'; this.calls = [];
      this.destination = new FakeNode(this, 'destination');
      this._started = false; this._stuck = false; this._frozen = false; this._clock = 0; this._since = 0;
      world.contexts.push(this);
    }
    get currentTime() {
      return this.state === 'running' && !this._frozen ? this._clock + (Date.now() - this._since) / 1000 : this._clock;
    }
    _setState(next) {
      this._clock = this.currentTime; this._since = Date.now(); this.state = next;
    }
    resume() {
      this.calls.push('resume');
      if (this.state === 'closed') return Promise.reject(new DOMException('closed', 'InvalidStateError'));
      if (this._stuck) return new Promise(() => {});
      // resume() on a running context has nothing to do (Web Audio, the resume() method), so a stopped clock stays stopped.
      if (this.state === 'running') return Promise.resolve();
      if (!this._started && !world.inGesture) return new Promise(() => {});
      this._started = true; this._frozen = false; this._setState('running');
      return Promise.resolve();
    }
    suspend() {
      this.calls.push('suspend');
      if (this.state === 'closed') return Promise.reject(new DOMException('closed', 'InvalidStateError'));
      this._stuck = false; this._frozen = false; this._setState('suspended');
      return Promise.resolve();
    }
    close() { this._setState('closed'); return Promise.resolve(); }
    /** The platform's interruption ended and the context did not come back on its own. */
    interrupt() { this._stuck = true; this._setState('interrupted'); }
    /** 'running', with a clock that no longer advances. */
    freeze() { this._clock = this.currentTime; this._frozen = true; }
    createGain() { return new FakeNode(this, 'gain'); }
    createBiquadFilter() { return new FakeNode(this, 'biquad'); }
    createOscillator() { return new FakeNode(this, 'oscillator'); }
    createBufferSource() { return new FakeNode(this, 'buffer'); }
    createDynamicsCompressor() { return new FakeNode(this, 'compressor'); }
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (i) => data[i] };
    }
    createMediaElementSource(el) {
      if (el.routedBy) throw new DOMException('already connected', 'InvalidStateError');
      const node = new FakeNode(this, 'media');
      node.mediaElement = el; el.routedBy = node;
      return node;
    }
  };
}

function makeAudioClass(world, device) {
  return class FakeAudio {
    constructor(src = '') {
      this.src = src; this.loop = false; this.preload = ''; this.muted = false;
      this._paused = true; this._volume = 1; this.unlocked = false; this.routedBy = null;
      this.plays = 0; this.refused = 0; this.autoPaused = 0;
      world.audios.push(this);
    }
    get paused() { return this._paused; }
    get volume() { return device === 'iphone' ? 1 : this._volume; }
    set volume(v) {
      if (device === 'iphone') return;
      this._volume = v;
      // HTMLMediaElement::setVolume: a playing element whose new volume would not be permitted outside a gesture pauses.
      if (!this._paused && v !== 0 && !this.muted && !this.unlocked && !world.inGesture) { this._paused = true; this.autoPaused += 1; }
    }
    play() {
      this.plays += 1;
      const atZero = device !== 'iphone' && !this.muted && this._volume === 0;
      if (!world.inGesture && !this.unlocked && !atZero) {
        this.refused += 1;
        return Promise.reject(new DOMException('play() needs a user gesture', 'NotAllowedError'));
      }
      if (world.inGesture) this.unlocked = true;
      this._paused = false;
      return Promise.resolve();
    }
    pause() { this._paused = true; }
  };
}

/** The gain an element reaches the speakers at: its route's gains, or its own volume when it is not routed. */
function audibleLevel(el) {
  if (el.paused) return 0;
  const src = el.routedBy;
  if (!src) return el.volume;
  const ctx = src.context;
  if (ctx.state !== 'running' || ctx._frozen) return 0;
  const reach = (node) => {
    if (node.kind === 'destination') return 1;
    const own = node.kind === 'gain' ? node.gain.value : 1;
    return Math.max(0, ...node.outputs.map((n) => own * reach(n)));
  };
  return reach(src);
}

function defineOn(target, key, descriptor, saved) {
  saved.push([target, key, Object.getOwnPropertyDescriptor(target, key)]);
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
}

function deleteFrom(target, key, saved) {
  const had = Object.getOwnPropertyDescriptor(target, key);
  if (!had) return;
  saved.push([target, key, had]);
  delete target[key];
}

export function installIosDocument({ device = 'iphone' } = {}) {
  const world = { inGesture: false, contexts: [], audios: [] };
  const saved = [];
  const win = globalThis.window ?? globalThis;

  for (const t of [Element.prototype, HTMLElement.prototype, document.body, document.documentElement]) {
    deleteFrom(t, 'requestPointerLock', saved);
  }
  for (const t of [Document.prototype, document]) {
    deleteFrom(t, 'exitPointerLock', saved);
    deleteFrom(t, 'pointerLockElement', saved);
  }

  defineOn(navigator, 'maxTouchPoints', { get: () => 5 }, saved);
  defineOn(win, 'ontouchstart', { value: null, writable: true }, saved);
  const COARSE = /\((any-)?pointer:\s*coarse\)|\((any-)?hover:\s*none\)/;
  defineOn(win, 'matchMedia', {
    value: (q) => ({ matches: COARSE.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    writable: true,
  }, saved);

  const AudioContextClass = makeAudioContextClass(world);
  const AudioClass = makeAudioClass(world, device);
  for (const t of new Set([globalThis, win])) {
    defineOn(t, 'AudioContext', { value: AudioContextClass, writable: true }, saved);
    defineOn(t, 'webkitAudioContext', { value: AudioContextClass, writable: true }, saved);
    defineOn(t, 'Audio', { value: AudioClass, writable: true }, saved);
  }

  const proto = EventTarget.prototype;
  const dispatch = proto.dispatchEvent;
  defineOn(proto, 'dispatchEvent', {
    writable: true,
    value: function dispatchInGesture(event) {
      if (world.inGesture || !isActivation(event)) return dispatch.call(this, event);
      world.inGesture = true;
      try { return dispatch.call(this, event); } finally { world.inGesture = false; }
    },
  }, saved);

  let visibility = 'visible';
  defineOn(document, 'visibilityState', { get: () => visibility }, saved);
  defineOn(document, 'hidden', { get: () => visibility === 'hidden' }, saved);

  const pointer = (type, el) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch' }));
  const plain = (Ctor, type, el) => el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true }));

  return {
    world,
    /** The context the game made (the last one), or null. */
    get ctx() { return world.contexts[world.contexts.length - 1] ?? null; },
    get audios() { return world.audios; },
    audible: audibleLevel,
    /** Runs fn as if inside a user gesture, for an action whose real control is not mounted (a Settings toggle). */
    gesture(fn) {
      const was = world.inGesture; world.inGesture = true;
      try { return fn(); } finally { world.inGesture = was; }
    },
    /** A finger's tap on `el`, in the order iOS sends it: pointer, touch, then the compatibility mouse events and click. */
    tap(el = document.body) {
      pointer('pointerdown', el);
      plain(TouchEvent, 'touchstart', el);
      pointer('pointerup', el);
      plain(TouchEvent, 'touchend', el);
      plain(MouseEvent, 'mousedown', el);
      plain(MouseEvent, 'mouseup', el);
      plain(MouseEvent, 'click', el);
    },
    /** Leaves the page by an app switch, or comes back to it: visibilitychange only, as the page stays loaded. */
    setVisible(visible) {
      visibility = visible ? 'visible' : 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    },
    /** A restore from the back-forward cache, which fires pageshow with no visibilitychange in this document. */
    pageshow() { win.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); },
    /** Every element as if a gesture had already played it (a returning session the platform lets play). */
    unlockMedia() { for (const a of world.audios) a.unlocked = true; },
    restore() {
      for (const [target, key, descriptor] of saved.reverse()) {
        if (descriptor) Object.defineProperty(target, key, descriptor);
        else delete target[key];
      }
      saved.length = 0;
    },
  };
}
