import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/useGameStore';
import { mobsQuery, alliesQuery } from '../ecs/world';

// MinimapSyncSystem -- throttled (250ms) ECS->store mirror that feeds RadialMinimap. Extracted VERBATIM
// from SimplifiedNPCSystem.jsx (v6 de-monolith A1.1); behavior unchanged. Writes mobEntities /
// npcEntities / activeHostilesCount on the same 250ms tick (see the store note at useGameStore.jsx:331).
// Self-contained: only top-level imports, no shared module-local state from the former host file.
export const MinimapSyncSystem = () => {
  useFrame(() => {
    const now = performance.now();
    const store = useGameStore.getState();
    if (now - (store._lastMinimapUpdate || 0) > 250) {
      const activeMobs = mobsQuery.entities.filter(e => e && e.health > 0);
      store.setMobEntities(activeMobs.map(e => ({
        id: e.id, type: e.type, passive: e.passive, role: e.role, npcName: e.npcName, position: [e.position.x, e.position.y, e.position.z]
      })));
      // Friendly-NPC mirror: quest villagers (passive quest NPCs) + converted allies. Mirrors the mob
      // path so RadialMinimap can plot gold NPC blips from the store (the consumer reads npcEntities).
      const villagers = activeMobs.filter(e => e.type === 'villager');
      const allies = alliesQuery.entities.filter(e => e && e.health > 0 && e.position);
      store.setNpcEntities([...villagers, ...allies].map(e => ({
        id: e.id, type: e.type, position: [e.position.x, e.position.y, e.position.z]
      })));
      const hostileCount = activeMobs.filter(e => !e.passive).length;
      useGameStore.setState({
        _lastMinimapUpdate: now,
        activeHostilesCount: hostileCount
      });
    }
  });
  return null;
};
