import { describe, it, expect, beforeEach } from 'vitest';
import { registerTestHook, callTestHook, _resetBridge } from '../../src/devtest/testBridge.js';

describe('test bridge registry', () => {
  beforeEach(() => _resetBridge());

  it('registers and calls a hook with args', () => {
    let captured = null;
    registerTestHook('setTime', (t) => { captured = t; });
    callTestHook('setTime', 0.5);
    expect(captured).toBe(0.5);
  });

  it('calling an unregistered hook is a safe no-op', () => {
    expect(() => callTestHook('missing', 1, 2)).not.toThrow();
    expect(callTestHook('missing')).toBeUndefined();
  });

  it('returns the hook return value', () => {
    registerTestHook('echo', (x) => x * 2);
    expect(callTestHook('echo', 21)).toBe(42);
  });
});
