// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';
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
// The talk verb (input/talk.js, which G and the touch tray's Talk button both call) is driven against real NPC entities
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
