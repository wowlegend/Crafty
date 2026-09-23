// Mood-driven atmosphere: one component owns the gradient skydome, fog, ambient/sun/
// fill lights, and the smoothed mood. Replaces the inline EnvironmentalFog + the
// isDay-ternary lights + drei <Sky> (removed). Each frame it lerps moodRef toward
// moodTarget(isDay, dangerLevel) and applies the blended palette. In capture mode the
// mood SNAPS to target for deterministic frames.
import { useRef, useMemo, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cycleFraction } from '../game/dayPhase.js';
import { useGameStore } from '../store/useGameStore.jsx';
import { isCaptureMode } from '../devtest/captureMode.js';
import { moodRef, moodTarget, sampleMood, sunDirRef, cloudCoverRef } from './mood.js';
import { starIntensity } from './nightSky.js';
import { makeSkyDomeMaterial } from './skyDome.js';
import { cloudTint } from './cloudField.js';
import { frameElapsed } from '../devtest/captureClock.js';
import { realDelta } from '../game/worldClock.js';

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
  // `transformed` is the displaced local position (set earlier in the vertex shader);
  // modelMatrix takes it to world space. We only need the Y for the height profile.
  THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	// INSTANCED GEOMETRY NEEDS instanceMatrix. modelMatrix * transformed is the object-space position
	// taken to world space -- correct for ordinary meshes, and WRONG for every instance of an
	// InstancedMesh, whose per-instance placement lives in instanceMatrix and not in modelMatrix. The
	// grass is instanced (one instancedMesh per chunk, ~81 chunks), so every blade reported the y of the
	// chunk's origin rather than its own: the whole field was fogged at one altitude regardless of the
	// terrain under it, which reads as fog that ignores the hills it is draped over.
	//
	// three defines USE_INSTANCING only when the material is compiled for an InstancedMesh, so the two
	// branches cannot drift apart -- there is no "instanced but no instanceMatrix" state to get wrong.
	#ifdef USE_INSTANCING
		vFogWorldY = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).y;
	#else
		vFogWorldY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;
	#endif
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

/** Capture pins the solar angle HERE — a declared constant, never "wherever the clock was". 0.25 = noon,
 *  the one fraction at which sunArcDirection returns the mood's own bearing unchanged, so committed
 *  baselines keep their exact sun direction. */
export const CAPTURE_SOLAR_FRACTION = 0.25;

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
 * The mood's `sunPos` is treated as a DIRECTION, not a location — which is also what makes the sun-arc
 * work (QUEUE.md B1) a drop-in later: an arc changes this vector, and the shadow sweeps for free.
 *
 * @param {{x:number,z:number}} centre  texel-snapped frustum centre (the player)
 * @param {number[]|null} sunPos        the mood's sun direction, e.g. [-55, 48, -52]
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
  const { scene, camera } = useThree();
  const ambientRef = useRef();
  const sunRef = useRef();
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
    const target = moodTarget({ isDay: st.isDay, dangerLevel: st.dangerLevel, weatherBoost: cap ? 0 : st.weatherMoodBoost });
    if (cap) {
      moodRef.current = target; // snap -> deterministic capture frames
    } else {
      moodRef.current = THREE.MathUtils.lerp(moodRef.current, target, Math.min(1, delta * 2.0));
    }
    // THE SUN ARC (QUEUE.md B1). cycleFraction drives the sun's orbit angle; until today its only
    // references were inside dayPhase.js itself, so the HUD dial showed a travelling sun while the sky's
    // sun stood still.
    //
    // CAPTURE SAFETY, per AGENTS.md: "a capture guard must RESET to a declared value, never early-return."
    // Freezing the arc wherever the clock happened to be would make every gated frame run-dependent, since
    // boot length varies 1.68-10.43s between processes. So capture pins the solar angle to a DECLARED
    // constant — noon, which is also the fraction at which the arc returns the mood's own historical
    // bearing unchanged, so the existing baselines keep their exact sun direction.
    const cycle = cap ? CAPTURE_SOLAR_FRACTION : cycleFraction(st.gameTime);
    const m = sampleMood(moodRef.current, cycle);
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
      u.sunColor.value.copy(m.sun);
      u.sunDir.value.set(m.sunPos[0], m.sunPos[1], m.sunPos[2]).normalize();
      sunDirRef.current.copy(u.sunDir.value); // the ONE resolved sun, for the terrain's cloud shadows
      u.uStar.value = starIntensity(moodRef.current); // dusk-only twilight stars + moon
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
      sunRef.current.color.copy(m.sun);
      sunRef.current.intensity = m.sunIntensity;
      // THE ONE PLACE the sun's position is written. Mood owns the direction, player owns the centre.
      const sp = sunWorldPosition(shadowCentreRef.current, m.sunPos);
      sunRef.current.position.set(sp.x, sp.y, sp.z);
    }
    if (fillRef.current) {
      fillRef.current.color.copy(m.fill);
      fillRef.current.intensity = m.fillIntensity;
    }
    if (hemiRef.current) {
      hemiRef.current.color.copy(m.hemiSky);          // sky bounce (top)
      hemiRef.current.groundColor.copy(m.hemiGround); // ground bounce (bottom)
      hemiRef.current.intensity = m.hemiIntensity;
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
