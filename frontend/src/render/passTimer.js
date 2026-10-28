// passTimer.js — GPU milliseconds per post-processing pass, for the lookbook probe (scripts/visual/lookbook.mjs).
//
// WHY GPU TIMER QUERIES. WebGL calls return before the GPU runs them, so performance.now() around a pass measures
// command submission, not the pass. EXT_disjoint_timer_query_webgl2 times the GPU work between beginQuery and
// endQuery. Chromium exposes it; Safari does not, and there every call here is a no-op that reports why.
//
// WHY SEGMENTS NEVER NEST. WebGL 2 allows one open TIME_ELAPSED query at a time, so an EffectPass is not timed as one
// span: each merged effect's update() (where Bloom's blur and GodRays' light pass render) and the pass's own merged
// draw are separate, back-to-back segments, and their sum is the pass.
//
// WHY A PROTOTYPE PATCH. @react-three/postprocessing builds the EffectComposer inside a component and exposes no
// instance; EffectComposer.prototype.render is the one place every instance passes through. Labels use
// postprocessing's own `name` strings, because the production bundle minifies class names.
//
// WHY A WALL-CLOCK WINDOW. A report carries the window's own length and every segment's summed ms within it, so a
// reader can test whether the readings can be GPU execution time at all: serial segments that all began after the
// window opened and finished before it was read cannot sum to more than the window (scripts/visual/_lookbook.mjs
// passSummary). On ANGLE-Metal under load they have summed to several times it.
//
// WHY A WHOLE-FRAME MODE. Those segment readings have summed to more than their window, and every segment that did
// GPU work read about the same few ms whatever it drew, so a segment cannot rank a pass. In `frame` mode the whole
// composer.render is ONE query (`frame`), opened right after a sync so the GPU is idle when it opens, and the wall
// clock from that sync to a second one after the render is recorded too (`frame:wall`): an instrument that needs no
// timer extension. A pass is then judged by the whole frame with it on minus off (plan 2026-10-28-crafty-w2i-passes).
//
// Loaded only when the lookbook seam is asked for timings (render/lookbookSeam.js passTimes), never for a player and
// never for the power A/B hold, which must not pay the queries' cost in one arm only.
import { EffectComposer, EffectPass } from 'postprocessing';

const EXT_NAME = 'EXT_disjoint_timer_query_webgl2';
const SAMPLES_PER_LABEL = 240;
// Results arrive a few frames late; a context that stops answering must not grow the queue without bound.
const MAX_PENDING = 256;

const sorted = (xs) => [...xs].sort((a, b) => a - b);
const round3 = (x) => Math.round(x * 1000) / 1000;

const wallClock = () => performance.now();

/**
 * A timer over one WebGL 2 context. `available` is false (with a `reason`) when the context has no timer extension;
 * then begin() refuses and nothing touches the context again. `now` is the wall clock the window is measured on.
 */
export function createPassTimer(gl, now = wallClock) {
  const ext = gl && typeof gl.createQuery === 'function' ? gl.getExtension(EXT_NAME) : null;
  const reason = !gl ? 'no WebGL context'
    : typeof gl.createQuery !== 'function' ? 'WebGL 1 context: timer queries need WebGL 2'
      : !ext ? `${EXT_NAME} is not exposed by this browser` : null;
  const available = reason === null;

  const pool = [];
  let pending = []; // { label, q, gen, frame } in submission order
  let open = null;
  let gen = 0;
  let samples = new Map(); // label -> { ms: last SAMPLES_PER_LABEL, count, sumMs over the whole window } (first-seen order is pass order)
  let frames = 0, disjoint = 0, skipped = 0, dropped = 0;
  // Frames with at least one landed result, counted as results land (in submission order, so one frame's are adjacent).
  let framesTimed = 0, lastFrameLanded = null;
  let since = now();

  const recycle = (q) => { pool.push(q); };
  const add = (label, ms) => {
    if (!samples.has(label)) samples.set(label, { ms: [], count: 0, sumMs: 0 });
    const s = samples.get(label);
    s.ms.push(ms);
    if (s.ms.length > SAMPLES_PER_LABEL) s.ms.shift();
    s.count += 1;
    s.sumMs += ms;
  };

  return {
    available,
    reason,
    /** Open a segment. Refused (returns false, counted) while another is open: queries cannot nest. */
    begin(label) {
      if (!available) return false;
      if (open) { skipped += 1; return false; }
      const q = pool.pop() || gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      open = { label, q, gen, frame: frames };
      return true;
    },
    end() {
      if (!open) return;
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(open);
      open = null;
      if (pending.length > MAX_PENDING) { dropped += 1; recycle(pending.shift().q); }
    },
    /** Read every finished result. A disjoint event (the GPU clock jumped) voids everything in flight. */
    poll() {
      if (!available || pending.length === 0) return;
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        disjoint += 1;
        for (const p of pending) recycle(p.q);
        pending = [];
        return;
      }
      let i = 0;
      for (; i < pending.length; i++) {
        const p = pending[i];
        // Queries finish in submission order, so the first unfinished one ends the read.
        if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break;
        const ns = gl.getQueryParameter(p.q, gl.QUERY_RESULT);
        if (p.gen === gen) {
          add(p.label, ns / 1e6);
          if (p.frame !== lastFrameLanded) { framesTimed += 1; lastFrameLanded = p.frame; }
        }
        recycle(p.q);
      }
      pending = pending.slice(i);
    },
    frame() { frames += 1; },
    /** A sample measured on the wall clock rather than by a query; recorded with or without the extension. */
    record(label, ms) { add(label, ms); },
    /** Forget everything measured so far; results still in flight from before are discarded when they land. */
    reset() {
      gen += 1;
      samples = new Map();
      frames = 0; disjoint = 0; skipped = 0; dropped = 0;
      framesTimed = 0; lastFrameLanded = null;
      since = now();
    },
    /** `n`, `meanMs`, `p50Ms`, `maxMs` are over each label's last SAMPLES_PER_LABEL results; `count` and `sumMs` over
     *  every result that landed in the window, which is `windowMs` long. */
    report() {
      const passes = [...samples].map(([label, { ms, count, sumMs }]) => {
        const s = sorted(ms);
        return {
          label,
          n: s.length,
          meanMs: round3(s.reduce((a, b) => a + b, 0) / s.length),
          p50Ms: round3(s[Math.floor((s.length - 1) / 2)]),
          maxMs: round3(s[s.length - 1]),
          count,
          sumMs: round3(sumMs),
        };
      });
      return {
        available, reason, frames, framesTimed, windowMs: round3(now() - since),
        disjoint, skipped, dropped, pending: pending.length, passes,
      };
    },
  };
}

/** The label a pass is reported under. EffectPass names what it merges, since that is what its cost is made of. */
function passLabel(pass, index) {
  if (pass instanceof EffectPass) return `EffectPass(${pass.effects.map((e) => e.name).join('+')})`;
  if (pass.name && pass.name !== 'Pass') return pass.name;
  // n8ao's N8AOPostPass passes no name to postprocessing's Pass, so it arrives as the default "Pass".
  if (pass.configuration && 'aoRadius' in pass.configuration) return 'N8AO';
  return `Pass#${index}`;
}

const timedPasses = new WeakSet();
// wrapper -> the function it wraps. The library rebuilds an EffectPass over the SAME effect instances whenever its
// pass-building effect re-runs (@react-three/postprocessing 3.0.4 dist/index.js: deps composer, children, camera and
// its two internal passes). In GameScene that is a tier first mounting N8AO or GodRays, the sun mesh arriving
// and a camera change (a new composer). So an effect's update() may
// already be a wrapper from its previous pass; it is wrapped from its original, so there is only ever one layer.
const unwrapped = new WeakMap();
const original = (fn) => {
  let f = fn;
  while (unwrapped.has(f)) f = unwrapped.get(f);
  return f;
};

// The page-wide mode: 'segments' (a query per segment), 'frame' (one query per composer.render) or 'count' (frames
// counted, nothing timed and no sync: the free-running frame a GPU-utilization reading is taken over). A segment
// wrapper reads it on every call, so a switch takes effect on the next frame without re-wrapping anything.
const MODES = ['segments', 'frame', 'count'];
let mode = 'segments';

function timed(timer, label, fn) {
  const inner = original(fn);
  const wrapper = function timedSegment(...args) {
    const on = mode === 'segments' && timer.begin(label);
    try {
      return inner.apply(this, args);
    } finally {
      if (on) timer.end();
    }
  };
  unwrapped.set(wrapper, inner);
  return wrapper;
}

/**
 * Wrap every pass of `composer` (once each) so its GPU work is timed. Non-effect passes are one segment. An EffectPass
 * is its effects' update() calls plus its merged draw, caught through the pass's own fullscreen scene, whose
 * onBeforeRender / onAfterRender three.js calls around the draw (WebGLRenderer.render).
 */
function instrumentComposer(composer, timer) {
  composer.passes.forEach((pass, i) => {
    if (timedPasses.has(pass)) return;
    timedPasses.add(pass);
    const label = `${i}:${passLabel(pass, i)}`;
    if (pass instanceof EffectPass) {
      for (const effect of pass.effects) {
        effect.update = timed(timer, `${label} > ${effect.name}.update`, effect.update);
      }
      const scene = pass.scene;
      const before = scene.onBeforeRender;
      const after = scene.onAfterRender;
      let on = false;
      scene.onBeforeRender = function drawBegins(...args) {
        before.apply(this, args);
        on = mode === 'segments' && timer.begin(`${label} > draw`);
      };
      scene.onAfterRender = function drawEnds(...args) {
        if (on) { timer.end(); on = false; }
        after.apply(this, args);
      };
    } else {
      pass.render = timed(timer, label, pass.render);
    }
  });
  if (!timedPasses.has(composer)) {
    timedPasses.add(composer);
    composer.blitDepthBuffer = timed(timer, 'depth blit', composer.blitDepthBuffer);
  }
}

/** The composer's passes as rendered: label and whether the composer runs it. */
const chainOf = (composer) => composer.passes.map((p, i) => ({ label: `${i}:${passLabel(p, i)}`, enabled: p.enabled !== false }));

const syncPixel = new Uint8Array(4);
/**
 * Wait for the GPU: a 1-pixel read of the screen cannot return before every command before it has run. The default
 * framebuffer is bound through three's own state cache (a raw bindFramebuffer would desync it); RGBA8 is a format and
 * type every WebGL 2 context accepts for it.
 */
function syncGpu(renderer, gl) {
  renderer.setRenderTarget(null);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPixel);
}

let installed = null;

/**
 * Patch EffectComposer.prototype.render (once per page) and return the page-wide timing handle: one timer per WebGL
 * context, so the title diorama's composer and the game's are reported apart, each with its canvas size and the chain
 * it last rendered. `now` is the wall clock (injected by the gates).
 */
export function installPassTimer(ComposerClass = EffectComposer, { now = wallClock } = {}) {
  if (installed) return installed;
  const timers = new Map(); // context -> { timer, canvas, chain }
  const proto = ComposerClass.prototype;
  const render = proto.render;
  proto.render = function timedComposerRender(deltaTime) {
    const renderer = this.getRenderer();
    const gl = renderer?.getContext?.();
    let entry = gl ? timers.get(gl) : null;
    if (gl && !entry) {
      entry = { timer: createPassTimer(gl, now), canvas: gl.canvas, chain: null };
      timers.set(gl, entry);
    }
    if (!entry) return render.call(this, deltaTime);
    entry.chain = chainOf(this);
    const timer = entry.timer;
    if (mode === 'frame') {
      timer.poll();
      if (timer.available) instrumentComposer(this, timer);
      timer.frame();
      syncGpu(renderer, gl);
      const t0 = now();
      const on = timer.begin('frame');
      try {
        return render.call(this, deltaTime);
      } finally {
        if (on) timer.end();
        syncGpu(renderer, gl);
        timer.record('frame:wall', now() - t0);
      }
    }
    if (mode === 'count') {
      timer.frame();
      return render.call(this, deltaTime);
    }
    if (!timer.available) return render.call(this, deltaTime);
    timer.poll();
    instrumentComposer(this, timer);
    timer.frame();
    return render.call(this, deltaTime);
  };
  installed = {
    /** Every context's report, with the canvas size in device pixels; `reset` starts a fresh window after reading. */
    report({ reset = false } = {}) {
      const contexts = [...timers.values()].map(({ timer, canvas, chain }) => {
        timer.poll();
        const r = { canvas: canvas ? [canvas.width, canvas.height] : null, mode, chain, ...timer.report() };
        if (reset) timer.reset();
        return r;
      });
      return { installed: true, mode, contexts };
    },
    /** 'segments', 'frame' or 'count', from the next composer.render on. */
    setMode(m) {
      if (!MODES.includes(m)) throw new RangeError(`passTimer: mode must be one of ${MODES.join(', ')}, got ${JSON.stringify(m)}`);
      mode = m;
    },
    uninstall() {
      proto.render = render;
      mode = 'segments';
      installed = null;
    },
  };
  return installed;
}
