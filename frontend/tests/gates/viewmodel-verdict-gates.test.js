import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { viewmodelVerdict, FRAMES } from '../e2e/_viewmodelVerdict.js';
import { ViewmodelCamera, makeHandLightRig, mirrorSkyLight } from '../../src/render/viewmodel.js';

/**
 * VIEWMODEL.SPEC.JS'S VERDICT, DRIVEN WITH THE READINGS EACH BROKEN BUILD PRODUCES (tests/e2e/_viewmodelVerdict.js).
 *
 * The e2e reads the live composer's passes, how often the composer ran the viewmodel pass against R3F's frame count, the
 * viewmodel camera's aspect against the canvas's, and the hand rig's sky and key turned back into the world by the
 * camera's rotation after the view is turned 1.1 rad and tilted 0.3 rad. Here the light half of each reading is made
 * the way the page makes it: the real mirrorSkyLight on a camera turned and tilted as the spec turns it. The pass half
 * is the reading CI's shard printed for the build as shipped (run 40825672194: RenderPass, ViewmodelPass, then three
 * EffectPasses, 4 frames drawn and 4 calls, aspect 1.6 on a 1.6 canvas), changed as each broken build changes it:
 *   E1 the pass deleted from GameScene's composer: the passes go RenderPass, EffectPass...
 *   E2 the pass disabled: the composer skips it, so it is never called
 *   E3 the aspect sync removed: the viewmodel camera keeps the aspect it was built with
 *   E4 the light mirrored without the camera's turn
 * WHAT THIS DOES NOT CHECK: the reading in the page (the pass's wrapped render, the bridge hooks, the frame count), which
 * only CI's run of the spec exercises.
 */

const WORLD_KEY = new THREE.Vector3(-0.55, 0.62, -0.56).normalize().toArray();
const LIVE_PASSES = ['RenderPass', 'ViewmodelPass', 'EffectPass', 'EffectPass', 'EffectPass'];

function reading({ turned = true, passes = LIVE_PASSES, enabled = true, aspect = 1.6, lost = false } = {}) {
  const cam = new THREE.PerspectiveCamera(75, 1.6, 0.1, 500);
  cam.rotation.order = 'YXZ';
  cam.rotation.y = 1.1;
  cam.rotation.x = -0.3;
  cam.updateMatrixWorld(true);
  const q = cam.getWorldQuaternion(new THREE.Quaternion());
  const frame = {
    ambient: new THREE.Color(0.3, 0.3, 0.35), ambientIntensity: 0.6, hemiSky: new THREE.Color(0.6, 0.7, 0.9),
    hemiGround: new THREE.Color(0.3, 0.25, 0.2), hemiIntensity: 0.55, keyColor: new THREE.Color(1, 0.9, 0.8),
    keyIntensity: 1.9, keyDir: [...WORLD_KEY],
  };
  const rig = makeHandLightRig();
  mirrorSkyLight(frame, turned ? q : new THREE.Quaternion(), rig);
  const sky = rig.hemi.position.clone().normalize().applyQuaternion(q);
  const key = rig.key.position.clone().normalize().applyQuaternion(q);
  return {
    passes, drawn: FRAMES, calls: enabled ? FRAMES : 0, enabled, hands: 14, aspect, canvasAspect: 1.6, skyUp: sky.y,
    key: key.toArray(), worldKey: WORLD_KEY, pitch: cam.rotation.x, lost, alive: true,
  };
}

const lines = (r) => viewmodelVerdict(r).map((f) => f.line);

describe('the viewmodel e2e verdict', () => {
  it('passes the build as shipped, read the way the page reads it', () => {
    expect(lines(reading())).toEqual([]);
  });

  it('fails each broken build, naming what broke', () => {
    expect(lines(reading({ passes: ['RenderPass', 'EffectPass', 'EffectPass', 'EffectPass'] })), 'E1 the pass deleted')
      .toEqual(['the viewmodel pass is not right after the world']);
    expect(lines(reading({ enabled: false })), 'E2 the pass disabled')
      .toEqual(['the viewmodel pass is disabled', `the composer drew ${FRAMES} frames and ran the pass on 0`]);
    expect(lines(reading({ aspect: new ViewmodelCamera().aspect })), 'E3 the aspect never synced')
      .toEqual(["the viewmodel camera is not on the canvas's aspect"]);
    expect(lines(reading({ turned: false })), 'E4 the light not turned with the view')
      .toEqual(["the sky on the hands is not the world's up in this view", "the key on the hands is not the world's key in this view"]);
  });

  it('a reading that cannot judge the hands is SETUP, never a pass and never a fault in them', () => {
    const lost = viewmodelVerdict(reading({ lost: true }));
    expect(lost.map((f) => [f.setup, f.line])).toEqual([[true, 'SETUP: the WebGL context was lost']]);
    // A page that drew nothing also read no passes: judged anyway, that would blame the composer for the stall.
    const still = viewmodelVerdict({ ...reading(), drawn: 0, calls: 0, hands: 0, passes: null });
    expect(still.every((f) => f.setup)).toBe(true);
    expect(still.length).toBe(2);
  });
});
