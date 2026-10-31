// @vitest-environment jsdom
//
// THE ZONE BRIDGE (lane L9, round 2). ElementZoneSystem is the one caller of the zone registry in the game, and it was the
// seam no gate drove: elementZones.test.js owns the registry's rules, and the pools gate drove the registry by hand. The
// first fix of the zone cap protected only the zone a single spawnZone call had just painted, so a cast's own chain evicted
// the impact zone in the same tick, and this bridge then played the impact's sound for a zone that was already gone
// (AUDIT:ultra:ultra-game-logic-4, round 1's static finding 1 and dynamic F1).
//
// The real system, mounted with its frame callback called by hand (15 Hz is its own tick), the real registry, the real ECS
// and the real request channel (requestZone is what a landed imbue calls). The sound is the store's playSpatialSound,
// recorded. Hostiles are ECS mobs the chain leaps to.
//
// WHAT THE READINGS HAVE TO SHOW BEFORE THE CLAIM MEANS ANYTHING:
//   - the board was FULL (eight frozen zones, 12 s each) and every one of the eight casts that filled it was voiced;
//   - the cast under test is the one that overflows it (a conductive zone of 8 s: sooner to expire than anything on the board);
//   - the chain took its leaps (three more zones), so the cast overflowed the board by three.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';

let frame = null;
vi.mock('@react-three/fiber', () => ({ useFrame: (cb) => { frame = cb; } }));

let clock = 5000;
vi.spyOn(performance, 'now').mockImplementation(() => clock);

import { ElementZoneSystem, getLiveZones } from '../../src/world/ElementZoneSystem.jsx';
import { requestZone } from '../../src/game/elemancerChannel.js';
import { clearZones, MAX_ZONES } from '../../src/game/elementZones.js';
import { ecs } from '../../src/ecs/world.js';
import { GameMethods } from '../../src/GameMethods.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';

const TICK = 0.07; // seconds: past the bridge's 1/15 s, so every frame is one tick
let heard = [];

// One bridge tick on the world clock.
function tick() {
  clock += TICK * 1000;
  act(() => { frame({}, TICK); });
}
// A cast is a request the bridge consumes on its next tick; what it voiced is checked against the registry at the tick's end.
function cast(spec) {
  const before = heard.length;
  requestZone(spec);
  tick();
  return heard.slice(before);
}
const mob = (id, x, z) => ecs.add({ isMob: true, id, type: 'zombie', position: { x, y: 1, z }, health: 10, maxHealth: 10 });
const zonesAt = (x, z) => getLiveZones().zones.filter((q) => q.pos.x === x && q.pos.z === z);

beforeEach(() => {
  for (const e of [...ecs.entities]) ecs.remove(e);
  clearZones(getLiveZones());
  heard = [];
  delete GameMethods.damageMob; // the zones' ticks are not under test: no damage path
  useGameStore.setState({ isDay: true, playSpatialSound: (sfx, pos) => { heard.push({ sfx, pos }); } });
  render(<ElementZoneSystem />);
});
afterEach(() => {
  cleanup();
  for (const e of [...ecs.entities]) ecs.remove(e);
});

const fillBoardWithFrozen = () => {
  for (let i = 0; i < MAX_ZONES; i++) cast({ kind: 'frozen', pos: { x: i * 20, y: 50, z: 100 } });
};

describe('the zone bridge: a cast the bridge voices is a zone that is on the board when the tick ends', () => {
  it('a chained conductive cast into a full board of fresh frozen zones keeps its impact zone, and the zap plays for it', () => {
    fillBoardWithFrozen();
    expect(getLiveZones().zones, 'the fill casts did not reach the cap: the setup is not the scenario').toHaveLength(MAX_ZONES);
    expect(heard.filter((h) => h.sfx === 'freeze'), 'a fill cast was not voiced: the sound channel is not wired in this test').toHaveLength(MAX_ZONES);
    mob(1, 505, 0); mob(2, 500, 6); mob(3, 495, 0);

    const voiced = cast({ kind: 'conductive', pos: { x: 500, y: 50, z: 0 }, chain: 3 });

    const zaps = voiced.filter((h) => h.sfx === 'zap');
    expect(zaps, 'the impact was voiced once').toHaveLength(1);
    expect(zonesAt(zaps[0].pos[0], zaps[0].pos[2]), 'the zap played for a zone that is not on the board: the cast evicted its own impact').toHaveLength(1);
    expect(getLiveZones().zones.filter((q) => q.kind === 'conductive'), 'the chain did not keep its three leaps beside the impact').toHaveLength(4);
    expect(getLiveZones().zones, 'the board is not at its cap').toHaveLength(MAX_ZONES);
    expect(getLiveZones().zones.filter((q) => q.kind === 'frozen'), 'the four frozen zones that go are not the first painted').toHaveLength(4);
  });

  it('every cast of a run at the cap, chained or not, is voiced only for a zone that exists', () => {
    fillBoardWithFrozen();
    mob(1, 505, 0); mob(2, 500, 6); mob(3, 495, 0);
    let voicedCasts = 0;
    for (let i = 0; i < 12; i++) {
      const x = 500 + (i % 4) * 60;
      const kind = i % 3 === 0 ? 'conductive' : (i % 3 === 1 ? 'burning' : 'resonant');
      mob(10 + i * 3, x + 5, 0); mob(11 + i * 3, x, 6); mob(12 + i * 3, x - 5, 0);
      const voiced = cast({ kind, pos: { x, y: 50, z: 0 }, chain: i % 2 ? 3 : 0 });
      for (const h of voiced.filter((q) => q.sfx !== 'motifElemancer')) {
        voicedCasts += 1;
        expect(zonesAt(h.pos[0], h.pos[2]).length, `cast ${i} (${kind}) was voiced at x ${h.pos[0]} for a zone that is not on the board`).toBeGreaterThan(0);
      }
      expect(getLiveZones().zones.length).toBeLessThanOrEqual(MAX_ZONES);
    }
    expect(voicedCasts, 'the run voiced nothing: the property above was never exercised').toBeGreaterThanOrEqual(10);
  });
});
