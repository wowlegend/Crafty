// @vitest-environment jsdom
// The chaos-play gate in the two-high tunnel and under the overhang, where a form swap meets a ceiling. What it asserts
// and why: tests/integration/chaos-play-instruments.test.jsx.
import { chaosSuite, COMMON_FLOORS } from './chaosPlay/suite.js';

chaosSuite(['cave', 'overhang'], { ...COMMON_FLOORS, swapsUnderCeiling: 8 });
