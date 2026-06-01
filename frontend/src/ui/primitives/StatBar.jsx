import { forwardRef } from 'react';
import { cn } from './cn.js';

const FILL = { health: 'bg-danger', mana: 'bg-info', hunger: 'bg-warn', xp: 'bg-accent' };

// Bold-flat stat bar: inset track + 4px ink frame + hard offset + a flat saturated
// fill. Value label is tabular-nums (IB-grade numerics). Fill width is clamped 0..100%.
export const StatBar = forwardRef(function StatBar(
  { kind = 'health', value = 0, max = 100, showValue = false, label, className, ...props }, ref) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * 100;
  const shown = Math.round(Math.max(0, Math.min(value, max)));
  return (
    <div ref={ref} className={cn('relative h-5 w-44 bg-panel-inset rounded-sm border-chrome border-ink shadow-elev-sm overflow-hidden', className)} {...props}>
      <div data-fill className={cn('h-full', FILL[kind] || 'bg-accent')} style={{ width: `${pct}%` }} />
      {(showValue || label) && (
        <div className="absolute inset-0 flex items-center justify-center text-xs font-body text-text">
          {label && <span className="mr-1">{label}</span>}
          {showValue && <span className="tabular-nums">{shown}/{max}</span>}
        </div>
      )}
    </div>
  );
});
