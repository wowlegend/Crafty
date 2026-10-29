import { useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';

/**
 * AspectHintToast -- the just-in-time Aspect-unlock teaching toast. store.aspectHint is set on the FIRST unlock of an
 * Aspect verb-talent (game/aspectHints.js: a dictionary key and the key to press); this hands it to the one
 * notification channel (ui/notifications.js), which shows it in the toast stack in the player's language, and clears
 * it. The unlock happens in the Talents panel, where the toast stack is not drawn, so the hint waits until play is
 * `live` again (the stack's own condition, in HUD.jsx) and teaches the verb as the player returns to the world. In
 * capture nothing unlocks, and nothing is sent.
 */
export default function AspectHintToast({ live }) {
  const hint = useGameStore((s) => s.aspectHint);
  useEffect(() => {
    if (!hint || !live || isCaptureMode()) return;
    const s = useGameStore.getState();
    s.addNotification?.(hint.key, 'success', { vars: hint.vars });
    s.setAspectHint(null);
  }, [hint, live]);
  return null;
}
