import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './cn.js';

// Inventory/hotbar cell. Empty = inset slot fill + ink. rarity tints the border
// (common keeps the plain ink). selected adds a gold ring. Always 4px ink (the
// world-outline tie). square via aspect-square; size set by the parent (w-*).
const slot = cva(
  'relative grid place-items-center aspect-square bg-slot rounded-sm border-chrome ' +
  'shadow-elev-sm overflow-hidden',
  {
    variants: {
      rarity: {
        none:      'border-ink',
        common:    'border-rarity-common',
        rare:      'border-rarity-rare',
        epic:      'border-rarity-epic',
        legendary: 'border-rarity-legendary',
      },
      selected: { true: 'ring-2 ring-accent ring-offset-0', false: '' },
    },
    defaultVariants: { rarity: 'none', selected: false },
  },
);

export const Slot = forwardRef(function Slot({ rarity = 'none', selected = false, className, children, ...props }, ref) {
  return (
    <div ref={ref} className={cn(slot({ rarity, selected }), className)} {...props}>
      {children}
    </div>
  );
});
