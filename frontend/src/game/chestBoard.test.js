import { describe, it, expect } from 'vitest';
import { CHEST_CAP, CHEST_COUNT_RADIUS, CHEST_RETIRE_RADIUS, CHEST_BOARD_MAX, countNearChests, retireFarChests } from './chestBoard.js';

// AUDIT:leaks:chest-board-slots-never-reclaimed. The periodic spawner capped the board at 5 UNOPENED chests wherever they
// stood, so five the player walked away from held every slot for the session. The cap now counts the chests within reach,
// and a chest far behind is retired.
const CAP_R = 120, RETIRE_R = 240, BOARD_MAX = 10; // the contract numbers (DECISIONS 2026-10-30 lane L9), not read back from the module
const chest = (id, x, z, extra = {}) => ({ id, position: [x, 60, z], opened: false, ...extra });
const me = { x: 0, y: 70, z: 0 };
const none = new Set();

describe('the chest board is bounded by where the player is', () => {
  it('the exports are the contract numbers', () => {
    expect(CHEST_CAP).toBe(5);
    expect(CHEST_COUNT_RADIUS).toBe(CAP_R);
    expect(CHEST_RETIRE_RADIUS).toBe(RETIRE_R);
    expect(CHEST_BOARD_MAX).toBe(BOARD_MAX);
  });

  describe('countNearChests', () => {
    it('counts the unopened chests within the radius, the edge included, and no others', () => {
      const board = [chest(1, 10, 0), chest(2, CAP_R, 0), chest(3, CAP_R + 1, 0), chest(4, 0, -500), chest(5, 30, 30)];
      expect(countNearChests(board, none, me)).toBe(3);
    });
    it('leaves out an opened chest, which holds nothing and is on its way off the board', () => {
      const board = [chest(1, 10, 0), chest(2, 20, 0)];
      expect(countNearChests(board, new Set([2]), me)).toBe(1);
    });
    it('measures along the ground: a chest far above or below is as near as its column', () => {
      const board = [{ id: 1, position: [10, 900, 0], opened: false }, { id: 2, position: [10, -900, 0], opened: false }];
      expect(countNearChests(board, none, me)).toBe(2);
    });
    it('counts a shrine chest in reach, which has always taken a slot', () => {
      expect(countNearChests([chest(1, 10, 0, { shrine: true }), chest(2, 20, 0)], none, me)).toBe(2);
    });
    it('counts nothing on an empty board', () => {
      expect(countNearChests([], none, me)).toBe(0);
    });
  });

  describe('retireFarChests', () => {
    it('drops an unopened chest beyond the retire radius and keeps those inside it, the edge included', () => {
      const board = [chest(1, 10, 0), chest(2, RETIRE_R, 0), chest(3, RETIRE_R + 1, 0), chest(4, 0, -900)];
      expect(retireFarChests(board, none, me).map((c) => c.id)).toEqual([1, 2]);
    });
    it('keeps a chest between the two radii: it no longer holds a slot, but the player can still walk back', () => {
      const board = [chest(1, CAP_R + 40, 0)];
      expect(retireFarChests(board, none, me)).toHaveLength(1);
      expect(countNearChests(board, none, me)).toBe(0);
    });
    it('never retires a shrine chest: its once-per-shrine reward is not respawnable', () => {
      const board = [chest(1, 900, 0, { shrine: true }), chest(2, 900, 0)];
      expect(retireFarChests(board, none, me).map((c) => c.id)).toEqual([1]);
    });
    it('never retires an opened chest: its own removal timer owns it', () => {
      const board = [chest(1, 900, 0), chest(2, 900, 0)];
      expect(retireFarChests(board, new Set([1]), me).map((c) => c.id)).toEqual([1]);
    });
    it('returns the same array when nothing retires, so a quiet sweep re-renders nothing', () => {
      const board = [chest(1, 10, 0), chest(2, 900, 0, { shrine: true })];
      expect(retireFarChests(board, none, me)).toBe(board);
    });
    it('a player who moves takes the board with them', () => {
      const board = [chest(1, 0, 0), chest(2, 600, 0)];
      expect(retireFarChests(board, none, { x: 600, y: 60, z: 0 }).map((c) => c.id)).toEqual([2]);
    });
  });

  // The count radius lets a player who loops through the ring between 120 m and 240 m keep adding chests there, and the board
  // creeps: measured 17 on a 125 m circle in the first hour and 21 on a 140 m circle in the sixth, still rising
  // (DECISIONS 2026-10-30 lane L9, round 2). The board has a maximum, and the farthest chests give way to it.
  describe('retireFarChests: the board has a maximum', () => {
    // n unopened chests inside the retire radius, the i-th at x = 130 + i
    const annulus = (n) => Array.from({ length: n }, (_, i) => chest(i + 1, CAP_R + 10 + i, 0));
    it('keeps a board at its maximum as it is, the same array', () => {
      const board = annulus(BOARD_MAX);
      expect(retireFarChests(board, none, me)).toBe(board);
    });
    it('retires the farthest unopened chests past the maximum, exactly the excess', () => {
      const board = annulus(BOARD_MAX + 3);
      const kept = retireFarChests(board, none, me).map((c) => c.id);
      expect(kept).toHaveLength(BOARD_MAX);
      expect(kept.sort((a, b) => a - b), 'the chests that went are not the three farthest').toEqual(Array.from({ length: BOARD_MAX }, (_, i) => i + 1));
    });
    it('retires by distance from the player, not by position in the array', () => {
      const board = [...annulus(BOARD_MAX), chest(99, 5, 0)].reverse(); // the nearest is listed first-last; the farthest is x = 130 + 9 (id 10)
      const kept = retireFarChests(board, none, me).map((c) => c.id);
      expect(kept).toContain(99);
      expect(kept, 'the farthest chest was kept').not.toContain(BOARD_MAX);
    });
    it('counts only unopened periodic chests: shrine chests and opened chests neither count toward it nor go', () => {
      const shrines = Array.from({ length: 4 }, (_, i) => chest(200 + i, 30 + i, 0, { shrine: true }));
      const opened = Array.from({ length: 4 }, (_, i) => chest(300 + i, 40 + i, 0));
      const board = [...annulus(BOARD_MAX + 2), ...shrines, ...opened];
      const kept = retireFarChests(board, new Set(opened.map((c) => c.id)), me).map((c) => c.id);
      for (const c of [...shrines, ...opened]) expect(kept, `chest ${c.id} was retired by the maximum`).toContain(c.id);
      expect(kept.filter((id) => id < 200)).toHaveLength(BOARD_MAX);
    });
    it('trims a board whose excess is all within the retire radius, the chests nearest the player surviving', () => {
      const board = Array.from({ length: BOARD_MAX + 5 }, (_, i) => chest(i + 1, 20 + i * 5, 0)); // x 20..110, all in reach
      const kept = retireFarChests(board, none, me).map((c) => c.id);
      expect(kept.sort((a, b) => a - b)).toEqual(Array.from({ length: BOARD_MAX }, (_, i) => i + 1));
    });
  });
});
