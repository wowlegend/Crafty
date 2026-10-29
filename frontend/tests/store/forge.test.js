// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { buildSaveData } from '../../src/game/saveSchema.js';
import { forgeOffers } from '../../src/game/forge.js';
import { getWeaponBaseDamage } from '../../src/game/equipment.js';
import { solveMeleeDamage } from '../../src/utils/combat.js';
import { RELICS } from '../../src/game/relics.js';
import { VERB_BASE } from '../../src/game/verbMods.js';

// THE FORGE IN THE STORE (DECISIONS 2026-10-29 items 60-62, 66): buyForgeOffer spends through game/forge.js's buy, the
// derived caps follow a new blade as equipItem's do, a tempered relic counts its tier in getVerbMods, the tiers ride
// the save, and an old save's pickaxe is dropped (the hand's one becomes the sword).
//
// WHAT THIS DOES NOT CHECK: the Forge card or the G key (tests/gates/forge-panel-gates.test.jsx), or a purchase in the
// running game (tests/e2e/forge.spec.js).

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(resolve(HERE, '../fixtures/pre-cut-save.json'), 'utf8'));
const S = () => useGameStore.getState();
const onDisk = () => JSON.parse(JSON.stringify(buildSaveData(S(), { position: { x: 0, y: 18, z: 0 } })));
const offer = (line) => forgeOffers({ inventory: S().inventory, coins: S().coins, equipment: S().equipment, relicTiers: S().relicTiers }).find((o) => o.line === line);
// A swing's damage with the crit roll pinned to a miss, so a crit cannot decide a comparison of two blades.
const meleeBase = () => {
  const random = Math.random;
  Math.random = () => 0.999;
  try { return solveMeleeDamage(S().getEffectiveAttributes(), getWeaponBaseDamage(S().equipment.weapon)).damage; } finally { Math.random = random; }
};

beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.setState({ isCaptureMode: false, _sessionWorldId: null });
});

describe('buyForgeOffer', () => {
  it('a fresh profile with the coins reforges its Stone Sword into an Iron Sword in hand, and the swing hits harder', () => {
    useGameStore.setState({ coins: 30, equipment: { ...S().equipment, weapon: 'Stone Sword' } });
    const before = meleeBase();
    const iron = S().inventory.blocks.iron;
    const r = S().buyForgeOffer(offer('weapon'));
    expect(r.ok, `the store refused a payable offer (${JSON.stringify(r.short)})`).toBe(true);
    expect(S().equipment.weapon).toBe('Iron Sword');
    expect(S().coins).toBe(0);
    expect(S().inventory.blocks.iron).toBe(iron - 4);
    expect(meleeBase(), 'the swing did not rise with the new blade').toBeGreaterThan(before);
  });

  it('recomputes the derived caps the blade feeds, as equipping it would', () => {
    useGameStore.setState({ coins: 30 });
    S().buyForgeOffer(offer('weapon'));
    const viaForge = { maxHealth: S().maxHealth, maxMana: S().maxMana };
    useGameStore.setState(useGameStore.getInitialState(), true);
    useGameStore.setState({ inventory: { ...S().inventory, blocks: { ...S().inventory.blocks, 'Iron Sword': 1 } } });
    S().equipItem('weapon', 'Iron Sword');
    expect(viaForge, 'the Forge left max health or mana where the old blade had it').toEqual({ maxHealth: S().maxHealth, maxMana: S().maxMana });
  });

  it('refuses with too little and changes nothing in the store', () => {
    useGameStore.setState({ coins: 29 });
    const before = { inventory: S().inventory, coins: S().coins, equipment: S().equipment, relicTiers: S().relicTiers };
    let writes = 0;
    const unsubscribe = useGameStore.subscribe(() => { writes++; });
    const r = S().buyForgeOffer(offer('weapon'));
    unsubscribe();
    expect(writes, 'a refused purchase wrote the store').toBe(0);
    expect(r.ok).toBe(false);
    expect(r.short).toEqual([{ key: 'coins', need: 30, have: 29 }]);
    expect({ inventory: S().inventory, coins: S().coins, equipment: S().equipment, relicTiers: S().relicTiers }).toEqual(before);
    expect(S().inventory, 'a refusal replaced the inventory object').toBe(before.inventory);
  });

  it('tempers the worn relic: getVerbMods counts its modifier once per tier', () => {
    const fang = RELICS['Ember Fang'].mod;
    useGameStore.setState({ coins: 40, equipment: { ...S().equipment, relic: 'Ember Fang' }, inventory: { ...S().inventory, blocks: { ...S().inventory.blocks, gold: 3 } } });
    expect(S().getVerbMods().roarSec).toBe(VERB_BASE.roarSec + fang.add);
    const r = S().buyForgeOffer(offer('relic'));
    expect(r.ok).toBe(true);
    expect(S().relicTiers).toEqual({ 'Ember Fang': 2 });
    expect(S().getVerbMods().roarSec, 'a tier-II Ember Fang still counted once').toBe(VERB_BASE.roarSec + 2 * fang.add);
    useGameStore.setState({ equipment: { ...S().equipment, relic: 'Lodestone' } });
    expect(S().getVerbMods().roarSec, 'the tier went with the slot, not the relic').toBe(VERB_BASE.roarSec);
    expect(S().getVerbMods().grabThrows).toBe(VERB_BASE.grabThrows + RELICS.Lodestone.mod.add);
  });
});

describe('the save', () => {
  it('relicTiers round-trips through the save and the load', () => {
    useGameStore.setState({ relicTiers: { 'Prism Shard': 3 } });
    const disk = onDisk();
    expect(disk.progression.relicTiers).toEqual({ 'Prism Shard': 3 });
    useGameStore.setState(useGameStore.getInitialState(), true);
    S().loadWorldData(disk);
    expect(S().relicTiers).toEqual({ 'Prism Shard': 3 });
  });

  it('a save from before the Forge loads with no tempered relic, and an unreadable map loads clean', () => {
    useGameStore.setState({ relicTiers: { Lodestone: 2 } });
    S().loadWorldData(structuredClone(FIXTURE));
    expect(S().relicTiers, 'a pre-Forge save kept the session\'s tiers').toEqual({});
    const disk = onDisk();
    disk.progression.relicTiers = { Lodestone: 'x', constructor: 3, 'Ember Fang': 7 };
    S().loadWorldData(disk);
    expect(S().relicTiers).toEqual({ 'Ember Fang': 3 });
  });

  it('the pre-cut fixture keeps its level and its Stone Sword in hand, deals finite damage, and holds no pickaxe', () => {
    expect(FIXTURE.player_data.inventory.tools.pickaxe, 'SETUP: the fixture no longer holds a pickaxe').toBe(1);
    S().loadWorldData(structuredClone(FIXTURE));
    expect(S().level).toBe(5);
    expect(S().equipment.weapon).toBe('Stone Sword');
    expect(Number.isFinite(meleeBase()) && meleeBase() > 0).toBe(true);
    for (const [bag, items] of Object.entries(S().inventory)) expect(items.pickaxe, `a pickaxe is still in ${bag}`).toBeUndefined();
    expect(onDisk().player_data.inventory.tools.pickaxe, 'the dropped pickaxe did not ride the tombstone back').toBe(1);
  });

  it('a pickaxe in hand becomes the sword, so the hand\'s damage rises from 8 to 10 and never falls', () => {
    const save = structuredClone(FIXTURE);
    save.progression.equipment = { ...save.progression.equipment, weapon: 'pickaxe' };
    S().loadWorldData(save);
    expect(S().equipment.weapon).toBe('sword');
    expect(getWeaponBaseDamage(S().equipment.weapon)).toBe(10);
    for (const [bag, items] of Object.entries(S().inventory)) expect(items.pickaxe, `a pickaxe is still in ${bag}`).toBeUndefined();
  });

  it('a chest\'s pickaxe leaves it too', () => {
    const save = structuredClone(FIXTURE);
    save.chests = [['1_2_3', { name: 'Wooden Chest', inventory: { pickaxe: 2, stone: 5 } }]];
    S().loadWorldData(save);
    expect(S().chests.get('1_2_3').inventory).toEqual({ stone: 5 });
  });
});
