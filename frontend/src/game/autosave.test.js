import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutosave } from './autosave.js';

describe('createAutosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces multiple schedule() calls into one save', () => {
    const save = vi.fn();
    const a = createAutosave({ save, delayMs: 1000 });
    a.schedule(); a.schedule(); a.schedule();
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('a change while a save is pending joins it: the save lands the delay after the FIRST change', () => {
    const save = vi.fn();
    const a = createAutosave({ save, delayMs: 1000 });
    a.schedule();
    vi.advanceTimersByTime(900);
    a.schedule();
    vi.advanceTimersByTime(100);
    expect(save, 'the second change pushed the save back').toHaveBeenCalledTimes(1);
    a.schedule();
    vi.advanceTimersByTime(1000);
    expect(save, 'a change after the save did not arm the next one').toHaveBeenCalledTimes(2);
  });
  it('flush() saves immediately and cancels the pending timer', () => {
    const save = vi.fn();
    const a = createAutosave({ save, delayMs: 1000 });
    a.schedule();
    a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1); // no double-save
  });
  it('flush() is a no-op when nothing is pending', () => {
    const save = vi.fn();
    createAutosave({ save, delayMs: 1000 }).flush();
    expect(save).not.toHaveBeenCalled();
  });
  it('cancel() drops a pending save', () => {
    const save = vi.fn();
    const a = createAutosave({ save, delayMs: 1000 });
    a.schedule();
    a.cancel();
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
  });
});
