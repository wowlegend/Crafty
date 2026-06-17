import { forwardRef } from 'react';
import { cn } from './cn.js';

// Bold-flat range slider (comp): a native <input type=range> reskinned via .bf-slider (index.css) to the
// locked design system -- ink-framed groove + accent fill + a hard ink-bordered square thumb. The native
// input is kept for full keyboard + a11y. The component computes the --pct fill var (the accent portion
// left of the thumb) from value/min/max; the look itself is CSS (Tailwind can't style range pseudo-els).
export const Slider = forwardRef(function Slider(
  { value, min = 0, max = 1, step, onChange, className, ...props }, ref) {
  const v = Number(value);
  const lo = Number(min);
  const hi = Number(max);
  const pct = Number.isFinite(v) && hi > lo ? Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100)) : 0;
  return (
    <input
      ref={ref}
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={onChange}
      className={cn('bf-slider', className)}
      style={{ '--pct': `${pct}%` }}
      {...props}
    />
  );
});
