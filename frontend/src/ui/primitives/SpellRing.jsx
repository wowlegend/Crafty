import { forwardRef } from 'react';
import { cn } from './cn.js';

// Bold-flat spell ring (comp): a circular slot tile with a 4px ink frame + the hard
// offset shadow, holding a game-icon colored by the spell (inherited via currentColor).
// ACTIVE rings border the spell color + bloom a circular fire-glow (the ONLY intended
// glow in the chrome) + a 3px spell-color ring; idle rings dim to opacity-90. An
// optional hotkey badge (e.g. "Q") sits bottom-right. The spell color is the CSS var
// rgb(var(--ui-spell-<spell>)); the ink in inline shadows = rgb(var(--ui-ink)).
const INK = 'rgb(var(--ui-ink))';
const spellColor = (spell) => `rgb(var(--ui-spell-${spell}))`;

export const SpellRing = forwardRef(function SpellRing(
  { spell = 'fire', active = false, keyLabel, size = 56, className, children, ...props }, ref) {
  const color = spellColor(spell);
  const style = { width: size, height: size };
  let cls = 'relative grid place-items-center rounded-full border-chrome bg-slot';

  if (active) {
    style.boxShadow = `5px 5px 0 0 ${INK}, 0 0 26px 4px ${color}, 0 0 0 3px ${color}`;
    style.borderColor = color;
    style.color = color;
    cls = cn(cls, className);
  } else {
    style.boxShadow = `5px 5px 0 0 ${INK}`;
    style.color = color;
    cls = cn(cls, 'border-ink opacity-90', className);
  }

  const iconStyle = active ? { filter: `drop-shadow(0 0 8px ${color})` } : undefined;

  return (
    <div ref={ref} className={cls} style={style} {...props}>
      <span className="grid place-items-center" style={iconStyle}>{children}</span>
      {keyLabel && (
        <span
          className="absolute -bottom-1 -right-1 grid place-items-center w-5 h-5 rounded-[7px] bg-panel-inset text-text text-[11px] font-bold border-[3px] border-ink"
          style={{ boxShadow: `2px 2px 0 0 ${INK}` }}
        >
          {keyLabel}
        </span>
      )}
    </div>
  );
});
