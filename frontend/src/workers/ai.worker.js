// Web Worker for AI Pathfinding and Aggro Logic
//
// THIS WORKER IMPORTS. It used to hand-maintain inline COPIES of three pure modules, each justified by a
// comment saying "this classic Worker cannot import", with regex "sync gates" pinning the copies to the
// originals. The premise was false: src/world/terrain.worker.js imports ten modules and has since the
// world spec-ladder. The only real difference was the construction site — Terrain used Vite's `?worker`
// import while AIWorkerSystem used `new Worker(new URL(...))`. Vite bundles the worker either way.
//
// Worse than unnecessary, the mirrors were unguarded: the sync gates asserted that certain regexes were
// PRESENT in each file, never that the two implementations AGREE. A differential fuzz against a
// deliberately-drifted copy produced 21,655 behavioural mismatches out of 200,000 randomized grids and
// all four gate assertions stayed green. A mirror whose guard cannot see drift is strictly worse than no
// mirror: it carries the maintenance cost AND the false assurance.
//
// So the copies are gone and the modules are imported directly. The pure modules keep their behavioural
// tests; the gates now assert the IMPORT (a syntactic anchor gate-shape.mjs can verify is not merely
// satisfied by a comment) rather than pinning duplicated source text.
import { hasLineOfSight } from '../game/mobLineOfSight.js';
import { attackPhase } from '../game/attackTelegraph.js';
import { steerGoalCell } from '../game/mobSteering.js';
import { dist3D, withinSense, canReach } from '../game/mobSenses.js';

// A* Voxel Pathfinding Solver on a 9x9 Local Grid
// startX, startZ are the local starting grid coords (typically 4, 4)
// endX, endZ are the local target grid coords clamped to [0, 8]
function findAStarPath(heightGrid, startX, startZ, endX, endZ) {
  const cols = 9;
  const rows = 9;
  
  const openSet = [];
  const closedSet = new Set();
  
  const startIdx = startX + startZ * cols;
  const endIdx = endX + endZ * cols;
  
  const nodeData = {};
  nodeData[startIdx] = { 
    g: 0, 
    f: Math.abs(startX - endX) + Math.abs(startZ - endZ), 
    parent: null, 
    x: startX, 
    z: startZ 
  };
  
  openSet.push(startIdx);
  
  let iterations = 0;
  // Safety cap to prevent worker stalls (9x9 grid completes in very few steps)
  while (openSet.length > 0 && iterations++ < 120) {
    // Sort openSet by f score
    openSet.sort((a, b) => nodeData[a].f - nodeData[b].f);
    const currentIdx = openSet.shift();
    
    if (currentIdx === endIdx) {
      // Path found! Reconstruct
      const path = [];
      let curr = currentIdx;
      while (curr !== null) {
        path.push([nodeData[curr].x, nodeData[curr].z]);
        curr = nodeData[curr].parent;
      }
      path.reverse();
      return path;
    }
    
    closedSet.add(currentIdx);
    const currNode = nodeData[currentIdx];
    const cx = currNode.x;
    const cz = currNode.z;
    const ch = heightGrid[currentIdx];
    
    // Check 8-way neighbors for diagonal traversal
    const neighbors = [
      [0, 1], [0, -1], [1, 0], [-1, 0],
      [1, 1], [1, -1], [-1, 1], [-1, -1]
    ];
    
    for (const [dx, dz] of neighbors) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nx >= cols || nz < 0 || nz >= rows) continue;
      
      const nIdx = nx + nz * cols;
      if (closedSet.has(nIdx)) continue;
      
      const nh = heightGrid[nIdx];
      const heightDiff = nh - ch;
      
      // Voxel navigation rules:
      // 1. Impassable walls: Steeper than 1.25 blocks up cannot be scaled.
      if (heightDiff > 1.25) continue;
      
      // 2. Slopes & Heights: Flat step cost + slope scale. 
      // Diagonal cost is sqrt(2). Deep drops add vertical caution penalty.
      const stepCost = (dx !== 0 && dz !== 0 ? 1.414 : 1.0) + (heightDiff < -2.0 ? 1.5 : 0.0);
      const gScore = currNode.g + stepCost;
      
      if (!nodeData[nIdx] || gScore < nodeData[nIdx].g) {
        nodeData[nIdx] = {
          g: gScore,
          f: gScore + Math.abs(nx - endX) + Math.abs(nz - endZ),
          parent: currentIdx,
          x: nx,
          z: nz
        };
        if (!openSet.includes(nIdx)) {
          openSet.push(nIdx);
        }
      }
    }
  }
}

// 2D Line-Of-Sight height check on a local 9x9 height grid
// hasLineOfSight now IMPORTS game/mobLineOfSight.js (see the header) instead of mirroring it.

self.onmessage = function(e) {
  if (e.data.type === 'TICK') {
    const { playerPos, now, delta, mobs } = e.data;
    // B4: the Y is no longer elided. It was always being SENT and thrown away here, under a comment saying
    // "the mob brain reasons on the XZ plane only" — which is exactly why pillaring up, walling in or going
    // underground gave zero protection and building was strategically pointless.
    const [playerX, playerY, playerZ] = playerPos;
    
    const AGGRO_RANGE = 20;
    const MELEE_RANGE = 2.5;
    const ARCHERY_RANGE = 12;
    const LEAP_RANGE = 6;
    const ATTACK_COOLDOWN = 1500;
    const PACK_ALERT_RADIUS_SQ = 144; // 12 units squared
    
    const updates = [];
    const attacks = [];
    
    // --- Step 1: Pack Alert Mechanics ---
    // If any mob is actively aggroed on the player, trigger nearby pack mobs within 12 units
    const activelyAggroed = mobs.filter(m => !m.passive && m.isAggro);
    if (activelyAggroed.length > 0) {
      for (let i = 0; i < mobs.length; i++) {
        const entity = mobs[i];
        if (entity.passive || entity.isAggro) continue;
        
        for (const aggroed of activelyAggroed) {
          const dx = aggroed.x - entity.x;
          const dz = aggroed.z - entity.z;
          if (dx * dx + dz * dz < PACK_ALERT_RADIUS_SQ) {
            entity.isAggro = true;
            break;
          }
        }
      }
    }
    
    // --- Step 2: Individual Mob State & Movement Pathfinding Solver ---
    for (let i = 0; i < mobs.length; i++) {
      const entity = mobs[i];
      let {
        id, passive, x, y, z, targetX, targetZ, isMoving, isAggro,
        lastAttackTime, windupUntil, damage, type, moveTimer, speed, rotation, health, maxHealth, heightGrid
      } = entity;
      let pendingAttack = null; // M2 #4: what this mob WOULD strike this tick (gated through the windup below)
      
      const dx = playerX - x;
      const dy = playerY - y;
      const dz = playerZ - z;
      // B4: SENSING is 3D and REACHING adds a vertical clamp (game/mobSenses.js). Every decision that used
      // the old XZ-only distance now asks one of those two questions instead, so the flat number is gone
      // entirely — eslint's no-unused-vars confirmed no site still wants it. MOVEMENT is unaffected: mobs
      // steer by setting targetX/targetZ to the player's XZ, which never consulted this value.
      const distToPlayer3D = dist3D(dx, dy, dz);
      
      // Aggro transition (+ de-aggro leash): a chased mob drops aggro once the player gets past
      // 1.5x aggro range, so it stops pursuing across the whole map and falls back to wandering below.
      // B4: SENSING is 3D. A mob forty blocks underground should not notice a player on the surface.
      if (!passive && withinSense(dx, dy, dz, AGGRO_RANGE)) {
        isAggro = true;
      } else if (isAggro && distToPlayer3D > AGGRO_RANGE * 1.5) {
        isAggro = false;
      }
      
      let isCoverSeeking = false;
      if (isAggro) {
        // AI State Tree - Cover seeking behavior tree selection
        if (health < maxHealth * 0.25 && heightGrid && heightGrid.length === 81) {
          const mobGridX = Math.round(x);
          const mobGridZ = Math.round(z);
          const startXGrid = mobGridX - 4;
          const startZGrid = mobGridZ - 4;
          
          const relPlayerX = Math.round(playerX - startXGrid);
          const relPlayerZ = Math.round(playerZ - startZGrid);
          
          let bestCoverX = -1;
          let bestCoverZ = -1;
          let minCoverDistSq = 999;
          
          for (let cz = 0; cz < 9; cz++) {
            for (let cx = 0; cx < 9; cx++) {
              if (cx === 4 && cz === 4) continue;
              if (cx === relPlayerX && cz === relPlayerZ) continue;
              
              const hIdx = cx + cz * 9;
              const ch = heightGrid[hIdx];
              const hDiffFromMob = Math.abs(ch - y);
              if (hDiffFromMob > 2.0) continue;
              
              const inLOS = hasLineOfSight(heightGrid, cx, cz, relPlayerX, relPlayerZ);
              if (!inLOS) {
                const dxCenter = cx - 4;
                const dzCenter = cz - 4;
                const distSq = dxCenter * dxCenter + dzCenter * dzCenter;
                if (distSq < minCoverDistSq) {
                  minCoverDistSq = distSq;
                  bestCoverX = cx;
                  bestCoverZ = cz;
                }
              }
            }
          }
          
          if (bestCoverX !== -1 && bestCoverZ !== -1) {
            targetX = startXGrid + bestCoverX;
            targetZ = startZGrid + bestCoverZ;
            isMoving = true;
            isCoverSeeking = true;
            
            const targetGridX = Math.max(0, Math.min(8, bestCoverX));
            const targetGridZ = Math.max(0, Math.min(8, bestCoverZ));
            
            const path = findAStarPath(heightGrid, 4, 4, targetGridX, targetGridZ);
            if (path && path.length > 1) {
              const nextNode = path[1];
              targetX = startXGrid + nextNode[0];
              targetZ = startZGrid + nextNode[1];
            }
          }
        }

        if (isCoverSeeking) {
          // If seeking cover, steer towards target cover point
        } else if (type === 'skeleton') {
          // Archery Logic: Maintain tactical range. B4: engagement distance is 3D — an archer forty blocks
          // below you is not "in range", and kiting away from a player it cannot reach is pointless.
          // Shooting UP or DOWN within range stays legal; that is a fair ranged threat against a wall.
          if (distToPlayer3D < 8) {
            // Retreat: Walk away from player
            targetX = x - dx;
            targetZ = z - dz;
            isMoving = true;
          } else if (distToPlayer3D > ARCHERY_RANGE) {
            // Close in
            targetX = playerX;
            targetZ = playerZ;
            isMoving = true;
          } else {
            // Stop and shoot arrows
            isMoving = false;
            if (now - lastAttackTime > ATTACK_COOLDOWN + 500) {
              pendingAttack = { id, type: 'projectile', damage: 15, position: [x, y, z] };
            }
          }
        } else if (type === 'spider') {
          // Leaping / Charging Logic
          isMoving = true;
          targetX = playerX;
          targetZ = playerZ;
          // B4: a leap may cover as much height as it does ground — a spider springing up a 6-block face is
          // a fair threat and keeps a low wall from being an auto-win. A swing may not.
          if (canReach(dx, dy, dz, LEAP_RANGE, LEAP_RANGE) && now - lastAttackTime > ATTACK_COOLDOWN + 1000) {
            pendingAttack = { id, type: 'leap', damage: 8, position: [x, y, z] };
          } else if (canReach(dx, dy, dz, MELEE_RANGE) && now - lastAttackTime > ATTACK_COOLDOWN) {
            pendingAttack = { id, type: 'melee', damage, position: [x, y, z] };
          }
        } else {
          // Standard Melee (Zombie & Bosses). B4: this is THE line that made building pointless — a zombie
          // 200 blocks below you, one block away horizontally, was inside MELEE_RANGE and swung.
          isMoving = true;
          targetX = playerX;
          targetZ = playerZ;
          if (canReach(dx, dy, dz, MELEE_RANGE) && now - lastAttackTime > ATTACK_COOLDOWN) {
            pendingAttack = { id, type: 'melee', damage, position: [x, y, z] };
          }
        }

        // M2 #4 attack telegraph — now the IMPORTED game/attackTelegraph.js state machine, not a copy of
        // it. Defers the strike behind a ~380ms windup and re-evaluates intent at strike time, so dodging
        // out of range during the windup whiffs the attack (the readability + fairness win).
        const phase = attackPhase(now, windupUntil, !!pendingAttack);
        windupUntil = phase.windupUntil;
        if (phase.action === 'strike') { attacks.push(pendingAttack); lastAttackTime = now; }
        // 'cancel' = dodged during the windup -> whiff. 'charge'/'windup'/'idle' = nothing to emit.
        
        // --- Step 3: Voxel Height-Aware 3D A* Path Steering ---
        // If we have a local height grid from the main thread, steer around blocks
        if (isMoving && !isCoverSeeking && heightGrid && heightGrid.length === 81) {
          // The TACTICAL target's cell in the mob-centered 9x9 grid, via the IMPORTED
          // game/mobSteering.js. It MUST resolve from the (targetX,targetZ) the mob decided above — NOT
          // the player — or Step-3 overrides a retreating archer's kite target and re-steers it back into
          // melee, and the archer never kites. Chasers are unaffected: their targetX/Z equal playerX/Z.
          const { gx: targetGridX, gz: targetGridZ } = steerGoalCell(targetX, targetZ, x, z);

          // The grid origin, needed below to map the chosen path node back into world space. Kept in
          // step with steerGoalCell's own framing (`Math.round(mobX) - 4`) — it is the same origin, and
          // if the two ever disagree the mob steers toward a cell offset from the one A* solved for.
          const startXGrid = Math.round(x) - 4;
          const startZGrid = Math.round(z) - 4;
          
          // Run 3D A* from center cell (4, 4) to target grid cell
          const path = findAStarPath(heightGrid, 4, 4, targetGridX, targetGridZ);
          
          if (path && path.length > 1) {
            // Steer towards the next immediate path node
            const nextNode = path[1];
            const nextWorldX = startXGrid + nextNode[0];
            const nextWorldZ = startZGrid + nextNode[1];
            
            // Adjust tactical targets to center of the designated coordinate cell
            targetX = nextWorldX;
            targetZ = nextWorldZ;
          }
        }
      } else {
        // Wandering logic for idle/passive mobs
        isAggro = false;
        moveTimer -= delta;
        if (moveTimer <= 0) {
          moveTimer = 2 + Math.random() * 4;
          isMoving = Math.random() > 0.3;
          if (isMoving) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 3 + Math.random() * 5;
            targetX = x + Math.cos(angle) * distance;
            targetZ = z + Math.sin(angle) * distance;
          }
        }
      }
      
      // --- Step 4: Velocity Interpolation & Angle Rotation System ---
      if (isMoving) {
        const tdx = targetX - x;
        const tdz = targetZ - z;
        const dist = Math.sqrt(tdx * tdx + tdz * tdz);
        
        if (dist > 0.15) {
          const speedMult = isAggro ? (type === 'spider' ? 2.0 : 1.5) : 1.0;
          const coverBoost = isCoverSeeking ? 1.2 : 1.0;
          const actualSpeed = speed * speedMult * coverBoost * delta;
          
          // Cap movement to prevent overshooting small local cells
          const moveDist = Math.min(actualSpeed, dist);
          x += (tdx / dist) * moveDist;
          z += (tdz / dist) * moveDist;
          rotation = Math.atan2(tdx, tdz);
        } else {
          isMoving = false;
        }
      }
      
      updates.push({
        id, x, z, rotation, isAggro, isMoving, targetX, targetZ, lastAttackTime, windupUntil, moveTimer, isCoverSeeking
      });
    }
    
    self.postMessage({
      type: 'TICK_RESULT',
      updates,
      attacks
    });
  }
};
