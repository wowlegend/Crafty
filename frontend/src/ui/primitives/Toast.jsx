import { forwardRef } from 'react';
import { cn } from './cn.js';

// Bold-flat toast: solid panel + 4px ink border + hard offset + a status-colored
// LEFT bar. Entry animation is the caller's job (wrap in framer-motion) — the
// primitive is presentational. `display` and `pad` replace those defaults by name, since a same-property class
// in className would not reliably win.
const STATUS = { info: 'border-l-info', success: 'border-l-success', warn: 'border-l-warn', danger: 'border-l-danger' };

export const Toast = forwardRef(function Toast(
  { status = 'info', display = 'inline-flex', pad = 'px-4 py-2', className, ...props }, ref) {
  return (
    <div
      ref={ref}
      role={status === 'danger' || status === 'warn' ? 'alert' : 'status'}
      className={cn(display, 'items-center gap-2 bg-panel text-text border-chrome border-ink rounded-md shadow-elev-md font-body border-l-8', pad, STATUS[status], className)}
      {...props}
    />
  );
});
