// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore';
import { STRINGS } from '../../src/i18n/strings.js';
import { writeWorld } from '../../src/game/worldSaves.js';
import { ContextLossPanel } from '../../src/ui/ContextLossPanel.jsx';
import { recoverFromContextLoss, consumeResumeWorld, RESUME_WORLD_KEY } from '../../src/game/contextRecovery.js';

/**
 * A LOST WEBGL CONTEXT HAS A WAY BACK (plan 2026-10-27-crafty-steady-cool, item e; masterpiece 0f).
 *
 * GameScene marked the store's isWebGLContextLost on `webglcontextlost`, and nothing read it (grep: one writer, zero
 * readers). On an iPad that drops the context under memory pressure, the player got a black canvas under a live HUD.
 * Now a panel derived from that flag offers one tap: save, leave a session breadcrumb, reload — and at boot the
 * breadcrumb loads the same world. This renders the real panel against the real store and drives the real recovery.
 * BLIND SPOT: that GameScene's listeners set the flag on a real context loss, and that the reload lands in the world,
 * are the e2e's (tests/e2e/context-loss.spec.js, WEBGL_lose_context).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/ui/ContextLossPanel.jsx and src/game/contextRecovery.js, receipts in
 * the commit:
 *   L1 the panel ignores the flag (never shows)                     -> RED expected
 *   L2 plausible-wrong: reload BEFORE the save                      -> RED expected (save precedes reload)
 *   L3 the breadcrumb is not written                                -> RED expected
 *   L4 plausible-wrong: the breadcrumb is read but never removed     -> RED expected (a second boot loads again)
 *   L5 the boot resume effect removed                               -> RED expected
 *   L0 identity (a comment edit)                                    -> must SURVIVE
 */
const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  useGameStore.setState({ isWebGLContextLost: false });
});
afterEach(cleanup);

describe('the panel is derived from the store flag', () => {
  it('hidden while the context is fine; shown, with the localised copy, once it is lost', () => {
    render(<ContextLossPanel reload={() => {}} />);
    expect(screen.queryByTestId('context-loss-panel'), 'the panel showed with a healthy context').toBeNull();
    useGameStore.setState({ isWebGLContextLost: true });
    cleanup();
    render(<ContextLossPanel reload={() => {}} />);
    const panel = screen.getByTestId('context-loss-panel');
    expect(panel.textContent).toContain(STRINGS.en['ui.contextLost']);
    expect(STRINGS.en['ui.contextLost']).toBe('Graphics were reset by the system — tap to resume');
    expect(STRINGS['zh-CN']['ui.contextLost'], 'no zh-CN copy').toBeTruthy();
    expect(STRINGS['zh-CN']['ui.contextLost']).not.toBe(STRINGS.en['ui.contextLost']);
  });

  it('a tap saves the world where the player stands, leaves the breadcrumb, then reloads', () => {
    const order = [];
    const save = vi.fn(() => { order.push('save'); useGameStore.setState({ _sessionWorldId: 'local_abc' }); });
    useGameStore.setState({
      isWebGLContextLost: true,
      _sessionWorldId: null,
      saveActiveWorld: save,
      playerRigidBodyRef: { current: { translation: () => ({ x: 4, y: 52, z: -7 }) } },
    });
    const reload = vi.fn(() => order.push(`reload:${window.sessionStorage.getItem(RESUME_WORLD_KEY)}`));
    render(<ContextLossPanel reload={reload} />);
    fireEvent.click(screen.getByTestId('context-loss-resume'));
    expect(save).toHaveBeenCalledWith({ x: 4, y: 52, z: -7 });
    expect(order, 'the reload must come after the save, with the breadcrumb already written').toEqual(['save', 'reload:local_abc']);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('the breadcrumb resumes the world at boot, once', () => {
  it('a reload after a recovery loads the world the tab was playing, and only once', () => {
    const data = { id: 'local_resume', player_data: { level: 7 } };
    writeWorld('local_resume', { name: 'Skyhold', created_at: 'x', is_owner: true }, data);
    window.sessionStorage.setItem(RESUME_WORLD_KEY, 'local_resume');
    const load = vi.fn();
    useGameStore.setState({ loadWorldData: load });
    render(<ContextLossPanel reload={() => {}} />);
    expect(load, 'the boot did not resume the world').toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0].id).toBe('local_resume');
    expect(window.sessionStorage.getItem(RESUME_WORLD_KEY), 'the breadcrumb survived its use').toBeNull();
    cleanup();
    render(<ContextLossPanel reload={() => {}} />);
    expect(load, 'a second boot resumed again').toHaveBeenCalledTimes(1);
  });

  it('a breadcrumb naming a world that no longer exists loads nothing and is still cleared', () => {
    const s = memoryStorage();
    s.setItem(RESUME_WORLD_KEY, 'gone');
    expect(consumeResumeWorld({ storage: s, readWorld: () => null })).toBeNull();
    expect(s.getItem(RESUME_WORLD_KEY)).toBeNull();
  });

  it('storage that throws (private mode) does not stop the recovery reload', () => {
    const reload = vi.fn();
    const throwing = { setItem: () => { throw new Error('denied'); } };
    const st = { saveActiveWorld: vi.fn(), playerPosition: { x: 1, y: 2, z: 3 }, _sessionWorldId: 'w' };
    recoverFromContextLoss({ getState: () => st, storage: throwing, reload });
    expect(st.saveActiveWorld).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
