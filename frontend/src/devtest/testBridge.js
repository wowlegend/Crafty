// Dev-only bridge that lets the visual-regression harness drive the running
// app into known states (start game, set time-of-day, later set dangerLevel).
// In production builds this module's installer is a no-op.

let registry = {};

export function registerTestHook(name, fn) { registry[name] = fn; }
export function callTestHook(name, ...args) {
  return Object.prototype.hasOwnProperty.call(registry, name) ? registry[name](...args) : undefined;
}
export function _resetBridge() { registry = {}; } // test-only

/** Expose window.__craftyTest in dev so Puppeteer can call registered hooks. */
export function installTestBridge() {
  if (typeof window === 'undefined') return;
  if (!import.meta.env || !import.meta.env.DEV) return; // dev-only
  window.__craftyTest = {
    call: (name, ...args) => callTestHook(name, ...args),
    list: () => Object.keys(registry),
    ready: () => true,
  };
}
