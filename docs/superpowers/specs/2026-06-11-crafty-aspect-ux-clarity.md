# The Aspect-UX clarity pass (design note)

> **Status (2026-06-11): DESIGN COMMITTED (Kevin item 3: "the menu is confusing, and how to use
> each one of them? it's unclear to the player").**

## The diagnosis
The talent panel presents the four Aspects as STAT COLUMNS ("Class Skill Talent Tree ... elemental
abilities" — stale copy from before the Aspect system existed). Nothing in the game says: each Aspect
is a POWER LOOP with its own key (R/V/X/Z), its own meter, and a verb chain. The player meets four
bars and four trees with no bridge between them.

## The design (one surface, where the player already looks)
1. **A "HOW IT PLAYS" guide card at the top of each Aspect column** in the talent panel — the key
   chip (kbd-style, Aspect-accented), the meter line (what banks it), and the 3-4 step loop in plain
   verbs. Content from a PURE module `game/aspectGuide.js` (testable; ids consistency-locked against
   ASPECT_TREES; copy EN-first — the panel is currently EN-hardcoded throughout, t()-routing for the
   whole panel is the recorded follow-up).
2. **The header retitle**: "ASPECTS — Talent Trees" + a subtitle that states the model in one line
   (four powers, four keys, each banks a meter and spends it on a signature verb).
3. The unlock-node descs already name verb+key (audited: grasp/roar/snare/imbue all do) — no rewrite.

## Recorded reductions
- The first-unlock hint TOAST is CUT for v1: unlocks happen INSIDE the panel that now carries the
  guide card directly above the unlock button — the hint would duplicate what's already on screen.
  Revisit only if playtest shows players forgetting the key after closing the panel.
- Dawn-bleed is stated once per card (step 4 family) — every meter shares the contract.
