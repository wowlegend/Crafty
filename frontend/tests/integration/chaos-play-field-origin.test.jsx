// @vitest-environment jsdom
// The chaos-play gate on the open field and at the origin column, which every respawn reads: the origin sessions dig
// that column and build on it before they fall through the void, and each field session clips into the rock over the
// cave under the field and must be stood clear where it clipped (I7). What it asserts and why:
// tests/integration/chaos-play-instruments.test.jsx.
import { chaosSuite, COMMON_FLOORS } from './chaosPlay/suite.js';

chaosSuite(['field', 'origin'], {
  ...COMMON_FLOORS, swapsUnderCeiling: 2, respawnsAfterOriginMine: 2, respawnsAfterOriginPlace: 2, clips: 8, stuckRecoveries: 8,
});
