import { forwardRef } from 'react';
import { cn } from './cn.js';

// Bold-flat panel: SOLID navy fill · uniform 4px ink border · hard offset shadow
// · radius <=14. No glass/blur. variant picks the fill, radius and shadow; `bg`, `text`, `radius` and `shadow`
// replace one of those defaults by name, since a same-property class in className would not reliably win.
const VARIANTS = {
  base:  { bg: 'bg-panel', radius: 'rounded-md', shadow: 'shadow-elev-md' },
  raise: { bg: 'bg-panel-raise', radius: 'rounded-md', shadow: 'shadow-elev-lg' },
  inset: { bg: 'bg-panel-inset', radius: 'rounded-sm', shadow: 'shadow-none' },
};

export const Panel = forwardRef(function Panel(
  { variant = 'base', bg, text = 'text-text', radius, shadow, className, ...props }, ref) {
  const v = VARIANTS[variant] ?? VARIANTS.base;
  return (
    <div
      ref={ref}
      className={cn('border-chrome border-ink font-body', bg ?? v.bg, text, radius ?? v.radius, shadow ?? v.shadow, className)}
      {...props}
    />
  );
});
