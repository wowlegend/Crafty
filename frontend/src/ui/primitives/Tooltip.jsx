import { forwardRef } from 'react';
import { cn } from './cn.js';
// Minimal bold-flat tooltip surface (positioning is the caller's concern in M1).
export const Tooltip = forwardRef(function Tooltip({ className, ...props }, ref) {
  return <div ref={ref} role="tooltip" className={cn('inline-block bg-ink text-text text-sm font-body rounded-sm px-2 py-1 shadow-elev-sm', className)} {...props} />;
});
