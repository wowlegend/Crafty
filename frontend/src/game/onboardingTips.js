// onboardingTips.js — the first-session goal/loop framing, as ONE shared source so the boot toast AND the
// in-game "How to Play" recall show identical text. The boot toast is localStorage-once (dead for a
// returning player); the recall (SettingsPanel) re-shows these on demand via the notification bus.
export const ONBOARDING_TIPS = [
  { text: 'Build by day, survive the night siege — defeat foes to unlock powerful Aspect abilities.', type: 'info' },
  { text: "Your goal: journey to the frontier shrines, then shatter the Blight Heart at the world's edge — follow the compass.", type: 'quest' },
];

// Re-show the tips through the notification bus (`add` = store.addNotification). Staggered so the two
// toasts don't overlap. `schedule` is injectable for tests. Returns how many were queued (0 if no bus).
export function replayOnboardingTips(add, schedule = (fn, ms) => setTimeout(fn, ms)) {
  if (typeof add !== 'function') return 0;
  ONBOARDING_TIPS.forEach((tip, i) => schedule(() => add(tip.text, tip.type), i * 2600));
  return ONBOARDING_TIPS.length;
}
