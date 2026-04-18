import { World } from 'miniplex';

// Create a central ECS world for the game
export const ecs = new World();

// Pre-create common queries
export const mobsQuery = ecs.with('isMob', 'position', 'type');
const movingMobsQuery = ecs.with('isMob', 'position', 'isMoving', 'targetX', 'targetZ');
const aggroMobsQuery = ecs.with('isMob', 'position', 'isAggro');
