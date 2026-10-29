// The first-person hands as a viewmodel: their own scene, camera and render pass, drawn by the composer right after
// the world (GameScene.jsx PostFX), so they take the grade, SMAA, tone mapping and bloom like everything else but never
// sink into a wall. No JSX here, so the projection, the pass, the value floor and the anchors are node-testable
// (tests/gates/viewmodel-gates.test.js); render/ViewmodelLayer.jsx mounts the hands into this scene.
import * as THREE from 'three';
import { RenderPass } from 'postprocessing';
import { getToonGradient } from './characterStyle.js';
import { FLASH_COLOR, hemiWithFlash } from '../game/lightning.js';
import { TIERS } from './quality.js';
import { CHUNK_SIZE } from '../world/chunkLayout.js';
import { ELEMENT_COLOR } from './beastAvatarParts.js';

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
 * defaults to true) and three would then clear the world before drawing the hands. With `hands` given and empty (the
 * lookbook, capture, no Player) it draws nothing; the composer's depth copy after it still runs, as the frame's one.
 */
export class ViewmodelPass extends RenderPass {
  constructor(scene, camera, hands = null) {
    super(scene, camera);
    this.name = 'ViewmodelPass';
    this.hands = hands;
    this.clearPass.enabled = false;
    this.ignoreBackground = true;
    // RenderPass.render turns the shadow map's autoUpdate off for the draw and restores it after.
    this.skipShadowMapUpdate = true;
    // After this pass the composer copies the depth buffer into the stable depth texture (postprocessing 6.39.5
    // EffectComposer.render, blitDepthBuffer), which GodRays copies under its light pass so the sun is drawn only where
    // nothing nearer stands (GodRaysEffect.update). With the hands in that copy, a gauntlet in front of the sun hides it.
    // The world's RenderPass, just before, is kept from copying too (oneDepthCopy).
    this.needsDepthBlit = true;
  }

  render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest) {
    if (this.hands && this.hands.children.length === 0) return;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    try {
      super.render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest);
    } finally {
      renderer.autoClear = autoClear;
    }
  }
}

/**
 * One depth copy a frame. The composer copies the depth buffer after every pass that sets needsDepthBlit, and the
 * world's RenderPass sets it as ViewmodelPass does, so with GodRays mounted the world's copy is overwritten by the one
 * after the hands. While `pass` is enabled and follows a RenderPass directly, that RenderPass does not copy; in
 * any other arrangement it copies again. Returns whether it changed anything. Called each frame by render/postFx.jsx.
 */
export function oneDepthCopy(composer, pass) {
  const passes = composer && composer.passes;
  if (!passes) return false;
  const i = passes.indexOf(pass);
  let changed = false;
  for (let j = 0; j < passes.length; j++) {
    const p = passes[j];
    if (!(p instanceof RenderPass) || p === pass) continue;
    const copies = !(pass.enabled && i === j + 1);
    if (p.needsDepthBlit !== copies) { p.needsDepthBlit = copies; changed = true; }
  }
  return changed;
}

/**
 * The world's point lights the hands take: the strongest at the eye, this many. A fixed count, because three compiles the
 * point-light count into every lit shader: the gauntlets' programs link once, and an unused light sits at intensity 0.
 */
export const HAND_POINT_LIGHTS = 3;

/** The light on the hands: the world's ambient, hemisphere and key, and its strongest point lights at the eye, mirrored
 *  each frame. None casts a shadow. */
export function makeHandLightRig() {
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.55);
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.castShadow = false;
  const points = Array.from({ length: HAND_POINT_LIGHTS }, () => new THREE.PointLight(0xffffff, 0));
  return { ambient, hemi, key, points };
}

const _lw = new THREE.Vector3();

/** The light a point light `L` puts on a point at world `eye`, by three's own falloff (its distance cut-off, windowed,
 *  and its decay), ignoring colour and facing. 0 past its reach, when dark, or for a light kept off the hands
 *  (userData.lightsHands false: the player's own beast core, render/lightPool.jsx PooledLight). */
export function lightAtEye(L, eye) {
  if (!(L.intensity > 0) || L.userData.lightsHands === false) return 0;
  const d = L.getWorldPosition(_lw).distanceTo(eye);
  let falloff = 1 / Math.max(Math.pow(d, L.decay), 0.01);
  if (L.distance > 0) {
    const q = d / L.distance;
    const w = Math.min(Math.max(1 - q * q * q * q, 0), 1);
    falloff *= w * w;
  }
  return L.intensity * falloff;
}

// The strongest lights so far, strongest first, and their light at the eye: fixed arrays, filled in place each frame.
const _top = new Array(HAND_POINT_LIGHTS).fill(null);
const _topScore = new Array(HAND_POINT_LIGHTS).fill(0);
const _eyeW = new THREE.Vector3();

/**
 * Mirror the world's point lights (`lights`, an array of three PointLights) that put the most light on the eye into
 * the rig's `points` (at most HAND_POINT_LIGHTS), each at its place relative to `camera` (view space, where the hands
 * are drawn), with its colour, intensity, reach and decay; the rest of the rig goes dark. Returns how many were taken.
 * The ranking is an insertion into fixed arrays, so a frame allocates nothing.
 */
export function mirrorPointLights(lights, camera, points) {
  camera.getWorldPosition(_eyeW);
  const cap = Math.min(points.length, HAND_POINT_LIGHTS);
  let n = 0;
  for (let j = 0; j < lights.length; j++) {
    const L = lights[j];
    const s = lightAtEye(L, _eyeW);
    if (!(s > 0) || (n === cap && s <= _topScore[cap - 1])) continue;
    let i = n < cap ? n++ : cap - 1;
    while (i > 0 && _topScore[i - 1] < s) {
      _top[i] = _top[i - 1];
      _topScore[i] = _topScore[i - 1];
      i -= 1;
    }
    _top[i] = L;
    _topScore[i] = s;
  }
  for (let i = 0; i < points.length; i++) {
    const P = points[i];
    if (i < n) {
      const L = _top[i];
      camera.worldToLocal(L.getWorldPosition(P.position));
      P.color.copy(L.color);
      P.intensity = L.intensity;
      P.distance = L.distance;
      P.decay = L.decay;
    } else if (P.intensity !== 0) {
      P.intensity = 0;
    }
  }
  _top.fill(null);
  return n;
}

/**
 * The hands receive no shadow, so the world's shadow reaches them through this instead: a ray from the eye toward the
 * key light, every `everyS`, against the world's fixed colliders; where it is blocked (a cave, a roof, a tree) the key
 * on the hands fades out over `easeS`, as the world around them is in the sun's shadow. `reachM` is the far corner of
 * the loaded square at the largest render distance, so every chunk collider that can stand in the sun's way is in
 * reach; one ray at 10 Hz.
 */
const LOADED_CORNER_M = (Math.max(...Object.values(TIERS).map((t) => t.renderDistance)) + 0.5) * CHUNK_SIZE * Math.SQRT2;
export const HAND_SHADE = Object.freeze({ everyS: 0.1, reachM: Math.ceil(LOADED_CORNER_M), easeS: 0.12 });

/** The share of the key light on the hands after `dtS`, eased from `current` toward 1 (`open`) or 0. */
export function easeKeyVisibility(current, open, dtS, easeS = HAND_SHADE.easeS) {
  const target = open ? 1 : 0;
  return current + (target - current) * (1 - Math.exp(-Math.max(0, dtS) / easeS));
}

const _inv = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _flashColor = new THREE.Color(FLASH_COLOR);

/**
 * Copy the sky frame's light (render/mood.js makeSkyFrame: ambient, hemiSky, hemiGround, keyColor, keyDir and their
 * intensities) onto the hand rig. The hands sit in view space, so the key's world direction and the sky's up are turned
 * by the inverse of the camera's world rotation: the key lights the side of the gauntlet that faces the sun.
 * `keyVisibility` scales the key (the world's shadow, HAND_SHADE); `flash` is the storm's lightning on the sky term,
 * added as the world's hemisphere takes it (game/lightning.js hemiWithFlash).
 */
export function mirrorSkyLight(frame, cameraQuaternion, rig, keyVisibility = 1, flash = 0) {
  _inv.copy(cameraQuaternion).invert();
  rig.ambient.color.copy(frame.ambient);
  rig.ambient.intensity = frame.ambientIntensity;
  hemiWithFlash(rig.hemi, frame.hemiSky, frame.hemiGround, frame.hemiIntensity, flash, _flashColor);
  rig.hemi.position.copy(_v.set(0, 1, 0).applyQuaternion(_inv));
  rig.key.color.copy(frame.keyColor);
  rig.key.intensity = frame.keyIntensity * keyVisibility;
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
  scene.add(rig.ambient, rig.hemi, rig.key, rig.key.target, ...rig.points, hands);
  const pass = new ViewmodelPass(scene, camera, hands);
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

/**
 * The form's colour on the gauntlets (DECISIONS 2026-10-29 item 87). In first person the player's own beast draws
 * nothing but its shadow, so while a form is on the gauntlets carry the form's element glow
 * (render/beastAvatarParts.js ELEMENT_COLOR, the beast's own rim and core) as the beast does: on their ink outlines, the
 * rim that runs round every edge the player sees, and in the ember core at the core's gain, which the bloom carries. Not
 * on the plates: added to their ember gold, a cool glow reads salmon or pink, not the form. It eases toward the form with
 * time constant `tauS`, in and out. `colour` is each form's colour on the gauntlets: the beast's own glow, but for fire,
 * whose orange glow (#FF6A2C) stands 24 degrees of OKLCH hue and 0.04 of lightness off the plates and 21 degrees and
 * 0.07 off the ember core, so it vanished into them; a crimson stands 41 degrees and 0.19 under the plates and 38
 * degrees and 0.22 under the ember core.
 */
export const FORM_TINT = Object.freeze({
  tauS: 0.12,
  colour: Object.freeze({ ...Object.fromEntries(Object.entries(ELEMENT_COLOR).map(([el, c]) => [el, c.glow])), fire: '#D4142C' }),
});

const _emberCore = new THREE.Color(GAUNTLET.core).multiplyScalar(GAUNTLET.coreGain);
const _ink = new THREE.Color(GAUNTLET.ink);
const _formGlow = Object.freeze(Object.fromEntries(Object.entries(FORM_TINT.colour).map(([el, hex]) => [el, new THREE.Color(hex)])));
const _formCore = new THREE.Color();

/**
 * One frame of the form's colour on the gauntlet materials `mats` (makeGauntletMaterials) and their outline materials
 * `rims` (each with a `uniforms.color`, drei's Outlines): `tint` ({ w, el }, the caller's) eases its weight `w` toward 1
 * while the form `el` is on and toward 0 when `el` is null, over `dtS` seconds, keeping the colour of the form that is
 * fading until it has faded. Writes in place; allocates nothing.
 */
export function stepFormTint(tint, el, dtS, mats, rims) {
  const glow = el ? _formGlow[el] : null;
  if (glow) tint.el = el;
  const k = 1 - Math.exp(-(dtS > 0 ? dtS : 0) / FORM_TINT.tauS);
  tint.w += ((glow ? 1 : 0) - tint.w) * k;
  if (!glow && tint.w < 1e-3) { tint.w = 0; tint.el = null; }
  const shown = tint.el ? _formGlow[tint.el] : null;
  if (shown) mats.core.color.copy(_emberCore).lerp(_formCore.copy(shown).multiplyScalar(GAUNTLET.coreGain), tint.w);
  else mats.core.color.copy(_emberCore);
  for (let i = 0; i < rims.length; i++) {
    const c = rims[i].uniforms.color.value.copy(_ink);
    if (shown) c.lerp(shown, tint.w);
  }
  return tint;
}

/** A toon material with the floor, for anything else the hands hold (the selected block). */
export function makeHeldMaterial(hex) {
  return installValueFloor(new THREE.MeshToonMaterial({ color: hex, gradientMap: getToonGradient() }));
}
