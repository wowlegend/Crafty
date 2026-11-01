// _glDrawCounter.mjs — draw calls per frame, counted at the WebGL context.
//
// WHY AT THE CONTEXT. three resets renderer.info at every render() call while info.autoReset is true (three r172
// WebGLRenderer.js render(), the default in webgl/WebGLInfo.js), and postprocessing calls renderer.render once per pass.
// So renderer.info.render.calls after a frame is the LAST pass's count, not the scene's: a probe reading it sees a mob's
// draws as zero. This counts every draw entry point on the context instance the page's canvases hand out, once per
// animation frame.
//
// HOW. drawCounterSource() is the source of a function body run in the page before the app (page.addInitScript with
// `new Function('window', src)(window)`). It wraps HTMLCanvasElement.prototype.getContext so each WebGL context is
// wrapped on its INSTANCE, once, and registers a requestAnimationFrame loop: each callback pushes the draws counted
// since the previous one. Registered before the app's own loop, it runs first in every frame, so each entry is one whole
// previous frame. The record keeps the last 1,200 frames. It reads frames as the page presents them: a frame the
// compositor never presents is not in the record.

/** The page-side installer's source. Defines window.__glDraws = { frames: number[], reset(): void }. */
export function drawCounterSource() {
  return `
    const DRAWS = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements'];
    const KEEP = 1200;
    const rec = { frames: [], count: 0 };
    const wrapped = new WeakSet();
    const proto = window.HTMLCanvasElement && window.HTMLCanvasElement.prototype;
    if (proto && proto.getContext) {
      const getContext = proto.getContext;
      proto.getContext = function (...args) {
        const ctx = getContext.apply(this, args);
        if (ctx && typeof ctx === 'object' && !wrapped.has(ctx)) {
          wrapped.add(ctx);
          for (const name of DRAWS) {
            const real = ctx[name];
            if (typeof real !== 'function') continue;
            ctx[name] = function (...a) { rec.count += 1; return real.apply(this, a); };
          }
        }
        return ctx;
      };
    }
    const tick = () => {
      rec.frames.push(rec.count);
      if (rec.frames.length > KEEP) rec.frames.splice(0, rec.frames.length - KEEP);
      rec.count = 0;
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
    window.__glDraws = {
      get frames() { return rec.frames.slice(); },
      reset() { rec.frames.length = 0; rec.count = 0; },
    };
  `;
}

/** PURE. The median, max and 95th percentile of per-frame draw counts. Throws on an empty record: no frames is no
 *  measurement, never a zero. */
export function summariseDraws(frames) {
  if (!Array.isArray(frames) || frames.length === 0) throw new Error('summariseDraws: no frames recorded');
  const s = [...frames].sort((a, b) => a - b);
  const at = (q) => s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
  return { n: s.length, median: s[Math.floor((s.length - 1) / 2)], max: s[s.length - 1], p95: at(0.95) };
}
