// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';

let TOUCH = false;
vi.mock('../../src/input/touchDevice', async (orig) => ({ ...(await orig()), isTouchDevice: () => TOUCH, isTouchUIMode: () => TOUCH }));

import { useRef } from 'react';
import { useInputManager } from '../../src/InputManager.jsx';
import TouchControls from '../../src/ui/TouchControls.jsx';
import { openTalents } from '../../src/ui/touchTray.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive, getInput } from '../../src/input/inputState.js';
import { PANEL_FLAGS, isAnyPanelOpen, shouldOpenPauseOnUnlock } from '../../src/ui/panelState.js';
import { tickWorldClock, isWorldFrozen } from '../../src/game/worldClock.js';
import { routeExpressVerb } from '../../src/input/expressVerbs.js';
import { requestGameLock } from '../../src/input/pointerLock.js';
import { HOTBAR_BLOCKS } from '../../src/world/Blocks';
import { ecs } from '../../src/ecs/world.js';
import { useShallow } from 'zustand/react/shallow';
import { MenuSystem } from '../../src/MenuSystem.jsx';
import { SoundProvider } from '../../src/SoundManager.jsx';
import { selectHudState } from '../../src/store/hudState.js';

// A SURFACE OVER THE GAME TAKES THE INPUT, WHICHEVER WAY IT OPENED (lane L5 of the 2026-10-30 deep audit).
//
// The input gate (getInput().active) is the pointer lock on desktop and play on touch, and every opener was trusted to
// drop it. Two did not: a chest opened from the world on touch (no lock to lose; the world ran on behind the scrim and a
// mob could kill the player in the menu, AUDIT:input:touch-panel-world-runs), and VICTORY, raised by a store write under
// a held lock (Keep exploring could not be clicked, clicks mined behind it, the world ran on,
// AUDIT:input:victory-under-pointer-lock). So this is exhaustive over device x surface x opener, against the real
// useInputManager, the real TouchControls, the real world clock and the real express router: every surface (each
// PANEL_FLAG, VICTORY, the lost-context panel and the death screen) by the worst opener, a bare store write that drops
// no gate, and by each real opener this harness can drive (the panel keys, G to a villager, the touch tray rows, the
// locked Aspect sector). With the surface up:
//   - no live verb: the wheel moves no hotbar slot, a spell key selects no spell, F routes to no verb;
//   - the world holds (tickWorldClock, isWorldFrozen), except at a death, which is not a pause;
//   - its control is reachable: on desktop the pointer is not locked (under a lock every click goes to the canvas); on
//     touch the move/look router yields the screen to it (a touch on scenery is not taken), death excepted (play stays
//     live on touch at a death, DECISIONS 2026-10-30 item 164);
//   - on desktop no pause panel is owed for the unlock (shouldOpenPauseOnUnlock), so Settings does not open under it.
// Each case first shows the same probes reading live play (PRESENCE), so a dead instrument cannot pass.
//
// The lock is a stand-in: pointerLockElement reads the body while held, exitPointerLock releases it and fires
// `pointerlockchange`, the store's requester takes it. Components' lock listener is mirrored in one line (onLockChange):
// active follows the lock and the first lock starts the game. Not covered here: the click itself in a browser (the
// victory e2e, tests/e2e/input-live.spec.js), and the R3F Player's half (performVerb, the walk and the Aspect machines),
// which reads the same predicate (input/inputLive.js) and is gated in tests/gates/player-input-live-gates.test.jsx.

const lock = { held: false, exits: 0, requests: 0, requestsUnderSurface: 0 };
const onLockChange = () => {
  const locked = !!document.pointerLockElement;
  setActive(locked);
  if (locked) useGameStore.getState().markGameStarted();
};
const surfaceOnScreen = () => {
  const s = useGameStore.getState();
  return isAnyPanelOpen(s) || !!s.victoryPending || !!s.isWebGLContextLost || s.isAlive === false;
};
function requester() {
  lock.requests += 1;
  if (surfaceOnScreen()) lock.requestsUnderSurface += 1;
  lock.held = true;
  document.dispatchEvent(new Event('pointerlockchange'));
}
function installDesktopLock() {
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => (lock.held ? document.body : null) });
  document.exitPointerLock = () => {
    lock.exits += 1;
    if (!lock.held) return;
    lock.held = false;
    document.dispatchEvent(new Event('pointerlockchange'));
  };
  document.addEventListener('pointerlockchange', onLockChange);
  useGameStore.setState({ requestPointerLock: requester });
}
function removeLock() {
  document.removeEventListener('pointerlockchange', onLockChange);
  delete document.exitPointerLock;
  delete document.pointerLockElement;
}

let im = null;
function Game() {
  const isAlive = useGameStore((s) => s.isAlive);
  const hook = useInputManager({}, { isAlive });
  const ref = useRef(hook);
  ref.current = hook;
  im = ref.current;
  if (!TOUCH) return null;
  return (
    <TouchControls isWorldBuilt talentsOpen={hook.showSpellUpgrades} otherPanelOpen={hook.showAchievements}
      onOpenTalents={() => openTalents(useGameStore.getState(), hook)} />
  );
}

const setterOf = (flag) => `set${flag[0].toUpperCase()}${flag.slice(1)}`;
let villager = null;
let scenery = null;
let T = 7e9;

function resetWorld() {
  const closed = Object.fromEntries(PANEL_FLAGS.map((f) => [f, false]));
  useGameStore.setState({
    ...closed, victoryPending: false, isWebGLContextLost: false, isAlive: true, gameStarted: true,
    selectedBlock: HOTBAR_BLOCKS[0], activeSpell: 'fireball', selectedVillager: null, activeChestCoords: null,
    unlockedTalents: {}, hitstopUntil: 0, hitstopStart: 0, hitstopFrozenTotal: 0,
    gameCamera: { position: { x: 0, y: 0, z: 0 } }, requestPointerLock: null,
  });
  setActive(false);
  Object.assign(lock, { held: false, exits: 0, requests: 0, requestsUnderSurface: 0 });
}

/** A one-finger touchstart and touchend on `el`; whether the game cancelled either (the router took the touch). */
function tap(el) {
  const touch = { identifier: 11, target: el, clientX: 300, clientY: 300, pageX: 300, pageY: 300 };
  const mk = (type) => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'changedTouches', { value: [touch] });
    Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [touch] });
    return ev;
  };
  const start = mk('touchstart');
  const end = mk('touchend');
  act(() => { el.dispatchEvent(start); el.dispatchEvent(end); });
  return start.defaultPrevented || end.defaultPrevented;
}

const key = (code, k = code) => act(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: k, bubbles: true, cancelable: true }));
});

/** What the input does right now: each probe is true when it acted on the game. */
function probe() {
  const s = useGameStore.getState();
  act(() => { window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true })); });
  const spellCode = s.activeSpell === 'iceball' ? 'Digit1' : 'Digit2';
  key(spellCode, spellCode === 'Digit1' ? '1' : '2');
  const after = useGameStore.getState();
  tickWorldClock((T += 16));
  tickWorldClock((T += 16));
  return {
    wheel: after.selectedBlock !== s.selectedBlock,
    spell: after.activeSpell !== s.activeSpell,
    express: routeExpressVerb('KeyF', { ...after, active: getInput().active }) !== null,
    paused: isWorldFrozen(),
    locked: !!document.pointerLockElement,
    routerTakesScenery: TOUCH ? tap(scenery) : null,
  };
}

function addVillager(role) {
  villager = ecs.add({ isMob: true, type: 'villager', health: 20, role, npcName: `Gate ${role}`, id: `gate-${role}`, position: { x: 1, y: 0, z: 1 } });
}

const openWithSetter = (flag) => () => act(() => {
  const fn = (im && im[setterOf(flag)]) || useGameStore.getState()[setterOf(flag)];
  fn(true);
});
const SURFACES = [
  ...PANEL_FLAGS.map((flag) => ({ surface: flag, opener: 'store write', open: openWithSetter(flag) })),
  { surface: 'victory', opener: 'store write', open: () => act(() => { useGameStore.setState({ victoryPending: true }); }) },
  { surface: 'contextLoss', opener: 'store write', open: () => act(() => { useGameStore.setState({ isWebGLContextLost: true }); }) },
  { surface: 'death', opener: 'store write', open: () => act(() => { useGameStore.setState({ isAlive: false }); }) },
];
const KEYS = [
  { surface: 'showInventory', opener: 'Tab', open: () => key('Tab') },
  { surface: 'showQuestLog', opener: 'KeyJ', open: () => key('KeyJ', 'j') },
  { surface: 'showControls', opener: 'KeyH', open: () => key('KeyH', 'h') },
  { surface: 'showBuildingTools', opener: 'KeyB', open: () => key('KeyB', 'b') },
  { surface: 'showForge', opener: 'G to the smith', open: () => { addVillager('smith'); key('KeyG', 'g'); } },
  { surface: 'showTradingInterface', opener: 'G to the merchant', open: () => { addVillager('merchant'); key('KeyG', 'g'); } },
];
const pointerUp = (id) => act(() => { fireEvent.pointerUp(screen.getByTestId(id)); });
const TOUCH_OPENERS = [
  ...['character', 'build', 'journal'].map((row) => ({
    surface: { character: 'showInventory', build: 'showBuildingTools', journal: 'showQuestLog' }[row],
    opener: `tray ${row}`, open: () => { pointerUp('touch-panels'); pointerUp(`touch-tray-${row}`); },
  })),
  { surface: 'showTradingInterface', opener: 'tray talk to the merchant', open: () => { addVillager('merchant'); pointerUp('touch-panels'); pointerUp('touch-tray-talk'); } },
  { surface: 'showSpellUpgrades', opener: 'a locked Aspect sector', open: () => { pointerUp('touch-aspects'); pointerUp('touch-aspect-roar'); } },
];

function enterPlay() {
  if (TOUCH) act(() => { setActive(true); useGameStore.getState().markGameStarted(); });
  else act(() => { requestGameLock(useGameStore.getState()); });
}

/** One case: live play, PRESENCE, the opener, then each property. Returns the violations it saw. */
function runCase(device, c) {
  TOUCH = device === 'touch';
  resetWorld();
  if (TOUCH) { delete document.exitPointerLock; } else installDesktopLock();
  scenery = document.createElement('canvas');
  document.body.appendChild(scenery);
  render(<Game />);
  enterPlay();
  const label = `${device} | ${c.surface} | ${c.opener}`;
  const out = [];
  const live = probe();
  const wantLive = { wheel: true, spell: true, express: true, paused: false, locked: !TOUCH, routerTakesScenery: TOUCH ? true : null };
  if (JSON.stringify(live) !== JSON.stringify(wantLive)) {
    out.push(`${label}: SETUP: live play did not read live, so nothing below was measured: ${JSON.stringify(live)}`);
  } else {
    c.open();
    const up = surfaceOnScreen();
    if (!up) out.push(`${label}: SETUP: the opener put nothing on screen`);
    const r = probe();
    const death = c.surface === 'death';
    if (r.wheel) out.push(`${label}: the wheel moved the hotbar behind the surface`);
    if (r.spell) out.push(`${label}: a spell key selected a spell behind the surface`);
    if (r.express) out.push(`${label}: F routed to a verb behind the surface`);
    if (!death && !r.paused) out.push(`${label}: the world ran on behind the surface`);
    if (death && r.paused) out.push(`${label}: the death screen paused the world`);
    if (!TOUCH && r.locked) out.push(`${label}: the pointer stayed locked, so the surface cannot be clicked`);
    if (TOUCH && !death && r.routerTakesScenery) out.push(`${label}: the touch router still takes the screen behind the surface`);
    if (!TOUCH && shouldOpenPauseOnUnlock({ ...useGameStore.getState(), isTouch: false })) out.push(`${label}: the unlock would open the pause panel over the surface`);
  }
  cleanup();
  scenery.remove();
  if (villager) { ecs.remove(villager); villager = null; }
  removeLock();
  setActive(false);
  return out;
}

afterEach(() => { cleanup(); removeLock(); setActive(false); TOUCH = false; });

describe('INVARIANT: a surface over the game takes the input (device x surface x opener)', () => {
  it('holds for every surface by a bare store write and for every real opener, on desktop and on touch', () => {
    const cases = [
      ...[...SURFACES, ...KEYS].map((c) => ['desktop', c]),
      ...[...SURFACES, ...KEYS, ...TOUCH_OPENERS].map((c) => ['touch', c]),
    ];
    const violations = [];
    for (const [device, c] of cases) violations.push(...runCase(device, c));
    console.log(`[input-live] ${cases.length} cases checked: ${SURFACES.length} surfaces by store write, ${KEYS.length} key and talk openers, ` +
      `${TOUCH_OPENERS.length} touch openers; ${violations.length} violations`);
    expect(cases.length, 'the denominator: device x (surfaces + openers)').toBe(2 * (PANEL_FLAGS.length + 3 + KEYS.length) + TOUCH_OPENERS.length);
    expect(violations).toEqual([]);
  });
});

describe('the pointer is taken again only when no surface remains (AUDIT:input:panel-stack-relock-still-live)', () => {
  const PANEL_KEYS = [['KeyB', 'b'], ['KeyJ', 'j'], ['KeyH', 'h'], ['Tab', 'Tab']];
  const UNDER = [
    { name: 'the trade panel (G to the merchant)', open: () => { addVillager('merchant'); key('KeyG', 'g'); }, flag: 'showTradingInterface' },
    // Terrain's open(): the chest's coordinates and its flag. It releases nothing itself: the chest is a covering surface,
    // and InputManager gives the pointer back for every one.
    { name: 'a chest (Terrain open)', open: () => act(() => { const s = useGameStore.getState(); s.setActiveChestCoords('3_4_5'); s.setShowChestInterface(true); }), flag: 'showChestInterface' },
  ];

  it('a panel key pressed twice over the trade panel or a chest never locks the pointer with a panel drawn, and play resumes', () => {
    const rows = [];
    for (const under of UNDER) {
      for (const [code, k] of PANEL_KEYS) {
        TOUCH = false;
        resetWorld();
        installDesktopLock();
        render(<Game />);
        enterPlay();
        expect(lock.held, 'SETUP: play did not take the lock').toBe(true);
        under.open();
        expect(useGameStore.getState()[under.flag], `SETUP: ${under.name} did not open`).toBe(true);
        const steps = [];
        for (let i = 0; i < 2; i++) {
          key(code, k);
          steps.push({ locked: lock.held, panel: isAnyPanelOpen(useGameStore.getState()) });
        }
        rows.push({ under: under.name, code, steps, requestsUnderSurface: lock.requestsUnderSurface, end: steps[1] });
        cleanup();
        if (villager) { ecs.remove(villager); villager = null; }
        removeLock();
      }
    }
    expect(rows.length).toBe(UNDER.length * PANEL_KEYS.length);
    const lockedOverPanel = rows.filter((r) => r.steps.some((s) => s.locked && s.panel) || r.requestsUnderSurface > 0);
    expect(lockedOverPanel, 'the pointer was locked (or asked for) with a panel still drawn').toEqual([]);
    // B, J and H switch to their panel and close it again, so the player is back in play. Tab in a dialog other than
    // Character is that dialog's focus key (key-focus-gates.test.jsx): it leaves the trade panel or the chest up, unlocked.
    const notBack = rows.filter((r) => (r.code === 'Tab' ? !(r.end.panel && !r.end.locked) : !(r.end.locked && !r.end.panel)));
    expect(notBack, 'after the key closed its panel the player was not back in play (or Tab took a dialog\'s focus key)').toEqual([]);
  });

  it('requestGameLock asks for nothing while any surface is up, and asks once when none is (the presence)', () => {
    const asked = [];
    for (const s of [...PANEL_FLAGS, 'victoryPending', 'isWebGLContextLost']) {
      const spy = vi.fn();
      requestGameLock({ [s]: true, isAlive: true, requestPointerLock: spy });
      if (spy.mock.calls.length) asked.push(s);
    }
    const dead = vi.fn();
    requestGameLock({ isAlive: false, requestPointerLock: dead });
    if (dead.mock.calls.length) asked.push('death');
    const clear = vi.fn();
    requestGameLock({ isAlive: true, requestPointerLock: clear });
    expect(clear, 'PRESENCE: with nothing up the lock is not asked for at all').toHaveBeenCalledTimes(1);
    expect(asked, 'surfaces under which the lock was asked for').toEqual([]);
  });
});

describe('Esc closes every panel (AUDIT:input:panel-stack-relock-still-live, AUDIT:softlocks:world-manager-keys-stolen)', () => {
  it('each PANEL_FLAG, open alone with the pointer free, closes on Esc, and a villager or chest lets go', () => {
    const stayed = [];
    for (const flag of PANEL_FLAGS) {
      TOUCH = false;
      resetWorld();
      installDesktopLock();
      render(<Game />);
      act(() => {
        useGameStore.setState({ selectedVillager: { id: 'v' }, activeChestCoords: '1_2_3' });
        const fn = (im && im[setterOf(flag)]) || useGameStore.getState()[setterOf(flag)];
        fn(true);
      });
      const open = flag === 'showSpellUpgrades' || flag === 'showAchievements' ? im[flag] : useGameStore.getState()[flag];
      if (!open) stayed.push(`${flag}: SETUP: did not open`);
      key('Escape');
      const s = useGameStore.getState();
      const still = flag === 'showSpellUpgrades' || flag === 'showAchievements' ? im[flag] : s[flag];
      if (still) stayed.push(flag);
      if (s.selectedVillager !== null || s.activeChestCoords !== null) stayed.push(`${flag}: the villager or chest was kept`);
      cleanup();
      removeLock();
    }
    expect(PANEL_FLAGS.length, 'the denominator').toBe(13);
    expect(stayed, 'panels Esc left open').toEqual([]);
  });
});

describe('the resume overlay, fed as App feeds MenuSystem, stands aside for VICTORY and the lost-context panel', () => {
  // App hands MenuSystem the store slice selectHudState picks (store/hudState.js), and the overlay's predicate reads the
  // covering surfaces from it: a surface the slice does not carry is invisible to the overlay, which then draws PAUSED
  // over the surface's own control (Keep exploring, in CI's victory e2e). The real slice, the real MenuSystem.
  function Menu() {
    const gameState = useGameStore(useShallow(selectHudState));
    return (
      <SoundProvider>
        <MenuSystem gameState={gameState} showAchievements={false} setShowAchievements={() => {}} showSpellUpgrades={false}
          setShowSpellUpgrades={() => {}} isPointerLocked={false} setIsPointerLocked={setActive} showStats={false}
          setShowStats={() => {}} questSystem={{ achievements: [], unlockedAchievements: [], stats: {}, quests: [] }} />
      </SoundProvider>
    );
  }
  it('PAUSED shows with the pointer free in play, and not over VICTORY or the lost-context panel', () => {
    resetWorld();
    render(<Menu />);
    const overlay = () => !!screen.queryByTestId('resume-overlay');
    const rows = { play: overlay() };
    act(() => { useGameStore.setState({ victoryPending: true }); });
    rows.victory = overlay();
    act(() => { useGameStore.setState({ victoryPending: false, isWebGLContextLost: true }); });
    rows.contextLoss = overlay();
    act(() => { useGameStore.setState({ isWebGLContextLost: false }); });
    expect(rows, 'PAUSED over a surface with its own way back (play is the presence)').toEqual({ play: true, victory: false, contextLoss: false });
  });
});
