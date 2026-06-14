import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { useGameSounds } from '../SoundManager';

/**
 * UISounds -- soft open/close foley when the core panel layer toggles (inventory / craft / build / magic).
 * A single edge-watcher: those booleans change rarely (not per-frame), so a reactive store read is safe
 * (Game-Loop-Isolation). Renders nothing. Capture-safe: audio is null under capture -> no baseline effect.
 */
export default function UISounds() {
  const open = useGameStore((s) => s.showInventory || s.showCrafting || s.showMagic || s.showBuildingTools);
  const { playUIOpen, playUIClose } = useGameSounds();
  const prev = useRef(open);
  useEffect(() => {
    if (open && !prev.current) playUIOpen?.();
    else if (!open && prev.current) playUIClose?.();
    prev.current = open;
  }, [open, playUIOpen, playUIClose]);
  return null;
}
