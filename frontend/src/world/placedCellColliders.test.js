import { describe, it, expect } from 'vitest';
import { createPlacedCellColliders, createEditSeq } from './placedCellColliders.js';

// Which chunks have answered (createPlacedCellColliders' `answered`): the load's hold reads it chunk by chunk
// (game/spawnPlacement.js cornersAnswer), since a column's own ray cannot tell a column dug through the world from one in
// a chunk not streamed in. A chunk answers once its mesh has landed, an empty mesh too, and nothing made since the last
// world step is still unindexed; it stops when it unloads or the world is wiped. Rapier is not needed: `landed` only
// propagates body moves and lists the trimesh, so the world here is that one call and a trimesh is any object.
describe('the placed-cell registry says which chunks have answered', () => {
  const world = { propagateModifiedBodyPositionsToColliders() {} };
  const registry = () => createPlacedCellColliders(world, {}, createEditSeq());

  it('a chunk answers once its mesh has landed and a step has run since, and only that chunk', () => {
    const cells = registry();
    expect(cells.answered(1, 2), 'a chunk that never landed answered').toBe(false);
    cells.landed(1, 2, 0, {});
    expect(cells.answered(1, 2), 'a chunk answered before its trimesh was indexed').toBe(false);
    cells.afterStep();
    expect([cells.answered(1, 2), cells.answered(2, 1), cells.answered(1, 3)], 'only the landed chunk answers').toEqual([true, false, false]);
  });

  it('a mesh rebuilt in place holds every chunk back until the next step', () => {
    const cells = registry();
    cells.landed(1, 2, 0, {});
    cells.landed(4, 4, 0, {});
    cells.afterStep();
    cells.landed(4, 4, 1, {});
    expect([cells.answered(1, 2), cells.answered(4, 4)], 'a chunk answered with a trimesh unindexed').toEqual([false, false]);
    cells.afterStep();
    expect([cells.answered(1, 2), cells.answered(4, 4)]).toEqual([true, true]);
  });

  it('an empty mesh answers: the chunk has nothing in it', () => {
    const cells = registry();
    cells.landed(0, 0, 0, null);
    cells.afterStep();
    expect(cells.answered(0, 0), 'a chunk whose mesh landed empty never answered').toBe(true);
  });

  it('an unloaded chunk, and every chunk once the world is wiped, has not answered until it lands again', () => {
    const cells = registry();
    for (const [cx, cz] of [[0, 0], [0, 1], [1, 0]]) cells.landed(cx, cz, 0, {});
    cells.afterStep();
    cells.dropChunk(0, 1);
    expect([cells.answered(0, 0), cells.answered(0, 1), cells.answered(1, 0)], 'the unloaded chunk still answered').toEqual([true, false, true]);
    cells.clear();
    expect([cells.answered(0, 0), cells.answered(1, 0)], 'a chunk answered after the wipe').toEqual([false, false]);
    cells.landed(0, 0, 0, {});
    cells.afterStep();
    expect([cells.answered(0, 0), cells.answered(1, 0)]).toEqual([true, false]);
  });
});
