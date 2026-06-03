// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { listWorlds, readWorld, writeWorld, deleteWorld, getActiveWorldId, setActiveWorldId } from './worldSaves.js';

describe('worldSaves localStorage helper', () => {
  beforeEach(() => localStorage.clear());

  it('writeWorld adds to the index and round-trips the blob', () => {
    writeWorld('local_1', { name: 'W1' }, { version: 2, hello: 'world' });
    expect(listWorlds().map((w) => w.id)).toContain('local_1');
    expect(readWorld('local_1').hello).toBe('world');
  });
  it('writeWorld upserts (no duplicate index entry on re-save)', () => {
    writeWorld('local_1', { name: 'W1' }, { version: 2 });
    writeWorld('local_1', { name: 'W1b' }, { version: 2 });
    expect(listWorlds().filter((w) => w.id === 'local_1').length).toBe(1);
  });
  it('deleteWorld removes index entry + blob', () => {
    writeWorld('local_1', { name: 'W1' }, { version: 2 });
    deleteWorld('local_1');
    expect(listWorlds()).toEqual([]);
    expect(readWorld('local_1')).toBeNull();
  });
  it('active world id persists and clears', () => {
    setActiveWorldId('local_42');
    expect(getActiveWorldId()).toBe('local_42');
    setActiveWorldId(null);
    expect(getActiveWorldId()).toBeNull();
  });
});
