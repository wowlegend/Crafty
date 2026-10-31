// @vitest-environment jsdom
// The chaos-play gate on the open field and at the origin column, which every respawn reads: the origin sessions dig
// that column and build on it before they fall through the void. What it asserts and why:
// tests/integration/chaos-play-instruments.test.jsx.
import { chaosSuite, COMMON_FLOORS } from './chaosPlay/suite.js';

chaosSuite(['field', 'origin'], { ...COMMON_FLOORS, swapsUnderCeiling: 2, respawnsAfterOriginMine: 2, respawnsAfterOriginPlace: 2 });
