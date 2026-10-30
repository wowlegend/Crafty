import { LazyMotion, domAnimation } from 'framer-motion';

// The one place framer-motion's feature set is chosen. Components render `m`, never `motion`: `motion` carries every
// feature (drag, layout, projection) and this game uses none of those, so only `domAnimation` ships (animate, exit,
// variants, hover/tap/focus). It is passed as a bundle, not a loader, so a panel's first frame already animates: a
// loader would show `initial` until a second request resolved, and for good if it failed. `strict` makes a stray
// `motion.*` throw in dev and test; framer-motion 12.43 skips that check in a production build, so the bundle budget
// (scripts/ci/bundle-budget.mjs) is what holds the line on the shipped artifact.
export function MotionProvider({ children }) {
  return <LazyMotion features={domAnimation} strict>{children}</LazyMotion>;
}
