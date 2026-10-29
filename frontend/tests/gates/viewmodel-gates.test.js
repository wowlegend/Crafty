import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  VIEWMODEL, squashDepth, ViewmodelCamera, ViewmodelPass, getViewmodel, HAND_ANCHORS, handAnchors,
  HAND_VALUE_FLOOR, VALUE_FLOOR_GLSL, installValueFloor, GAUNTLET, makeGauntletMaterials, mirrorSkyLight, makeHandLightRig,
} from '../../src/render/viewmodel.js';
import { getToonGradient } from '../../src/render/characterStyle.js';
import { UI } from '../../src/theme/tokens.js';

/**
 * THE HANDS ARE A VIEWMODEL (plan docs/superpowers/plans/2026-10-29-crafty-w2e-hands.md).
 *
 * Driven on real three objects: the viewmodel camera's projection, the pass against a recording renderer, the value
 * floor run through three's own toon fragment shader, the gauntlet materials, the hand anchors across aspects, and the
 * light rig mirrored from a sky frame.
 * BLIND SPOT: whether the gauntlets read at midnight on a GPU is the lookbook's `hands` set (mean and median luma of the
 * hand pixels against a floor declared in the plan), and whether the pass is in the live composer is the build's.
 */

const DEPTH = (cam, z) => {
  const v = new THREE.Vector3(0, 0, -z).applyMatrix4(cam.projectionMatrix);
  return (v.z + 1) / 2; // window depth with the default glDepthRange(0, 1)
};

describe('the viewmodel camera: its own FOV, and every depth it writes in front of the world', () => {
  const vm = new ViewmodelCamera();
  vm.aspect = 1.6;
  vm.updateProjectionMatrix();
  const main = new THREE.PerspectiveCamera(75, 1.6, 0.1, 500);
  const slice = VIEWMODEL.depthSlice;

  it('declares a narrow slice and its own fixed FOV, narrower than the main camera', () => {
    expect(slice).toBeGreaterThan(0);
    expect(slice).toBeLessThanOrEqual(0.05);
    expect(vm.fov).toBe(VIEWMODEL.fov);
    expect(VIEWMODEL.fov).toBeLessThan(75);
  });

  it('projects x and y exactly as an unsquashed camera of the same FOV', () => {
    const plain = new THREE.PerspectiveCamera(VIEWMODEL.fov, 1.6, VIEWMODEL.near, VIEWMODEL.far);
    const pts = [[0.5, -0.4, -0.9], [-0.48, -0.38, -0.88], [0.2, 0.3, -2.5], [-1, -1, -1]];
    for (const p of pts) {
      const a = new THREE.Vector3(...p).applyMatrix4(vm.projectionMatrix);
      const b = new THREE.Vector3(...p).applyMatrix4(plain.projectionMatrix);
      expect(a.x).toBeCloseTo(b.x, 9);
      expect(a.y).toBeCloseTo(b.y, 9);
    }
    expect(pts.length).toBe(4);
  });

  it('maps its near plane to window depth 0 and its far plane to the slice', () => {
    expect(DEPTH(vm, VIEWMODEL.near)).toBeCloseTo(0, 6);
    expect(DEPTH(vm, VIEWMODEL.far)).toBeCloseTo(slice, 6);
  });

  it('puts every hand distance below the slice, and every world surface beyond 0.1/(1 - slice) m above it', () => {
    let checked = 0;
    for (let z = 0.3; z <= 2.0; z += 0.05) { expect(DEPTH(vm, z)).toBeLessThan(slice); checked += 1; }
    const nearest = main.near / (1 - slice);
    for (const z of [nearest * 1.001, 0.15, 0.45, 1, 10, 499]) { expect(DEPTH(main, z)).toBeGreaterThan(slice); checked += 1; }
    expect(checked).toBe(40);
    // The control: the slice is real, and a world point nearer than that bound can lose (the main near plane clips it).
    expect(DEPTH(main, main.near * 1.0001)).toBeLessThan(slice);
  });

  it('keeps the squash through an aspect change, and its inverse matches', () => {
    vm.aspect = 0.69;
    vm.updateProjectionMatrix();
    expect(DEPTH(vm, VIEWMODEL.far)).toBeCloseTo(slice, 6);
    const id = vm.projectionMatrix.clone().multiply(vm.projectionMatrixInverse);
    expect(id.equals(new THREE.Matrix4()) || id.elements.every((e, i) => Math.abs(e - new THREE.Matrix4().elements[i]) < 1e-9)).toBe(true);
    vm.aspect = 1.6;
    vm.updateProjectionMatrix();
  });

  it('squashDepth on a plain projection maps NDC z from [-1, 1] to [-1, 2s - 1]', () => {
    const m = new THREE.PerspectiveCamera(60, 1, 1, 10).projectionMatrix.clone();
    squashDepth(m, 0.25);
    const at = (z) => new THREE.Vector3(0, 0, -z).applyMatrix4(m).z;
    expect(at(1)).toBeCloseTo(-1, 9);
    expect(at(10)).toBeCloseTo(-0.5, 9);
  });
});

describe('the viewmodel pass draws over the scene without clearing it', () => {
  const fakeRenderer = (calls) => ({
    autoClear: true,
    shadowMap: { autoUpdate: true },
    setRenderTarget(t) { calls.push({ op: 'target', t }); },
    render(scene, camera) { calls.push({ op: 'render', scene, camera, autoClear: this.autoClear, shadowAuto: this.shadowMap.autoUpdate }); },
    clear() { calls.push({ op: 'clear' }); },
    getClearColor() { return new THREE.Color(); }, getClearAlpha() { return 1; }, setClearColor() {}, setClearAlpha() {},
  });

  it('renders its own scene and camera into the input buffer, autoClear off during the draw and restored after', () => {
    const scene = new THREE.Scene();
    const camera = new ViewmodelCamera();
    const pass = new ViewmodelPass(scene, camera);
    const calls = [];
    const r = fakeRenderer(calls);
    const input = { id: 'input' };
    pass.render(r, input, null, 0, false);
    const renders = calls.filter((c) => c.op === 'render');
    expect(renders).toHaveLength(1);
    expect(renders[0].scene).toBe(scene);
    expect(renders[0].camera).toBe(camera);
    expect(renders[0].autoClear, 'autoClear on during the draw: three would clear the scene the composer just drew').toBe(false);
    expect(renders[0].shadowAuto, 'the viewmodel draw must not re-render the shadow map').toBe(false);
    expect(calls.filter((c) => c.op === 'clear')).toHaveLength(0);
    expect(calls.find((c) => c.op === 'target').t).toBe(input);
    expect(r.autoClear).toBe(true);
    expect(r.shadowMap.autoUpdate).toBe(true);
    expect(pass.needsSwap).toBe(false);
    expect(pass.name).toBe('ViewmodelPass');
  });

  it('restores autoClear even when the draw throws', () => {
    const pass = new ViewmodelPass(new THREE.Scene(), new ViewmodelCamera());
    const r = fakeRenderer([]);
    r.render = () => { throw new Error('lost context'); };
    expect(() => pass.render(r, {}, null, 0, false)).toThrow('lost context');
    expect(r.autoClear).toBe(true);
  });

  it('getViewmodel hands out one scene, camera and pass, wired to each other', () => {
    const a = getViewmodel(), b = getViewmodel();
    expect(a).toBe(b);
    expect(a.scene).toBeInstanceOf(THREE.Scene);
    expect(a.camera).toBeInstanceOf(ViewmodelCamera);
    expect(a.pass.scene).toBe(a.scene);
    expect(a.pass.camera).toBe(a.camera);
    expect(a.scene.fog).toBeNull();
  });
});

describe('the value floor, run through three\'s own toon shader', () => {
  const compile = (material) => {
    const shader = {
      uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.toon.uniforms),
      vertexShader: THREE.ShaderLib.toon.vertexShader,
      fragmentShader: THREE.ShaderLib.toon.fragmentShader,
    };
    material.onBeforeCompile(shader, null);
    return shader;
  };

  it('lands the floor once, after outgoingLight is declared and before it is written out, with its uniform bound', () => {
    const m = installValueFloor(new THREE.MeshToonMaterial(), 0.4);
    const s = compile(m);
    const f = s.fragmentShader;
    expect(f.split(VALUE_FLOOR_GLSL).length - 1, 'the floor line must land exactly once').toBe(1);
    const decl = f.indexOf('vec3 outgoingLight =');
    const floorAt = f.indexOf(VALUE_FLOOR_GLSL);
    const out = f.indexOf('#include <opaque_fragment>');
    expect(decl).toBeGreaterThan(-1);
    expect(floorAt).toBeGreaterThan(decl);
    expect(out).toBeGreaterThan(floorAt);
    expect(f).toMatch(/uniform float uValueFloor;/);
    expect(s.uniforms.uValueFloor.value).toBe(0.4);
    m.userData.valueFloor.value = 0.6;
    expect(s.uniforms.uValueFloor.value, 'the uniform must be the material\'s live value, not a copy').toBe(0.6);
  });

  it('keeps an earlier onBeforeCompile, and caches its program apart from a plain toon material', () => {
    const m = new THREE.MeshToonMaterial();
    let ran = 0;
    m.onBeforeCompile = () => { ran += 1; };
    installValueFloor(m, 0.3);
    compile(m);
    expect(ran).toBe(1);
    expect(m.customProgramCacheKey()).not.toBe(new THREE.MeshToonMaterial().customProgramCacheKey());
  });
});

const hueOf = (hex) => { const hsl = {}; new THREE.Color(hex).getHSL(hsl, THREE.SRGBColorSpace); return hsl.h * 360; };
const linY = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe('the gauntlet materials: toon, floored, ember, and a core bright enough to bloom', () => {
  const mats = makeGauntletMaterials();
  const toon = ['plate', 'leather', 'trim'];

  it('plates, leather and trim are toon materials on the shared two-band gradient, each with the value floor', () => {
    for (const k of toon) {
      expect(mats[k], k).toBeInstanceOf(THREE.MeshToonMaterial);
      expect(mats[k].gradientMap, k).toBe(getToonGradient());
      expect(mats[k].userData.valueFloor?.value, k).toBe(HAND_VALUE_FLOOR);
    }
    expect(toon.length).toBe(3);
  });

  it('the plate is the game\'s ember gold, and every gauntlet colour is warm', () => {
    // The reference must be a real colour: an undefined token reads as black, hue 0.
    expect(UI.color.ember).toMatch(/^#[0-9A-F]{6}$/i);
    expect(hueOf(UI.color.ember)).toBeGreaterThan(15);
    expect(Math.abs(hueOf(GAUNTLET.plate) - hueOf(UI.color.ember))).toBeLessThan(12);
    for (const k of toon) {
      const c = mats[k].color;
      expect(c.r, `${k} must read warm`).toBeGreaterThan(c.b * 1.3);
    }
  });

  it('the darkest gauntlet colour, held at the floor, keeps a readable luminance', () => {
    const floored = toon.map((k) => linY(mats[k].color) * HAND_VALUE_FLOOR);
    expect(Math.min(...floored)).toBeGreaterThanOrEqual(0.03);
    expect(HAND_VALUE_FLOOR).toBeLessThan(1);
  });

  it('the core is unlit and above Bloom\'s 0.65 luminance threshold; the plate under the same light is not', () => {
    expect(mats.core).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(linY(mats.core.color)).toBeGreaterThan(0.65 * 1.5);
    expect(linY(mats.plate.color)).toBeLessThan(0.65);
  });
});

describe('the hand anchors keep both gauntlets in frame at every aspect a player has', () => {
  const ndc = (v, aspect) => {
    const cam = new THREE.PerspectiveCamera(VIEWMODEL.fov, aspect, VIEWMODEL.near, VIEWMODEL.far);
    return v.clone().applyMatrix4(cam.projectionMatrix);
  };
  const aspects = [0.5, 0.69, 1.0, 1.44, 1.6, 2.4];

  it('both fists project inside the lower frame, one each side of centre, apart', () => {
    let checked = 0;
    for (const a of aspects) {
      const { right, left } = handAnchors(a);
      const r = ndc(right, a), l = ndc(left, a);
      for (const p of [r, l]) {
        expect(Math.abs(p.x), `aspect ${a}: a fist off the side of the frame`).toBeLessThanOrEqual(0.9);
        expect(p.y, `aspect ${a}`).toBeGreaterThanOrEqual(-0.95);
        expect(p.y, `aspect ${a}`).toBeLessThanOrEqual(-0.4);
      }
      expect(r.x, `aspect ${a}`).toBeGreaterThan(0);
      expect(l.x, `aspect ${a}`).toBeLessThan(0);
      expect(r.x - l.x, `aspect ${a}: the fists crowd together`).toBeGreaterThanOrEqual(0.3);
      checked += 1;
    }
    expect(checked).toBe(aspects.length);
  });

  it('a landscape window keeps the authored anchors', () => {
    const { right, left } = handAnchors(1.6);
    expect(right.toArray()).toEqual([...HAND_ANCHORS.right]);
    expect(left.toArray()).toEqual([...HAND_ANCHORS.left]);
  });
});

describe('the light on the hands is the world\'s, turned into the camera\'s view', () => {
  const frame = {
    ambient: new THREE.Color(0.2, 0.3, 0.4), ambientIntensity: 0.7,
    hemiSky: new THREE.Color(0.5, 0.6, 0.7), hemiGround: new THREE.Color(0.3, 0.2, 0.1), hemiIntensity: 0.4,
    keyColor: new THREE.Color(1, 0.8, 0.6), keyIntensity: 1.9, keyDir: [0, 0, -1],
  };

  it('copies colours and intensities, and puts the key where the world key is relative to the view', () => {
    const rig = makeHandLightRig();
    const facingNorth = new THREE.Quaternion();
    mirrorSkyLight(frame, facingNorth, rig);
    expect(rig.ambient.color.equals(frame.ambient)).toBe(true);
    expect(rig.ambient.intensity).toBe(0.7);
    expect(rig.hemi.color.equals(frame.hemiSky)).toBe(true);
    expect(rig.hemi.groundColor.equals(frame.hemiGround)).toBe(true);
    expect(rig.hemi.intensity).toBe(0.4);
    expect(rig.key.color.equals(frame.keyColor)).toBe(true);
    expect(rig.key.intensity).toBe(1.9);
    const dirN = rig.key.position.clone().sub(rig.key.target.position).normalize();
    expect(dirN.z).toBeCloseTo(-1, 6); // the key ahead of a camera looking north (-Z)
    const facingSouth = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    mirrorSkyLight(frame, facingSouth, rig);
    const dirS = rig.key.position.clone().sub(rig.key.target.position).normalize();
    expect(dirS.z, 'turned around, the key must come from behind the view').toBeCloseTo(1, 6);
  });

  it('the rig casts no shadow', () => {
    const rig = makeHandLightRig();
    expect(rig.key.castShadow).toBe(false);
  });
});
