// lazyPanels.js — the panels, loaded on demand from ONE chunk (plan 2026-09-23-crafty-lazy-panels).
//
// Every on-demand panel (inventory, crafting, magic, building, settings, spell upgrades, chest, trading, quest log,
// credits, world manager) was in the boot bundle, parsed before the first frame and paid for by every player who
// never opens half of them — and the byte budget for that chunk had 0.7 KB left. They now share one import():
// one request, one chunk. prefetchPanels() starts it once the game is idle, so the first panel a player opens is
// normally already there; a panel opened before that renders nothing for the moment the chunk takes (Suspense).
import { lazy } from 'react';

/**
 * `load`, run at most once while it is pending or has succeeded; a REJECTED load is forgotten, so the next call
 * tries again (offline, a CDN hiccup) instead of every panel failing for the rest of the session.
 */
export function onceRetrying(load) {
  let pending = null;
  return () => {
    if (!pending) {
      pending = load().catch((err) => {
        pending = null;
        throw err;
      });
    }
    return pending;
  };
}

/** The panel chunk, imported once (and again only after a failure). */
export const loadPanels = onceRetrying(() => import('./panelBundle.js'));

/** Start loading the panels without waiting (called on idle after boot). A failure here is silent: loadPanels retries. */
export function prefetchPanels() {
  loadPanels().catch(() => {});
}

const lazyPanel = (name) => lazy(() => loadPanels().then((m) => ({ default: m[name] })));

export const Inventory = lazyPanel('Inventory');
export const CraftingTable = lazyPanel('CraftingTable');
export const BuildingTools = lazyPanel('BuildingTools');
export const SettingsPanel = lazyPanel('SettingsPanel');
export const MagicSystem = lazyPanel('MagicSystem');
export const SpellUpgradePanel = lazyPanel('SpellUpgradePanel');
export const CreditsScreen = lazyPanel('CreditsScreen');
export const WorldManager = lazyPanel('WorldManager');
export const TradingInterface = lazyPanel('TradingInterface');
export const QuestLog = lazyPanel('QuestLog');
export const ChestInventoryPanel = lazyPanel('ChestInventoryPanel');
