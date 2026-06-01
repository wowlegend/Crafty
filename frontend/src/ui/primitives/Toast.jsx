import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './cn.js';

// Bold-flat toast: solid panel + 4px ink border + hard offset + a status-colored
// LEFT bar. Entry animation is the caller's job (wrap in framer-motion) — the
// primitive is presentational.
const toast = cva(
  'inline-flex items-center gap-2 bg-panel text-text border-chrome border-ink rounded-md shadow-elev-md px-4 py-2 font-body border-l-8',
  {
    variants: {
      status: { info: 'border-l-info', success: 'border-l-success', warn: 'border-l-warn', danger: 'border-l-danger' },
    },
    defaultVariants: { status: 'info' },
  },
);
export const Toast = forwardRef(function Toast({ status, className, ...props }, ref) {
  return <div ref={ref} role={status === 'danger' || status === 'warn' ? 'alert' : 'status'} className={cn(toast({ status }), className)} {...props} />;
});
