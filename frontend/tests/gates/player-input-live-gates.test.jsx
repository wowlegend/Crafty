// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

/**
 * THE PLAYER LOOP TAKES NO INPUT WHILE A SURFACE COVERS THE GAME, WHATEVER OPENED IT (input/inputLive.js; lane L5).
 *
 * The input gate (getInput().active) stays up under two openers: a chest opened from the world on touch (there is no lock
 * to lose) and VICTORY, a store write under a held lock. So the Player's frame reads isInputLive once, and the five Aspect
 * machines (roar, grab, snare, fuse, imbue) and the walk, jump and dodge all take that answer, not the gate. This mounts
 * the real Player with the real Rapier, as tests/gates/player-view-hold-gates.test.jsx does (R3F stubbed so the test drives
 * the frame callback; a floor, a kinematic capsule and the loop's own character controller), stands the player on the
 * floor, raises the gate, and then, for each covering surface (every PANEL_FLAG, VICTORY and the lost-context panel, each
 * put up by a bare store write that drops no gate), drives each verb through its real intent with its talent and a full
 * ember bar:
 *   - walk: W held for 20 frames moves the body; jump: Space lifts it; dodge: Shift's intent throws it forward;
 *   - roar starts the transform's charge, grab holds a phantom block, snare starts its channel on a weakened mob in the aim
 *     (GameMethods.checkMobsInMeleeCone answers with one), fuse starts its channel between two allies near the player that
 *     have a hybrid, imbue arms the next cast.
 * Each verb is first measured with nothing up, in the same harness (PRESENCE), so a dead instrument cannot pass.
 *
 * And Components' keydown, which listens on the window, so a key typed into a text field reaches it: a locked Aspect
 * key there raises its "locked" toast only when the press could act (input/aspectDeny.js). On touch the gate stays up
 * under World Manager (opened from the HUD gear and Settings) and under VICTORY, so the case types into the real World
 * Manager's name field and presses under VICTORY, both on touch, after a press in play shows the toast (the presence).
 *
 * BLIND SPOT: the frames are the loop's callback driven by hand at 60 Hz, not R3F's loop; the touch controls, which
 * write the same intents, are not mounted; the death screen is not a case, because the loop's death branch returns
 * before the walk and the machines take `alive` from the store as well.
 */

const h = vi.hoisted(() => ({ frame: null, camera: null, body: null, world: null, denied: [], touch: false }));
vi.mock('@react-three/fiber', () => ({
  useFrame: (cb) => { h.frame = cb; },
  useThree: (sel) => (sel ? sel({ camera: h.camera }) : { camera: h.camera }),
}));
vi.mock('@react-three/rapier', async () => {
  const R = await import('react');
  return {
    RigidBody: R.forwardRef(function RigidBody(_props, ref) {
      R.useImperativeHandle(ref, () => h.body);
      return null;
    }),
    CapsuleCollider: () => null,
    useRapier: () => ({ rapier: RAPIER, world: h.world }),
  };
});
vi.mock('../../src/render/playerRender', () => ({ StableMagicHands: () => null }));
vi.mock('../../src/render/ViewmodelLayer.jsx', () => ({ ViewmodelLayer: ({ children }) => <>{children}</> }));
vi.mock('../../src/render/BeastAvatar', () => ({ BeastAvatar: () => null }));
vi.mock('../../src/world/PhantomBlockSystem', () => ({ PhantomBlockSystem: () => null, phantomWorldPos: { x: 0, y: 0, z: 0 } }));
vi.mock('../../src/world/HurlSystem', () => ({ HurlSystem: () => null }));
vi.mock('../../src/world/SnareTetherSystem.jsx', () => ({ SnareTetherSystem: () => null }));
vi.mock('../../src/world/SquadAISystem.jsx', () => ({ SquadAISystem: () => null }));
vi.mock('../../src/world/ElementZoneSystem.jsx', () => ({ ElementZoneSystem: () => null }));
// The toast pipe throttles to one a second; the case counts each refusal the press would raise.
vi.mock('../../src/ui/denyToast', () => ({ notifyDenied: (kind) => { h.denied.push(kind); } }));
vi.mock('../../src/input/touchDevice', async (orig) => ({ ...(await orig()), isTouchDevice: () => h.touch, isTouchUIMode: () => h.touch }));

const { Player } = await import('../../src/Components.jsx');
const { WorldManager } = await import('../../src/WorldManager.jsx');
const { useGameStore } = await import('../../src/store/useGameStore.jsx');
const { setIntent, setActive, resetInput, getInput } = await import('../../src/input/inputState');
const { isInputLive } = await import('../../src/input/inputLive.js');
const { _resetShake } = await import('../../src/game/cameraShakeChannel.js');
const { EMBER_MAX } = await import('../../src/game/ember.js');
const { PANEL_FLAGS } = await import('../../src/ui/panelState.js');
const { readSnareState, clearSnareState } = await import('../../src/game/snareChannel.js');
const { ecs } = await import('../../src/ecs/world.js');
const { GameMethods } = await import('../../src/GameMethods.js');

beforeAll(async () => {
  await RAPIER.init();
});

let t = 0;
/** One frame of the Player's loop at 60 Hz, then one world step (the body's kinematic write lands). */
function frame() {
  t += 1 / 60;
  h.frame({ camera: h.camera, clock: { getElapsedTime: () => t, elapsedTime: t } }, 1 / 60);
  h.world.step();
}
const frames = (n) => { for (let i = 0; i < n; i++) frame(); };
const at = () => { const b = h.body.translation(); return { x: b.x, y: b.y, z: b.z }; };
const planar = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

const saved = useGameStore.getState();
const closed = Object.fromEntries(PANEL_FLAGS.map((f) => [f, false]));
const CLEAR = {
  ...closed, victoryPending: false, isWebGLContextLost: false, isCaptureMode: false, isAlive: true,
  beastFormActive: false, activeBeastForm: null, beastCharging: false, voidhandHeld: false, heldPhantom: null, imbueArmed: false,
};
const allies = [];
beforeEach(() => {
  h.world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const floor = h.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 49.5, 0));
  h.world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50), floor);
  h.body = h.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 51, 0));
  h.world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.4), h.body);
  h.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
  h.denied.length = 0;
  h.touch = false;
  t = 0;
  _resetShake();
  resetInput();
  clearSnareState();
  // The ground probe (Terrain.jsx getMobGroundLevel) answers the floor's top at the spawn's columns, where the loop stands
  // the player (game/spawnPlacement.js spawnCornerGround).
  useGameStore.setState({ ...CLEAR, getMobGroundLevel: () => 50 });
});
afterEach(() => {
  cleanup();
  _resetShake();
  resetInput();
  clearSnareState();
  for (const e of allies.splice(0)) ecs.remove(e);
  delete GameMethods.checkMobsInMeleeCone;
  useGameStore.setState({
    ...CLEAR, isAlive: saved.isAlive, getMobGroundLevel: saved.getMobGroundLevel, ember: saved.ember,
    unlockedTalents: saved.unlockedTalents, playerPosition: saved.playerPosition,
  });
});

/** Mount the Player and run it a second: it stands on the floor, and the dodge's cooldown from t = 0 (0.8 s) has run. */
function standPlayer() {
  render(<Player isWorldBuilt />);
  expect(h.frame, 'the Player registered no frame callback').toBeTypeOf('function');
  frames(60);
}

// Each verb: what it needs beyond the raised gate, and what it did. A movement verb returns metres moved; an Aspect verb
// returns whether it started.
const TALENTS = { wildheart_roar: 1, voidhand_grasp: 1, soulbind_snare: 1, elemancer_imbue: 1 };
const VERBS = {
  walk: { min: 0.5, run: () => { const a = at(); setIntent('moveF', true); frames(20); setIntent('moveF', false); return planar(a, at()); } },
  jump: { min: 0.2, run: () => { const y0 = at().y; let top = y0; setIntent('jump', true); for (let i = 0; i < 12; i++) { frame(); top = Math.max(top, at().y); } return top - y0; } },
  dodge: { min: 0.5, run: () => { const a = at(); setIntent('dodge', true); frames(12); return planar(a, at()); } },
  roar: { run: () => { setIntent('roar', true); frames(3); return useGameStore.getState().beastCharging; } },
  // The grab commits after its charge (game/voidhand.js GRAB_CHARGE_SEC, 0.35 s): 25 frames.
  grab: { run: () => { setIntent('grab', true); frames(25); return useGameStore.getState().voidhandHeld; } },
  snare: {
    run: () => {
      // A weakened hostile in the aim: under the snare's health share, so it is a target (Components' snare arbiter).
      const p = at();
      GameMethods.checkMobsInMeleeCone = () => [{ id: 'gate-weak', type: 'zombie', health: 1, maxHealth: 100, position: { x: p.x, y: p.y, z: p.z - 3 } }];
      setIntent('snare', true);
      frames(2);
      return readSnareState().channeling;
    },
  },
  fuse: {
    run: () => {
      // Two allies by the player with a hybrid (game/hybrids.js 'spider+zombie'), and no snare target, so X is the fuse.
      const p = at();
      useGameStore.setState({ playerPosition: { x: p.x, y: p.y, z: p.z } });
      for (const [type, dx] of [['spider', 1], ['zombie', -1]]) {
        allies.push(ecs.add({ isAlly: true, id: `gate-ally-${type}`, type, baseType: type, health: 20, maxHealth: 20, position: { x: p.x + dx, y: p.y, z: p.z } }));
      }
      setIntent('snare', true);
      frames(2);
      return readSnareState().channeling;
    },
  },
  imbue: { run: () => { setIntent('imbue', true); frames(2); return useGameStore.getState().imbueArmed; } },
};

const SURFACES = [
  ...PANEL_FLAGS.map((f) => ({ name: f, write: { [f]: true } })),
  { name: 'victoryPending', write: { victoryPending: true } },
  { name: 'isWebGLContextLost', write: { isWebGLContextLost: true } },
];

/** One mount: stand, raise the gate, put the surface up (or none), drive the verb. */
function measure(verb, surface) {
  standPlayer();
  act(() => { useGameStore.setState({ unlockedTalents: { ...(saved.unlockedTalents || {}), ...TALENTS }, ember: EMBER_MAX }); });
  setActive(true);
  if (surface) act(() => { useGameStore.setState(surface.write); });
  const gates = { active: getInput().active, inputLive: isInputLive(useGameStore.getState(), getInput().active), alive: useGameStore.getState().isAlive };
  const out = VERBS[verb].run();
  cleanup();
  resetInput();
  clearSnareState();
  for (const e of allies.splice(0)) ecs.remove(e);
  delete GameMethods.checkMobsInMeleeCone;
  useGameStore.setState(CLEAR);
  return { out, gates };
}
const acted = (verb, out) => (typeof out === 'number' ? out >= VERBS[verb].min : !!out);

describe('INVARIANT: the Player loop takes no input while a surface covers the game, with the gate up', () => {
  it.each(Object.keys(VERBS))('%s acts in play, and under no covering surface', (verb) => {
    const live = measure(verb, null);
    expect(acted(verb, live.out), `PRESENCE: ${verb} did nothing in play (${JSON.stringify(live)}), so nothing below was measured`).toBe(true);
    const ran = [];
    const under = [];
    for (const s of SURFACES) {
      const r = measure(verb, s);
      under.push(typeof r.out === 'number' ? +r.out.toFixed(3) : r.out);
      if (r.gates.active !== true || r.gates.inputLive !== false) ran.push(`${s.name}: SETUP: the gate is not up under the surface, or input reads live: ${JSON.stringify(r.gates)}`);
      else if (acted(verb, r.out)) ran.push(`${s.name}: ${verb} acted behind the surface (${JSON.stringify(r.out)}; ${JSON.stringify(r.gates)})`);
    }
    console.log(`[player-input-live] ${verb}: in play ${JSON.stringify(typeof live.out === 'number' ? +live.out.toFixed(3) : live.out)}; ` +
      `${SURFACES.length} surfaces checked: ${JSON.stringify(under)}; ${ran.length} violations`);
    expect(SURFACES.length, 'the denominator: every PANEL_FLAG, VICTORY and the lost-context panel').toBe(PANEL_FLAGS.length + 2);
    expect(ran, `${verb} behind a covering surface`).toEqual([]);
  });
});

describe('a locked Aspect key says nothing where it acts on nothing (input/aspectDeny.js)', () => {
  const ASPECT_KEYS = ['r', 'v', 'x', 'z'];
  const press = (target, ch) => act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: ch, code: `Key${ch.toUpperCase()}`, bubbles: true, cancelable: true }));
  });
  const lockedToasts = () => h.denied.filter((k) => k === 'aspect-locked').length;

  it('on touch, R, V, X and Z typed into World Manager\'s name field, or pressed under VICTORY, raise no locked toast; in play each does', async () => {
    h.touch = true;
    act(() => { useGameStore.setState({ unlockedTalents: {} }); });
    render(<Player isWorldBuilt />);
    setActive(true); // touch play: MenuSystem's enterPlay raises the gate, and nothing on this path drops it
    const rows = {};
    h.denied.length = 0;
    for (const ch of ASPECT_KEYS) press(window, ch);
    rows.play = lockedToasts();

    act(() => { useGameStore.setState({ showSettings: false, showWorldManager: true }); });
    render(<WorldManager gameState={{}} onWorldLoad={() => {}} onClose={() => {}} />);
    fireEvent.click(await screen.findByTestId('world-create-new'));
    const field = await screen.findByTestId('world-name-field');
    h.denied.length = 0;
    for (const ch of [...ASPECT_KEYS, ...'rex']) { act(() => { field.focus(); }); press(field, ch); }
    rows.worldManagerField = lockedToasts();
    rows.fieldFocused = document.activeElement === field;
    act(() => { useGameStore.setState({ showWorldManager: false, victoryPending: true }); });
    h.denied.length = 0;
    for (const ch of ASPECT_KEYS) press(window, ch);
    rows.victory = lockedToasts();
    rows.gateUp = getInput().active;
    expect(rows, 'locked toasts per place (play is the presence: four locked keys, four toasts)').toEqual({
      play: 4, worldManagerField: 0, fieldFocused: true, victory: 0, gateUp: true,
    });
  });
});
