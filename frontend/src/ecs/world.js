import { World } from 'miniplex';

// Create a central ECS world for the game
export const ecs = new World();

// Pre-create common queries
export const mobsQuery = ecs.with('isMob', 'position', 'type');
// S2-B3-M3: allies are a SEPARATE archetype — deliberately NOT 'isMob', so every hostile surface
// (worker bridge, cull, spawn cap, minimap, melee cone) excludes them by query-construction.
export const alliesQuery = ecs.with('isAlly', 'position', 'type');
const movingMobsQuery = ecs.with('isMob', 'position', 'isMoving', 'targetX', 'targetZ');
const aggroMobsQuery = ecs.with('isMob', 'position', 'isAggro');
