// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { Profiler } from 'react';
import * as THREE from 'three';
import WindupChevrons from '../../src/ui/WindupChevrons.jsx';
import { useGameStore } from '../../src/store/useGameStore';
import { ecs } from '../../src/ecs/world';
import { worldNow } from '../../src/game/worldClock.js';
import { enterCaptureMode, exitCaptureMode } from '../../src/devtest/captureMode.js';
import { claimHudTick, emitHudTick } from '../../src/ui/hudTicker.js';

/**
 * THE CHEVRON LAYER: A TICK WRITES THE RIGHT NODE, A STILL SCENE WRITES NOTHING, AND NOTHING RE-RENDERS
 * (combat-stance Task 7, docs/superpowers/plans/2026-10-27-crafty-combat-stance.md).
 *
 * This renders the REAL component against the real store, the real ECS world and a real three.js camera, and drives the
 * real HUD ticker by hand (claimHudTick + emitHudTick: one tick per call, no rAF), as
 * tests/gates/objective-tracker-capture-gates.test.jsx does. The plan asked for a stubbed subscribeHudTick; the real
 * ticker is the stronger instrument, since a component subscribed to the wrong clock would then go RED here too.
 *
 * Game-Loop isolation is the claim under test: the layer writes DOM through refs from the ticker and never sets React
 * state per tick, so its commit count (React's Profiler) stays at the mount's 1 while 30 ticks move a chevron.
 *
 * WHAT THIS DOES NOT CHECK: that the layer is mounted in the HUD, that the chevron is placed clear of the HUD's controls,
 * and the world clock in a running game (tests/e2e/windup-chevron.spec.js carries all three).
 *
 * Mutation-Proof: scripts/dev/mutate.sh on src/ui/WindupChevrons.jsx, 8 tests, 2026-10-27. RED: J1 the data-on
 *   write-on-change guard dropped (a still tick rewrites); J2 a state setter subscribed to the ticker (a re-render per
 *   tick); J3 the in-tick capture guard dropped; J4 the capture guard freezes instead of resetting; J6 the touch inset
 *   ignored; J7 the insets swapped; J8 the angle in radians, not quantised degrees; J9 a slot past the count left on;
 *   J10 the yaw ignored; J11 the opacity ignores the ramp; J12 the projection's view matrix left stale; J13 the tick
 *   never subscribed. J0 (a comment edit, the identity mutant) SURVIVED. J1b (the transform's guard dropped) SURVIVED:
 *   EQUIVALENT here, since a same-value style write makes no mutation record, so the behaviour this gate states holds.
 */
let release = null;
let added = [];
let camera = null;

function addMob({ x = 0, y = 60, z = 4, dueMs = 2000 } = {}) {
  const e = ecs.add({ isMob: true, id: `wc-${added.length + 1}`, type: 'zombie', position: new THREE.Vector3(x, y, z), health: 50, windupUntil: worldNow() + dueMs, staggerUntil: 0 });
  added.push(e);
  return e;
}

beforeEach(() => {
  exitCaptureMode();
  release = claimHudTick();
  camera = new THREE.PerspectiveCamera(75, 1024 / 768, 0.1, 500);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 60, 0); // yaw 0 looks along -z, so z > 0 is behind
  camera.updateMatrixWorld();
  useGameStore.setState({ gameCamera: camera });
});
afterEach(() => {
  cleanup();
  release();
  exitCaptureMode();
  for (const e of added) ecs.remove(e);
  added = [];
  useGameStore.setState({ gameCamera: null });
  restoreDevice();
});

// isTouchDevice() (input/touchDevice.js) reads PointerEvent, maxTouchPoints and matchMedia; jsdom answers "touch" by
// default, so each test that depends on the bottom inset declares its device class instead of inheriting jsdom's.
const saved = {};
function asDevice(kind) {
  saved.PointerEvent = window.PointerEvent;
  saved.matchMedia = window.matchMedia;
  window.PointerEvent = window.PointerEvent || function PointerEvent() {};
  Object.defineProperty(navigator, 'maxTouchPoints', { value: kind === 'touch' ? 5 : 0, configurable: true });
  window.matchMedia = () => ({ matches: kind === 'touch' });
}
function restoreDevice() {
  if ('PointerEvent' in saved) window.PointerEvent = saved.PointerEvent;
  if ('matchMedia' in saved) window.matchMedia = saved.matchMedia;
  delete navigator.maxTouchPoints;
}

const tick = () => act(() => { emitHudTick(0); });
const chevrons = (root) => [...root.querySelectorAll('[data-testid="windup-chevron"]')];
const onOnes = (root) => chevrons(root).filter((n) => n.dataset.on === '1');

describe('WindupChevrons on the HUD ticker', () => {
  it('one chevron is on, at about 180 degrees, the other three off', () => {
    asDevice('desktop');
    const behind = addMob({ z: 4 });
    addMob({ z: -4 }); // dead ahead, in the frustum: the control, no chevron
    const { getByTestId } = render(<WindupChevrons />);
    const root = getByTestId('windup-chevrons');
    expect(chevrons(root).length).toBe(4);
    tick();
    const on = onOnes(root);
    expect(on.length, 'a windup behind the camera turned no chevron on (or turned on the one ahead too)').toBe(1);
    expect(Math.abs(Number(on[0].dataset.angle))).toBeGreaterThanOrEqual(178);
    expect(on[0].dataset.mob).toBe(behind.id);
    expect(Number(on[0].style.opacity)).toBeGreaterThan(0.5);
    // behind is bottom-centre of the frame (jsdom lays nothing out, so the frame is the window): x w/2, y h - 140
    const x = Math.round(window.innerWidth / 2), y = Math.round(window.innerHeight - 140);
    expect(on[0].style.transform.startsWith(`translate(${x}px, ${y}px) translate(-50%, -50%) rotate(180deg)`), on[0].style.transform).toBe(true);
    for (const n of chevrons(root).filter((x) => x !== on[0])) expect(n.dataset.on).toBe('0');
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.style.pointerEvents).toBe('none');
  });

  it('on a touch device the bottom inset clears the joystick and the action cluster', () => {
    asDevice('touch');
    addMob({ z: 4 });
    const { getByTestId } = render(<WindupChevrons />);
    const root = getByTestId('windup-chevrons');
    tick();
    const on = onOnes(root);
    expect(on.length).toBe(1);
    const h = window.innerHeight;
    const x = Math.round(window.innerWidth / 2), y = Math.round(h - (Math.round(0.11 * h) + 170));
    expect(on[0].style.transform.startsWith(`translate(${x}px, ${y}px) `), on[0].style.transform).toBe(true);
  });

  it('a second tick with nothing changed writes nothing', () => {
    // The observer is attached before the mount, so it also sees the mount-time tick's writes.
    const mob = addMob({ z: 4 });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const obs = new MutationObserver(() => {});
    obs.observe(host, { attributes: true, subtree: true, childList: true, characterData: true });
    const { getByTestId } = render(<WindupChevrons />, { container: host });
    const root = getByTestId('windup-chevrons');
    obs.takeRecords(); // the mount
    mob.position.set(4, 60, 0.5); // to the right of the camera: a real change
    tick();
    const moved = obs.takeRecords().filter((r) => r.type === 'attributes').length;
    expect(moved, 'SETUP: a moved windup wrote nothing, so the instrument never saw a write').toBeGreaterThan(0);
    expect(onOnes(root).length).toBe(1);
    tick();
    tick();
    expect(obs.takeRecords().length, 'a still scene rewrote the chevrons').toBe(0);
    obs.disconnect();
    host.remove();
  });

  it('the component renders once across 30 ticks', () => {
    const mob = addMob({ z: 4 });
    let commits = 0;
    const { getByTestId } = render(<Profiler id="wc" onRender={() => { commits++; }}><WindupChevrons /></Profiler>);
    const root = getByTestId('windup-chevrons');
    expect(commits, 'SETUP: the Profiler never counted the mount').toBe(1);
    const angles = new Set();
    for (let i = 0; i < 30; i++) {
      const a = Math.PI / 2 + (i / 30) * Math.PI; // walk the mob from the right, round behind, to the left
      mob.position.set(4 * Math.sin(a), 60, -4 * Math.cos(a));
      tick();
      const on = onOnes(root);
      if (on.length) angles.add(on[0].dataset.angle);
    }
    expect(angles.size, 'SETUP: the ticks never moved the chevron').toBeGreaterThan(5);
    expect(commits, 'the chevron layer re-rendered from its tick (React state per frame)').toBe(1);
  });

  it('under capture mode it renders nothing; entered after mount, the next tick turns every chevron off', () => {
    addMob({ z: 4 });
    enterCaptureMode();
    const first = render(<WindupChevrons />);
    expect(first.queryByTestId('windup-chevrons')).toBeNull();
    first.unmount();
    exitCaptureMode();
    const { getByTestId } = render(<WindupChevrons />);
    const root = getByTestId('windup-chevrons');
    tick();
    expect(onOnes(root).length, 'SETUP: no chevron was on before capture').toBe(1);
    act(() => { enterCaptureMode(); });
    tick();
    expect(onOnes(root).length, 'a chevron stayed on in capture').toBe(0);
    for (const n of chevrons(root)) expect(n.style.opacity).toBe('0');
  });

  it('turns with the camera: facing the other way, the mob that was ahead gets the chevron', () => {
    asDevice('desktop');
    const north = addMob({ z: -4 }); // ahead at yaw 0
    const south = addMob({ z: 4 });  // behind at yaw 0
    camera.rotation.y = Math.PI;     // now facing +z: south is ahead, north behind
    camera.updateMatrixWorld();
    const { getByTestId } = render(<WindupChevrons />);
    const root = getByTestId('windup-chevrons');
    tick();
    const on = onOnes(root);
    expect(on.length).toBe(1);
    expect(on[0].dataset.mob, 'the chevron went to the mob in view, not the one behind the turned camera').toBe(north.id);
    expect(Math.abs(Number(on[0].dataset.angle))).toBeGreaterThanOrEqual(178);
    expect(south.id).not.toBe(north.id);
  });

  it('opacity follows the ramp: 0.55 at the start of a windup, brighter as the strike nears', () => {
    const mob = addMob({ z: 4, dueMs: 2000 });
    const { getByTestId } = render(<WindupChevrons />);
    const root = getByTestId('windup-chevrons');
    tick();
    expect(onOnes(root)[0].style.opacity).toBe('0.55');
    mob.windupUntil = worldNow() + 190; // half the 380 ms windup left: ramp 0.5
    tick();
    expect(onOnes(root)[0].style.opacity).toBe('0.775');
  });

  it('a staggered or expired windup turns its chevron off at the next tick', () => {
    const mob = addMob({ z: 4 });
    const { getByTestId } = render(<WindupChevrons />);
    const root = getByTestId('windup-chevrons');
    tick();
    expect(onOnes(root).length).toBe(1);
    mob.staggerUntil = worldNow() + 500; // a perfect dodge staggered it: its strike will not land
    tick();
    expect(onOnes(root).length, 'a staggered mob kept its chevron').toBe(0);
    mob.staggerUntil = 0;
    tick();
    expect(onOnes(root).length, 'SETUP: the chevron did not come back once the stagger cleared').toBe(1);
    mob.windupUntil = worldNow() - 1;
    tick();
    expect(onOnes(root).length, 'an expired windup kept its chevron').toBe(0);
  });
});
