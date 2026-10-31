/**
 * chestBoard.js — which quest chests hold a slot on the board, and which are let go (pure).
 *
 * The periodic spawner keeps the board to CHEST_CAP unopened chests so the loot and XP loop is paced, not farmed. It used to
 * count every unopened chest wherever it stood, so five the player had walked away from held every slot for the session and
 * no periodic chest spawned again (AUDIT:leaks:chest-board-slots-never-reclaimed: 0 in 30 minutes at 600 m). Now a chest
 * holds a slot only while it is within reach, and one far behind is retired:
 *   - CHEST_COUNT_RADIUS (120 m): the chests the cap counts. The compass shows chests to 80 m; the spawner places a new one
 *     20-60 m from the player, so a board of five in reach is a board the player can see.
 *   - CHEST_RETIRE_RADIUS (240 m, twice the count radius): an unopened periodic chest past it leaves the board. Between the
 *     two a chest no longer holds a slot but the player can still turn back to it, so one at the edge does not vanish as they
 *     step toward it.
 * A SHRINE chest is never retired: it is the once-per-shrine reward, and the shrine's own record would not respawn it. It
 * still counts toward the cap while in reach, as it always has. An OPENED chest is not touched: its own 5 s timer owns it.
 *
 * Distances are along the ground (x, z): a chest's height is its column's, and the cap is a question of where the player is.
 */
export const CHEST_CAP = 5;
export const CHEST_COUNT_RADIUS = 120;
export const CHEST_RETIRE_RADIUS = 240;

const groundDist = (chest, pos) => Math.hypot(chest.position[0] - pos.x, chest.position[2] - pos.z);

/**
 * How many unopened chests hold a slot: those within `radius` of the player.
 * @param {{id:number, position:number[]}[]} chests
 * @param {Set<number>} openedIds
 * @param {{x:number, z:number}} pos  the player
 */
export function countNearChests(chests, openedIds, pos, radius = CHEST_COUNT_RADIUS) {
  let n = 0;
  for (const c of chests) if (!openedIds.has(c.id) && groundDist(c, pos) <= radius) n += 1;
  return n;
}

/**
 * The board without the unopened periodic chests past `radius`. The SAME array when none is retired, so a quiet sweep
 * mints no new state and re-renders nothing.
 */
export function retireFarChests(chests, openedIds, pos, radius = CHEST_RETIRE_RADIUS) {
  const kept = chests.filter((c) => c.shrine || openedIds.has(c.id) || groundDist(c, pos) <= radius);
  return kept.length === chests.length ? chests : kept;
}
