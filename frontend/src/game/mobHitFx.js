/**
 * mobHitFx.js -- PURE damageMob hit-FX pulls (no THREE/React; node-testable). Extracted from
 * SimplifiedNPCSystem's damageMob (the god-file de-monolith, charter S3-M6) -- the element->spark
 * table + the knockback/hit-direction math + the death-burst. The component keeps the impure parts
 * (entity mutation, triggerGPUSparks, sounds). These had ZERO tests before (charter S3 characterization).
 */
import { MOB_TYPES } from './mobTypes';

/**
 * Death-burst spark color + count for a mob KILL -- a bigger finisher than the per-hit sparkFor, so a
 * kill reads as a satisfying payoff (was silent: mobs just vanished). color = the mob's body color;
 * count scales with its xp (tougher mobs burst harder), clamped 50..110. Unknown -> white, 50.
 * W2-T5: a dark-mob TINT FLOOR lifts very-dark body colors toward a visible glow while PRESERVING
 * hue (so a near-black mob reads as a colored soul-burst, not a black puff, and a green mob stays
 * green at peak rather than washing to white), and a `burst:'death'` tag selects the GPU pool's
 * upward-biased death velocity branch.
 * @returns {{color:string, count:number, burst:string}}
 */
export function deathBurst(mobType) {
  const m = MOB_TYPES[mobType];
  let color = (m && m.color) || '#ffffff';
  const xp = (m && m.xp) || 0;
  // dark-mob tint floor: lift very-dark body colors toward a visible glow while PRESERVING hue
  // (so a green mob reads green at peak, not white/black). Scale the channels up if the max < floor.
  const hex = color.replace('#', '');
  let r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  const mx = Math.max(r, g, b, 1), floor = 110;
  if (mx < floor) { const k = floor / mx; r = Math.min(255, r * k) | 0; g = Math.min(255, g * k) | 0; b = Math.min(255, b * k) | 0; color = '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join(''); }
  return { color, count: Math.max(50, Math.min(110, 40 + xp)), burst: 'death' };
}

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

/**
 * Directional flinch tilt for a hit. The mob model is a child of a group rotated by `facingY`
 * about Y, so the WORLD away-from-player hit dir (hitDirX, hitDirZ) is rotated into the model's
 * LOCAL frame, then the model tips its top along that push: pitch (rotation.x) along local Z,
 * roll (rotation.z) along local X, scaled by the `wave` flinch envelope. Replaces the old
 * arbitrary id-parity roll. Pure + RNG-free.
 * @returns {{pitch:number, roll:number}}
 */
export function flinchTilt(hitDirX, hitDirZ, facingY, wave, tilt = 0.22) {
  const c = Math.cos(facingY), s = Math.sin(facingY);
  const localX = hitDirX * c - hitDirZ * s;
  const localZ = hitDirX * s + hitDirZ * c;
  return { pitch: localZ * tilt * wave, roll: -localX * tilt * wave };
}

/**
 * Bias a horizontal spark velocity (vx,vz) toward a unit hit direction (dirX,dirZ) by `strength`
 * in [0,1], preserving horizontal speed. strength 0 = radial (unchanged); 1 = fully along the dir.
 * Used to spray hit sparks in a cone AWAY from the player along the real hit vector. Pure.
 * @returns {{vx:number, vz:number}}
 */
export function biasAlong(vx, vz, dirX, dirZ, strength = 0.6) {
  const dl = Math.hypot(dirX, dirZ);
  if (dl === 0) return { vx, vz };
  const ux = dirX / dl, uz = dirZ / dl;
  const speed = Math.hypot(vx, vz);
  return { vx: vx * (1 - strength) + ux * speed * strength, vz: vz * (1 - strength) + uz * speed * strength };
}
