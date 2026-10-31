// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('../../src/input/touchDevice', async (orig) => ({ ...(await orig()), isTouchDevice: () => true, isTouchUIMode: () => true }));
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { AnimatePresence, m } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { MotionProvider } from '../../src/ui/MotionProvider.jsx';
import { SoundProvider } from '../../src/SoundManager.jsx';
import { Modal } from '../../src/ui/primitives/Modal.jsx';
import { ChestInventoryPanel } from '../../src/ui/ChestInventoryPanel.jsx';
import { SpellUpgradePanel } from '../../src/ui/SpellUpgradePanel.jsx';
import TouchControls from '../../src/ui/TouchControls.jsx';
import { MenuSystem } from '../../src/MenuSystem.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { selectHudState } from '../../src/store/hudState.js';
import { setActive, getInput } from '../../src/input/inputState.js';
import { useActiveInput } from '../../src/input/useActiveInput.js';
import { ownsTouch } from '../../src/input/touchOwnership.js';

// A MODAL'S BACKDROP CLOSES ONLY FOR A PRESS THAT BEGAN ON IT, AND A MODAL ON ITS WAY OUT IS NO LONGER A SURFACE.
//
// 1. The touch tray's rows act on the lift and unmount under the finger (ui/TouchControls.jsx); the browser's click for
//    that tap is then hit-tested where the finger was, on the backdrop of the panel the lift just opened, and the
//    backdrop's onClick closed it (the app half of AUDIT:input:ipad-tray-ghost-click, which CI's Chromium showed). A drag
//    that begins inside a panel's card and ends on the backdrop is the same shape. The backdrop now closes only when the
//    press began on it. The real TouchControls and MenuSystem, as the audit verifier drove them; jsdom does not hit-test,
//    so the click is dispatched on the backdrop, where the browser lands it.
// 2. A panel inside AnimatePresence stays in the DOM through its exit. While it faded it still declared aria-modal, which
//    the touch layer reads as a control that owns its touches (input/touchOwnership.js, lane L1), and it still took the
//    pointer, so the first touch on the world after a close neither looked nor moved (L1's leftover). Leaving, a surface
//    claims nothing and takes no pointer: the Modal primitive and the two panels that draw their own dialog (the chest and
//    the talents).

const QUEST_STUB = { achievements: [], unlockedAchievements: [], stats: {}, quests: [] };
const NOOP = () => {};
function Harness() {
  const gameState = useGameStore(useShallow(selectHudState));
  const isPointerLocked = useActiveInput();
  return (
    <MotionProvider>
      <SoundProvider>
        <TouchControls isWorldBuilt talentsOpen={false} otherPanelOpen={false} onOpenTalents={NOOP} />
        <MenuSystem gameState={gameState} showAchievements={false} setShowAchievements={NOOP}
          showSpellUpgrades={false} setShowSpellUpgrades={NOOP} isPointerLocked={isPointerLocked}
          setIsPointerLocked={setActive} showStats={false} setShowStats={NOOP} questSystem={QUEST_STUB} />
      </SoundProvider>
    </MotionProvider>
  );
}
const ROWS = [
  { row: 'build', flag: 'showBuildingTools', modal: 'building-panel' },
  { row: 'journal', flag: 'showQuestLog', modal: 'quest-log-panel' },
  { row: 'character', flag: 'showInventory', modal: 'inventory-modal' },
];

beforeEach(() => {
  useGameStore.setState({
    showInventory: false, showForge: false, showMagic: false, showBuildingTools: false, showSettings: false,
    showChestInterface: false, showTradingInterface: false, showWorldManager: false, showCredits: false,
    showQuestLog: false, showControls: false, showSpellUpgrades: false, showAchievements: false,
    gameStarted: true, isAlive: true, victoryPending: false, isWebGLContextLost: false, requestPointerLock: null,
  });
  setActive(true);
});
afterEach(() => { cleanup(); setActive(false); });

/** A tap's lift on a tray row: the opener first, then the row's press and lift (the row unmounts on the lift). */
async function liftOnRow(row) {
  fireEvent.pointerUp(screen.getByTestId('touch-panels'));
  const btn = screen.getByTestId(`touch-tray-${row}`);
  fireEvent.pointerDown(btn);
  fireEvent.pointerUp(btn);
}

describe('the backdrop closes only for a press that began on it', () => {
  it('the click after a tray lift and a drag out of the card leave the panel open; a tap on the backdrop closes it', async () => {
    const rows = [];
    for (const { row, flag, modal } of ROWS) {
      render(<Harness />);
      await liftOnRow(row);
      const backdrop = await screen.findByTestId(modal, {}, { timeout: 10000 });
      expect(useGameStore.getState()[flag], `SETUP: the ${row} row did not open its panel`).toBe(true);
      fireEvent.click(backdrop); // the tap's own click, landing on the new backdrop
      const afterGhost = useGameStore.getState()[flag];
      fireEvent.pointerDown(backdrop.firstElementChild); // a drag from inside the card...
      fireEvent.click(backdrop); // ...released over the backdrop
      const afterDrag = useGameStore.getState()[flag];
      fireEvent.pointerDown(backdrop); // PRESENCE: a press and a click on the backdrop itself
      fireEvent.click(backdrop);
      const afterTap = useGameStore.getState()[flag];
      rows.push({ row, afterGhost, afterDrag, afterTap });
      cleanup();
      act(() => { useGameStore.setState({ [flag]: false }); setActive(true); });
    }
    expect(rows.length, 'the denominator: the three tray rows that open a Modal').toBe(3);
    expect(rows.filter((r) => r.afterTap !== false), 'PRESENCE: a tap on the backdrop did not close the panel').toEqual([]);
    expect(rows.filter((r) => r.afterGhost !== true || r.afterDrag !== true), 'a click that did not begin on the backdrop closed the panel').toEqual([]);
  }, 60000);
});

describe('the Modal primitive alone', () => {
  it('a click on a child that lets it bubble does not close, even after a press on the backdrop', () => {
    const onClose = vi.fn();
    render(<Modal testId="plain-modal" label="Plain" onClose={onClose}><span data-testid="plain-child">a label</span></Modal>);
    const backdrop = screen.getByTestId('plain-modal');
    fireEvent.pointerDown(backdrop);
    fireEvent.click(screen.getByTestId('plain-child'));
    const afterChild = onClose.mock.calls.length;
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose, 'PRESENCE: a press and a click on the backdrop did not close it').toHaveBeenCalledTimes(1);
    expect(afterChild, 'a click on a child closed the modal').toBe(0);
  });
});

/** Render `node` inside AnimatePresence, then take it away: the leaving element while its exit runs. */
function leaving(node, find) {
  const view = (open) => <MotionProvider><AnimatePresence>{open && node}</AnimatePresence></MotionProvider>;
  const r = render(view(true));
  const up = find();
  const whileUp = { modal: up?.getAttribute('aria-modal') ?? null, owns: ownsTouch(up), pointer: up?.style.pointerEvents || '' };
  r.rerender(view(false));
  const out = find();
  const whileLeaving = out ? { modal: out.getAttribute('aria-modal'), owns: ownsTouch(out), pointer: out.style.pointerEvents || '' } : null;
  r.unmount();
  return { whileUp, whileLeaving };
}

describe('a modal surface on its way out is no longer a surface', () => {
  it('the Modal primitive, the chest panel and the talents panel each claim nothing and take no pointer while they leave', () => {
    act(() => { useGameStore.setState({ chests: new Map(), inventory: { blocks: {} } }); });
    const cases = {
      modal: leaving(
        <Modal key="m" testId="leaving-modal" label="Leaving" onClose={NOOP}>
          <m.div exit={{ opacity: 0 }} transition={{ duration: 5 }}>card</m.div>
        </Modal>,
        () => screen.queryByTestId('leaving-modal')),
      chest: leaving(<ChestInventoryPanel key="c" coords="0_0_0" onClose={NOOP} />, () => screen.queryByRole('dialog', { name: 'Chest' })),
      talents: leaving(<SpellUpgradePanel key="s" onClose={NOOP} />, () => document.querySelector('[role="dialog"]')),
    };
    const bad = [];
    for (const [name, { whileUp, whileLeaving }] of Object.entries(cases)) {
      if (whileUp.modal !== 'true' || !whileUp.owns) bad.push(`${name}: SETUP: up, it is not a modal surface that owns its touch (${JSON.stringify(whileUp)})`);
      if (!whileLeaving) { bad.push(`${name}: SETUP: it left the DOM at once, so its exit was never seen`); continue; }
      if (whileLeaving.modal === 'true' || whileLeaving.owns) bad.push(`${name}: leaving, it still claims touches (${JSON.stringify(whileLeaving)})`);
      if (whileLeaving.pointer !== 'none') bad.push(`${name}: leaving, it still takes the pointer (${JSON.stringify(whileLeaving)})`);
    }
    expect(Object.keys(cases).length, 'the denominator').toBe(3);
    expect(bad).toEqual([]);
  });

  it('on touch, the first touch on a closing panel goes to the world, not to the panel that is fading', async () => {
    // The trade panel, opened as the world opens it on touch (play stays live), animates out (its card's exit).
    act(() => { useGameStore.setState({ selectedVillager: { id: 'v1', npcName: 'Gate Merchant', role: 'merchant', position: [0, 0, 0] } }); });
    render(<Harness />);
    act(() => { useGameStore.getState().setShowTradingInterface(true); });
    const backdrop = await screen.findByRole('dialog', { name: 'Gate Merchant' }, { timeout: 10000 });
    fireEvent.click(within(backdrop).getAllByRole('button', { name: /close/i })[0]);
    expect(useGameStore.getState().showTradingInterface, 'SETUP: the close control did not close the trade panel').toBe(false);
    expect(getInput().active, 'SETUP: play is not live after the close').toBe(true);
    expect(backdrop.isConnected, 'SETUP: the panel left at once, so its exit was never seen').toBe(true);
    const touch = { identifier: 3, target: backdrop, clientX: 300, clientY: 300, pageX: 300, pageY: 300 };
    const start = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(start, 'changedTouches', { value: [touch] });
    Object.defineProperty(start, 'touches', { value: [touch] });
    act(() => { backdrop.dispatchEvent(start); });
    expect(start.defaultPrevented, 'the fading panel kept the touch, so the world did not get it').toBe(true);
  }, 30000);
});
