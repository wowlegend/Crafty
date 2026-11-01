// @vitest-environment jsdom
// The chaos-play gate on the open field and at the origin column, which every respawn reads: the origin sessions dig
// that column and build on it before they fall through the void, and each field session clips into the rock over the
// cave under the field and must be stood clear where it clipped (I7). What it asserts and why:
// tests/integration/chaos-play-instruments.test.jsx.
import { chaosSuite, COMMON_FLOORS } from './chaosPlay/suite.js';

// Two floors are this file's own, from the reach of seeds 1 to 8 (DECISIONS 2026-11-01 (lane L13 part 2) item 510): its
// sixteen sessions refuse 1 to 7 swaps and leave 0 to 6 own shells by seed, so the common floors of 2 and 1 failed seeds 3
// and 5 with every session clean. The own-shell exit stays floored in the other two places' files, which reach it on
// every seed.
chaosSuite(['field', 'origin'], {
  ...COMMON_FLOORS, swapsRefused: 1, ownShellOut: 0,
  swapsUnderCeiling: 2, respawnsAfterOriginMine: 2, respawnsAfterOriginPlace: 2, clips: 8, stuckRecoveries: 8,
});
