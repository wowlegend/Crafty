---
description: "[CRAFTY] audit and clean up window.* global variable pollution"
---

# Window Global Audit (Crafty-Specific)

Crafty uses `window.*` globals for cross-component communication between the React tree and the Three.js render loop. This workflow audits and cleans them.

## 1. Count All Globals Per File

// turbo

```bash
cd frontend/src
grep -c "window\.\w\+ =" *.jsx **/*.jsx 2>/dev/null | grep -v ":0$" | sort -t: -k2 -rn
```

## 2. List All Global Assignments

// turbo

```bash
cd frontend/src
grep -n "window\.\w\+ =" *.jsx **/*.jsx 2>/dev/null | grep -v "window\.location\|window\.document\|window\.addEventListener\|window\.removeEventListener\|window\.innerWidth\|window\.innerHeight" | sort
```

## 3. Find Duplicates

Check if the same global is set in multiple files:

```bash
cd frontend/src
grep -h "window\.\w\+ =" *.jsx **/*.jsx 2>/dev/null | sed 's/.*\(window\.\w\+\).*/\1/' | sort | uniq -c | sort -rn | head -20
```

Any global with count >1 is a duplicate — pick one canonical source and import/remove the rest.

## 4. Find Dead Globals (Set But Never Read)

```bash
cd frontend/src
for global in $(grep -oh "window\.\w\+" *.jsx **/*.jsx 2>/dev/null | sort -u); do
  writes=$(grep -c "$global =" *.jsx **/*.jsx 2>/dev/null | grep -v ":0$" | wc -l)
  reads=$(grep -c "$global[^=]" *.jsx **/*.jsx 2>/dev/null | grep -v ":0$" | wc -l)
  if [ "$reads" -le "$writes" ]; then echo "POSSIBLY DEAD: $global (writes=$writes, reads=$reads)"; fi
done
```

## 5. Consolidation Strategy

Current canonical sources:

- `GameSystems.jsx` → `damagePlayer`, `healPlayer`, `useMana`, `isPlayerAlive`, `getPlayerHealth`, `getPlayerMana`
- `SimpleExperienceSystem.jsx` → `addExperience`, `getPlayerLevel`, `getPlayerXP`
- `EnhancedMagicSystem.jsx` → `castSpell`, `mobSlowEffects`, `mobStunEffects`
- `SimplifiedNPCSystem.jsx` → `attackEntity`, `damageMob`, `checkMobCollision`, `_mobEntities`
- `QuestSystem.jsx` → `onMobKill`, `onSpellCast`, `onBlockPlace`, `onBlockBreak`, `onChestOpen`, `onPlayerDeath`
- `App.jsx` → `selectedSpell`, `setSelectedSpell`, `addToInventory`, `removeFromInventory`, audio functions
- `Components.jsx` → `gameCamera`
- `Terrain.jsx` → `getGeneratedChunks`, `getMobGroundLevel`, `checkCollision`, `isSpawnChunkLoaded`

**Future improvement**: Migrate high-traffic globals to Zustand store actions.

## 6. Remove and Verify

After removing dead/duplicate globals:

```bash
npx vite build 2>&1 | tail -5
```

Build must pass with 0 errors. Test in-game that all systems still communicate.
