import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './cn.js';

// Bold-flat panel: SOLID navy fill · uniform 4px ink border · hard offset shadow
// · radius <=14. No glass/blur. variant tweaks the fill + shadow depth only.
const panel = cva(
  'border-chrome border-ink text-text font-body',
  {
    variants: {
      variant: {
        base:  'bg-panel rounded-md shadow-elev-md',
        raise: 'bg-panel-raise rounded-md shadow-elev-lg',
        inset: 'bg-panel-inset rounded-sm shadow-none',
      },
    },
    defaultVariants: { variant: 'base' },
  },
);

export const Panel = forwardRef(function Panel({ variant, className, ...props }, ref) {
  return <div ref={ref} className={cn(panel({ variant }), className)} {...props} />;
});
