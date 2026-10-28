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
          const ms = ns / 1e6;
          if (!samples.has(p.label)) samples.set(p.label, { ms: [], count: 0, sumMs: 0 });
          const s = samples.get(p.label);
          s.ms.push(ms);
          if (s.ms.length > SAMPLES_PER_LABEL) s.ms.shift();
          s.count += 1;
          s.sumMs += ms;
          if (p.frame !== lastFrameLanded) { framesTimed += 1; lastFrameLanded = p.frame; }
        }
        recycle(p.q);
      }
      pending = pending.slice(i);
    },
    frame() { frames += 1; },
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

function timed(timer, label, fn) {
  const inner = original(fn);
  const wrapper = function timedSegment(...args) {
    const on = timer.begin(label);
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
        on = timer.begin(`${label} > draw`);
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

let installed = null;

/**
 * Patch EffectComposer.prototype.render (once per page) and return the page-wide timing handle: one timer per WebGL
 * context, so the title diorama's composer and the game's are reported apart, each with its canvas size.
 */
export function installPassTimer(ComposerClass = EffectComposer) {
  if (installed) return installed;
  const timers = new Map(); // context -> { timer, canvas }
  const proto = ComposerClass.prototype;
  const render = proto.render;
  proto.render = function timedComposerRender(deltaTime) {
    const gl = this.getRenderer()?.getContext?.();
    let entry = gl ? timers.get(gl) : null;
    if (gl && !entry) {
      entry = { timer: createPassTimer(gl), canvas: gl.canvas };
      timers.set(gl, entry);
    }
    const timer = entry?.timer;
    if (!timer || !timer.available) return render.call(this, deltaTime);
    timer.poll();
    instrumentComposer(this, timer);
    timer.frame();
    return render.call(this, deltaTime);
  };
  installed = {
    /** Every context's report, with the canvas size in device pixels; `reset` starts a fresh window after reading. */
    report({ reset = false } = {}) {
      const contexts = [...timers.values()].map(({ timer, canvas }) => {
        timer.poll();
        const r = { canvas: canvas ? [canvas.width, canvas.height] : null, ...timer.report() };
        if (reset) timer.reset();
        return r;
      });
      return { installed: true, contexts };
    },
    uninstall() {
      proto.render = render;
      installed = null;
    },
  };
  return installed;
}
