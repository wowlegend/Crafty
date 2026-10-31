/**
 * useSpellAnchor.js — React projection of where the touch spell row sits: its right anchor in px, from the viewport's
 * height (aspectWheel.js `spellAnchorRight`, review round 2).
 *
 * Both touch layers read it — the hit-targets (TouchControls) and the glyphs (TouchControlsSurface) — so the two cannot
 * place the row differently. It subscribes to `resize`, which fires on rotation and as Safari's toolbars come and go; the
 * snapshot is a NUMBER that changes only when the viewport crosses the height where the stack stops fitting, so React
 * re-renders on that transition alone (Game-Loop Isolation: a rare event, never a per-frame read).
 */
import { useSyncExternalStore } from 'react';
import { spellAnchorRight } from './aspectWheel';
import { subscribeResize } from '../ui/hudLayout.js';

const snapshot = () => spellAnchorRight(window.innerHeight);

export function useSpellAnchorRight() {
  return useSyncExternalStore(subscribeResize, snapshot, snapshot);
}
