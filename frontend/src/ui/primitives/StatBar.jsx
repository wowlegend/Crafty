import { forwardRef } from 'react';
import { cn } from './cn.js';
import { Icon } from './Icon.jsx';

// Bold-flat stat bar (comp): an optional small colored game-icon to the LEFT, then an
// inset track (deep groove + 4px ink frame + hard offset) with a flat saturated fill
// and a tabular-nums value. Fill color tracks the kind (health=danger/red,
// mana=info/blue, hunger=warn/amber, xp=accent/gold). Fill width is clamped 0..100%.
const FILL = { health: 'bg-danger', mana: 'bg-info', hunger: 'bg-warn', xp: 'bg-accent', ferocity: 'bg-ferocity', kinetic: 'bg-kinetic', soul: 'bg-soul' };
const ICON_COLOR = { health: 'text-danger', mana: 'text-info', hunger: 'text-warn', xp: 'text-accent', ferocity: 'text-ferocity', kinetic: 'text-kinetic', soul: 'text-soul' };

export const StatBar = forwardRef(function StatBar(
  { kind = 'health', value = 0, max = 100, showValue = false, label, icon, className, ...props }, ref) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * 100;
  const shown = Math.round(Math.max(0, Math.min(value, max)));
  return (
    <div ref={ref} className={cn('inline-flex items-center gap-2', className)} {...props}>
      {icon && <Icon name={icon} size={18} className={ICON_COLOR[kind] || 'text-accent'} />}
      <div className="relative h-5 flex-1 bg-track rounded-md border-chrome border-ink shadow-elev-sm overflow-hidden">
        <div data-fill className={cn('h-full', FILL[kind] || 'bg-accent')} style={{ width: `${pct}%` }} />
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
