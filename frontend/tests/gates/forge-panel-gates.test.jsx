// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen, act } from '@testing-library/react';
import * as THREE from 'three';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { ecs } from '../../src/ecs/world.js';
import { HUB_NPCS, makeNpcEntity } from '../../src/world/npcSpawn.js';
import { talkToNearest, TALK_RANGE } from '../../src/input/talk.js';
import { TRAY_PANELS, activateTrayRow } from '../../src/ui/touchTray.js';
import { getWeaponBaseDamage } from '../../src/game/equipment.js';

// MARA'S FORGE, THROUGH THE CARD AND THE TALK VERB (DECISIONS 2026-10-29 items 60-65). The real ForgePanel against the
// real store: each line shows its price beside what the player holds, a press on Buy spends exactly that and puts the
// new blade in hand with the craft sound, and a press the player cannot pay for says what is short and changes nothing.
// A double press on a line buys one thing: the line's Buy rests, disabled, for the double-click time after a purchase,
// and a bought tier's button leaves the card with its offer. The talk verb (input/talk.js, which G and the touch tray's Talk button both call) is driven against real NPC entities
// in the ECS, as the G handler reads them.
//
// WHAT THIS DOES NOT CHECK: the G keydown or a tap in the running game, the lazy panel chunk, or MenuSystem mounting the
// card (tests/e2e/forge.spec.js walks to Mara, presses G and buys on CI).
//
// Mutation-Proof: see the commit trailer.

const sounds = vi.hoisted(() => ({ playCraft: vi.fn() }));
vi.mock('../../src/SoundManager', () => ({ useGameSounds: () => sounds }));
const { ForgePanel } = await import('../../src/ui/panels/ForgePanel.jsx');

const S = () => useGameStore.getState();
const tid = (id) => screen.getByTestId(id);
const npc = (role, at) => {
  const def = HUB_NPCS.find((n) => n.role === role);
  const e = makeNpcEntity(def, `npc_${role}`, 20);
  e.position.set(at[0], 20, at[1]);
  return ecs.add(e);
};
const clearWorld = () => { for (const e of [...ecs.entities]) ecs.remove(e); };

beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  sounds.playCraft.mockClear();
  clearWorld();
});
afterEach(() => {
  cleanup();
  clearWorld();
  useGameStore.setState(useGameStore.getInitialState(), true);
});

describe('the Forge card', () => {
  it('lists the weapon, relic and goods lines, each price beside what the player holds', () => {
    useGameStore.setState({ coins: 12 });
    render(<ForgePanel onClose={() => {}} />);
    // The id tests/e2e/forge.spec.js waits on after G: the card, by the dialog's own name.
    expect(screen.getByRole('dialog', { name: "Mara's Forge" }).contains(tid('forge-panel')), 'the card is not inside its dialog').toBe(true);
    expect(tid('forge-offer-weapon:Iron Sword').textContent, 'the weapon line does not name the blade it reforges').toContain('Stone Sword');
    expect(tid('forge-price-weapon:Iron Sword-iron').textContent).toBe('4 Iron Ore (have 4)');
    expect(tid('forge-price-weapon:Iron Sword-coins').textContent).toBe('30 coins (have 12)');
    expect(tid('forge-price-weapon:Iron Sword-coins').dataset.short, 'a price the player is short of is not marked').toBe('true');
    expect(tid('forge-price-weapon:Iron Sword-iron').dataset.short).toBe('false');
    expect(tid('forge-relic-none'), 'with no relic worn the relic line says nothing').toBeTruthy();
    for (const id of ['goods:chest', 'goods:cobblestone', 'goods:glass']) expect(tid(`forge-offer-${id}`)).toBeTruthy();
    expect(tid('forge-price-goods:chest-wood').textContent).toBe('8 Oak Wood (have 16)');
    expect(tid('forge-coins').textContent).toBe('12');
  });

  it('a press on Buy with enough spends the shown price, puts the new blade in hand and sounds', () => {
    useGameStore.setState({ coins: 30 });
    render(<ForgePanel onClose={() => {}} />);
    const before = getWeaponBaseDamage(S().equipment.weapon);
    fireEvent.click(tid('forge-buy-weapon:Iron Sword'));
    expect(S().equipment.weapon, 'the purchase left the old blade in hand').toBe('Iron Sword');
    expect(getWeaponBaseDamage(S().equipment.weapon)).toBeGreaterThan(before);
    expect([S().coins, S().inventory.blocks.iron, S().inventory.blocks['Stone Sword']]).toEqual([0, 0, 0]);
    expect(sounds.playCraft, 'the purchase was silent').toHaveBeenCalledTimes(1);
    expect(tid('forge-message').textContent).toBe('Forged: Iron Sword');
    expect(tid('forge-offer-weapon:Diamond Sword'), 'the card did not move on to the next blade').toBeTruthy();
  });

  it('a press on Buy the player cannot pay for says what is short and changes nothing', () => {
    useGameStore.setState({ coins: 5 });
    render(<ForgePanel onClose={() => {}} />);
    const before = { inventory: S().inventory, coins: S().coins, equipment: S().equipment };
    fireEvent.click(tid('forge-buy-weapon:Iron Sword'));
    expect(tid('forge-message').textContent).toBe('Not enough: 30 coins (have 5)');
    expect({ inventory: S().inventory, coins: S().coins, equipment: S().equipment }).toEqual(before);
    expect(sounds.playCraft, 'a refusal played the craft sound').not.toHaveBeenCalled();
  });

  it('a worn relic is offered its next tier, and the tier is bought', () => {
    useGameStore.setState({ coins: 40, equipment: { ...S().equipment, relic: 'Prism Shard' }, inventory: { ...S().inventory, blocks: { ...S().inventory.blocks, gold: 3 } } });
    render(<ForgePanel onClose={() => {}} />);
    fireEvent.click(tid('forge-buy-relic:Prism Shard:2'));
    expect(S().relicTiers).toEqual({ 'Prism Shard': 2 });
    expect(tid('forge-offer-relic:Prism Shard:3')).toBeTruthy();
  });
});

describe('a double press buys one thing', () => {
  // The browser hit-tests each click where the pointer is, so the second click of a double press lands on whatever Buy
  // now stands in the line's place. lineBuy reads that Buy afresh for every click, as the pointer would.
  const lineBuy = (line) => document.querySelector(`[data-testid^="forge-buy-${line}:"]`);
  const wait = (ms) => act(() => { vi.advanceTimersByTime(ms); });
  // The two clicks of a double press fall within the system's double-click time: 500 ms by default on Windows
  // (SetDoubleClickTime, learn.microsoft.com). The card must swallow a second click up to that, and no longer.
  const DOUBLE_CLICK_MS = 500;
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('the weapon line: two clicks with the Diamond Sword affordable buy only the Iron Sword; a click after the window buys it', () => {
    useGameStore.setState({ coins: 110, inventory: { ...S().inventory, blocks: { ...S().inventory.blocks, diamond: 4 } } });
    render(<ForgePanel onClose={() => {}} />);
    const ironBuy = tid('forge-buy-weapon:Iron Sword');
    fireEvent.click(lineBuy('weapon'));
    fireEvent.click(lineBuy('weapon'));
    expect(S().equipment.weapon, 'the second click of a double press bought the next blade').toBe('Iron Sword');
    expect([S().coins, S().inventory.blocks.diamond], 'a double press spent more than the Iron Sword').toEqual([80, 4]);
    expect(lineBuy('weapon').dataset.testid, 'SETUP: the line did not move on to the Diamond Sword').toBe('forge-buy-weapon:Diamond Sword');
    expect(lineBuy('weapon').disabled, 'the line\'s Buy does not show the player it is resting').toBe(true);
    wait(DOUBLE_CLICK_MS - 1);
    fireEvent.click(lineBuy('weapon'));
    expect(S().equipment.weapon, `a click ${DOUBLE_CLICK_MS - 1} ms after a purchase bought again`).toBe('Iron Sword');
    wait(1);
    expect(lineBuy('weapon').disabled, `the line's Buy still rests ${DOUBLE_CLICK_MS} ms after the purchase`).toBe(false);
    // The Iron Sword's own button, as keyboard focus would hold it: it left the card with its offer, so a press on it
    // cannot buy the offer that took its place.
    fireEvent.click(ironBuy);
    expect(S().equipment.weapon, 'the Iron Sword\'s button stayed in the card and bought the Diamond Sword').toBe('Iron Sword');
    fireEvent.click(lineBuy('weapon'));
    expect(S().equipment.weapon, 'a click after the window did not buy the next blade').toBe('Diamond Sword');
    expect([S().coins, S().inventory.blocks.diamond]).toEqual([0, 0]);
  });

  it('the relic line: two clicks with tier III affordable temper to tier II only; a click after the window tempers to III', () => {
    useGameStore.setState({ coins: 140, equipment: { ...S().equipment, relic: 'Prism Shard' },
      inventory: { ...S().inventory, blocks: { ...S().inventory.blocks, gold: 3, diamond: 3 } } });
    render(<ForgePanel onClose={() => {}} />);
    const tierTwo = tid('forge-buy-relic:Prism Shard:2');
    fireEvent.click(lineBuy('relic'));
    fireEvent.click(lineBuy('relic'));
    expect(S().relicTiers, 'the second click of a double press tempered twice').toEqual({ 'Prism Shard': 2 });
    expect([S().coins, S().inventory.blocks.diamond]).toEqual([100, 3]);
    expect(lineBuy('relic').disabled, 'the relic line\'s Buy does not show it is resting').toBe(true);
    wait(DOUBLE_CLICK_MS - 1);
    fireEvent.click(lineBuy('relic'));
    expect(S().relicTiers, `a click ${DOUBLE_CLICK_MS - 1} ms after a temper tempered again`).toEqual({ 'Prism Shard': 2 });
    wait(1);
    fireEvent.click(tierTwo);
    expect(S().relicTiers, 'the tier II button stayed in the card and bought tier III').toEqual({ 'Prism Shard': 2 });
    fireEvent.click(lineBuy('relic'));
    expect(S().relicTiers, 'a click after the window did not temper to tier III').toEqual({ 'Prism Shard': 3 });
  });

  it('a pointer press on Buy does not take focus, so a key meant for the game cannot press it; Tab still reaches it', () => {
    render(<ForgePanel onClose={() => {}} />);
    const chest = tid('forge-buy-goods:chest');
    chest.focus();
    expect(document.activeElement, 'SETUP: a Buy cannot hold focus at all, so the check below would mean nothing').toBe(chest);
    chest.blur();
    // fireEvent returns false when a handler cancelled the event's default action, which for mousedown is the focus.
    expect(fireEvent.mouseDown(chest), 'a pointer press on Buy left the browser free to focus it').toBe(false);
  });
});

describe('the talk verb', () => {
  const at = (x, z) => useGameStore.setState({ gameCamera: { position: new THREE.Vector3(x, 21.6, z) }, openNearbyChest: () => null });

  it('beside Mara opens the Forge and selects her; the touch tray\'s Talk button does the same and yields control', () => {
    npc('smith', [8, -7]);
    npc('healer', [10, 8]);
    at(8 + TALK_RANGE - 0.5, -7);
    expect(talkToNearest(S())).toBe('forge');
    expect(S().showForge).toBe(true);
    expect(S().selectedVillager?.npcName).toBe('Mara the Smith');
    useGameStore.setState({ showForge: false });
    const row = TRAY_PANELS.find((r) => r.talk);
    expect(row?.id, 'the tray has no Talk button').toBe('talk');
    expect(activateTrayRow(row, S()), 'opening the Forge from the tray did not yield control to it').toBe(true);
    expect(S().showForge).toBe(true);
  });

  it('beside the healer heals and opens nothing, so the tray keeps the player in play', () => {
    npc('healer', [10, 8]);
    at(10, 9);
    useGameStore.setState({ playerHealth: 10 });
    expect(activateTrayRow(TRAY_PANELS.find((r) => r.talk), S())).toBe(false);
    expect(S().playerHealth).toBe(S().maxHealth);
    expect(S().showForge).toBe(false);
  });

  it('reads the nearest living villager in range, live from the ECS', () => {
    const mara = npc('smith', [8, -7]);
    at(8 + TALK_RANGE + 0.5, -7);
    expect(talkToNearest(S()), 'a villager past the range was talked to').toBe(null);
    at(8, -7.5);
    mara.health = 0;
    expect(talkToNearest(S()), 'a dead villager was talked to').toBe(null);
    mara.health = 200;
    mara.position.set(8, 20, -100);
    expect(talkToNearest(S()), 'the talk read a stale position, not the entity').toBe(null);
  });
});
