// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { readWorld, getActiveWorldId } from '../../src/game/worldSaves.js';

describe('store.saveActiveWorld', () => {
  beforeEach(() => { localStorage.clear(); useGameStore.setState({ isCaptureMode: false, level: 7, currentXP: 5, totalXP: 1200 }); });

  it('writes the full save blob to the active world slot', () => {
    useGameStore.getState().saveActiveWorld({ x: 1, y: 2, z: 3 });
    const id = getActiveWorldId();
    expect(id).toBeTruthy();
    const blob = readWorld(id);
    expect(blob.version).toBe(2);
    expect(blob.progression.level).toBe(7);
    expect(blob.player_data.position).toEqual({ x: 1, y: 2, z: 3 });
  });
  it('is a no-op in capture mode (visual-gate isolation)', () => {
    useGameStore.setState({ isCaptureMode: true });
    useGameStore.getState().saveActiveWorld({ x: 0, y: 0, z: 0 });
    expect(getActiveWorldId()).toBeNull();
  });
});
