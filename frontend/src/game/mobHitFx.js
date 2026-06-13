/**
 * mobHitFx.js -- PURE damageMob hit-FX pulls (no THREE/React; node-testable). Extracted from
 * SimplifiedNPCSystem's damageMob (the god-file de-monolith, charter S3-M6) -- the element->spark
 * table + the knockback/hit-direction math. The component keeps the impure parts (entity mutation,
 * triggerGPUSparks, sounds). These had ZERO tests before (charter S3 characterization).
 */

/**
 * Spark color + particle count for a hit. count = 60 on crit else 25; color by spell element,
 * with physical = glowing gold on crit / crimson otherwise. Unknown types fall to the physical case.
 * @returns {{color:string, count:number}}
 */
export function sparkFor(type, isCrit) {
  const count = isCrit ? 60 : 25;
  switch (type) {
    case 'fireball': return { color: '#ff5500', count };
    case 'iceball': return { color: '#00d2ff', count };
    case 'lightning': return { color: '#ffff00', count };
    case 'arcane': return { color: '#d900ff', count };
    case 'physical':
    default: return { color: isCrit ? '#ffcc00' : '#ff2200', count };
  }
}

/**
 * Knockback impulse + hit-direction for a mob hit, given the mob + camera (player) positions.
 * Horizontal away-from-player unit dir; knockback is that dir * 2 (y=0). With no camera, knockback
 * is null (untouched by the caller) and hitDir defaults to forward [0,0,-1]. Returns plain arrays;
 * the component wraps hitDir in a THREE.Vector3.
 * @returns {{knockback:number[]|null, hitDir:number[]}}
 */
export function hitKnockback(entityPos, cameraPos) {
  if (!cameraPos) return { knockback: null, hitDir: [0, 0, -1] };
  const kx = entityPos.x - cameraPos.x;
  const kz = entityPos.z - cameraPos.z;
  const kd = Math.sqrt(kx * kx + kz * kz) || 1;
  return { knockback: [kx / kd * 2, 0, kz / kd * 2], hitDir: [kx / kd, 0, kz / kd] };
}
