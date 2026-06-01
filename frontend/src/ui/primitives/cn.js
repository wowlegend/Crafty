import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge must learn the project's custom `borderWidth: { chrome }` token,
// else it mis-files `border-chrome` into the border-COLOR group and silently drops it
// when paired with `border-ink` (both seen as `border-*`). Register chrome as a width
// so width (border-chrome) and color (border-ink) coexist instead of colliding.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'border-w': [{ border: ['chrome'] }] } },
});

/** Merge conditional class lists with Tailwind-aware conflict resolution. */
export function cn(...inputs) { return twMerge(clsx(inputs)); }
