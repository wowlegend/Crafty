// @vitest-environment jsdom
// The chaos-play gate at the shore (where Kevin was) and the cliff face. What it asserts and why:
// tests/integration/chaos-play-instruments.test.jsx.
import { chaosSuite, COMMON_FLOORS } from './chaosPlay/suite.js';

chaosSuite(['shore', 'cliff'], { ...COMMON_FLOORS, swapsUnderCeiling: 4 });
