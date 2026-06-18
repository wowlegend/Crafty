import React from 'react';
import { isCaptureMode } from '../devtest/captureMode';
import { isTouchUIMode } from '../input/touchDevice';
import { Icon } from './primitives/index.js';

// A compact bottom-left scrolling combat-log ticker. Renders the LAST N entries of the existing
// addNotification stream (QuestSystem.jsx) — the same data the corner toasts use — as a quiet,
// chat-style feed for the classic-RPG "what just happened" read. Capture-SUPPRESSED (returns null)
// so the 20 deterministic visual baselines stay byte-identical. Collapses to fewer lines on touch.
// The type->icon/colour maps mirror QuestSystem's NOTIF_ICON/NOTIF_STATUS so the log reads
// consistently with the corner toasts (same glyph per event type; lucide names verified in use there).
const TYPE_COLOR = {
  quest: 'text-success', achievement: 'text-accent', reward: 'text-success',
  loot: 'text-info', danger: 'text-danger', warn: 'text-warn', warning: 'text-warn',
  success: 'text-success', info: 'text-text-muted',
};
const TYPE_ICON = {
  quest: 'check', achievement: 'trophy', reward: 'gift', loot: 'gift',
  danger: 'skull', warn: 'warning', warning: 'warning', success: 'check', info: 'sparkles',
};

export const CombatLog = React.memo(({ notifications = [] }) => {
  if (isCaptureMode()) return null;
  const lines = notifications.slice(-(isTouchUIMode() ? 4 : 8));
  if (lines.length === 0) return null;
  return (
    <div className="absolute bottom-24 left-4 z-10 pointer-events-none space-y-0.5 max-w-[320px]">
      {lines.map((n) => (
        // text-shadow + icon drop-shadow keep the quiet (no-panel) feed legible over ANY world backdrop
        // (e.g. green "Quest Complete" over bright grass) without a heavy toast panel.
        <div key={n.id} className="flex items-center gap-1.5 text-[11px] font-medium opacity-90"
             style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.85)' }}>
          <Icon name={TYPE_ICON[n.type] || 'sparkles'} size={11} className={`flex-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${TYPE_COLOR[n.type] || 'text-text-muted'}`} />
          <span className={TYPE_COLOR[n.type] || 'text-text'}>{n.text}</span>
        </div>
      ))}
    </div>
  );
});
