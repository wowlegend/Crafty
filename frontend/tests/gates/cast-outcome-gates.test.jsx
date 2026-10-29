// @vitest-environment jsdom
//
// WHETHER A CAST WENT OUT, AND WHAT IT CARRIED. Components applies an armed imbue to a cast only when castSpell
// reports the projectile went out: a cast refused for mana takes no ember, keeps the stance armed and withdraws the
// element it parked (triggerSpellCast). That makes castSpell's return value and the projectile's imbueKind the two
// facts the call site and tests/e2e/ember.spec.js read, so this proves the producer of each: the real
// EnhancedMagicSystem mounted, the store's real castSpell called, the projectile read through the real test hook.
//
// WHAT THIS DOES NOT CHECK: the call site's use of either (tests/e2e/ember.spec.js drives F with an armed imbue, with and
// without the mana for it), or the impact that turns imbueKind into a zone.
//
// Mutation-Proof: see the commit trailer.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as THREE from 'three';

vi.mock('@react-three/fiber', async (orig) => ({ ...(await orig()), useFrame: () => {} }));
vi.mock('../../src/render/spellVfx', () => ({
  EnhancedSpellProjectile: () => null,
  SpellImpactPop: () => null,
  CastTelegraph: () => null,
  ChainArc: () => null,
  MagicWand: () => null,
}));
vi.mock('../../src/SoundManager', () => ({
  useGameSounds: () => ({ playMagicCast() {}, playMagicHit() {}, playMagicExplosion() {} }),
}));

const { EnhancedMagicSystem } = await import('../../src/EnhancedMagicSystem.jsx');
const { useGameStore } = await import('../../src/store/useGameStore.jsx');
const { callTestHook, _resetBridge } = await import('../../src/devtest/testBridge.js');
const { armImbueCast, consumeImbueCast } = await import('../../src/game/elemancerChannel.js');

const live = () => callTestHook('readProjectiles');
const cast = (type = 'fireball') => {
  const before = new Set(live().map((p) => p.id));
  let out;
  act(() => { out = useGameStore.getState().castSpell(type); });
  return { out, made: live().filter((p) => !before.has(p.id)) };
};

beforeEach(() => {
  _resetBridge();
  consumeImbueCast();
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(0, 40, 0);
  cam.lookAt(0, 40, -1);
  cam.updateMatrixWorld(true);
  useGameStore.setState({
    isAlive: true, mana: 1e6, maxMana: 1e6, gameCamera: cam, addNotification: () => {},
    playSpatialSound: () => {}, triggerGPUSparks: () => {}, triggerBloomSpike: () => {},
  });
  render(<EnhancedMagicSystem />);
  expect(typeof useGameStore.getState().castSpell, 'EnhancedMagicSystem registered no castSpell').toBe('function');
});
afterEach(() => {
  cleanup();
  consumeImbueCast();
});

describe('castSpell says whether the projectile went out', () => {
  it('a cast with the mana for it returns true and makes one projectile', () => {
    const { out, made } = cast();
    expect(made.length, 'the cast made no projectile, so nothing below is about one').toBe(1);
    expect(out, 'a cast that went out did not say so').toBe(true);
  });

  it('a cast refused for mana returns a non-true value and makes none, after a cast that did (the same instrument)', () => {
    expect(cast().made.length, 'SETUP: a funded cast made no projectile').toBe(1);
    useGameStore.setState({ mana: 0 });
    const { out, made } = cast();
    expect(made, 'a cast with no mana made a projectile').toEqual([]);
    expect(out, 'a refused cast said it went out').not.toBe(true);
  });

  it('a cast with no player alive returns a non-true value', () => {
    useGameStore.setState({ isAlive: false });
    expect(cast().out).not.toBe(true);
  });
});

describe('the projectile reports the element it carries', () => {
  it('a parked kind rides the next cast, and only that one', () => {
    armImbueCast('frozen');
    expect(cast().made.map((p) => p.imbueKind), 'the parked kind did not ride the cast').toEqual(['frozen']);
    expect(cast().made.map((p) => p.imbueKind), 'a plain cast carried an element').toEqual([null]);
  });
});
