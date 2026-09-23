import { describe, it, expect } from 'vitest';
import { ONBOARDING_TIPS, replayOnboardingTips } from '../../src/game/onboardingTips.js';

// M6 onboarding recall: the boot goal/loop toasts are localStorage-once (dead for returning players);
// the "How to Play" recall re-fires the SAME tips. This pins the shared source + the replay order. The boot toast
// shows tips [0] and [1] by index (App.jsx); the third — the perfect dodge, an advanced move — lives in the recall.
describe('M6 onboarding recall tips', () => {
  it('holds the loop tip + the goal tip with their bus types', () => {
    expect(ONBOARDING_TIPS).toHaveLength(3);
    expect(ONBOARDING_TIPS[0].type).toBe('info');
    expect(ONBOARDING_TIPS[1].type).toBe('quest');
    expect(ONBOARDING_TIPS[0].text).toMatch(/survive the night/i);
    expect(ONBOARDING_TIPS[1].text).toMatch(/blight heart/i);
    expect(ONBOARDING_TIPS[2].text).toMatch(/perfect/i);
  });

  it('replays every tip in order through the injected bus', () => {
    const calls = [];
    const n = replayOnboardingTips((text, type) => calls.push({ text, type }), (fn) => fn());
    expect(n).toBe(3);
    expect(calls.map((c) => c.type)).toEqual(['info', 'quest', 'info']);
    expect(calls[1].text).toMatch(/follow the compass/i);
  });

  it('no-ops safely when the notification bus is not ready', () => {
    expect(replayOnboardingTips(null)).toBe(0);
    expect(replayOnboardingTips(undefined)).toBe(0);
  });
});
