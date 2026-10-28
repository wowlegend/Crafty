// The atmosphere: one component owns the gradient skydome, fog, the light rig (ambient, the one directional KEY light,
// fill, hemisphere) and the smoothed danger mood. Each frame it lerps moodRef toward moodTarget(dangerLevel,
// weatherBoost), resolves THE SKY FRAME for the clock's cycle (render/mood.js sampleMood: the colour script under the
// danger overlays) and publishes a copy of it (publishSkyFrame -> skyFrameRef) for every other reader: the sun
// billboard, the grade, the terrain and the far field. It is the ONLY caller of sampleMood (the sky-readers gate in
// tests/gates/atmosphere-isolation-gates.test.js). In capture mode the mood SNAPS to target and the cycle is DECLARED
// (captureCycle), for deterministic frames.
import { useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore.jsx';
import { isCaptureMode } from '../devtest/captureMode.js';
import {
  moodRef, moodTarget, sampleMood, publishSkyFrame, skyFrameRef, captureCycle, liveCycle, sunDirRef, cloudCoverRef,
  lightningFlashRef,
} from './mood.js';
import { makeSkyDomeMaterial } from './skyDome.js';
import { cloudTint } from './cloudField.js';
import { makeSkyClock, followSkyClock, resetSkyClock } from './skyClock.js';
import { frameElapsed } from '../devtest/captureClock.js';
import { realDelta } from '../game/worldClock.js';
import { resetShadowForConfig } from './shadowReset.js';
import { TERRAIN_SURFACE } from '../world/terrainSurface.js';
import { registerTestHook, callTestHook } from '../devtest/testBridge.js';
import { createShadowSchedule, shadowDue, shadowWorldEpoch } from './shadowSchedule.js';
import { ecs, mobsQuery, alliesQuery } from '../ecs/world';
import { FLASH_COLOR, hemiWithFlash } from '../game/lightning.js';

// The shadow's DYNAMIC CASTERS that live in the ECS (render/shadowSchedule.js): mobs and villagers, squad allies, and the
// loot and XP pickups (pickupVfx casts). The same component sets the systems use; miniplex reuses a query per key.
const lootQuery = ecs.with('isLootDrop', 'position');
const orbQuery = ecs.with('isXPOrb', 'position');

// The lightning flash's colour in the working (linear) space, parsed once.
const _flashColor = new THREE.Color(FLASH_COLOR);

// ─────────────────────────────────────────────────────────────────────────────
// S1-D-M3: HEIGHT / VALLEY-MIST FOG (subtle).
//
// Evolves the flat FogExp2 toward a height-fog feel — denser low (valley mist), clearer
// up — by patching three's standard fog ShaderChunks ONCE (global, idempotent). This
// touches NO material directly (terrain materials are off-limits this task) and adds NO
// new uniforms: it reuses the existing `fogDensity` uniform (already mood-driven by
// <Atmosphere> below, and SNAPPED in capture), so it is fully capture-deterministic — the
// height term is a pure function of world-space Y and the mood-snapped density. The profile
// reaches full strength at/below FOG_SEA_LEVEL and fades to a residual floor by
// FOG_SEA_LEVEL + FOG_HEIGHT_FALLOFF metres, so distant peaks read clear while the valley
// floor reads misty. Kept subtle (FOG_RESIDUAL floor) so it never crushes mid-height detail.
const FOG_SEA_LEVEL = 56.0;        // world Y at/below which fog is at full density
const FOG_HEIGHT_FALLOFF = 34.0;   // metres over which fog thins toward the residual floor
const FOG_RESIDUAL = 0.55;         // min fog multiplier high up (keep subtle, not zero)
let _heightFogPatched = false;
// EXPORTED for the gate. It mutates THREE.ShaderChunk, which is observable, so the patch can be
// asserted on what three will COMPILE rather than on what the source file says.
export function installHeightFog() {
  if (_heightFogPatched) return;
  _heightFogPatched = true;
  // Add a world-Y varying alongside three's view-depth fog varying.
  THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
	varying float vFogDepth;
	varying float vFogWorldY;
#endif`;
  // The world Y comes from mvPosition, the one input every stock shader that includes fog_vertex has built by then (the
  // stock chunk reads mvPosition.z). The sprite shader declares no `transformed` and builds mvPosition from
  // modelViewMatrix[ 3 ] (three 0.172 ShaderLib/sprite.glsl.js:15), so a chunk that reads `transformed` does not
  // compile for a fogged SpriteMaterial. mvPosition already carries instanceMatrix (each grass blade at its own
  // height, not its chunk's origin), batchingMatrix, skinning, morphs and the sprite's billboard offset.
  // viewMatrix is a rigid [ R | t ], so world = R^T ( view - t ), and GLSL's `v * M` is transpose( M ) * v. A camera
  // whose world matrix carries scale would misplace the height; no camera here is scaled or has a scaled parent.
  THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWorldY = ( ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix ) ).y;
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying float vFogWorldY;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`;
  // Distance fog as before, then a valley-mist height multiplier on the fog factor:
  // full strength at/below sea level, easing to FOG_RESIDUAL by sea+falloff.
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	float heightT = clamp( ( vFogWorldY - ${FOG_SEA_LEVEL.toFixed(1)} ) / ${FOG_HEIGHT_FALLOFF.toFixed(1)}, 0.0, 1.0 );
	float heightMul = mix( 1.0, ${FOG_RESIDUAL.toFixed(2)}, heightT );
	fogFactor *= heightMul;
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
}
// Patch at module-eval time (when GameScene imports <Atmosphere>) — BEFORE any material
// compiles its fog shader, so terrain/water pick up the height term on first compile.
installHeightFog();


/**
 * PURE. Where the shadow frustum's centre belongs this frame, texel-snapped.
 *
 * WHY SNAP. A directional shadow map is a grid in light space. Slide its centre by a fraction of a texel
 * and every shadow edge re-samples on a different boundary, so the whole world's shadows CRAWL as the
 * player walks — the classic artefact, and far more visible on voxel geometry where every edge is a
 * straight line. Quantising the centre to whole-texel steps means the map slides in discrete jumps and
 * the edges stay put between them. It is one multiply and two rounds per frame.
 *
 * @param {{x:number,z:number}} pos      the player's world position (transient read at the call site)
 * @param {number} extent                half-width of the ortho frustum, world units
 * @param {number} mapSize               shadow map resolution in texels
 * @returns {{x:number,z:number}}        the snapped centre
 */
export function snapShadowCentre(pos, extent, mapSize) {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return { x: 0, z: 0 };
  const unitsPerTexel = (extent * 2) / Math.max(1, mapSize);
  if (!Number.isFinite(unitsPerTexel) || unitsPerTexel <= 0) return { x: pos.x, z: pos.z };
  return {
    x: Math.round(pos.x / unitsPerTexel) * unitsPerTexel,
    z: Math.round(pos.z / unitsPerTexel) * unitsPerTexel,
  };
}

/** Fallback bearing if a mood ever supplies no sunPos. Same bearing as the historical constant. */
export const SUN_OFFSET = { x: 50, y: 100, z: 50 };

/** How far up the light-direction ray the sun sits. Only has to clear terrain so nothing is clipped by
 *  the shadow camera's `near`; a directional light's position otherwise carries no distance meaning. */
export const SUN_DISTANCE = 140;


/** Above this y-component the sun counts as above the horizon (god rays allowed). A small positive
 *  epsilon rather than 0: exactly at the horizon the screen-space projection is at its least stable,
 *  which is the three.js#18446 sign-flip region. */
export const SUN_HORIZON_EPS = 0.02;

/**
 * PURE. Where the sun light belongs: the MOOD owns the direction, the PLAYER owns the centre.
 *
 * WHY THIS EXISTS AS ONE FUNCTION. Both facts were being written to `sunRef.current.position` from two
 * places in the same useFrame — my player-follow write near the top, and the long-standing
 * `position.set(m.sunPos)` in the mood block below. The later one silently won, so the follow was dead
 * code AND the target still moved, which left the light-to-target vector rotating as the player walked.
 * That swings every shadow's DIRECTION while you move, which is worse than the pinned frustum it replaced.
 *
 * A second writer is not a bug you fix by reordering, because the next edit reorders it back. It is a bug
 * you fix by leaving exactly one place that can write the value, and that is what this function is for.
 *
 * The direction is treated as a DIRECTION, not a location — which is also what made the sun-arc work
 * (QUEUE.md B1) a drop-in: an arc changes this vector, and the shadow sweeps for free. The caller passes the sky
 * frame's KEY direction (the moon's at night), not the sun's.
 *
 * @param {{x:number,z:number}} centre  texel-snapped frustum centre (the player)
 * @param {number[]|null} sunPos        the light's direction, e.g. [-55, 48, -52] (magnitude ignored)
 * @returns {{x:number,y:number,z:number}}
 */
export function sunWorldPosition(centre, sunPos) {
  const c = centre && Number.isFinite(centre.x) ? centre : { x: 0, z: 0 };
  const v = Array.isArray(sunPos) && sunPos.length === 3 && sunPos.every(Number.isFinite)
    ? sunPos
    : [SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z];
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return {
    x: c.x + (v[0] / len) * SUN_DISTANCE,
    y: (v[1] / len) * SUN_DISTANCE,   // absolute: terrain height must not tilt the shadow direction
    z: c.z + (v[2] / len) * SUN_DISTANCE,
  };
}

export function Atmosphere({ shadowConfig }) {
  const { scene, camera, gl } = useThree();
  const ambientRef = useRef();
  const sunRef = useRef();
  // A TIER CHANGE RE-BUILDS THE SHADOW (render/shadowReset.js): three keeps a light's first shadow target for life.
  const cam = shadowConfig?.camera || {};
  const [mapW, mapH] = shadowConfig?.mapSize || [0, 0];
  // A LAYOUT effect: it runs in the same commit that applied the new mapSize and extents, before any frame can render.
  // A passive effect could let one rAF draw the new viewport over the old target — the bug, for a frame (review #11).
  useLayoutEffect(() => {
    resetShadowForConfig(sunRef.current?.shadow);
  }, [mapW, mapH, cam.left, cam.right, cam.top, cam.bottom, cam.near, cam.far]);
  // THE SHADOW RENDERS ON DEMAND (render/shadowSchedule.js; plan 2026-10-27-crafty-steady-cool item h): three skips a
  // light whose shadow.autoUpdate and needsUpdate are both false; the useFrame below sets needsUpdate when one is due.
  const shadowSched = useMemo(createShadowSchedule, []);
  const shadowCamAt = useMemo(() => new THREE.Matrix4(), []); // the camera when the shadow last rendered
  const sunUnit = useMemo(() => [0, 0, 0], []);
  useLayoutEffect(() => {
    const sh = sunRef.current?.shadow;
    if (!sh) return;
    sh.autoUpdate = false;
    sh.needsUpdate = true;
  }, []);
  // DEV-only: the live shadow target's real size, for the tier-change e2e (the bridge is tree-shaken in prod). `schedSun`
  // is the direction the shadow map last rendered from (render/shadowSchedule.js), so the light-script e2e can see that
  // the schedule is fed the KEY's direction (the moon at night), not the sun's under the ground.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    registerTestHook('readSunShadow', () => {
      const sh = sunRef.current?.shadow;
      return sh
        ? {
          mapSize: [sh.mapSize.x, sh.mapSize.y], map: sh.map ? [sh.map.width, sh.map.height] : null, autoUpdate: sh.autoUpdate,
          renders: shadowSched.renders, schedSun: shadowSched.sun ? [...shadowSched.sun] : null,
        }
        : null;
    });
  }, [shadowSched]);
  // The light's aim point. A directional light with no `target` aims at the world ORIGIN, which is
  // exactly how the shadowed region ended up pinned to spawn. three.js only updates a target's
  // matrixWorld if it is in the scene graph, so it is added here rather than just assigned.
  const sunTarget = useMemo(() => new THREE.Object3D(), []);
  const shadowCentreRef = useRef({ x: 0, z: 0 });
  const sunAboveHorizonRef = useRef(true);
  const fillRef = useRef();
  const hemiRef = useRef();
  const domeRef = useRef();
  const domeMat = useMemo(makeSkyDomeMaterial, []);
  const domeGeo = useMemo(() => new THREE.SphereGeometry(100, 32, 16), []);
  // prop-attached sky-dome material + geometry -> dispose on unmount
  useEffect(() => () => { domeMat.dispose(); domeGeo.dispose(); }, [domeMat, domeGeo]);
  useEffect(() => {
    scene.add(sunTarget);
    if (sunRef.current) sunRef.current.target = sunTarget;
    return () => { scene.remove(sunTarget); };
  }, [scene, sunTarget]);
  const framesRef = useRef(0); // frames this component has run, for the DEV grey card's "wait three frames"
  // THE SKY'S CLOCK (render/skyClock.js): the 1 Hz game clock, followed every frame, so the light ramps instead of
  // stepping once a second. `cycleRef` is the fraction the frame was rendered at (DEV reads it).
  const skyClock = useMemo(makeSkyClock, []);
  const cycleRef = useRef(0);
  // DEV-only reads for tests/e2e/light-script.spec.js. Every value
  // is read from the LIVE object it describes where one exists (the light's own position and intensity, the dome's
  // uniform, the terrain's uniform via its own hook), so a reader that stopped drawing from the frame is seen.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const v = new THREE.Vector3();
    const liveKeyDir = () => (sunRef.current ? v.copy(sunRef.current.position).sub(sunTarget.position).normalize().toArray() : null);
    registerTestHook('readSkyLight', () => {
      const st = useGameStore.getState(), f = skyFrameRef.current, key = liveKeyDir();
      return {
        sunDirY: f.sunDir[1], keyDir: key, keyDirY: key ? key[1] : null, keyIsMoon: f.keyIsMoon,
        keyIntensity: sunRef.current ? sunRef.current.intensity : null, stars: domeMat.uniforms.uStar.value,
        terrainSunDirY: callTestHook('readTerrainSky')?.sunDir?.[1] ?? null,
        bloomThreshold: callTestHook('readPostFx')?.bloomThreshold ?? null,
        motes: callTestHook('readMotes') ?? null,
        mood: moodRef.current, weatherBoost: st.weatherMoodBoost, tier: st.qualityTier,
        cycle: cycleRef.current, gameTime: st.gameTime, frame: framesRef.current,
      };
    });
    // THE GREY CARD: the colour model (tests/gates/_lightModel.js) against the screen. A 1 m quad, the stone's albedo
    // #8C8C8C on the terrain's surface (MeshStandardMaterial, world/terrainSurface.js), facing up, casting and receiving
    // no shadow, 3 m ahead of the camera on the horizontal and 0.8 m below it: about 15 deg under the camera's horizon, clear of the bottom HUD. It is drawn last and its depth test always
    // passes, so a hill or a tree in front cannot cover it (lighting does not depend on either).
    // `readGreyCard` mounts it, waits three frames, and returns its screen rect with the LIVE rig it is lit by; the card
    // STAYS until `clearGreyCard` (the spec calls it in a finally, after its screenshot), or 30 s, whichever is first.
    let card = null, cardTimer = 0;
    const dropCard = () => {
      clearTimeout(cardTimer);
      if (!card) return;
      scene.remove(card);
      card.geometry.dispose();
      card.material.dispose();
      card = null;
    };
    registerTestHook('readGreyCard', async () => {
      dropCard();
      const fwd = camera.getWorldDirection(new THREE.Vector3());
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
      fwd.normalize();
      card = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        // depthFunc ALWAYS, not depthTest false: WebGL writes no depth while the depth test is disabled, so the depth
        // buffer under the card would hold the terrain behind it for every depth-reading pass. ALWAYS passes the test
        // and writes the card's own depth. (The e2e still reads the card on the LOW tier: at high, N8AO and GodRays moved
        // it up to L 0.10 off the model either way, with this setting or without it.)
        new THREE.MeshStandardMaterial({ color: '#8C8C8C', ...TERRAIN_SURFACE, depthFunc: THREE.AlwaysDepth }),
      );
      card.castShadow = false;
      card.receiveShadow = false;
      card.renderOrder = 10000;
      card.frustumCulled = false;
      card.position.copy(camera.position).addScaledVector(fwd, 3).add(new THREE.Vector3(0, -0.8, 0));
      scene.add(card);
      cardTimer = setTimeout(dropCard, 30000);
      try {
        const start = framesRef.current, t0 = performance.now();
        await new Promise((resolve, reject) => {
          const tick = () => {
            if (framesRef.current - start >= 3) resolve();
            else if (performance.now() - t0 > 20000) reject(new Error(`readGreyCard: ${framesRef.current - start} frame(s) in 20 s`));
            else requestAnimationFrame(tick);
          };
          tick();
        });
      } catch (e) {
        dropCard();
        throw e;
      }
      const box = gl.domElement.getBoundingClientRect(); // THIS renderer's canvas (the title screen has its own)
      const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, z]) => {
        const p = new THREE.Vector3(x, 0, z).add(card.position).project(camera);
        return [box.left + ((p.x + 1) / 2) * box.width, box.top + ((1 - p.y) / 2) * box.height];
      });
      const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
      const f = skyFrameRef.current, a = ambientRef.current, h = hemiRef.current, k = sunRef.current;
      const st = useGameStore.getState();
      return {
        rect: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) },
        // The rig the card is lit by, read from the live lights, in the SkyFrame shape the model takes.
        frame: {
          ambient: a.color.toArray(), ambientIntensity: a.intensity, hemiSky: h.color.toArray(), hemiGround: h.groundColor.toArray(),
          hemiIntensity: h.intensity, keyColor: k.color.toArray(), keyIntensity: k.intensity, aoFloor: f.aoFloor.toArray(),
          keyDir: liveKeyDir(), grade: { ...f.grade }, keyIsMoon: f.keyIsMoon,
        },
        // From the card's centre TOWARD the camera: the model adds the key's view-dependent specular, as three does.
        viewDir: camera.position.clone().sub(card.position).normalize().toArray(),
        mood: moodRef.current, weatherBoost: st.weatherMoodBoost, tier: st.qualityTier,
      };
    });
    registerTestHook('clearGreyCard', () => { dropCard(); return true; });
    // THE DOME SAMPLER (the painted moon's horizon mask is GLSL, so no node test can run it). The dome's OWN material, rendered alone on THIS renderer into a 4x4 target through a 2 deg view along
    // `dir` from the dome's centre, with the given uniforms set for that one render and restored after. Returns the mean
    // linear RGB (the dome writes no tone mapping or colour-space conversion). Outside the frame loop, so the frame's
    // own writes do not race it.
    registerTestHook('sampleDome', ({ dir, uniforms = {} } = {}) => {
      const u = domeMat.uniforms, saved = {};
      for (const [k, v] of Object.entries(uniforms)) {
        const cur = u[k]?.value;
        if (cur === undefined) throw new Error(`sampleDome: the dome has no uniform ${k}`);
        if (cur && (cur.isColor || cur.isVector3)) { saved[k] = cur.clone(); cur.fromArray(v); } else { saved[k] = cur; u[k].value = v; }
      }
      const SIDE = 4, PX = SIDE * SIDE; // the target's side and pixel count
      const rt = new THREE.WebGLRenderTarget(SIDE, SIDE);
      const cam = new THREE.PerspectiveCamera(2, 1, 0.1, 1000);
      cam.lookAt(dir[0], dir[1], dir[2]);
      cam.updateMatrixWorld();
      const s = new THREE.Scene();
      const mesh = new THREE.Mesh(domeGeo, domeMat);
      mesh.frustumCulled = false;
      s.add(mesh);
      const prev = gl.getRenderTarget();
      try {
        gl.setRenderTarget(rt);
        gl.clear(true, true, false);
        gl.render(s, cam);
        const buf = new Uint8Array(PX * 4); // RGBA bytes
        gl.readRenderTargetPixels(rt, 0, 0, SIDE, SIDE, buf);
        const rgb = [0, 0, 0];
        for (let i = 0; i < PX; i++) for (let c = 0; c < 3; c++) rgb[c] += buf[i * 4 + c] / 255 / PX;
        return rgb;
      } finally {
        gl.setRenderTarget(prev);
        for (const [k, v] of Object.entries(saved)) { if (v && (v.isColor || v.isVector3)) u[k].value.copy(v); else u[k].value = v; }
        s.remove(mesh);
        rt.dispose();
      }
    });
    return dropCard;
  }, [scene, camera, gl, domeMat, domeGeo, sunTarget]);

  useFrame((state, frameDelta) => {
    const delta = realDelta(frameDelta); // the sky's mood lerp is ambient: a freeze does not stop the day (R2.6)
    const st = useGameStore.getState();
    const cap = isCaptureMode();

    // KEEP THE SHADOW FRUSTUM ON THE PLAYER. Transient read via getState() — never a subscription
    // (Game-Loop-Isolation). This runs in capture too, deliberately: the player's capture position is
    // itself deterministic, so the frames stay reproducible, and adding a 128th isCaptureMode branch
    // would make the oracle depict one more thing nobody plays. It DOES change the gated frames, which
    // folds into the re-baseline already owed since postprocessing 6.39.1 -> 6.39.5.
    if (sunRef.current && shadowConfig?.extent) {
      // ONLY the target here. The light's POSITION is written once, in the mood block below, via
      // sunWorldPosition — because it depends on the mood direction as well as this centre, and two
      // writers to one property is how the first version of this change silently did nothing.
      const c = snapShadowCentre(st.playerPosition, shadowConfig.extent, shadowConfig.mapSize?.[0] ?? 1024);
      shadowCentreRef.current = c;
      sunTarget.position.set(c.x, 0, c.z);
      sunTarget.updateMatrixWorld();
    }
    // W4-T8: the storm sky-darken boost is FORCED to 0 in capture. The weather state machine still ticks
    // during a capture (which runs >90s, longer than the 90s weather cycle), so a live weatherMoodBoost
    // would darken every frame captured after the first transition -> non-deterministic baselines. Capture
    // always renders the clear-sky mood; the storm darken is a live-play-only effect.
    // NIGHT IS NOT DANGER: the mood is the danger overlay only, so isDay is not passed.
    const target = moodTarget({ dangerLevel: st.dangerLevel, weatherBoost: cap ? 0 : st.weatherMoodBoost });
    if (cap) {
      moodRef.current = target; // snap -> deterministic capture frames
    } else {
      moodRef.current = THREE.MathUtils.lerp(moodRef.current, target, Math.min(1, delta * 2.0));
    }
    // THE CLOCK. cycleFraction drives the sun's orbit AND the whole colour script: night is the clock's, a moonlit blue, and the moon takes the key light.
    //
    // CAPTURE SAFETY, per CLAUDE.md: "a capture guard must RESET to a declared value, never early-return."
    // Freezing the clock wherever it happened to be would make every gated frame run-dependent, since boot length
    // varies 1.68-10.43s between processes. So capture renders at a DECLARED fraction (captureCycle): noon for a day
    // state and midnight for a night state. Live play goes
    // through liveCycle, which maps a corrupt (non-finite) gameTime to noon rather than to the key-less dawn.
    //
    // LIVE PLAY READS THE SKY CLOCK, NEVER st.gameTime DIRECTLY: gameTime is a 1 Hz step, and the light read from it
    // stepped once a second (the dawn key popped three times on its way up). followSkyClock moves toward it every frame.
    // Capture resets the sky clock, so a return to play snaps to the game clock instead of panning from before capture.
    if (cap) resetSkyClock(skyClock);
    const cycle = cap ? captureCycle(st) : liveCycle(followSkyClock(skyClock, st.gameTime, delta));
    cycleRef.current = cycle;
    const m = sampleMood(moodRef.current, cycle);
    publishSkyFrame(m); // THE copy every other reader reads (Sun, MoodGradeDriver, Terrain, FarField)
    framesRef.current += 1;
    // Above the horizon? The GodRays shaft is a screen-space effect whose light source is the sun
    // BILLBOARD, and three.js#18446 records that the official godrays example flips the shaft downwards
    // when "the signs of the sun's screen space position vector components change" — which an arcing sun
    // crosses by construction. It is also simply wrong to cast sun shafts at night. Published for the
    // effect's mount gate rather than solved inside the shader.
    const above = m.sunPos[1] > SUN_HORIZON_EPS;
    if (above !== sunAboveHorizonRef.current) {
      sunAboveHorizonRef.current = above;
      // EDGE-TRIGGERED, and that is what makes a store write legal here. Game-Loop-Isolation forbids
      // binding a useFrame to reactive state — but this fires only when the sun CROSSES the horizon,
      // twice per day/night cycle, not per frame. Mounting/unmounting an effect pass needs a real React
      // render, so a transient ref could not do the job; a per-frame write would have been the violation.
      useGameStore.setState({ sunAboveHorizon: above });
    }

    // Distance fog (terrain only -- the dome has fog:false). Background = horizon as a
    // base colour in case the dome ever fails to cover a pixel.
    if (!scene.fog) scene.fog = new THREE.FogExp2(0x000000, 0.01);
    scene.fog.color.copy(m.fog);
    scene.fog.density = m.fogDensity;
    if (!scene.background) scene.background = new THREE.Color();
    scene.background.copy(m.skyHorizon);

    // Gradient skydome -- follow the camera + push mood-blended colours/sun.
    if (domeRef.current) {
      domeRef.current.position.copy(camera.position);
      const u = domeMat.uniforms;
      u.topColor.value.copy(m.skyTop);
      u.midColor.value.copy(m.skyMid);
      u.horizonColor.value.copy(m.skyHorizon);
      // ...and the sky itself: a lightning flash whitens the dome, strongest overhead (0 outside a flash).
      const flash = lightningFlashRef.current;
      if (flash > 0) {
        u.topColor.value.addScalar(flash * 0.22);
        u.midColor.value.addScalar(flash * 0.16);
        u.horizonColor.value.addScalar(flash * 0.1);
      }
      // The dome's sun glow and disc: the key's glow colour, faded out with the daylight (0 at night and under the boss).
      u.sunColor.value.copy(m.glowColor).multiplyScalar(m.daylight);
      u.sunDir.value.fromArray(m.sunDir);
      // THE SUN, at every hour: the terrain's cloud shadows, ore glow and leaf translucency mean the sun,
      // so this is never the key's direction, which is the moon's at night.
      sunDirRef.current.copy(u.sunDir.value);
      u.uStar.value = m.stars;           // the script's stars (night 1, twilight 0.5), less the storm overlay
      u.uMoonDir.value.fromArray(m.moonDir); // the painted moon rides its own arc, where the moon key light comes from
      u.uTime.value = frameElapsed(state.clock.elapsedTime); // cloud drift: the CAPTURE clock under capture
      cloudTint(m, u.uCloudTint.value);                     // clouds take the mood, not a painted white
      // The sky-studio subject cards sit ~74 m under the cloud plane, where clouds loom behind the subject:
      // a declared reset for those cards only (the same call LightMotes makes), never an early return.
      u.uCloudCover.value = st.captureStudio ? 0 : 1;
      cloudCoverRef.current = u.uCloudCover.value; // the terrain's shadows obey the same cover
    }

    if (ambientRef.current) {
      ambientRef.current.color.copy(m.ambient);
      ambientRef.current.intensity = m.ambientIntensity;
    }
    if (sunRef.current) {
      // THE KEY LIGHT (render/keyLight.js): the sun by day, the moon by night, on the one directional light. Its
      // intensity fades to 0 at the horizon, so the direction swaps only under a dark key.
      sunRef.current.color.copy(m.keyColor);
      sunRef.current.intensity = m.keyIntensity;
      // THE ONE PLACE the light's position is written. The frame owns the direction (the KEY's), the player the centre.
      const sp = sunWorldPosition(shadowCentreRef.current, m.keyDir);
      sunRef.current.position.set(sp.x, sp.y, sp.z);
      // SHADOW ON DEMAND. Capture renders it every frame, as before (the oracle is not this change's to move). In play,
      // a dynamic caster is: the camera moved since the last shadow render (the player's own hands cast), any ECS mob,
      // villager, ally or pickup, the boss, the beast form, or a held phantom block. Transient reads only.
      const sh = sunRef.current.shadow;
      if (cap) {
        sh.needsUpdate = true;
      } else {
        // Fed the KEY's direction, the same one the light is positioned from above: the moon's shadows step as it
        // moves, and the dawn and dusk swaps (a step far past SUN_STEP_DEG) render at once.
        const p = m.keyDir, len = Math.hypot(p[0], p[1], p[2]) || 1;
        sunUnit[0] = p[0] / len; sunUnit[1] = p[1] / len; sunUnit[2] = p[2] / len;
        const dynamic = !camera.matrixWorld.equals(shadowCamAt)
          || mobsQuery.entities.length > 0 || alliesQuery.entities.length > 0
          || lootQuery.entities.length > 0 || orbQuery.entities.length > 0
          || !!st.bossActive || !!st.beastFormActive || !!st.voidhandHeld;
        if (shadowDue(shadowSched, { now: performance.now(), sunDir: sunUnit, centre: shadowCentreRef.current, worldEpoch: shadowWorldEpoch(), dynamic })) {
          sh.needsUpdate = true;
          shadowCamAt.copy(camera.matrixWorld);
        }
      }
    }
    if (fillRef.current) {
      fillRef.current.color.copy(m.fill);
      fillRef.current.intensity = m.fillIntensity;
    }
    if (hemiRef.current) {
      // Sky bounce (top) and ground bounce (bottom). STORM LIGHTNING (render/LightningDriver.jsx): the flash is sky
      // light, so it rides the hemisphere's sky term — as WHITE light added to it, not as intensity on the night sky's
      // blue, which never cleared the night grade (game/lightning.js hemiWithFlash). The whole world lights from above
      // for a beat, shadows unchanged. 0 outside a flash and under capture, where this writes exactly the mood.
      hemiWithFlash(hemiRef.current, m.hemiSky, m.hemiGround, m.hemiIntensity, lightningFlashRef.current, _flashColor);
    }
  });

  return (
    <>
      <mesh ref={domeRef} geometry={domeGeo} material={domeMat} renderOrder={-1} frustumCulled={false} />
      <ambientLight ref={ambientRef} intensity={0.6} />
      <directionalLight
        ref={sunRef}
        // PHASE C: THE SUN CASTS SHADOWS IN THE GATED FRAMES NOW.
        //
        // This was `castShadow={!isCaptureMode()}`, which is the single largest thing the visual oracle
        // could not see: every committed baseline depicted a world with NO sun shadows, so the shadow
        // camera bounds, the map size, the bias, the receiveShadow flags and every future regression in
        // any of them were invisible to a gate that photographs ten outdoor frames.
        //
        // AND IT IS THE ONE CONVERSION THAT THE 6% THRESHOLD CAN ACTUALLY RESOLVE. A 17-agent survey put
        // 41 suppression sites forward for conversion; the value pass refuted all but this one on the
        // grounds that their pixels sit under the gate — the entire QUESTS panel is 7.51% of the frame,
        // the whole spell-cast VFX ensemble 0.64%. Shadows move a large fraction of every outdoor frame,
        // so a regression that switches them off again goes red on its own, with no new assertion.
        //
        // Nothing about it is nondeterministic: the light FOLLOWS the player (2026-09-22) but the player's
        // capture position is itself deterministic and the offset/angle are constants, the shadow config is
        // derived from the quality tier that `enterCapture` pins to 'high', and the geometry casting
        // the shadows is the same terrain the frame already had to settle before it could be shot.
        castShadow
        // Initial placement only — the useFrame above keeps this on the player every frame. Left at the
        // historical constant so the very first frame before that runs is unchanged.
        position={[50, 100, 50]}
        intensity={1.5}
        shadow-mapSize={shadowConfig.mapSize}
        shadow-camera-left={shadowConfig.camera.left}
        shadow-camera-right={shadowConfig.camera.right}
        shadow-camera-top={shadowConfig.camera.top}
        shadow-camera-bottom={shadowConfig.camera.bottom}
        shadow-camera-near={shadowConfig.camera.near}
        shadow-camera-far={shadowConfig.camera.far}
        shadow-bias={-0.0001}
      />
      <pointLight ref={fillRef} position={[0, 20, 0]} intensity={0} distance={50} />
      <hemisphereLight ref={hemiRef} intensity={0.55} />
    </>
  );
}
