// Web Worker for AI Pathfinding and Aggro Logic

self.onmessage = function(e) {
  if (e.data.type === 'TICK') {
    const { playerPos, now, delta, mobs } = e.data;
    const [playerX, playerY, playerZ] = playerPos;
    
    const AGGRO_RANGE = 20;
    const MELEE_RANGE = 2.5;
    const ARCHERY_RANGE = 12;
    const LEAP_RANGE = 6;
    const ATTACK_COOLDOWN = 1500;
    
    const updates = [];
    const attacks = [];
    
    for (let i = 0; i < mobs.length; i++) {
      const entity = mobs[i];
      let { id, passive, x, y, z, targetX, targetZ, isMoving, isAggro, lastAttackTime, damage, type, moveTimer, speed, rotation } = entity;
      
      const dx = playerX - x;
      const dz = playerZ - z;
      const distToPlayer2D = Math.sqrt(dx * dx + dz * dz);
      
      if (!passive && distToPlayer2D < AGGRO_RANGE) {
        isAggro = true;
        
        if (type === 'skeleton') {
          // Archery Logic: Maintain distance
          if (distToPlayer2D < 8) {
            // Back away
            targetX = x - dx;
            targetZ = z - dz;
            isMoving = true;
          } else if (distToPlayer2D > ARCHERY_RANGE) {
            // Close in
            targetX = playerX;
            targetZ = playerZ;
            isMoving = true;
          } else {
            // Stay put and shoot
            isMoving = false;
            if (now - lastAttackTime > ATTACK_COOLDOWN + 500) {
                attacks.push({ id, type: 'projectile', damage: 15, position: [x, y, z] });
                lastAttackTime = now;
            }
          }
        } else if (type === 'spider') {
          // Leap Logic
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
          // Standard Melee (Zombie)
          isMoving = true;
          targetX = playerX;
          targetZ = playerZ;
          if (distToPlayer2D < MELEE_RANGE && now - lastAttackTime > ATTACK_COOLDOWN) {
            attacks.push({ damage, type: 'melee' });
            lastAttackTime = now;
          }
        }
      } else {
        // Wandering logic
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
          const speedMult = isAggro ? (type === 'spider' ? 2.0 : 1.5) : 1.0;
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
