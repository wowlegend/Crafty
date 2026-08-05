import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from './store/useGameStore';
import { ecs } from './ecs/world';
import { isCaptureMode } from './devtest/captureMode';

// Custom materials with GPU-based wind swaying & player displacement
const grassMaterial = new THREE.MeshBasicMaterial({
  color: '#4a7c59',
  transparent: true,
  opacity: 0.7,
  side: THREE.DoubleSide
});

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
    float offset = instanceMatrix[3][0] * 0.5 + instanceMatrix[3][2] * 0.5;
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
  grassMaterial.userData.shader = shader;
};

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
    
    grassBlocks.forEach(([x, y, z], i) => {
      dummy.position.set(x, y + 0.35, z); // root the 0.7-tall tuft base at the grass surface (grassTop y)
      dummy.updateMatrix();
      grassMeshRef.current.setMatrixAt(i, dummy.matrix);
    });
    grassMeshRef.current.instanceMatrix.needsUpdate = true;
  }, [grassBlocks]);

  useFrame((state) => {
    // Dev capture-determinism: pin the wind-sway clock to a fixed value so the
    // grass holds a frozen pose across capture runs (wall-clock elapsedTime differs
    // run-to-run -> frame jitter, dominant ~3-4% self-diff on explore-night). Inert in
    // normal gameplay — falls through to the live clock so wind animates as before.
    const capture = isCaptureMode();
    const time = capture ? 0 : state.clock.elapsedTime;

    // 1. Update GPU shader time and entityPositions uniforms for grass
    if (grassMaterial.userData.shader) {
      grassMaterial.userData.shader.uniforms.time.value = time;
      const uniforms = grassMaterial.userData.shader.uniforms;
      const positions = uniforms.entityPositions.value;

      // Reset all slots to inactive coordinate sentinels
      for (let k = 0; k < 8; k++) {
        positions[k].set(9999, 9999, 9999);
      }

      let index = 0;

      // Slot 0: Player Position coordinates
      const playerPos = useGameStore.getState().playerPosition;
      if (playerPos) {
        positions[index].set(playerPos.x, playerPos.y, playerPos.z);
        index++;
      }

      // Slots 1-7: Active mobs from the ECS world
      if (ecs && ecs.entities) {
        ecs.entities.forEach(entity => {
          if (entity.isMob && entity.position && index < 8) {
            positions[index].set(entity.position[0], entity.position[1], entity.position[2]);
            index++;
          }
        });
      }
    }

    // (the per-frame mote matrix rebuild that used to live here went with them — see the note above)
  });

  return (
    <group>
      {grassCount > 0 && (
        <instancedMesh ref={grassMeshRef} args={[null, grassMaterial, grassCount]}>
          {/* M4 #5: a READABLE stylized tuft (was 0.1x0.18 -- sub-perceptual specks). 0.4 wide x 0.7 tall
              billboard, DoubleSide, wind-swayed at the top by the shader. Bold-flat (flat blade, locked palette). */}
          <planeGeometry args={[0.4, 0.7]} />
        </instancedMesh>
      )}
    </group>
  );
};


