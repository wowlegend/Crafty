// @vitest-environment jsdom
// The chaos-play gate at the shore (where Kevin was), the deep ocean past it (its seabed at DEEP_FLOOR, under the ground
// probe's floor and under the y 10 the void guard reset at before DECISIONS 2026-10-30 item 190: its sessions stand and
// walk there, then dig out of the bottom of the world), and the cliff face. What it asserts and why:
// tests/integration/chaos-play-instruments.test.jsx.
import { chaosSuite, COMMON_FLOORS } from './chaosPlay/suite.js';

chaosSuite(['shore', 'deep', 'cliff'], { ...COMMON_FLOORS, swapsUnderCeiling: 4, framesUnderOldVoidLine: 1700, shaftsThroughWorld: 2 });
