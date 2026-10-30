// wheelStep.js — the scroll wheel walks the hotbar one slot per notch, not one per event.
//
// The hotbar moved a slot on every wheel event, whatever its size or direction: a trackpad swipe (dozens of small events
// and a momentum tail after the fingers lift) spun it through 30 slots, a 0.01 px nudge moved it, a sideways swipe walked
// it backwards, and with a coal, iron or potion tile selected (not a hotbar block) the wheel did nothing at all
// (AUDIT:input:wheel-hotbar-per-event).
//
// What a notch reports differs by browser and platform (deltaY per notch, measured and published by others, collected in
// the lane's DECISIONS entry): Chrome on Windows 100 px, on Linux 120 px; Firefox 3 lines (deltaMode 1) on Windows and
// Linux, 16 px on macOS; Chrome and Safari on macOS 4 px for a slow notch and up to 400 px for a fast spin. A trackpad
// starts near 1 px. So no single pixel threshold can be one notch: 100 px would make a macOS mouse need 25 notches a slot.
// The rule here: a GESTURE is a run of events in one direction with no gap over GESTURE_GAP_MS. Its first slot comes once
// it has moved START_PX (the smallest notch any of those reports), and each further slot every STEP_PX more. A slow notch
// on any wheel is its own gesture and moves one slot; a fast spin on Windows or Linux moves one per notch; a trackpad swipe
// moves one or two; a 0.01 px nudge and a sideways swipe move none. One event moves at most one slot.

/** The smallest notch any browser reports (a slow notch in Chrome or Safari on macOS: 4.0002 px). */
export const START_PX = 4;
/** Each further slot within one gesture: one notch in Chrome on Windows. */
export const STEP_PX = 100;
/** A pause longer than this starts a new gesture. Trackpad and momentum events arrive about every frame (16 ms). */
export const GESTURE_GAP_MS = 80;
const LINE_PX = 40;
const PAGE_PX = 800;

/**
 * A stepper for one listener. Feed it every wheel event; it returns -1, 0 or +1 slots.
 * @returns {(e: { deltaX?: number, deltaY?: number, deltaMode?: number, timeStamp: number }) => -1 | 0 | 1}
 */
export function makeWheelStepper() {
  let moved = 0;
  let dir = 0;
  let last = -Infinity;
  let stepped = false;
  return (e) => {
    const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1;
    const dy = (e.deltaY || 0) * unit;
    const dx = (e.deltaX || 0) * unit;
    // A sideways swipe, or a mostly sideways one, is not a scroll through the bar.
    if (dy === 0 || Math.abs(dy) <= Math.abs(dx)) return 0;
    const sign = dy > 0 ? 1 : -1;
    if (e.timeStamp - last > GESTURE_GAP_MS || sign !== dir) {
      moved = 0;
      stepped = false;
      dir = sign;
    }
    last = e.timeStamp;
    moved += Math.abs(dy);
    if (moved < (stepped ? STEP_PX : START_PX)) return 0;
    moved = 0;
    stepped = true;
    return sign;
  };
}

/**
 * PURE. The hotbar slot `step` slots on from `index` in a bar of `size`. A selection that is not on the bar (index -1:
 * a coal, iron or potion tile chosen from the inventory) comes back to the first slot, so the wheel is never dead.
 */
export function nextHotbarSlot(index, step, size) {
  if (index < 0) return 0;
  return (index + step + size) % size;
}
