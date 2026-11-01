// Sited under tests/scripts because its subject is a probe script (scripts/visual/_glDrawCounter.mjs), not game
// behaviour. It EXECUTES the page-side counter against a fake WebGL context and a fake frame clock; it reads no source.
import { describe, it, expect } from 'vitest';
import { drawCounterSource, summariseDraws } from '../../scripts/visual/_glDrawCounter.mjs';

const DRAW_ENTRY_POINTS = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements'];

/** A context with every draw entry point and one method that is not a draw. */
function fakeGl() {
  const ctx = { calls: [] };
  for (const name of [...DRAW_ENTRY_POINTS, 'clear']) ctx[name] = (...a) => { ctx.calls.push(name); return a.length; };
  return ctx;
}

/** A window whose canvases all hand out `ctx`, and whose frame clock the test steps with __tickFrame(). */
function fakeWindow(ctx) {
  const queue = [];
  class HTMLCanvasElement {}
  HTMLCanvasElement.prototype.getContext = function getContext() { return ctx; };
  const win = {
    HTMLCanvasElement,
    requestAnimationFrame: (cb) => { queue.push(cb); return queue.length; },
    __tickFrame: () => { const due = queue.splice(0); for (const cb of due) cb(0); },
  };
  return win;
}

function install(ctx) {
  const win = fakeWindow(ctx);
  new Function('window', drawCounterSource())(win);
  const gl = new win.HTMLCanvasElement().getContext('webgl2');
  return { win, gl };
}

describe('the GL draw counter (scripts/visual/_glDrawCounter.mjs)', () => {
  it('counts every draw entry point, per frame, and still calls through', () => {
    const ctx = fakeGl();
    const { win, gl } = install(ctx);
    for (const name of DRAW_ENTRY_POINTS) gl[name](1, 2, 3);
    gl.clear(); // not a draw
    win.__tickFrame();
    gl.drawElements(4, 6, 0, 0);
    win.__tickFrame();
    expect(win.__glDraws.frames).toEqual([5, 1]);
    expect(ctx.calls.filter((n) => n !== 'clear')).toHaveLength(DRAW_ENTRY_POINTS.length + 1); // the real call ran each time
  });

  it('wraps a context once however often the page asks for it, and reset() empties the record', () => {
    const ctx = fakeGl();
    const { win } = install(ctx);
    const again = new win.HTMLCanvasElement().getContext('webgl2');
    again.drawArrays(0, 0, 3);
    win.__tickFrame();
    expect(win.__glDraws.frames).toEqual([1]); // a second wrap would count this draw twice
    win.__glDraws.reset();
    expect(win.__glDraws.frames).toEqual([]);
  });

  it('summariseDraws refuses an empty denominator and summarises a real one', () => {
    expect(() => summariseDraws([])).toThrow(/no frames/);
    expect(summariseDraws([3, 5, 4])).toEqual({ n: 3, median: 4, max: 5, p95: 5 });
    expect(summariseDraws([10, 2, 2, 2])).toEqual({ n: 4, median: 2, max: 10, p95: 10 });
  });
});
