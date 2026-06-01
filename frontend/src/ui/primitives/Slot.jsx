import { forwardRef } from 'react';
import { cn } from './cn.js';
import { RARITY_FILL } from '../../theme/tokens.js';

// Inventory/hotbar/gear cell — bold-flat comp. A filled tile (rarity or gear) is a
// flat-saturated 2-stop vertical gradient + a thin colored INNER ring + the 2-tone
// icon color (the child <Icon> inherits via currentColor). Empty = the lighter slot
// slate. selected adds a gold accent border + a 3px gold ring on top of the hard
// offset shadow. Gradients + composed inset shadows are inline (they don't map to the
// single-color --ui-* token layer); the ink in inline shadows = rgb(var(--ui-ink)).
const INK = 'rgb(var(--ui-ink))';
const ACCENT = 'rgb(var(--ui-accent))';

export const Slot = forwardRef(function Slot(
  { rarity, gear, selected = false, className, children, ...props }, ref) {
  const fill = gear ? RARITY_FILL.gear : (rarity ? RARITY_FILL[rarity] : null);

  const base = 'relative grid place-items-center aspect-square border-chrome rounded-md overflow-hidden';
  const borderCls = selected ? 'border-accent-raise' : 'border-ink';

  const style = {};
  let cls;
  if (fill) {
    // Filled tile: gradient + inner ring + hard offset. Legendary gets a slightly
    // thicker ring so the gold reads as "premium".
    const rw = rarity === 'legendary' ? 2.5 : 2;
    let boxShadow = `5px 5px 0 0 ${INK}, inset 0 0 0 ${rw}px ${fill.ring}`;
    if (selected) boxShadow += `, 0 0 0 3px ${ACCENT}`;
    style.background = `linear-gradient(180deg, ${fill.from}, ${fill.to})`;
    style.boxShadow = boxShadow;
    style.color = fill.icon; // 2-tone icon color via currentColor
    cls = cn(base, borderCls, className);
  } else {
    // Empty slot: the lighter slot slate + the hard offset shadow.
    if (selected) {
      style.boxShadow = `5px 5px 0 0 ${INK}, 0 0 0 3px ${ACCENT}`;
      cls = cn(base, borderCls, 'bg-slot', className);
    } else {
      cls = cn(base, borderCls, 'bg-slot shadow-elev-md', className);
    }
  }

  return (
    <div ref={ref} className={cls} style={style} {...props}>
      {children}
    </div>
  );
});
