# Brief: the costed lantern, radius rule first (2026-10-28)

**Plan:** `2026-10-28-crafty-sota-reset.md`, row 15; the radius rule ships inside lane W3-A (the First Night).
**Decision:** DECISIONS 2026-10-28 (W1-H) item 8. **Amends:** `2026-10-27-crafty-lantern-block-light.md` (its banner
points here). **Status:** unstarted. The Forge offer needs W2-F's Forge; the block needs the material grammar (W2-K) for
its tile, as the lantern plan's Unit 5 already says. **Owner:** the command session.

## What the player gets

A lantern is something you buy at Mara's Forge, with its price on the card, so every lantern on the map was a choice.
Placed, it keeps natural hostile spawns away from the ground around it: an outpost ringed with lanterns stays quiet while
you are out exploring, and the siege (W3-A) marches from the dark, not out of your own yard. The warm pool of light on the
ground comes later, with the baked light field.

## What changes from the lantern plan

| Lantern plan | Now |
|---|---|
| Unit 5 makes the lantern a grid recipe, 1 glass + 1 coal | A Forge offer; the grid is gone (item 7). Starting price: 2 coal, 1 iron and 20 coins, shown on the card |
| Unit 6 refuses spawns where the baked light level is 8 or more | A radius rule: no natural hostile spawn within R of a placed lantern, R starting at 16 m (one chunk). It ships first |
| Units 1-4 and 7, the baked light field, LUT shading and its acceptance | A later lane, after the First Night lands. It then replaces the radius rule or sits beside it, decided on lookbook frames |

The lantern block itself (id 16, its texture layer, its flame emissive, its hotbar slot, its i18n and icon) stays as
Unit 5 designed it, minus the recipe.

## Why R = 16 m

Natural spawns land 28-85 m from the player (`frontend/src/systems/spawnPlacement.js`, the placement ring), so a radius
rule never acts near the player; it acts at a lit place the player is away from. 16 m covers a small outpost from one
lantern, matches the chunk size, and is one distance check per spawn attempt. It is a starting value, tuned on a
lookbook night clip of a lantern-ringed outpost.

## Acceptance

- **e2e on the CI sha:** with a lantern placed and the player 40 m away, 200 forced natural spawn attempts produce no
  hostile within 16 m of the lantern; the same run with the lantern mined produces some (the presence control).
- **Live:** buy a lantern from Mara, place it, walk away into the night; no hostile appears inside the ring. Authored
  spawns (the prologue, the siege's own waves, the dragon) are unaffected.
- The Forge card shows the lantern's price and refuses a purchase the player cannot afford.

## One-way door

Block id 16 enters saves at the first push that lets a player save one (lantern plan, upside (a)). The radius rule and
the Forge offer land in the same release as the block, never after it. Removing the block later goes through
`SAVE_VERSION` as the lantern plan describes.

## Registry rows this lane closes

`MASTERPIECE:the-lantern-and-a-baked/a` (the costed lantern and the radius rule). `/b`, the baked block-light field,
stays open for its own lane.

---

## Task script

Run from `frontend/`. Re-verify every file:line at lane start (after W2-F and W2-K).

### Task 0: Amend the lantern plan in place

- [ ] The banner at the top of `docs/superpowers/plans/2026-10-27-crafty-lantern-block-light.md` points here (done by
      W1-H). At lane start, mark Unit 5's recipe step and Unit 6 as replaced, with a link to this brief.

### Task 1: The radius rule, pure (red first)

- [ ] `src/game/lanternWard.js`: `isWarded(x, z, lanterns, radius)` over a list of lantern positions, and
      `LANTERN_WARD_RADIUS = 16`. Unit tests: a point at 15.9 m is warded, at 16.1 m is not, with no lanterns nothing is,
      with two lanterns the union is warded.
- [ ] Mutant: compare squared distance against `radius` instead of `radius * radius`. The 15.9 m case goes RED.
- [ ] Commit with the `Mutation-Proof:` trailer.

### Task 2: Where the lanterns are

- [ ] The store keeps a lantern index that follows the world edits: place adds the position, mine removes it, load
      rebuilds it from `worldBlocks`. Red first: a place, a mine and a load each leave the index matching the blocks.
- [ ] Mutant: skip the rebuild on load. The load test goes RED.

### Task 3: The spawner refuses warded natural spawns

- [ ] In `spawnMob` (`systems/SpawnerSystem.jsx`), a natural spawn (no `forceType`) inside a ward is refused and the
      placement loop tries elsewhere; forced spawns pass.
- [ ] Red first: drive `spawnMob` with a lantern beside the candidate point (natural: refused; forced: spawned).
- [ ] e2e: the 200-attempt check from Acceptance, with its presence control.

### Task 4: The block

- [ ] Unit 5 of the lantern plan, minus the recipe: block id 16, texture layer (after W2-K's layer layout), flame
      emissive, hotbar slot, i18n, icon. Its own gates as Unit 5 lists them.
- [ ] The layer layout (W2-K, `src/world/materialGrammar.js`): id 16 makes `BLOCK_LAYER_COUNT` 17 and moves the face
      variants to 17-19, so the array is 20 deep, derived. The lantern plan's "depth 17" assertion and its K2 mutant
      ("`numLayers` left at 16") are void; assert `depth === TEXTURE_LAYER_COUNT`. `colors.b` is still unwritten.

### Task 5: The Forge offer

- [ ] Add the lantern to `game/forge.js`'s offers with its price; a test that buying it spends exactly 2 coal, 1 iron
      and 20 coins and adds one lantern; too little refuses and changes nothing.
- [ ] e2e (real input): buy, place, walk 40 m, fast-forward to night, count hostiles inside the ring (0).

### Task 6: Land together

- [ ] Tasks 1-5 land in one release (the one-way door). Lookbook night clip of a lantern-ringed outpost attached.
- [ ] Close `MASTERPIECE:the-lantern-and-a-baked/a` in `memory/registry.jsonl` with the merge commit; `/b` (the baked
      light field) stays open.
