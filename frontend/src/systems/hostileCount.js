// The count the music reads (SoundManager subscribes to the store's activeHostilesCount to raise the soundtrack while
// hostiles are about): live mobs that are not passive. Hub NPCs and livestock are passive; a dissolving corpse is at
// zero health.

/** PURE. How many of `entities` are live hostiles. */
export function countLiveHostiles(entities) {
  let n = 0;
  for (const e of entities || []) if (e && e.health > 0 && !e.passive) n += 1;
  return n;
}
