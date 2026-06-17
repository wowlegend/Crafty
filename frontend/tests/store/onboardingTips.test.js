import { describe, it, expect } from 'vitest';
import { ONBOARDING_TIPS, replayOnboardingTips } from '../../src/game/onboardingTips.js';

// M6 onboarding recall: the boot goal/loop toasts are localStorage-once (dead for returning players);
// the "How to Play" recall re-fires the SAME two tips. This pins the shared source + the replay order.
describe('M6 onboarding recall tips', () => {
  it('holds the loop tip + the goal tip with their bus types', () => {
    expect(ONBOARDING_TIPS).toHaveLength(2);
    expect(ONBOARDING_TIPS[0].type).toBe('info');
    expect(ONBOARDING_TIPS[1].type).toBe('quest');
    expect(ONBOARDING_TIPS[0].text).toMatch(/survive the night/i);
    expect(ONBOARDING_TIPS[1].text).toMatch(/blight heart/i);
  });

  it('replays both tips in order through the injected bus', () => {
    const calls = [];
    const n = replayOnboardingTips((text, type) => calls.push({ text, type }), (fn) => fn());
    expect(n).toBe(2);
    expect(calls.map((c) => c.type)).toEqual(['info', 'quest']);
    expect(calls[1].text).toMatch(/follow the compass/i);
  });

  it('no-ops safely when the notification bus is not ready', () => {
    expect(replayOnboardingTips(null)).toBe(0);
    expect(replayOnboardingTips(undefined)).toBe(0);
  });
});
