// A PANEL'S TRANSITION, SAMPLED ON THE FRAMES THE PAGE DRAWS, AND JUDGED (W2-L, tests/e2e/lazy-motion.spec.js).
//
// Kept out of the spec so a unit gate can drive both halves (tests/gates/motion-sample-gates.test.jsx): the sampler
// against the real talents panel in jsdom, the verdict against series whose answer is known by construction. In a
// browser the case that decides this is a runner whose frames are seconds apart, which comes down to which machine CI
// hands you.
//
// WHAT IS SAMPLED. The inline `transform` of the panel's own motion element, read on each animation frame from the
// moment the element is inserted. framer-motion drives scale and y from JavaScript, one step per frame with the step
// clamped to 40 ms, so a slow frame advances the animation by a bounded amount rather than skipping it: a spring that
// runs on lets every drawn frame show a value between its start and its end. (Opacity is not sampled: framer hands
// it to the Web Animations API, which runs on the compositor and finishes between two frames drawn seconds apart.)
//
// THE START IS READ AT INSERTION, by a MutationObserver, which runs before the first paint: it is the `initial` the
// element was rendered with, whatever the first drawn frame shows.

/** In the page (Playwright serialises this function: it closes over nothing). Arms a sampler that waits for the element
 *  with `data-testid=testid`, takes its parent (the motion element), and records `{ t, scale, y }` at insertion and on
 *  every frame after, until it has read the end state `settleFrames` times running or `deadlineMs` has passed. The result
 *  is on window.__motionSamples: { frames, done, target }. `target` says which element was sampled. */
export function installMotionSampler({ testid, endScale = 1, endY = 0, settleFrames = 3, deadlineMs = 30000 }) {
  const out = { frames: [], done: false, target: null, startedAt: performance.now() };
  window.__motionSamples = out;
  const read = (el) => {
    const tf = el.style.transform || '';
    const scale = /scale\(\s*([-\d.e]+)/.exec(tf);
    const y = /translateY\(\s*([-\d.e]+)px/.exec(tf);
    return { t: Math.round(performance.now() - out.startedAt), scale: scale ? Number(scale[1]) : 1, y: y ? Number(y[1]) : 0 };
  };
  let el = null;
  let settled = 0;
  const frame = () => {
    if (out.done) return;
    const f = read(el);
    out.frames.push(f);
    settled = Math.abs(f.scale - endScale) < 1e-3 && Math.abs(f.y - endY) < 0.05 ? settled + 1 : 0;
    if (settled >= settleFrames || performance.now() - out.startedAt > deadlineMs) { out.done = true; return; }
    requestAnimationFrame(frame);
  };
  const watch = new MutationObserver(() => {
    const panel = document.querySelector(`[data-testid="${testid}"]`);
    if (!panel || !panel.parentElement) return;
    watch.disconnect();
    el = panel.parentElement;
    out.target = `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/)[0] || ''}`;
    out.frames.push(read(el)); // the start: before any frame is drawn
    requestAnimationFrame(frame);
  });
  watch.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => { if (!el) { watch.disconnect(); out.done = true; } }, deadlineMs); // never inserted: the spec says so
  return true;
}

/** The verdict on a sampled series. kind: 'ok'; 'fail' (the transition is wrong); 'setup' (the series cannot judge:
 *  the element never appeared, or too few frames were drawn). `why` names what was seen, with the denominator. */
export function judgeMotion(frames, { startScale = 0.9, endScale = 1, endY = 0, minFrames = 4, tol = 1e-3 } = {}) {
  const n = frames.length;
  if (n === 0) return { kind: 'setup', why: 'the panel was never inserted, so nothing was sampled' };
  const first = frames[0];
  if (Math.abs(first.scale - startScale) > tol) {
    return { kind: 'setup', why: `the first sample (at insertion) read scale ${first.scale}, not the initial ${startScale}: the sampled element is not the panel's motion element, or it was inserted already animated` };
  }
  if (n < minFrames) return { kind: 'setup', why: `only ${n} samples (${minFrames} needed): too few frames were drawn to judge a transition` };
  const last = frames[n - 1];
  if (Math.abs(last.scale - endScale) > tol || Math.abs(last.y - endY) > 0.05) {
    return { kind: 'fail', why: `after ${n} samples the panel never reached its end (scale ${last.scale}, y ${last.y}; wanted ${endScale}, ${endY}): it is frozen at its initial state, so nothing animates` };
  }
  const between = frames.filter((f) => f.scale > startScale + tol && f.scale < endScale - tol);
  if (between.length === 0) {
    return { kind: 'fail', why: `in ${n} samples scale went from ${startScale} to ${endScale} with no value between them: the panel jumps, it does not animate` };
  }
  return { kind: 'ok', why: `${n} samples, ${between.length} strictly between ${startScale} and ${endScale}` };
}
