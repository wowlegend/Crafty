/**
 * aspectGuide.js — the Aspect-UX clarity pass (2026-06-11, Kevin item 3): the "HOW IT PLAYS"
 * content for the four Aspect power loops, rendered as guide cards in the talent panel.
 * PURE data (testable; ids consistency-locked against ASPECT_TREES). Copy is EN-first by
 * design — the surrounding panel is EN-hardcoded; t()-routing is the recorded follow-up.
 * Every price and limit is read from game/ember.js, so the guide cannot drift from the game.
 */
import { ROAR_COST, GRAB_COST, SNARE_COST, FUSE_COST, IMBUE_COST, DAILY_BUILD_CAP } from './ember.js';

const FILL = 'Day kills by your own hand fill the ember bar';

export const ASPECT_GUIDE = {
  wildheart: {
    key: 'R',
    meter: `EMBER — the roar spends a full bar (${ROAR_COST})`,
    steps: [
      `${FILL}; building adds up to ${DAILY_BUILD_CAP} a day.`,
      'At a FULL bar, at night: hold R to ROAR into an element-beast — your loaded spell (1-4) picks the form.',
      'Claw, pounce, rampage; the form runs on a timer (talents extend it).',
      'Dawn empties the ember bar — spend it nightly.',
    ],
  },
  voidhand: {
    key: 'V',
    meter: `EMBER — a grab spends ${GRAB_COST}`,
    steps: [
      `${FILL} (a grab spends ${GRAB_COST}).`,
      'Press V in combat to SEIZE a phantom block out of the world.',
      'Left-click HURLS it at your aim; right-click SLAMS it down — an anvil onto whatever stands under it.',
      'Your base is ammunition: build by day, throw it by night.',
    ],
  },
  soulbind: {
    key: 'X',
    meter: `EMBER — a bind spends ${SNARE_COST}, a fuse ${FUSE_COST}`,
    steps: [
      `${FILL} (a bind spends ${SNARE_COST}).`,
      'Weaken any hostile to about a third — its health bar turns JADE.',
      'Hold X while aiming at it: the tether tightens and it JOINS your squad.',
      `It heels and fights beside you. Stand TWO bound creatures together and hold X to FUSE them into a hybrid (${FUSE_COST} ember).`,
    ],
  },
  elemancer: {
    key: 'Z',
    meter: `EMBER — an imbue spends ${IMBUE_COST}; BUILDING fills it too`,
    steps: [
      `Work the world by day: each block you place adds ember, up to ${DAILY_BUILD_CAP} a day; day kills add more.`,
      `Press Z to ARM an imbue — the white-gold ring appears (${IMBUE_COST} ember).`,
      'Cast (1-4 picks the element): the impact paints an ELEMENT ZONE — fire burns, ice slows, lightning pulses, arcane lures.',
      'Chemistry: fire onto ice = steam (both vanish); any cast onto an arcane rune comes out BIGGER.',
    ],
  },
};
