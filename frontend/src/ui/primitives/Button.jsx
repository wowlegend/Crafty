import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './cn.js';

// Bold-flat button: flat saturated fill · 4px ink border · hard offset shadow that
// "presses" on :active (translate + shadow shrink). Motion uses token-aligned
// durations; respects prefers-reduced-motion via the `motion-reduce:` utility.
const button = cva(
  'inline-flex items-center justify-center gap-2 select-none font-display uppercase ' +
  'border-chrome border-ink rounded-md shadow-elev-md ' +
  'transition-[transform,box-shadow] duration-150 ease-out ' +
  'active:translate-x-[3px] active:translate-y-[3px] active:shadow-elev-sm ' +
  'motion-reduce:transition-none motion-reduce:active:translate-x-0 motion-reduce:active:translate-y-0 ' +
  'disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
  {
    variants: {
      variant: {
        primary:   'bg-accent text-text-inverse hover:bg-accent-raise',
        secondary: 'bg-panel-raise text-text hover:bg-panel',
        ghost:     'bg-transparent text-text shadow-none hover:bg-panel-raise',
        danger:    'bg-danger text-text-inverse',
      },
      size: { sm: 'text-sm px-3 py-1.5', md: 'text-base px-4 py-2', lg: 'text-lg px-6 py-3' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export const Button = forwardRef(function Button({ variant, size, className, type = 'button', ...props }, ref) {
  return <button ref={ref} type={type} className={cn(button({ variant, size }), className)} {...props} />;
});
