import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutosave } from './autosave.js';

describe('createAutosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces multiple schedule() calls into one save', () => {
    const save = vi.fn();
    const a = createAutosave({ save, delayMs: 1000 });
    a.schedule(); a.schedule(); a.schedule();
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
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
