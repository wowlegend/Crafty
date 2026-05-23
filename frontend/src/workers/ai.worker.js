// Web Worker for AI Pathfinding and Aggro Logic

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
// x1, z1 are starting grid coords (typically 4, 4)
// x2, z2 are destination grid coords
function hasLineOfSight(heightGrid, x1, z1, x2, z2) {
  const cols = 9;
  const startH = heightGrid[x1 + z1 * cols];
  const endH = heightGrid[x2 + z2 * cols];
  
  // Trace cells from (x1, z1) to (x2, z2)
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1));
  if (steps === 0) return true;
  
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = Math.round(x1 + (x2 - x1) * t);
    const pz = Math.round(z1 + (z2 - z1) * t);
    const idx = px + pz * cols;
    const cellH = heightGrid[idx];
    
    // An intermediate column is blocking if it rises significantly higher than both ends
    if (cellH > Math.max(startH, endH) + 1.2) {
      return false; // Obstruction found!
    }
  }
  return true;
}

self.onmessage = function(e) {
  if (e.data.type === 'TICK') {
    const { playerPos, now, delta, mobs } = e.data;
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
        lastAttackTime, damage, type, moveTimer, speed, rotation, health, maxHealth, heightGrid 
      } = entity;
      
      const dx = playerX - x;
      const dz = playerZ - z;
      const distToPlayer2D = Math.sqrt(dx * dx + dz * dz);
      
      // Aggro transition
      if (!passive && distToPlayer2D < AGGRO_RANGE) {
        isAggro = true;
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
          // Archery Logic: Maintain tactical range
          if (distToPlayer2D < 8) {
            // Retreat: Walk away from player
            targetX = x - dx;
            targetZ = z - dz;
            isMoving = true;
          } else if (distToPlayer2D > ARCHERY_RANGE) {
            // Close in
            targetX = playerX;
            targetZ = playerZ;
            isMoving = true;
          } else {
            // Stop and shoot arrows
            isMoving = false;
            if (now - lastAttackTime > ATTACK_COOLDOWN + 500) {
              attacks.push({ id, type: 'projectile', damage: 15, position: [x, y, z] });
              lastAttackTime = now;
            }
          }
        } else if (type === 'spider') {
          // Leaping / Charging Logic
          isMoving = true;
          targetX = playerX;
          targetZ = playerZ;
          if (distToPlayer2D < LEAP_RANGE && now - lastAttackTime > ATTACK_COOLDOWN + 1000) {
            attacks.push({ id, type: 'leap', damage: 8, position: [x, y, z] });
            lastAttackTime = now;
          } else if (distToPlayer2D < MELEE_RANGE && now - lastAttackTime > ATTACK_COOLDOWN) {
            attacks.push({ damage, type: 'melee' });
            lastAttackTime = now;
          }
        } else {
          // Standard Melee (Zombie & Bosses)
          isMoving = true;
          targetX = playerX;
          targetZ = playerZ;
          if (distToPlayer2D < MELEE_RANGE && now - lastAttackTime > ATTACK_COOLDOWN) {
            attacks.push({ damage, type: 'melee' });
            lastAttackTime = now;
          }
        }
        
        // --- Step 3: Voxel Height-Aware 3D A* Path Steering ---
        // If we have a local height grid from the main thread, steer around blocks
        if (isMoving && !isCoverSeeking && heightGrid && heightGrid.length === 81) {
          const mobGridX = Math.round(x);
          const mobGridZ = Math.round(z);
          const startXGrid = mobGridX - 4;
          const startZGrid = mobGridZ - 4;
          
          // Player's relative coordinates in our 9x9 local grid
          const relPlayerX = Math.round(playerX - startXGrid);
          const relPlayerZ = Math.round(playerZ - startZGrid);
          
          // Clamp target grid coordinate to ensure A* target sits on grid bounds
          const targetGridX = Math.max(0, Math.min(8, relPlayerX));
          const targetGridZ = Math.max(0, Math.min(8, relPlayerZ));
          
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
        id, x, z, rotation, isAggro, isMoving, targetX, targetZ, lastAttackTime, moveTimer, isCoverSeeking
      });
    }
    
    self.postMessage({
      type: 'TICK_RESULT',
      updates,
      attacks
    });
  }
};
