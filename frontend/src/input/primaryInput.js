/**
 * primaryInput.js — the primary attack's press and release, as the game publishes them to every input that has a
 * release (touch-hold lane, review round 3; plan docs/superpowers/plans/2026-10-27-crafty-touch-hold.md).
 *
 * WHY THIS IS ITS OWN MODULE. The input-time hold (heavyAttack.inputTime) is only as good as the wiring that hands it
 * the event's time, and that wiring lived inline in Components.jsx's input effect, where no unit gate reaches: a store
 * wrapper that dropped the time (`releasePrimary: (source) => releaseHeavySwing(source)`) or a call with its arguments
 * swapped stayed green across the whole suite (review round 3, K12 / K13). So the press, the release and the store
 * publication live here, with their dependencies injected, and tests/gates/primary-input-gates.test.js drives the
 * PUBLISHED seams the touch overlay calls against the real heavyAttack module — the same move round 2 made with
 * compatMouse.installPrimaryMouse.
 *
 * WHAT IT DOES.
 *  - pressPrimary(button, source, at): the press runs the verb (the light swing, a mine, a cast — performVerb), and a
 *    left press that ATTACKED starts the heavy's charge for `source`, counted from `at` (the press event's own time)
 *    when the caller has it. Not in a beast form (R9.2: the form drops `heavy`, so a charge there only slowed the walk
 *    and threw a free light swing) and not with the voidhand full (R9.3).
 *  - releasePrimary(source, at): the input `source` came up. With input dead (paused, a panel, death) the charge is
 *    CANCELLED, never thrown; otherwise a release that finds the charge ready throws the heavy, the hold read on `at`
 *    (the lift event's own time) when the caller has it, so a tap whose lift is handled late is still a tap.
 *  - the store gets { performVerb, pressPrimary, releasePrimary } — the overlay's touch action button dispatches
 *    through those (Phase 0c) — and remove() clears them, so no stale closure survives a remount.
 *
 * `now` is the handler's clock (performance.now in the game); `at` is used only when it is a reading on that clock
 * (heavyAttack.inputTime). Pure wiring: no React, no DOM, no Three.
 */
import { pressHeavy, releaseHeavy, cancelHeavy } from '../game/heavyAttack.js';

/**
 * @param {{ performVerb: (button: number) => string | undefined, setState: (patch: object) => void,
 *           getState: () => { voidhandHeld?: boolean, beastFormActive?: boolean },
 *           isInputLive: () => boolean, throwHeavy: () => void, now: () => number }} deps
 * @returns {{ pressPrimary(button: number, source: string, at?: number): string | undefined,
 *             releasePrimary(source: string, at?: number): void, pressKey(at?: number): void,
 *             presses(): Record<string, number>, verbs(): Record<string, string | null>, remove(): void }}
 */
export function installPrimaryInput({ performVerb, setState, getState, isInputLive, throwHeavy, now }) {
  // Presses per source, for the dev test bridge: the e2e F2 case asserts a real tap presses once as 'touch' and never
  // as 'mouse'. One integer per press, not per frame. `verbs` is the verb each source's last press was routed to, null
  // when the router refused it (input dead, no body): a failed click then names the verb it became.
  const presses = { mouse: 0, touch: 0 };
  const verbs = { mouse: null, touch: null };
  const pressPrimary = (button, source, at) => {
    presses[source] = (presses[source] || 0) + 1;
    const verb = performVerb(button);
    verbs[source] = verb ?? null;
    const st = getState();
    if (button === 0 && verb === 'attack' && !st.voidhandHeld && !st.beastFormActive) pressHeavy(now(), source, at);
    return verb;
  };
  // `source` is the input coming up: only the one holding the charge can release it (R9.3 — T's keyup used to end a
  // charge the mouse held).
  const releasePrimary = (source, at) => {
    const t = now();
    if (!isInputLive()) { cancelHeavy(); return; }
    if (releaseHeavy(t, source, at)) throwHeavy();
  };
  // T, the melee key (Kevin 2026-06-28), has no verb router: Components swings at its keydown, and the charge is the
  // primary's rule for the 'key' source, counted from the keydown's own time. Its keyup is releasePrimary('key', at).
  const pressKey = (at) => {
    const st = getState();
    if (!st.voidhandHeld && !st.beastFormActive) pressHeavy(now(), 'key', at);
  };
  setState({ performVerb, pressPrimary, releasePrimary });
  return {
    pressPrimary,
    releasePrimary,
    pressKey,
    presses: () => ({ ...presses }),
    verbs: () => ({ ...verbs }),
    remove: () => setState({ performVerb: null, pressPrimary: null, releasePrimary: null }),
  };
}
