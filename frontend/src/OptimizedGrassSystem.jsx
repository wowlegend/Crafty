import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from './store/useGameStore';
import { mobsQuery } from './ecs/world';
import { isCaptureMode } from './devtest/captureMode';
import { collectBendSources } from './game/grassBend.js';
import { bladeTransform, bladeTint } from './game/grassVariation.js';

// S9. LIT grass, with GPU wind sway + player displacement.
//
// Was an unlit basic material -- unlit by definition, so the grass ignored every light in Atmosphere, the
// per-mood grade, and the aerial haze the ground beneath it receives. A field that does not change
// between noon and dusk while the ground does reads as a decal, not as plants.
//
// TRANSPARENCY IS GONE, AND THAT IS A PERF FIX AS MUCH AS A LOOK ONE. three splits a material that is
// `transparent && side === DoubleSide && !forceSinglePass` into TWO passes, BackSide then FrontSide —
// at WebGLRenderer.js:922 AND again at :1619 — so every grass draw call was silently two. Every
// grass draw-call estimate written in this repo before now was 2x low.
//
// WHY THIS HAD TO FOLLOW S8, NOT LEAD IT. With DoubleSide three flips the normal per face
// (normal_fragment_begin.glsl.js), so a Lambert blade is lit by whichever side faces the rasterizer.
// Before S8 every blade shared ONE yaw and one +/-Z normal, and the explore sun is [-55,48,-52] while
// the capture camera sees the +Z faces -> N.L <= 0 for the whole field. Shipping this first would have
// made the grass DARKER and FLATTER and looked like the lighting was wrong.
//
// COLOUR: '#5E8A3E' -- swatch B of the ladder in docs/superpowers/assets/. The old '#4a7c59' was a
// BLUE-green sitting on ground whose base is '#567C35', a yellow-green, so the tufts read as a different
// plant from the turf they grow in. That mismatch is the thing S9's success criterion was written
// against, and it is now closed.
//
// Ruled out by measurement: A ('#4a7c59') leaves 13,213 blue-leaning pixels in the ground crop against
// 11,258 for both B and C, so A is the measurable outlier. B vs C the measurement CANNOT separate --
// identical median (G-B) of 46 and an identical count -- so that half is a taste call decided on stated
// reasoning rather than on a number invented to look objective.
//
// B over C: B is +8/+14/+9 on the ground base, a modest lift that keeps tuft and turf in one family,
// which is exactly what S9 set out to achieve. C ('#6F9C4A') is +25/+32/+21 and starts to separate
// again -- that is the pale-card read the unlit material had, and removing it was the point of S8/S9b.
// S8's per-blade tint is a multiplier centred on 1.0 (+/-7% value), so B still varies blade to blade.
//
// VETO-ABLE: C is a one-word change on the line below if the field should pop harder.
const grassMaterial = new THREE.MeshLambertMaterial({
  color: '#5E8A3E',
  side: THREE.DoubleSide
});

// three stringifies onBeforeCompile on EVERY program lookup unless the key is pinned. Only
// render/characterStyle.js:66 does this today.
grassMaterial.customProgramCacheKey = () => 'grassWind';

grassMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.time = { value: 0 };
  shader.uniforms.entityPositions = {
    value: Array.from({ length: 8 }, () => new THREE.Vector3(9999, 9999, 9999))
  };

  shader.vertexShader = `
    uniform float time;
    uniform vec3 entityPositions[8];
    ${shader.vertexShader}
  `;

  shader.vertexShader = shader.vertexShader.replace(
    `#include <begin_vertex>`,
    `
    #include <begin_vertex>
    // S8: a two-term hash of the instance translation, NOT x*0.5 + z*0.5. The old form is constant
    // along every x+z diagonal, so the whole field used to sway in diagonal bands marching across the
    // world -- the single most legible tell that the grass is instanced. Wrapping first keeps the sin
    // argument small enough that float32 does not quantise the hash at world distances (~1000m).
    // (No backticks in here: this GLSL lives inside a JS template literal and one would close it.)
    vec2 ipos = mod(vec2(instanceMatrix[3][0], instanceMatrix[3][2]), 128.0);
    float offset = fract(sin(ipos.x * 12.9898 + ipos.y * 78.233) * 43758.5453) * 6.2831853;
    // Apply sway and bending only to the top vertices of grass blades
    if (position.y > 0.0) {
       // Premium multi-frequency wind sway
       float windSwayX = sin(time * 2.2 + offset) * 0.12 + sin(time * 0.8 + offset * 2.0) * 0.06;
       float windSwayZ = cos(time * 1.8 + offset) * 0.08 + cos(time * 0.6 + offset * 1.5) * 0.04;
       transformed.x += windSwayX;
       transformed.z += windSwayZ;
       
       // GPU proximity grass bending for multiple entities (player, pets, mobs)
       vec3 instancePosition = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       vec3 totalDisplacement = vec3(0.0);

       for (int i = 0; i < 8; i++) {
          vec3 pos = entityPositions[i];
          if (pos.y > 9990.0) continue; // Skip inactive/unassigned slots
          
          vec3 diff = instancePosition - pos;
          float dist = length(diff);
          if (dist < 2.2) {
             float force = (2.2 - dist) / 2.2;
             vec3 bendDir = normalize(vec3(diff.x, 0.0, diff.z));
             if (length(bendDir) < 0.01) bendDir = vec3(1.0, 0.0, 0.0);
             
             totalDisplacement.x += bendDir.x * force * force * 0.7;
             totalDisplacement.z += bendDir.z * force * force * 0.7;
             totalDisplacement.y -= force * force * 0.25;
          }
       }
       transformed.xyz += totalDisplacement;
    }
    `
  );
  // S9b: FOLIAGE-CARD NORMAL. Shade a blade like the ground it grows from, not like the vertical
  // rectangle it actually is.
  //
  // S9 put the grass in the lighting equation and it came out DARKER than its own turf -- measured at
  // a 4:1 skew of tuft pixels below the ground's median luminance. The plan predicted that exact
  // failure and prescribed ordering (S8's per-blade yaw first) as the cure, so S8 shipped first and it
  // was still dark. The prescription was necessary but not sufficient, because the mechanism is not
  // the yaw: with side DoubleSide, three rebuilds the normal per FRAGMENT from gl_FrontFacing
  // (normal_fragment_begin), so the lit face is always the one facing the RASTERIZER. The explore sun
  // sits behind the capture camera, so the camera-facing side is the unlit side no matter which way
  // the blade is turned. Rotating a card cannot fix a normal that follows the viewer.
  //
  // Bending the shading normal toward world-up is the standard treatment for foliage cards, and it is
  // not a cheat: a tuft of grass is a volume being approximated by a quad, and the volume's average
  // normal points up, not at the camera. `normal` is in VIEW space here, so world-up has to be carried
  // through viewMatrix (declared in the fragment prefix, WebGLProgram.js:824).
  //
  // Kept at a mix rather than a replace so blades still catch some directional variation instead of
  // becoming a flat sheet of ground colour.
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_begin>',
    `
    #include <normal_fragment_begin>
    vec3 grassUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    normal = normalize(mix(normal, grassUp, 0.8));
    `
  );

  grassMaterial.userData.shader = shader;
};

/**
 * The ONE driver for the grass shader's shared uniforms. Mount it exactly once (Terrain.jsx), NOT
 * per chunk.
 *
 * `grassMaterial` above is a module-level singleton shared by every chunk's instancedMesh, but the
 * uniform write used to live in each chunk's own `useFrame`. At high tier `renderDistance` is 4, so
 * the chunk loop runs -4..4 on both axes = **81 chunks**, i.e. 81 identical full-ECS walks per frame
 * writing the same 8 slots, 80 of them discarded by last-write-wins. One mount does the same work
 * once.
 *
 * Reads the player transiently via `getState()` and mobs via `mobsQuery` — no reactive subscription,
 * so Game-Loop Isolation holds (this runs inside useFrame).
 */
export const GrassWindDriver = React.memo(() => {
  useFrame((state) => {
    const shader = grassMaterial.userData.shader;
    if (!shader) return; // material not compiled yet (no grass on screen)

    // Dev capture-determinism: pin the wind-sway clock so the grass holds a frozen pose across
    // capture runs (wall-clock elapsedTime differs run-to-run -> frame jitter, once the dominant
    // ~3-4% self-diff on explore-night). Inert in normal gameplay.
    shader.uniforms.time.value = isCaptureMode() ? 0 : state.clock.elapsedTime;

    const slots = collectBendSources(useGameStore.getState().playerPosition, mobsQuery);
    const positions = shader.uniforms.entityPositions.value;
    for (let i = 0; i < slots.length; i++) {
      positions[i].set(slots[i][0], slots[i][1], slots[i][2]);
    }
  });
  return null;
});

// NOTE: Terrain.jsx still passes chunkX/chunkZ (grass-revival-gates asserts that call shape) and this
// component no longer reads them — they existed only to seed the deleted motes. Left vestigial rather
// than changing the mount site, so a gate is not edited in a commit that is about deleting dead render
// work. Cleaning both together is a follow-up.
export const OptimizedGrassSystem = ({ blockPositions = [] }) => {
  const grassMeshRef = useRef();

  // M4 #5: blockPositions are the worker's pre-filtered grass-top [x,y,z] tuples (world/grassField.js
  // grassTops) -- already grass-only + capped, so just take them (the instancing forEach uses [x,y,z]).
  const grassBlocks = useMemo(() => blockPositions.slice(0, 50), [blockPositions]);

  const grassCount = grassBlocks.length;
  
  // REMOVED 2026-08-05 — the 8 "floating mote" instances per chunk rendered in the wrong place
  // entirely, in every chunk, since they were written.
  //
  // They were seeded at x/z = (r()-0.5)*30 and y = 12 + r()*8 with NO chunk offset, and this
  // component's wrapping <group> carries no `position` — so EVERY chunk placed its motes in WORLD
  // space around the origin, at y 12-22, stacked on top of each other. They never followed the grass
  // they were meant to decorate.
  //
  // Where that lands, checked rather than assumed:
  //   - On land they were buried and invisible. Measured `computeHeight().baseHeight` over 16,641
  //     samples spanning 1024x1024 world units: surface ranges 39.2 to 63.1, never below y=22. With a
  //     depth-tested MeshBasicMaterial that is at least 17 blocks of opaque ground overhead.
  //   - In deep OCEAN they were visible. `oceanProfile.DEEP_FLOOR = 6` puts the seabed at y 6-10 with
  //     water to SEA_LEVEL 28, and that file calls the ocean "a DIVABLE place" — so a diving player
  //     swam through a clump of green specks hanging in open water at the world origin.
  // (The first draft of this note claimed they were provably invisible everywhere. That was wrong:
  //  it reasoned from the land heightmap and never opened the ocean profile.)
  //
  // The cost was constant regardless: one extra instancedMesh (draw call) per loaded chunk, plus a
  // per-frame position/scale/rotation/matrix rebuild for all 8, per chunk, forever.
  //
  // Deleted rather than repaired because "ambient motes above the grass" is a LOOK decision, and the
  // honest version (chunk-offset, above the surface, tuned in-world) is a feature to design
  // deliberately, not a bug to resurrect by moving a constant. Routed to KEVIN-REVIEW as veto-able.
  // The grass TUFTS are untouched — they use the worker's real world coordinates and are correct.

  useEffect(() => {
    if (!grassMeshRef.current) return;
    const dummy = new THREE.Object3D();
    
    const tint = new THREE.Color();

    grassBlocks.forEach(([x, y, z], i) => {
      // S8: yaw / scale / sub-cell offset, all hashed from the world (x,z) -- deterministic, RNG-free
      // and clock-free, so the capture gate still byte-compares. `py` arrives base-anchored: the quad
      // is centre-origin, so the lift that stands it on the surface scales WITH the blade (a fixed
      // +0.35 sinks a scaled-up blade into the terrain). See game/grassVariation.js note 1.
      const t = bladeTransform(x, y, z);
      dummy.position.set(t.px, t.py, t.pz);
      dummy.rotation.y = t.yaw;
      dummy.scale.setScalar(t.scale);
      dummy.updateMatrix();
      grassMeshRef.current.setMatrixAt(i, dummy.matrix);

      // instanceColor MULTIPLIES the material colour (color_fragment: `diffuseColor.rgb *= vColor`),
      // so this is a multiplier centred on 1.0, never a colour. Recolouring the grass toward its
      // yellow-green substrate is S9's owner call; S8 only adds spread around whatever it becomes.
      const c = bladeTint(x, z);
      tint.setRGB(c.r, c.g, c.b);
      grassMeshRef.current.setColorAt(i, tint);
    });
    grassMeshRef.current.instanceMatrix.needsUpdate = true;
    // setColorAt allocates instanceColor on first call; without this flag the buffer never uploads and
    // the tint is silently a no-op that every source-grep gate would still call present.
    if (grassMeshRef.current.instanceColor) grassMeshRef.current.instanceColor.needsUpdate = true;
  }, [grassBlocks]);

  return (
    <group>
      {grassCount > 0 && (
        <instancedMesh ref={grassMeshRef} args={[null, grassMaterial, grassCount]} receiveShadow>
          {/* M4 #5: a READABLE stylized tuft (was 0.1x0.18 -- sub-perceptual specks). 0.4 wide x 0.7 tall
              billboard, DoubleSide, wind-swayed at the top by the shader. Bold-flat (flat blade, locked palette). */}
          <planeGeometry args={[0.4, 0.7]} />
        </instancedMesh>
      )}
    </group>
  );
};


