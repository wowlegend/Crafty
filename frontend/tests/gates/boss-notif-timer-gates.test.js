import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(HERE, '../../src/', rel), 'utf8');

// Regression (2026-06-28 audit, MEDIUM): bossSystem's 3 notification auto-clears used raw
// setTimeout(() => setBossNotification(null), N) with NO cleanup — a setState-after-unmount leak if
// the system unmounts within the window. They now route through a tracked helper cleared on unmount.
describe('bossSystem notification timers — tracked + cleared on unmount', () => {
  const src = read('world/bossSystem.js');

  it('no raw uncleared setBossNotification timeout; uses the tracked helper', () => {
    expect(src).not.toMatch(/setTimeout\(\(\) => setBossNotification\(null\)/);
    expect(src).toMatch(/scheduleNotifClear\(/);
  });

  it('clears the tracked timers on unmount', () => {
    expect(src).toMatch(/notifTimers\.current/);
    expect(/for \(const t of notifTimers\.current\) clearTimeout\(t\)/.test(src)).toBe(true);
  });
});
