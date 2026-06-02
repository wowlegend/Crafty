// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { getInput, setIntent, setActive, resetInput, INTENT_KEYS } from './inputState.js';

describe('input intent module', () => {
  beforeEach(() => resetInput());
  it('defaults: all intents false, inactive', () => {
    const s = getInput();
    expect(s.active).toBe(false);
    for (const k of INTENT_KEYS) expect(s[k]).toBe(false);
  });
  it('setIntent flips a single intent; getInput reflects it', () => {
    setIntent('dodge', true);
    expect(getInput().dodge).toBe(true);
    expect(getInput().attack).toBe(false);
  });
  it('setActive gates the active flag (replaces pointer-lock checks)', () => {
    setActive(true); expect(getInput().active).toBe(true);
    setActive(false); expect(getInput().active).toBe(false);
  });
  it('getInput returns a STABLE reference (transient read, no per-call alloc)', () => {
    expect(getInput()).toBe(getInput());
  });
  it('rejects unknown intent keys (typo guard)', () => {
    expect(() => setIntent('jmup', true)).toThrow();
  });
  it('resetInput restores defaults', () => {
    setIntent('jump', true); setActive(true);
    resetInput();
    expect(getInput().jump).toBe(false);
    expect(getInput().active).toBe(false);
  });
});
