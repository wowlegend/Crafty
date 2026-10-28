import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { subscribeHudTick } from './hudTicker.js';
import {
  offscreenWindups, chevronPlacement, touchBottomInsetPx, BOTTOM_INSET_DESKTOP_PX, CHEVRON_MAX,
} from '../game/windupChevrons.js';
import { worldNow } from '../game/worldClock.js';
import { mobsQuery } from '../ecs/world';
import { isTouchDevice } from '../input/touchDevice.js';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';

/**
 * WindupChevrons — a chevron at the screen edge for each windup the player cannot see (masterpiece Phase 1,
 * close-quarters combat; plan docs/superpowers/plans/2026-10-27-crafty-combat-stance.md, Task 7).
 *
 * A telegraphed strike from outside the view was readable only by its sound. Now each hostile winding up within 12 m
 * and off screen (game/windupChevrons.js: the camera's projection, so a steep pitch counts) gets a chevron on an inset
 * frame clear of the HUD, pointing toward it, brightening as the strike nears.
 *
 * GAME-LOOP ISOLATION. Four DOM nodes, rendered once. The HUD ticker (ui/hudTicker.js) drives the tick, which reads the
 * camera, the ECS mobs and the world clock transiently and writes transform, opacity and data-* through refs, and only
 * when the quantised value changed (angle to 2 degrees, ramp to 0.1, position to whole px). No React state is set.
 * The tick is NOT throttled: a 380 ms windup read at 15 Hz loses up to 66 ms of the reaction budget, while the scan is
 * O(mobs) plus at most four projections, and write-on-change already bounds the DOM cost.
 *
 * GPU: none. transform and opacity only; no filter, no box-shadow.
 * CAPTURE: renders nothing when mounted in capture, and the tick RESETS every chevron off under capture (the harness
 * enters capture after boot, so the check lives inside the tick).
 */
const ndc = new THREE.Vector3();
let projCamera = null;
const project = (p) => ndc.set(p.x, p.y, p.z).project(projCamera);
const SIZE_PX = 30;

function WindupChevrons() {
  const boxRef = useRef(null);
  const nodesRef = useRef([]);
  const memo = useRef(null);
  if (memo.current === null) {
    memo.current = {
      slots: Array.from({ length: CHEVRON_MAX }, () => ({ id: 0, until: 0, angle: 0, ramp: 0 })),
      place: { left: 0, top: 0, rotDeg: 0 },
      last: Array.from({ length: CHEVRON_MAX }, () => ({ on: '0', transform: '', opacity: '0', angle: '', mob: '' })),
    };
  }

  useEffect(() => {
    const touch = isTouchDevice();
    const { slots, place, last } = memo.current;
    const write = (i, on, transform, opacity, angle, mob) => {
      const node = nodesRef.current[i];
      if (!node) return;
      const l = last[i];
      if (l.on !== on) { l.on = on; node.dataset.on = on; }
      if (l.opacity !== opacity) { l.opacity = opacity; node.style.opacity = opacity; }
      if (on === '0') return;
      if (l.transform !== transform) { l.transform = transform; node.style.transform = transform; }
      if (l.angle !== angle) { l.angle = angle; node.dataset.angle = angle; }
      if (l.mob !== mob) { l.mob = mob; node.dataset.mob = mob; }
    };
    const allOff = () => { for (let i = 0; i < CHEVRON_MAX; i++) write(i, '0', '', '0', '', ''); };

    const tick = () => {
      const box = boxRef.current;
      if (!box) return;
      if (isCaptureMode()) { allOff(); return; }
      const camera = useGameStore.getState().gameCamera;
      if (!camera || !camera.projectionMatrix || !camera.matrixWorldInverse) { allOff(); return; }
      projCamera = camera;
      const n = offscreenWindups(mobsQuery.entities, camera.position, camera.rotation.y, project, worldNow(), slots);
      const w = box.clientWidth || window.innerWidth;
      const h = box.clientHeight || window.innerHeight;
      const bottom = touch ? touchBottomInsetPx(h) : BOTTOM_INSET_DESKTOP_PX;
      for (let i = 0; i < CHEVRON_MAX; i++) {
        if (i >= n) { write(i, '0', '', '0', '', ''); continue; }
        const s = slots[i];
        const deg = Math.round((s.angle * 180) / Math.PI / 2) * 2; // quantised to 2 degrees
        chevronPlacement((deg * Math.PI) / 180, w, h, bottom, place);
        const transform = `translate(${Math.round(place.left)}px, ${Math.round(place.top)}px) translate(-50%, -50%) rotate(${deg}deg)`;
        const ramp = Math.round(s.ramp * 10) / 10;
        write(i, '1', transform, String(+(0.55 + 0.45 * ramp).toFixed(3)), String(deg), String(s.id));
      }
    };
    tick();
    return subscribeHudTick(tick);
  }, []);

  if (isCaptureMode()) return null;

  return (
    <div
      ref={boxRef}
      data-testid="windup-chevrons"
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        right: 'env(safe-area-inset-right, 0px)',
        bottom: 'env(safe-area-inset-bottom, 0px)',
        left: 'env(safe-area-inset-left, 0px)',
        pointerEvents: 'none',
        zIndex: 38, // DamageDirection's layer
      }}
    >
      {Array.from({ length: CHEVRON_MAX }, (_, i) => (
        <div
          key={i}
          ref={(el) => { nodesRef.current[i] = el; }}
          data-testid="windup-chevron"
          data-on="0"
          style={{ position: 'absolute', left: 0, top: 0, width: SIZE_PX, height: SIZE_PX, opacity: 0, willChange: 'transform, opacity' }}
        >
          <svg viewBox="0 0 24 24" width={SIZE_PX} height={SIZE_PX}>
            <path d="M12 3 L22 15 L17 15 L12 9 L7 15 L2 15 Z M12 11 L19 20 L15 20 L12 16 L9 20 L5 20 Z" fill="rgb(var(--ui-danger))" />
          </svg>
        </div>
      ))}
    </div>
  );
}

export default React.memo(WindupChevrons);
