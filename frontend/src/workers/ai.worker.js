// Web Worker for AI Pathfinding and Aggro Logic

self.onmessage = function(e) {
  if (e.data.type === 'TICK') {
    const { playerPos, now, delta, mobs } = e.data;
    const [playerX, playerY, playerZ] = playerPos;
    
    const AGGRO_RANGE = 16;
    const MELEE_RANGE = 2.5;
    const ATTACK_COOLDOWN = 1000;
    
    const updates = [];
    const attacks = [];
    
    for (let i = 0; i < mobs.length; i++) {
      const entity = mobs[i];
      let { id, passive, x, y, z, targetX, targetZ, isMoving, isAggro, lastAttackTime, damage, type, moveTimer, speed, rotation } = entity;
      
      // AISystem Logic
      const dx = playerX - x;
      const dy = playerY - y;
      const dz = playerZ - z;
      const distToPlayer3D = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      if (!passive && distToPlayer3D < AGGRO_RANGE) {
        isAggro = true;
        isMoving = true;
        targetX = playerX;
        targetZ = playerZ;
        
        if (distToPlayer3D < MELEE_RANGE) {
          if (now - lastAttackTime > ATTACK_COOLDOWN) {
            attacks.push({ damage, type });
            lastAttackTime = now;
          }
        }
      } else {
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
      
      // MovementSystem Logic
      if (isMoving) {
        const tdx = targetX - x;
        const tdz = targetZ - z;
        const dist = Math.sqrt(tdx * tdx + tdz * tdz);
        
        if (dist > 0.5) {
          const speedMult = isAggro ? 1.5 : 1.0;
          const actualSpeed = speed * speedMult * delta;
          const moveX = (tdx / dist) * actualSpeed;
          const moveZ = (tdz / dist) * actualSpeed;
          
          x += moveX;
          z += moveZ;
          rotation = Math.atan2(tdx, tdz);
        } else {
          isMoving = false;
        }
      }
      
      updates.push({
        id, x, z, rotation, isAggro, isMoving, targetX, targetZ, lastAttackTime, moveTimer
      });
    }
    
    self.postMessage({
      type: 'TICK_RESULT',
      updates,
      attacks
    });
  }
};
