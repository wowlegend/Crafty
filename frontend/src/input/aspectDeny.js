// aspectDeny.js — a pressed Aspect verb that is not unlocked teaches the unlock path, once, at the press (Components.jsx
// keydown). An unlocked verb the ember bar cannot pay for is not judged here: whether a press would start its verb but for
// the price depends on gates only the frame loop sees (a target in the aim, a pair near, a charge already running), so
// each Aspect reducer returns 'short' or 'unpaid' and the frame loop raises that notice.
//
// The keydown listener is on window, so a letter typed into a text field, pressed behind a panel or VICTORY, or pressed
// while dead reaches it. On touch the input gate stays up under those surfaces, so the gate alone is not the answer: the
// Aspect machines in the frame loop read isInputLive (input/inputLive.js), and a press they would ignore says nothing
// (Shift arms no dodge then either). The check sits here, where no caller can leave it out, as routeExpressVerb keeps its
// own (input/expressVerbs.js).
import { notifyDenied } from '../ui/denyToast';
import { ASPECT_VERBS } from './aspectWheel.js';
import { getInput } from './inputState.js';
import { isInputLive } from './inputLive.js';

/** @returns {'aspect-locked'|null} the reason given, or null when the press is not refused for it. */
export function denyAspectPress(verb, state) {
  const row = ASPECT_VERBS.find((a) => a.verb === verb);
  if (!row || !state || !isInputLive(state, getInput().active)) return null;
  if (!((state.unlockedTalents?.[row.talent] ?? 0) > 0)) {
    notifyDenied('aspect-locked', row.aspect);
    return 'aspect-locked';
  }
  return null;
}
