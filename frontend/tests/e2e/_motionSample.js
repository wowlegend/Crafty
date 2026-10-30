// A PANEL'S TRANSITION, SAMPLED ON THE FRAMES THE PAGE DRAWS, AND JUDGED (W2-L, tests/e2e/lazy-motion.spec.js).
//
// Kept out of the spec so a unit gate can drive both halves (tests/gates/motion-sample-gates.test.jsx): the sampler
// against the real talents panel in jsdom, the verdict against series whose answer is known by construction.
//
// WHAT IS SAMPLED, per drawn frame: the card's inline scale and y and the dialog's computed opacity. framer-motion runs
// scale and y from JavaScript against the clock it reads with performance.now() (the springs cross from their start to
// their end in about 125 ms and settle, y overshooting, in about 350 ms, however few frames were drawn) and hands opacity to the Web Animations API.
//
// WHY THE PAGE'S CLOCK IS SLOWED. CI's software-rendered frames land 130 to 620 ms apart, and the first attempt of the
// spec on CI read scale 0.9 at 921 ms and 1 at 1539 ms: the spring fit between two frames and no frame was drawn between
// its ends. So the sampler, at the moment it sees the panel inserted, replaces performance.now with a clock that runs at
// `clockFactor` of real time (0.02: a fiftieth), continuous at the switch. framer-motion reads performance.now() on every
// frame of its loop, so the crossing now takes 6 s of real time and the settle 17 s, and a frame drawn in the first
// window shows a value between the ends: ten of them at the slowest cadence seen, 620 ms. A second attempt slowed the document timeline with CDP Animation.setPlaybackRate instead, to
// stretch the opacity fade; on CI the fade then made almost no progress in two minutes (opacity 0.012 after 6765 frames),
// so that route was dropped. The fade is not slowed here: it is read when a frame happens to fall in it, and the verdict
// does not need it. The sampler puts the clock back when it finishes, and the spec puts it back again in a finally.
//
// THE START IS READ AT INSERTION, by a MutationObserver, which runs before the first paint: it is the `initial` state the
// element was rendered with, whatever the first drawn frame shows.

/** In the page (Playwright serialises this function: it closes over nothing). Arms a sampler that waits for the element
 *  with `data-testid=testid`, takes its parent (the card, a motion element) and its dialog ancestor, and records
 *  `{ t, scale, y, opacity }` at insertion and on every frame after, until the end state has been read `settleFrames`
 *  times running or `deadlineMs` of real time has passed. With `clockFactor` below 1 it slows performance.now from the
 *  insertion until it finishes. The result is on window.__motionSamples: { frames, done, target, clockFactor }. */
export function installMotionSampler({ testid, endScale = 1, endY = 0, endOpacity = 1, settleFrames = 3, deadlineMs = 30000, clockFactor = 1 }) {
  const out = { frames: [], done: false, target: null, startedAt: Date.now(), clockFactor };
  window.__motionSamples = out;
  let card = null;
  let dialog = null;
  const restoreClock = () => { if (Object.prototype.hasOwnProperty.call(performance, 'now')) delete performance.now; };
  const slowClock = () => {
    const real = performance.now.bind(performance);
    const base = real();
    performance.now = () => base + (real() - base) * clockFactor;
  };
  const read = () => {
    const tf = card.style.transform || '';
    const scale = /scale\(\s*([-\d.e]+)/.exec(tf);
    const y = /translateY\(\s*([-\d.e]+)px/.exec(tf);
    return {
      t: Date.now() - out.startedAt,
      scale: scale ? Number(scale[1]) : 1,
      y: y ? Number(y[1]) : 0,
      opacity: dialog ? Number(getComputedStyle(dialog).opacity) : NaN,
    };
  };
  const finish = () => { out.done = true; restoreClock(); };
  let settled = 0;
  const frame = () => {
    if (out.done) return;
    const f = read();
    out.frames.push(f);
    const atEnd = Math.abs(f.scale - endScale) < 1e-3 && Math.abs(f.y - endY) < 0.05 && Math.abs(f.opacity - endOpacity) < 1e-3;
    settled = atEnd ? settled + 1 : 0;
    if (settled >= settleFrames || Date.now() - out.startedAt > deadlineMs) { finish(); return; }
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
    if (clockFactor < 1) slowClock();
    out.frames.push(read()); // the start: before any frame is drawn
    requestAnimationFrame(frame);
  });
  watch.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => { if (!card) { watch.disconnect(); finish(); } }, deadlineMs); // never inserted: the spec says so
  return true;
}

/** For a unit gate (Node side, never serialised): slows performance.now to `factor` of real time from this moment,
 *  continuous at the switch, the same clock installMotionSampler installs in the page. The sampler keeps its own copy
 *  inline because Playwright serialises it and a closure over this function would not survive. framer-motion reads
 *  performance.now() on every frame and its springs and tweens run against that clock, so at a tenth a 350 ms spring
 *  lasts 3.5 s and a frame that stalls for a second still lands inside it. Undo with restorePageClock. */
export function slowPageClock(factor) {
  const real = performance.now.bind(performance);
  const base = real();
  performance.now = () => base + (real() - base) * factor;
}

/** In the page: puts performance.now back, whatever state the sampler was left in. Returns whether an override remains. */
export function restorePageClock() {
  if (Object.prototype.hasOwnProperty.call(performance, 'now')) delete performance.now;
  return Object.prototype.hasOwnProperty.call(performance, 'now');
}

/** The verdict on a sampled series. kind: 'ok'; 'fail' (the transition is wrong); 'setup' (the series cannot judge:
 *  the element never appeared, or too few frames were drawn). `why` names what was seen, with the denominator. A
 *  transition is seen when scale or opacity takes a value strictly between its start and its end on some frame. */
export function judgeMotion(frames, { startScale = 0.9, endScale = 1, startY = 30, endY = 0, startOpacity = 0, endOpacity = 1, minFrames = 4, tol = 1e-3 } = {}) {
  const n = frames.length;
  if (n === 0) return { kind: 'setup', why: 'the panel was never inserted, so nothing was sampled' };
  const first = frames[0];
  if (Math.abs(first.scale - startScale) > tol) {
    return { kind: 'setup', why: `the first sample (at insertion) read scale ${first.scale}, not the initial ${startScale}: the sampled element is not the panel's motion element, or it was inserted already animated` };
  }
  if (Math.abs(first.y - startY) > 0.05) {
    return { kind: 'setup', why: `the first sample (at insertion) read y ${first.y}, not the initial ${startY}: the sampled element is not the panel's motion element, or it was inserted already animated` };
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
  const yMid = frames.filter((f) => f.y > endY + 0.05 && f.y < startY - 0.05).length;
  const opacityMid = frames.filter((f) => f.opacity > startOpacity + tol && f.opacity < endOpacity - tol).length;
  if (scaleMid + yMid + opacityMid === 0) {
    return { kind: 'fail', why: `in ${n} samples none of scale (${startScale} to ${endScale}), y (${startY} to ${endY}) and opacity (${startOpacity} to ${endOpacity}) took a value between its ends: the panel jumps, it does not animate` };
  }
  return { kind: 'ok', why: `${n} samples; strictly between the ends: scale on ${scaleMid}, y on ${yMid}, opacity on ${opacityMid}` };
}
