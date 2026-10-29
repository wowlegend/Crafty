import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  VIEWMODEL, squashDepth, ViewmodelCamera, ViewmodelPass, getViewmodel, HAND_ANCHORS, handAnchors, HAND_REST_ROT, oneDepthCopy,
  GAUNTLET_PARTS, HAND_VALUE_FLOOR, installValueFloor, GAUNTLET, makeGauntletMaterials, makeHeldMaterial, mirrorSkyLight,
  makeHandLightRig, mirrorPointLights, lightAtEye, HAND_POINT_LIGHTS,
} from '../../src/render/viewmodel.js';
import { getToonGradient } from '../../src/render/characterStyle.js';
import { RenderPass, EffectPass } from 'postprocessing';
import { UI } from '../../src/theme/tokens.js';

/**
 * THE HANDS ARE A VIEWMODEL (plan docs/superpowers/plans/2026-10-29-crafty-w2e-hands.md).
 *
 * Driven on real three objects: the viewmodel camera's projection, the pass against a recording renderer, the value
 * floor run through three's own toon fragment shader, the gauntlet materials, the hand anchors across aspects, and the
 * light rig mirrored from a sky frame.
 * BLIND SPOT: whether the gauntlets read at midnight on a GPU is the lookbook's `hands` set (mean and median luma of the
 * hand pixels against a floor declared in the plan). The layer's per-frame wiring and the wand are
 * viewmodel-layer-gates; the pass's place in GameScene's composer is viewmodel-composer-gates, and that the live
 * composer draws it every frame is tests/e2e/viewmodel.spec.js.
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
    expect(pass.needsDepthBlit, 'the hands must reach the depth GodRays tests the sun against, or it shines through them').toBe(true);
  });

  it('restores autoClear even when the draw throws', () => {
    const pass = new ViewmodelPass(new THREE.Scene(), new ViewmodelCamera());
    const r = fakeRenderer([]);
    r.render = () => { throw new Error('lost context'); };
    expect(() => pass.render(r, {}, null, 0, false)).toThrow('lost context');
    expect(r.autoClear).toBe(true);
  });

  it('with its hands group empty it draws nothing, and with a hand mounted it draws', () => {
    const scene = new THREE.Scene();
    const hands = new THREE.Group();
    scene.add(hands);
    const pass = new ViewmodelPass(scene, new ViewmodelCamera(), hands);
    const calls = [];
    pass.render(fakeRenderer(calls), {}, null, 0, false);
    expect(calls.filter((c) => c.op === 'render'), 'an empty viewmodel scene was drawn').toHaveLength(0);
    hands.add(new THREE.Mesh());
    pass.render(fakeRenderer(calls), {}, null, 0, false);
    expect(calls.filter((c) => c.op === 'render'), 'the mounted hand was not drawn').toHaveLength(1);
    expect(getViewmodel().pass.hands, 'the live pass does not watch the live hands group').toBe(getViewmodel().hands);
  });

  it('one depth copy a frame: the world\'s pass stops copying while the viewmodel pass follows it, and copies again otherwise', () => {
    const world = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    const vm = new ViewmodelPass(new THREE.Scene(), new ViewmodelCamera());
    const effects = new EffectPass(new THREE.PerspectiveCamera());
    expect(world.needsDepthBlit, 'SETUP: a RenderPass copies depth by default').toBe(true);
    const composer = { passes: [world, vm, effects] };
    expect(oneDepthCopy(composer, vm)).toBe(true);
    expect([world.needsDepthBlit, vm.needsDepthBlit]).toEqual([false, true]);
    expect(oneDepthCopy(composer, vm), 'an unchanged frame changed something').toBe(false);
    vm.enabled = false;
    oneDepthCopy(composer, vm);
    expect(world.needsDepthBlit, 'the hands are off and the world no longer copies its depth: GodRays tests a stale one').toBe(true);
    vm.enabled = true;
    composer.passes = [world, effects, vm];
    oneDepthCopy(composer, vm);
    expect(world.needsDepthBlit, 'an effect between them reads the depth the world pass no longer copied').toBe(true);
    expect(oneDepthCopy(null, vm)).toBe(false);
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

// The floor as the plan declares it, max(lit, albedo x floor), written out here rather than imported from the module
// under test: an imported line would pass whatever it said.
const FLOOR_LINE = 'outgoingLight = max( outgoingLight, diffuseColor.rgb * uValueFloor );';

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
    expect(f.split(FLOOR_LINE).length - 1, 'the floor line, max(lit, albedo x floor), must land exactly once').toBe(1);
    const decl = f.indexOf('vec3 outgoingLight =');
    const floorAt = f.indexOf(FLOOR_LINE);
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

  it('the held block\'s material is a floored toon on the shared gradient, in the block\'s own colour', () => {
    const m = makeHeldMaterial('#567C35');
    expect(m).toBeInstanceOf(THREE.MeshToonMaterial);
    expect(m.gradientMap).toBe(getToonGradient());
    expect(m.color.equals(new THREE.Color('#567C35'))).toBe(true);
    expect(m.userData.valueFloor?.value).toBe(HAND_VALUE_FLOOR);
    expect(compile(m).fragmentShader).toContain(FLOOR_LINE);
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

  it('the core is unlit and above Bloom\'s 0.65 luminance threshold; the plate\'s colour is under it', () => {
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

  // The centre test above lets a fist's centre sit at 0.9 of the half-width, where a third of the fist is off screen. This
  // projects the fist's own boxes (GAUNTLET_PARTS, the geometry Gauntlet draws) at the rest pose (HAND_REST_ROT) from
  // the anchors, and measures how much of each box's projected extent is inside the frame, phone portrait (0.46) to
  // 32:9. The swing, cast and charge poses move the fists further and are not covered here.
  it('each fist and its knuckle plate stay at least 90% inside the frame at the rest pose, at every aspect', () => {
    const parts = GAUNTLET_PARTS.filter((p) => p.name === 'fist' || p.name === 'knuckles');
    expect(parts.length).toBe(2);
    const corners = ({ pos, size }) => {
      const out = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        out.push(new THREE.Vector3(pos[0] + sx * size[0] / 2, pos[1] + sy * size[1] / 2, pos[2] + sz * size[2] / 2));
      }
      return out;
    };
    const inFrame = (pts, cam) => {
      const n = pts.map((v) => v.clone().applyMatrix4(cam.projectionMatrix));
      const x0 = Math.min(...n.map((v) => v.x)), x1 = Math.max(...n.map((v) => v.x));
      const y0 = Math.min(...n.map((v) => v.y)), y1 = Math.max(...n.map((v) => v.y));
      const inX = Math.max(0, Math.min(x1, 1) - Math.max(x0, -1)), inY = Math.max(0, Math.min(y1, 1) - Math.max(y0, -1));
      return (inX * inY) / ((x1 - x0) * (y1 - y0));
    };
    const shares = [];
    for (const a of [0.46, 0.5, 0.69, 1.0, 1.6, 2.4, 3.56]) {
      const cam = new ViewmodelCamera();
      cam.aspect = a;
      cam.updateProjectionMatrix();
      const anchors = handAnchors(a);
      for (const side of ['right', 'left']) {
        const hand = new THREE.Object3D();
        hand.position.copy(anchors[side]);
        hand.rotation.set(...HAND_REST_ROT[side]);
        hand.updateMatrixWorld(true);
        for (const p of parts) {
          const share = inFrame(corners(p).map((c) => c.applyMatrix4(hand.matrixWorld)), cam);
          shares.push(share);
          expect(share, `aspect ${a}, ${side} ${p.name}: ${(share * 100).toFixed(0)}% inside the frame`).toBeGreaterThanOrEqual(0.9);
        }
      }
    }
    expect(shares.length).toBe(28);
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

  it('turns the sky\'s up into the view: looking straight down, the sky lies behind the view', () => {
    const rig = makeHandLightRig();
    mirrorSkyLight(frame, new THREE.Quaternion(), rig);
    expect(rig.hemi.position.toArray().map((v) => +v.toFixed(6))).toEqual([0, 1, 0]); // level: the sky is up
    const lookingDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    mirrorSkyLight(frame, lookingDown, rig);
    const up = rig.hemi.position.clone().normalize();
    expect(up.x).toBeCloseTo(0, 6);
    expect(up.y, 'looking down, the sky must no longer be above the view').toBeCloseTo(0, 6);
    expect(up.z).toBeCloseTo(1, 6);
  });

  it('the rig casts no shadow', () => {
    const rig = makeHandLightRig();
    expect(rig.key.castShadow).toBe(false);
  });
});

describe('the world\'s point lights on the hands: the strongest at the eye, mirrored into view space', () => {
  /** A world point light at `pos`, as three draws it. */
  const lamp = (pos, { color = 0xff8a2a, intensity = 1.6, distance = 9, decay = 2 } = {}) => {
    const L = new THREE.PointLight(color, intensity, distance, decay);
    L.position.set(...pos);
    L.updateMatrixWorld(true);
    return L;
  };
  /** A camera at the eye, turned to `yaw`, with its world matrix current. */
  const eyeAt = (pos, yaw) => {
    const cam = new THREE.PerspectiveCamera(75, 1.6, 0.1, 500);
    cam.position.set(...pos);
    cam.rotation.set(0, yaw, 0, 'YXZ');
    cam.updateMatrixWorld(true);
    return cam;
  };

  it('a brazier 1.5 m off lands in the rig at its place in the view, with its colour, intensity, reach and decay', () => {
    const rig = makeHandLightRig();
    expect(rig.points.length, 'the rig\'s point-light count is fixed, so no hand shader relinks').toBe(HAND_POINT_LIGHTS);
    const cam = eyeAt([10, 53.6, 10], 0.9);
    const brazier = lamp([11.2, 53.1, 9.2]);
    const used = mirrorPointLights([brazier], cam, rig.points);
    expect(used, 'the brazier was not taken').toBe(1);
    const want = cam.worldToLocal(brazier.position.clone());
    expect(rig.points[0].position.distanceTo(want), 'the light is not where the brazier is relative to the view').toBeLessThan(1e-9);
    expect(rig.points[0].color.getHex()).toBe(0xff8a2a);
    expect([rig.points[0].intensity, rig.points[0].distance, rig.points[0].decay]).toEqual([1.6, 9, 2]);
    expect(rig.points.slice(1).every((p) => p.intensity === 0), 'an unused rig light is lit').toBe(true);
    expect(rig.points.every((p) => !p.castShadow)).toBe(true);
  });

  it('takes the strongest at the eye, by three\'s own falloff, and leaves out what cannot reach or is dark', () => {
    const rig = makeHandLightRig();
    const cam = eyeAt([0, 50, 0], 0);
    const near = lamp([1, 50, 0], { intensity: 1 }); // 1 m: 1 / 1^2, windowed
    const bright = lamp([3, 50, 0], { intensity: 20, distance: 0 }); // 3 m, no cut-off: 20 / 9
    const far = lamp([0, 50, 6], { intensity: 2, distance: 0 }); // 6 m: 2 / 36
    const beyond = lamp([0, 50, -8], { intensity: 50, distance: 7.5 }); // past its own reach
    const dark = lamp([0.5, 50, 0], { intensity: 0 });
    const mid = lamp([0, 52, 0], { intensity: 1.5, distance: 0 }); // 2 m: 1.5 / 4
    const own = lamp([0, 49.4, -0.2], { intensity: 5.1, distance: 6 }); // the player's own beast core, kept off the hands
    own.userData.lightsHands = false;
    const used = mirrorPointLights([far, beyond, own, dark, mid, near, bright], cam, rig.points);
    expect(used).toBe(3);
    const at = (L) => cam.worldToLocal(L.position.clone());
    expect(rig.points.map((p) => p.intensity), 'not the three strongest, strongest first').toEqual([20, 1, 1.5]);
    expect(rig.points[0].position.distanceTo(at(bright))).toBeLessThan(1e-9);
    expect(rig.points[1].position.distanceTo(at(near))).toBeLessThan(1e-9);
    expect(rig.points[2].position.distanceTo(at(mid))).toBeLessThan(1e-9);
    expect(lightAtEye(beyond, new THREE.Vector3(0, 50, 0)), 'a light past its reach still counts').toBe(0);
    // Fewer lights than the rig holds: the rest go dark, and a later frame with none darkens them all.
    expect(mirrorPointLights([near], cam, rig.points)).toBe(1);
    expect(rig.points.map((p) => p.intensity)).toEqual([1, 0, 0]);
    expect(mirrorPointLights([], cam, rig.points)).toBe(0);
    expect(rig.points.map((p) => p.intensity)).toEqual([0, 0, 0]);
  });

  it('the scene the hands draw in carries the rig\'s point lights', () => {
    const vm = getViewmodel();
    const inScene = [];
    vm.scene.traverse((o) => { if (o.isPointLight) inScene.push(o); });
    expect(inScene.length).toBe(HAND_POINT_LIGHTS);
    expect(inScene.every((p) => vm.rig.points.includes(p))).toBe(true);
  });
});
