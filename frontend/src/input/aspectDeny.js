// aspectDeny.js — why a pressed Aspect verb will not fire, said once at the press. The keyboard (Components.jsx keydown)
// and the touch ring (ui/TouchControls.jsx) both call it, so neither is quieter than the other. A locked verb teaches
// the unlock path; an unlocked one the ember bar cannot pay for says so. A press that releases (ending a form, dropping
// a block, disarming an imbue) is not refused and says nothing.
//
// The keydown listener is on window, so a letter typed into a text field or pressed while dead reaches it. Such a press
// does nothing, so it says nothing: the liveness check sits here, where no caller can leave it out, as the dodge's does.
import { notifyDenied } from '../ui/denyToast';
import { emberShort } from '../game/ember.js';
import { ASPECT_VERBS } from './aspectWheel.js';
import { getInput } from './inputState.js';

/** @returns {'aspect-locked'|'no-ember'|null} the reason given, or null when the press is not refused for either. */
export function denyAspectPress(verb, state) {
  const row = ASPECT_VERBS.find((a) => a.verb === verb);
  if (!row || !state || !getInput().active || !state.isAlive) return null;
  if (!((state.unlockedTalents?.[row.talent] ?? 0) > 0)) {
    notifyDenied('aspect-locked', row.aspect);
    return 'aspect-locked';
  }
  if (emberShort(verb, state)) {
    notifyDenied('no-ember');
    return 'no-ember';
  }
  return null;
}
