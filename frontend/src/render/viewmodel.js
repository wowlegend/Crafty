// The first-person hands as a viewmodel: their own scene, camera and render pass, drawn by the composer right after
// the world (GameScene.jsx PostFX), so they take the grade, SMAA, tone mapping and bloom like everything else but never
// sink into a wall. No JSX here, so the projection, the pass, the value floor and the anchors are node-testable
// (tests/gates/viewmodel-gates.test.js); render/ViewmodelLayer.jsx mounts the hands into this scene.
import * as THREE from 'three';
import { RenderPass } from 'postprocessing';
import { getToonGradient } from './characterStyle.js';

/**
 * fov: vertical degrees, fixed, so the main camera's speed FOV (75 to 85) does not stretch the hands.
 * depthSlice: the share of the depth buffer the hands occupy, at its near end. Not a depth clear: the composer copies
 * the depth buffer into the texture GodRays tests the sun against after ViewmodelPass as well (see needsDepthBlit
 * below), so the world's depth and the hands' must both be in the buffer then; a clear would leave the hands' alone and
 * the sun would shine through every wall. In the slice the hands are nearer than any world surface beyond
 * near / (1 - depthSlice) of the main camera (0.102 m against its 0.1 m near plane), and still test against each other.
 */
export const VIEWMODEL = Object.freeze({ fov: 60, near: 0.05, far: 6, depthSlice: 0.02 });

/** Rewrite a projection matrix's z row so NDC z maps from [-1, 1] to [-1, 2 * slice - 1]: z' = s z + (s - 1) w. */
export function squashDepth(matrix, slice) {
  const e = matrix.elements;
  for (let c = 0; c < 16; c += 4) e[c + 2] = slice * e[c + 2] + (slice - 1) * e[c + 3];
  return matrix;
}

export class ViewmodelCamera extends THREE.PerspectiveCamera {
  constructor() {
    super(VIEWMODEL.fov, 1, VIEWMODEL.near, VIEWMODEL.far);
    this.depthSlice = VIEWMODEL.depthSlice;
    this.updateProjectionMatrix();
  }

  updateProjectionMatrix() {
    super.updateProjectionMatrix();
    // The base constructor calls this before depthSlice exists.
    if (this.depthSlice === undefined) return;
    squashDepth(this.projectionMatrix, this.depthSlice);
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}

/**
 * Draws the viewmodel scene over the composer's input buffer: no clear pass and no background, and the renderer's
 * autoClear off for the draw, because R3F's composer turns autoClear ON around composer.render (its `autoClear` prop
 * defaults to true) and three would then clear the world before drawing the hands.
 */
export class ViewmodelPass extends RenderPass {
  constructor(scene, camera) {
    super(scene, camera);
    this.name = 'ViewmodelPass';
    this.clearPass.enabled = false;
    this.ignoreBackground = true;
    this.skipShadowMapUpdate = true;
    // After this pass the composer copies the depth buffer into the stable depth texture (postprocessing 6.39.5
    // EffectComposer.render, blitDepthBuffer), which GodRays copies under its light pass so the sun is drawn only where
    // nothing nearer stands (GodRaysEffect.update). With the hands in that copy, a gauntlet in front of the sun hides it.
    // The world's RenderPass copies too, just before; that copy is overwritten (REVIEW:w2e:viewmodel-pass-gpu-cost).
    this.needsDepthBlit = true;
  }

  render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest) {
    const autoClear = renderer.autoClear;
    const shadowAuto = renderer.shadowMap.autoUpdate;
    renderer.autoClear = false;
    try {
      super.render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest);
    } finally {
      renderer.autoClear = autoClear;
      renderer.shadowMap.autoUpdate = shadowAuto;
    }
  }
}

/** The light on the hands: the world's ambient, hemisphere and key, mirrored each frame. None casts a shadow. */
export function makeHandLightRig() {
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.55);
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.castShadow = false;
  return { ambient, hemi, key };
}

const _inv = new THREE.Quaternion();
const _v = new THREE.Vector3();

/**
 * Copy the sky frame's light (render/mood.js makeSkyFrame: ambient, hemiSky, hemiGround, keyColor, keyDir and their
 * intensities) onto the hand rig. The hands sit in view space, so the key's world direction and the sky's up are turned
 * by the inverse of the camera's world rotation: the key lights the side of the gauntlet that faces the sun.
 */
export function mirrorSkyLight(frame, cameraQuaternion, rig) {
  _inv.copy(cameraQuaternion).invert();
  rig.ambient.color.copy(frame.ambient);
  rig.ambient.intensity = frame.ambientIntensity;
  rig.hemi.color.copy(frame.hemiSky);
  rig.hemi.groundColor.copy(frame.hemiGround);
  rig.hemi.intensity = frame.hemiIntensity;
  rig.hemi.position.copy(_v.set(0, 1, 0).applyQuaternion(_inv));
  rig.key.color.copy(frame.keyColor);
  rig.key.intensity = frame.keyIntensity;
  const d = frame.keyDir;
  rig.key.position.copy(_v.set(d[0], d[1], d[2]).normalize().applyQuaternion(_inv).multiplyScalar(5));
  return rig;
}

let _vm = null;

/** The one viewmodel scene, camera, pass and light rig (process lifetime, like the toon gradient). `hands` is the group
 *  the hands mount into, apart from the rig, so the lookbook can count what is mounted. */
export function getViewmodel() {
  if (_vm) return _vm;
  const scene = new THREE.Scene();
  scene.name = 'viewmodel';
  const camera = new ViewmodelCamera();
  const rig = makeHandLightRig();
  const hands = new THREE.Group();
  hands.name = 'hands';
  scene.add(rig.ambient, rig.hemi, rig.key, rig.key.target, hands);
  const pass = new ViewmodelPass(scene, camera);
  _vm = { scene, camera, pass, rig, hands };
  return _vm;
}

/** How many objects are mounted under the hands group (0 when the hands are hidden). */
export function handNodeCount() {
  let n = -1;
  getViewmodel().hands.traverse(() => { n += 1; });
  return n;
}

/** Where the fists rest in view space on a landscape window, authored for VIEWMODEL.fov. */
export const HAND_ANCHORS = Object.freeze({
  right: Object.freeze([0.44, -0.34, -0.9]),
  left: Object.freeze([-0.44, -0.33, -0.88]),
});

/** A fist's centre stays within this share of the visible half-width at its depth, so it is in frame at any aspect. */
export const HAND_EDGE = 0.62;

/** The fists' rest positions for a window of `aspect` (width / height): the authored anchors, pulled inward on a narrow
 *  window (an iPad in portrait) until each sits inside HAND_EDGE of the visible half-width. */
export function handAnchors(aspect, fov = VIEWMODEL.fov, out = { right: new THREE.Vector3(), left: new THREE.Vector3() }) {
  const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2) * aspect;
  for (const side of ['right', 'left']) {
    const [x, y, z] = HAND_ANCHORS[side];
    const limit = HAND_EDGE * Math.abs(z) * t;
    out[side].set(Math.sign(x) * Math.min(Math.abs(x), limit), y, z);
  }
  return out;
}

/**
 * THE VALUE FLOOR: a lit surface never falls below this share of its own albedo, so the gauntlets read at midnight. Lit
 * light above the floor is untouched, so the day's shading is the world's.
 */
export const HAND_VALUE_FLOOR = 0.45;
const VALUE_FLOOR_GLSL = 'outgoingLight = max( outgoingLight, diffuseColor.rgb * uValueFloor );';

/** Patch `material` (a three lit material whose fragment declares `outgoingLight` before `opaque_fragment`, as toon,
 *  lambert, phong and standard do) with the floor. Keeps any earlier onBeforeCompile and keys its program apart. */
export function installValueFloor(material, floor = HAND_VALUE_FLOOR) {
  material.userData.valueFloor = { value: floor };
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    shader.uniforms.uValueFloor = material.userData.valueFloor;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uValueFloor;')
      .replace('#include <opaque_fragment>', `${VALUE_FLOOR_GLSL}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `valueFloor|${prevKey}`;
  return material;
}

/**
 * The ember gauntlets. plate: the game's ember gold (theme/tokens.js UI.ember, a shade deeper so a sunlit plate does
 * not bloom); leather: the glove under it; trim: the white-gold cuff; core: the ember set in the back of each hand, an
 * unlit HDR colour above Bloom's threshold (GameScene.jsx PostFX), which is what replaces the hand's point light.
 */
export const GAUNTLET = Object.freeze({
  plate: '#E8963A',
  leather: '#7A4A2A',
  trim: '#E8D9A8',
  ink: '#1A1A1F',
  core: '#FF9A2E',
  coreGain: 3,
});

/**
 * One gauntlet's boxes in the fist's frame, which the hand group places at its anchor: the leather forearm runs back
 * toward the camera (+z), an ember-gold plate on top carries the glowing core, a white-gold cuff at the wrist, the fist
 * with a knuckle plate. `mat` names a makeGauntletMaterials key; `outline` takes the ink outline.
 */
const part = (name, mat, pos, size, outline = true) => Object.freeze({ name, mat, pos: Object.freeze(pos), size: Object.freeze(size), outline });
export const GAUNTLET_PARTS = Object.freeze([
  part('forearm', 'leather', [0, -0.02, 0.3], [0.15, 0.15, 0.5]),
  part('plate', 'plate', [0, 0.065, 0.32], [0.165, 0.05, 0.36]),
  part('core', 'core', [0, 0.093, 0.3], [0.06, 0.012, 0.13], false),
  part('cuff', 'trim', [0, 0, 0.07], [0.19, 0.19, 0.05]),
  part('fist', 'leather', [0, 0, -0.04], [0.17, 0.15, 0.15]),
  part('knuckles', 'plate', [0, 0.085, -0.05], [0.175, 0.035, 0.11]),
]);

/** Each hand's rest rotation (Euler XYZ): the forearm runs back and down toward the camera, the fist turned a little
 *  inward. */
export const HAND_REST_ROT = Object.freeze({ right: Object.freeze([0.35, 0.12, 0]), left: Object.freeze([0.35, -0.12, 0]) });

/** Fresh materials for one pair of gauntlets; the caller disposes them (the toon gradient is shared and stays). */
export function makeGauntletMaterials() {
  const toon = (hex) => installValueFloor(new THREE.MeshToonMaterial({ color: hex, gradientMap: getToonGradient() }));
  const core = new THREE.MeshBasicMaterial({ color: new THREE.Color(GAUNTLET.core).multiplyScalar(GAUNTLET.coreGain) });
  return { plate: toon(GAUNTLET.plate), leather: toon(GAUNTLET.leather), trim: toon(GAUNTLET.trim), core };
}

/** A toon material with the floor, for anything else the hands hold (the selected block). */
export function makeHeldMaterial(hex) {
  return installValueFloor(new THREE.MeshToonMaterial({ color: hex, gradientMap: getToonGradient() }));
}
