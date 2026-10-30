import { forwardRef } from 'react';
import { cn } from './cn.js';
import { Icon } from './Icon.jsx';
import { isCaptureMode } from '../../devtest/captureMode';
import { ON_WORLD_TEXT } from '../onWorldText.js';

// Bold-flat stat bar (comp): an optional small colored game-icon to the LEFT, then an
// inset track (deep groove + 4px ink frame + hard offset) with a flat saturated fill
// and a tabular-nums value. Fill color tracks the kind (health=danger/red,
// mana=info/blue, xp=accent/gold, ember=ember-gold). Fill width is clamped 0..100%.
//
// `slim`: the HUD at rest (DECISIONS 2026-10-29 item 99). A 14 px row: a 10 px track with no offset shadow, and the label
// and value beside it on the world in ink-outlined type (ui/onWorldText.js), since a track that thin holds no text.
const FILL = { health: 'bg-danger', mana: 'bg-info', xp: 'bg-accent', ember: 'bg-ember' };
const ICON_COLOR = { health: 'text-danger', mana: 'text-info', xp: 'text-accent', ember: 'text-ember' };

export const StatBar = forwardRef(function StatBar(
  { kind = 'health', value = 0, max = 100, showValue = false, label, icon, slim = false, className, ...props }, ref) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * 100;
  const shown = Math.round(Math.max(0, Math.min(value, max)));
  const fill = <div data-fill className={cn('h-full', FILL[kind] || 'bg-accent', !isCaptureMode() && 'transition-[width] duration-300 ease-out')} style={{ width: `${pct}%` }} />;
  if (slim) {
    return (
      <div ref={ref} className={cn('inline-flex items-center gap-1.5 h-3.5', className)} {...props}>
        {icon && <Icon name={icon} size={14} className={cn('flex-none', ICON_COLOR[kind] || 'text-accent')} />}
        <div className="relative h-2.5 flex-1 bg-track rounded-sm border border-ink overflow-hidden">{fill}</div>
        {(showValue || label) && (
          <span className="flex-none text-[11px] leading-none font-bold text-text whitespace-nowrap" style={ON_WORLD_TEXT}>
            {label && <span className="mr-1">{label}</span>}
            {showValue && <span className="tabular-nums">{shown}/{max}</span>}
          </span>
        )}
      </div>
    );
  }
  return (
    <div ref={ref} className={cn('inline-flex items-center gap-2', className)} {...props}>
      {icon && <Icon name={icon} size={18} className={ICON_COLOR[kind] || 'text-accent'} />}
      <div className="relative h-5 flex-1 bg-track rounded-md border-chrome border-ink shadow-elev-sm overflow-hidden">
        {fill}
        {(showValue || label) && (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-body text-text">
            {label && <span className="mr-1">{label}</span>}
            {showValue && <span className="tabular-nums">{shown}/{max}</span>}
          </div>
        )}
      </div>
    </div>
  );
});
