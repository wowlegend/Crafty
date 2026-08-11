// mobTypes.js — the mob registry (extracted from SimplifiedNPCSystem S3-M3: same stats,
// byte-identical). The single consumer is the NPC spawner/renderer; game/spawnWeights.js
// takes [key, weight] entries as params and does NOT import this (no coupling). Each entry's
// `weight` (default 1 via `?? 1` at the spawner) biases the weighted pick; `legMode` (only on
// the variety-pass trio) reaches MobModel for the spider/quad gait.
export const MOB_TYPES = {
  pig: { bank: 8, color: '#ffc0cb', health: 50, speed: 1.5, damage: 0, xp: 10, passive: true, bodySize: [1.0, 0.8, 1.4], headSize: [0.7, 0.7, 0.7], displayName: 'Boar' },
  cow: { bank: 8, color: '#8B4513', health: 80, speed: 1.2, damage: 0, xp: 15, passive: true, bodySize: [1.2, 1.0, 1.6], headSize: [0.8, 0.8, 0.6], displayName: 'Ox' },
  zombie: { bank: 16, color: '#228B22', health: 100, speed: 2.0, damage: 10, xp: 25, passive: false, bodySize: [0.8, 1.6, 0.5], headSize: [0.7, 0.7, 0.7], displayName: 'Husk' },
  skeleton: { bank: 16, color: '#F5F5DC', health: 80, speed: 2.5, damage: 15, xp: 30, passive: false, bodySize: [0.6, 1.5, 0.4], headSize: [0.6, 0.6, 0.6], displayName: 'Bonepicker' },
  spider: { bank: 16, color: '#2F2F2F', health: 60, speed: 3.0, damage: 8, xp: 20, passive: false, bodySize: [1.2, 0.5, 1.5], headSize: [0.6, 0.4, 0.6], displayName: 'Frontier Spider' },
  villager: { bank: 8, color: '#8b5a2b', health: 120, speed: 1.2, damage: 0, xp: 0, passive: true, bodySize: [0.8, 1.5, 0.6], headSize: [0.7, 0.8, 0.7], weight: 0.6, displayName: 'Settler' },
  // the mob-variety pass (2026-06-11): three silhouettes on the existing procedural axes.
  skitterling: { bank: 16, color: '#5B4FA8', health: 30, speed: 3.8, damage: 5, xp: 12, passive: false, bodySize: [0.7, 0.35, 0.9], headSize: [0.45, 0.3, 0.45], legMode: 'spider', weight: 1.2, displayName: 'Skitterling' },
  duskhound: { bank: 16, color: '#4A3A50', health: 70, speed: 3.2, damage: 12, xp: 28, passive: false, bodySize: [0.9, 0.7, 1.5], headSize: [0.6, 0.55, 0.7], legMode: 'quad', weight: 0.9, displayName: 'Duskhound' },
  moss_brute: { bank: 16, color: '#3D5A3A', health: 220, speed: 1.2, damage: 25, xp: 60, passive: false, bodySize: [1.6, 2.0, 1.0], headSize: [0.9, 0.8, 0.9], weight: 0.25, displayName: 'Moss Brute' },
  // content-variety (2026-06-14): a charred night-siege HUSK — warm ember color (new palette note vs the
  // greens/greys/purples) + a jagged back-crest silhouette (mobFeatures). Mid-tier biped hostile; reuses
  // the generic hostile AI (data-driven spawn via MOB_TYPES + spawnWeights).
  emberhusk: { bank: 16, color: '#9A3B2A', health: 95, speed: 2.3, damage: 13, xp: 32, passive: false, bodySize: [0.85, 1.55, 0.55], headSize: [0.7, 0.65, 0.7], weight: 0.8, displayName: 'Ember Husk' },
};
