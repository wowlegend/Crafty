// The touch-layout viewport matrix, shared: tests/gates/touch-layout-gates.test.jsx renders the touch overlay in each,
// and tests/gates/chevron-placement-gates.test.js places the windup chevrons in each. One list, so the two gates cannot
// drift apart on what "every viewport we support" means. Not a test file (no .test. in its name): vitest never runs it.
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
export const vp = (name, w, h, insets = NO_INSETS) => ({ name, w, h, insets });
// Playwright 1.x device descriptors (node_modules/playwright-core, read 2026-10-27): Safari's visible viewport.
export const VIEWPORTS = [
  vp('iPad Pro 11', 834, 1194), vp('iPad Pro 11 landscape', 1194, 834),
  vp('iPad (gen 7)', 810, 1080), vp('iPad (gen 7) landscape', 1080, 810),
  vp('iPad (gen 11)', 656, 944), vp('iPad (gen 11) landscape', 944, 656),
  vp('iPad Mini', 768, 1024), vp('iPad Mini landscape', 1024, 768),
  // iPad Air / iPad (10th gen) full screen (a home-screen launch, no Safari chrome): the 820 x 1180 CSS viewport the
  // masterpiece plan names for Kevin's device. Not a Playwright descriptor; the iPad Air 11" screen in CSS px.
  vp('iPad Air full screen', 820, 1180), vp('iPad Air full screen landscape', 1180, 820),
  vp('iPhone SE', 320, 568), vp('iPhone SE landscape', 568, 320),
  vp('iPhone SE (3rd gen)', 375, 667), vp('iPhone SE (3rd gen) landscape', 667, 375),
  vp('iPhone 14', 390, 664), vp('iPhone 14 landscape', 750, 340),
  vp('iPhone 15 Pro', 393, 659), vp('iPhone 15 Pro landscape', 734, 343),
  vp('iPhone 15 Pro Max', 430, 739), vp('iPhone 15 Pro Max landscape', 814, 380),
  // Full screen under viewport-fit=cover (a home-screen launch): the notch and home indicator as env() insets.
  vp('iPhone 14 cover', 390, 844, { top: 47, right: 0, bottom: 34, left: 0 }),
  vp('iPhone 14 cover landscape', 844, 390, { top: 0, right: 47, bottom: 21, left: 47 }),
  vp('iPhone 15 Pro Max cover', 430, 932, { top: 59, right: 0, bottom: 34, left: 0 }),
  vp('iPhone 15 Pro Max cover landscape', 932, 430, { top: 0, right: 59, bottom: 21, left: 59 }),
];
