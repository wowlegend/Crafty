/**
 * aspectGuide.js — the Aspect-UX clarity pass (2026-06-11, Kevin item 3): the "HOW IT PLAYS"
 * content for the four Aspect power loops, rendered as guide cards in the talent panel.
 * PURE data (testable; ids consistency-locked against ASPECT_TREES). Copy is EN-first by
 * design — the surrounding panel is EN-hardcoded; t()-routing is the recorded follow-up.
 * Every mechanic stated here is verified against the shipped modules (ferocity/kinetic/
 * soul/resonance + the SM files) — the guide must never drift from the game.
 */
export const ASPECT_GUIDE = {
  wildheart: {
    key: 'R',
    meter: 'FEROCITY — banked by your kills',
    steps: [
      'Kill mobs to fill the Ferocity bar (kills by your own hand).',
      'At a FULL bar, at night: hold R to ROAR into an element-beast — your loaded spell (1-4) picks the form.',
      'Claw, pounce, rampage; the form runs on a timer (talents extend it).',
      'Dawn drains every Aspect bank — spend it nightly.',
    ],
  },
  voidhand: {
    key: 'V',
    meter: 'KINETIC — banked by your kills',
    steps: [
      'Kill to bank Kinetic (a grab costs 25).',
      'Press V in combat to SEIZE a phantom block out of the world.',
      'Left-click HURLS it at your aim; right-click SLAMS it down — an anvil onto whatever stands under it.',
      'Your base is ammunition: build by day, throw it by night.',
    ],
  },
  soulbind: {
    key: 'X',
    meter: 'SOUL — banked by your kills',
    steps: [
      'Kill to bank Soul (a bind costs 35).',
      'Weaken any hostile to about a third — its health bar turns JADE.',
      'Hold X while aiming at it: the tether tightens and it JOINS your squad.',
      'It heels and fights beside you. Stand TWO bound creatures together and hold X to FUSE them into a hybrid (50 Soul).',
    ],
  },
  elemancer: {
    key: 'Z',
    meter: 'RESONANCE — banked by BUILDING (mine + place, by day)',
    steps: [
      'Work the world by day: mining and placing blocks charges Resonance.',
      'Press Z to ARM an imbue — the white-gold ring appears (30 Resonance).',
      'Cast (1-4 picks the element): the impact paints an ELEMENT ZONE — fire burns, ice slows, lightning pulses, arcane lures.',
      'Chemistry: fire onto ice = steam (both vanish); any cast onto an arcane rune comes out BIGGER.',
    ],
  },
};
