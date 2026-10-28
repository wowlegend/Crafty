import { forwardRef } from 'react';
import { cn } from './cn.js';

// Bold-flat button: flat saturated fill · 4px ink border · hard offset shadow that
// "presses" on :active (translate + shadow shrink). Motion uses token-aligned
// durations; respects prefers-reduced-motion via the `motion-reduce:` utility.
const BASE =
  'inline-flex items-center justify-center select-none font-display uppercase ' +
  'border-chrome border-ink rounded-md shadow-elev-md ' +
  'transition-[transform,box-shadow] duration-150 ease-out ' +
  'active:translate-x-[3px] active:translate-y-[3px] active:shadow-elev-sm ' +
  'motion-reduce:transition-none motion-reduce:active:translate-x-0 motion-reduce:active:translate-y-0 ' +
  'disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-accent';

// `text` replaces the variant's text colour by name, since a colour class in className would not reliably win.
const VARIANTS = {
  primary:   { fill: 'bg-accent hover:bg-accent-raise', text: 'text-text-inverse' },
  secondary: { fill: 'bg-panel-raise hover:bg-panel', text: 'text-text' },
  ghost:     { fill: 'bg-transparent shadow-none hover:bg-panel-raise', text: 'text-text' },
  danger:    { fill: 'bg-danger', text: 'text-text-inverse' },
};

// `icon` is a square the caller sizes with w-/h-. `size={null}` leaves gap, type size and padding to className.
const SIZES = {
  sm:   'gap-2 text-sm px-3 py-1.5',
  md:   'gap-2 text-base px-4 py-2',
  lg:   'gap-2 text-lg px-6 py-3',
  icon: 'gap-2 text-sm p-0',
};

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', text, className, type = 'button', ...props }, ref) {
  const v = VARIANTS[variant] ?? VARIANTS.primary;
  return <button ref={ref} type={type} className={cn(BASE, v.fill, text ?? v.text, SIZES[size], className)} {...props} />;
});
