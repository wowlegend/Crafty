# Gameplay POINT — S10 Onboarding / State the Goal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.
> The LAST piece of the "give it a point" arc: S7-S9 built the journey/climax; S10 makes it LEGIBLE to a
> brand-new player from second one by NAMING the campaign goal at start.

**Goal:** A new player should immediately understand the point — venture to the frontier shrines, then reach
and shatter the Blight Heart at the world's edge — without reading docs. Small, copy-led, capture-safe.

## Live-code grounding (read-before-architect — done)
- `App.jsx` ~L121-138: a ONE-TIME first-session onboarding toast (localStorage `crafty_onboarded`, capture-
  SUPPRESSED, null-safe via `addNotification`) currently says "Build by day, survive the night siege --
  defeat foes to unlock powerful Aspect abilities." It teaches the day/night loop but NOT the campaign goal.
- `MenuSystem.jsx` L292: the title tagline "Build • Craft • Cast Spells • Explore Infinite Worlds" (under the
  "Crafty" title). menu.png IS a capture fixture -> changing it hits the baseline (deliberate re-baseline + LOOK).
  This is BRAND copy -> treat a goal-naming rewrite as a Kevin-taste option, not an autonomous default.
- The compass (S8/S9) already shows SHRINE + BLIGHT HEART markers, so "follow the compass" is actionable.
- `first_step` auto-quest (QuestSystem L73) "Enter the world"; the Pilgrimage `reach_shrine` quest (S8c) exists.

---

## Slice S10a — name the goal in the opening onboarding (capture-safe, the core)
- [ ] In `App.jsx` the onboarding block (~L128-138), after the existing day/night toast add a SECOND
  sequenced one-time toast (delay ~+7s so it doesn't collide) naming the campaign goal + pointing at the
  compass: e.g. `'Your goal: venture to the frontier shrines, then shatter the Blight Heart at the world\'s edge -- follow the compass.'` (type 'quest'). Stays inside the existing `!isCaptureMode()` + localStorage-once guard -> capture-safe, shows ONCE.
- [ ] VERIFY: build clean; npx vitest run holds; capture-suppressed -> gate 20/20 (no menu/explore frame change). Commit.

## Slice S10b — (KEVIN-TASTE, surface) goal in the title tagline
- [ ] Option for Kevin: replace/augment the menu tagline (MenuSystem L292) to evoke the campaign, e.g.
  "Brave the frontier • Claim the shrines • Shatter the Blight Heart". Changes menu.png -> capture + LOOK +
  deliberate re-baseline. Because the tagline is brand copy, SURFACE it to KEVIN-REVIEW with the proposed
  copy + a before/after rather than changing it unilaterally; build on his pick.

## Slice S10c — (OPTIONAL) a starter quest that points outward
- [ ] If S10a+menu aren't enough, add an early tier-1 quest ("Reach the frontier" / "Find a shrine") that
  chains toward the Pilgrimage + ultimately the Blight Heart, so the quest log itself states the goal. Only if
  the toast + tagline don't read as enough direction. TDD the quest-data + a reach/echo of the S8c reach_shrine driver.

## Notes / Self-Review
- **Capture-safety:** the toast is inside the existing `!isCaptureMode()` + localStorage-once guard (no baseline change). The menu tagline (S10b) DOES hit menu.png -> re-baseline + LOOK, and it's Kevin-taste so surface first.
- **No new systems:** S10a reuses the existing onboarding toast mechanism + `addNotification`; the compass already shows the markers it references.
- **STUCK:** if the toast timing collides/reads cluttered -> single combined toast, or stagger the delay.
