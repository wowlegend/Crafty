// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { listWorlds, readWorld, writeWorld, deleteWorld, getActiveWorldId, setActiveWorldId, mintWorldId } from './worldSaves.js';

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
  it('writeWorld reports failure when the INDEX write fails (quota) — not a false success', () => {
    // The blob write lands but the index write hits quota. Before the fix writeWorld ignored the
    // index-write result and returned true, so the caller believed the save succeeded while the world
    // was orphaned (a blob no index entry points at). MUTATION-PROOF: revert saveIndex/writeWorld to
    // drop the boolean and this goes RED (ok === true).
    const realSet = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function set(k, v) {
      if (k === 'crafty_world_saves') throw new DOMException('quota', 'QuotaExceededError');
      return realSet.call(this, k, v);
    });
    try {
      const ok = writeWorld('local_orphan', { name: 'W' }, { version: 2 });
      expect(ok).toBe(false);
    } finally {
      spy.mockRestore();
    }
    // and the caller can see the world never made it into the index
    expect(listWorlds().map((w) => w.id)).not.toContain('local_orphan');
  });

  it('active world id persists and clears', () => {
    setActiveWorldId('local_42');
    expect(getActiveWorldId()).toBe('local_42');
    setActiveWorldId(null);
    expect(getActiveWorldId()).toBeNull();
  });

  it('mintWorldId avoids same-millisecond collisions (base -> _2 -> _3, the id the slice exists to protect)', () => {
    // Freeze the clock so Date.now() is stable -> two worlds minted in the same ms MUST NOT collide.
    // MUTATION-PROOF: make mintWorldId return the bare base always and the _2/_3 assertions go RED.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T00:00:00Z'));
    try {
      const base = 'local_' + Date.now();
      expect(mintWorldId()).toBe(base);              // nothing taken yet -> the bare base
      writeWorld(base, { name: 'A' }, { version: 2 });
      expect(mintWorldId()).toBe(`${base}_2`);       // base taken (index + blob) -> _2
      writeWorld(`${base}_2`, { name: 'B' }, { version: 2 });
      expect(mintWorldId()).toBe(`${base}_3`);       // base + _2 taken -> _3
    } finally {
      vi.useRealTimers();
    }
  });
});
