// A PANEL'S TRANSITION, SAMPLED ON THE FRAMES THE PAGE DRAWS, AND JUDGED (W2-L, tests/e2e/lazy-motion.spec.js).
//
// Kept out of the spec so a unit gate can drive both halves (tests/gates/motion-sample-gates.test.jsx): the sampler
// against the real talents panel in jsdom, the verdict against series whose answer is known by construction.
//
// WHAT IS SAMPLED, per drawn frame: the dialog's computed opacity and the card's inline scale and y. framer-motion runs
// scale and y from JavaScript against the wall clock (a spring that takes 350 ms is over after 350 ms however few frames
// were drawn) and hands opacity to the Web Animations API (the browser's document timeline). CI's software-rendered
// frames land 130 to 620 ms apart (the first attempt of this spec on CI read 0.9 at 921 ms and 1 at 1539 ms), so a
// transition that lasts 300 ms can fall between two frames. The spec therefore slows the document timeline with CDP
// (Animation.setPlaybackRate) before it opens the panel: the opacity fade then lasts seconds, and every frame drawn in
// that time shows a value between its ends. Scale and y are not slowed; a frame that lands in their window still counts.
//
// THE START IS READ AT INSERTION, by a MutationObserver, which runs before the first paint: it is the `initial` state the
// element was rendered with, whatever the first drawn frame shows.

/** In the page (Playwright serialises this function: it closes over nothing). Arms a sampler that waits for the element
 *  with `data-testid=testid`, takes its parent (the card, a motion element) and its dialog ancestor, and records
 *  `{ t, scale, y, opacity }` at insertion and on every frame after, until the end state has been read `settleFrames`
 *  times running or `deadlineMs` has passed. The result is on window.__motionSamples: { frames, done, target }. `target`
 *  says which elements were sampled. */
export function installMotionSampler({ testid, endScale = 1, endY = 0, endOpacity = 1, settleFrames = 3, deadlineMs = 30000 }) {
  const out = { frames: [], done: false, target: null, startedAt: performance.now() };
  window.__motionSamples = out;
  let card = null;
  let dialog = null;
  const read = () => {
    const tf = card.style.transform || '';
    const scale = /scale\(\s*([-\d.e]+)/.exec(tf);
    const y = /translateY\(\s*([-\d.e]+)px/.exec(tf);
    return {
      t: Math.round(performance.now() - out.startedAt),
      scale: scale ? Number(scale[1]) : 1,
      y: y ? Number(y[1]) : 0,
      opacity: dialog ? Number(getComputedStyle(dialog).opacity) : NaN,
    };
  };
  let settled = 0;
  const frame = () => {
    if (out.done) return;
    const f = read();
    out.frames.push(f);
    const atEnd = Math.abs(f.scale - endScale) < 1e-3 && Math.abs(f.y - endY) < 0.05 && Math.abs(f.opacity - endOpacity) < 1e-3;
    settled = atEnd ? settled + 1 : 0;
    if (settled >= settleFrames || performance.now() - out.startedAt > deadlineMs) { out.done = true; return; }
    requestAnimationFrame(frame);
  };
  const watch = new MutationObserver(() => {
    const panel = document.querySelector(`[data-testid="${testid}"]`);
    if (!panel || !panel.parentElement) return;
    watch.disconnect();
    card = panel.parentElement;
    dialog = panel.closest('[role="dialog"]');
    const name = (e) => (e ? `${e.tagName.toLowerCase()}.${String(e.className).split(/\s+/)[0] || ''}` : 'none');
    out.target = `card ${name(card)}, dialog ${name(dialog)}`;
    out.frames.push(read()); // the start: before any frame is drawn
    requestAnimationFrame(frame);
  });
  watch.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => { if (!card) { watch.disconnect(); out.done = true; } }, deadlineMs); // never inserted: the spec says so
  return true;
}

/** The verdict on a sampled series. kind: 'ok'; 'fail' (the transition is wrong); 'setup' (the series cannot judge:
 *  the element never appeared, or too few frames were drawn). `why` names what was seen, with the denominator. A
 *  transition is seen when scale or opacity takes a value strictly between its start and its end on some frame. */
export function judgeMotion(frames, { startScale = 0.9, endScale = 1, endY = 0, startOpacity = 0, endOpacity = 1, minFrames = 4, tol = 1e-3 } = {}) {
  const n = frames.length;
  if (n === 0) return { kind: 'setup', why: 'the panel was never inserted, so nothing was sampled' };
  const first = frames[0];
  if (Math.abs(first.scale - startScale) > tol) {
    return { kind: 'setup', why: `the first sample (at insertion) read scale ${first.scale}, not the initial ${startScale}: the sampled element is not the panel's motion element, or it was inserted already animated` };
  }
  if (!(Math.abs(first.opacity - startOpacity) <= tol)) {
    return { kind: 'setup', why: `the first sample (at insertion) read opacity ${first.opacity}, not the initial ${startOpacity}: the panel has no dialog ancestor, or it was inserted already animated` };
  }
  if (n < minFrames) return { kind: 'setup', why: `only ${n} samples (${minFrames} needed): too few frames were drawn to judge a transition` };
  const last = frames[n - 1];
  if (Math.abs(last.scale - endScale) > tol || Math.abs(last.y - endY) > 0.05 || !(Math.abs(last.opacity - endOpacity) <= tol)) {
    return { kind: 'fail', why: `after ${n} samples the panel never reached its end (scale ${last.scale}, y ${last.y}, opacity ${last.opacity}; wanted ${endScale}, ${endY}, ${endOpacity}): it is frozen at its initial state, so nothing animates` };
  }
  const scaleMid = frames.filter((f) => f.scale > startScale + tol && f.scale < endScale - tol).length;
  const opacityMid = frames.filter((f) => f.opacity > startOpacity + tol && f.opacity < endOpacity - tol).length;
  if (scaleMid + opacityMid === 0) {
    return { kind: 'fail', why: `in ${n} samples neither scale (${startScale} to ${endScale}) nor opacity (${startOpacity} to ${endOpacity}) took a value between its ends: the panel jumps, it does not animate` };
  }
  return { kind: 'ok', why: `${n} samples; strictly between the ends: scale on ${scaleMid}, opacity on ${opacityMid}` };
}
