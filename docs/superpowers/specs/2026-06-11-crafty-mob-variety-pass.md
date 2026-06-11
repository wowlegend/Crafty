# The mob-variety pass (design note — the §2.5 content interleave, post-spine)

> **Status (2026-06-11): DESIGN COMMITTED.** The 6-type roster is the visible ceiling every night;
> three new types stretch the EXISTING procedural axes (size/speed/hp/color/legMode — no new
> renderer work) and triple-pay into snare targets, fusion pairs, and zone interactions.

## The three (distinct silhouettes, the toon palette, NO Minecraft derivatives)
| Type | Role | Look | Stats |
|---|---|---|---|
| `skitterling` | the swarm | TINY dusk-violet spider-legged darter (#5B4FA8 — reads vs the spider's near-black) | hp 30 · spd 3.8 · dmg 5 · xp 12 |
| `duskhound` | the skirmisher | lean dark-plum quad, low and long (#4A3A50) | hp 70 · spd 3.2 · dmg 12 · xp 28 |
| `moss_brute` | the tank | HUGE deep-moss slab (#3D5A3A), slow, hits like a wall | hp 220 · spd 1.2 · dmg 25 · xp 60 |

## Mechanics
- **Weighted spawning** (the registry gains `weight`; uniform-random would make brutes as common as
  zombies): pig/cow/zombie/skeleton/spider 1 · villager 0.6 · skitterling 1.2 · duskhound 0.9 ·
  moss_brute 0.25. A pure `weightedPick` (tested) replaces both uniform picks.
- **legMode wiring**: skitterling carries `legMode: 'spider'` in the registry — spawnMob must COPY it
  to the entity (it doesn't today; only hybrids carry legMode).
- **One new hybrid**: duskhound+skeleton = `grimhound` (a bone hound: pale #D8D4C4, quad, fast, hp 130)
  — the new types join the FUSE economy day one.
- Snare (hostiles ≤30%), zones, squad AI: free by construction (all read the entity fields).
- Judge: the new-type look card next iteration (the sky-band spawnMob precedent).
