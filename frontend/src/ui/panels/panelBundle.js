// panelBundle.js — the on-demand panels, bundled as ONE lazy chunk (plan 2026-09-23-crafty-lazy-panels).
//
// Only ui/panels/lazyPanels.js imports this file, and only through import(): that is what keeps every panel below
// — and whatever only they use — out of the boot bundle. A second static importer of any of these modules would
// pull it back in (tests/gates/lazy-panels-gates.test.js checks the built bundle for exactly that).
export { Inventory, CraftingTable, BuildingTools, SettingsPanel, MagicSystem } from '../GamePanels';
export { SpellUpgradePanel } from '../SpellUpgradePanel';
export { CreditsScreen } from '../CreditsScreen';
export { WorldManager } from '../../WorldManager';
export { TradingInterface } from '../TradingInterface';
export { QuestLog } from '../QuestLog';
export { ChestInventoryPanel } from '../ChestInventoryPanel';
