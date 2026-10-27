// lazyPanels.js — the panels, loaded on demand from ONE chunk (plan 2026-09-23-crafty-lazy-panels).
//
// Every on-demand panel (inventory, crafting, magic, building, settings, spell upgrades, chest, trading, quest log,
// credits, world manager) was in the boot bundle, parsed before the first frame and paid for by every player who
// never opens half of them — and the byte budget for that chunk had 0.7 KB left. They now share one import():
// one request, one chunk. prefetchPanels() starts it once the game is idle, so the first panel a player opens is
// normally already there; a panel opened before that renders nothing for the moment the chunk takes (Suspense).
import { lazy, createElement, Component, useRef } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { t } from '../../i18n/i18n.js';

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

/**
 * One panel's failure stays in that panel (QUEUE R9.1). A rejected React.lazy rethrows its error on every render,
 * and the nearest boundary used to be the app-wide one: a panel opened while its chunk failed — offline, or a tab
 * left open across a deploy, whose old hashed chunk now 404s — replaced the whole game with the reload screen. This
 * renders nothing instead, and tells the panel to drop its failed lazy so the next open builds a fresh one.
 *
 * And it GIVES THE GAME BACK (review #8 #1, ultrareview U2, 2026-10-27): rendering null left the panel's open flag set,
 * and the onClose that clears it (and re-enters play) lives in the panel UI that never rendered — the player sat in
 * panel-open mode with nothing on screen, worst on touch. So it calls the panel's own onClose and tells the player.
 * Every error it sees is a LOAD failure: a panel that suspended on mount is re-mounted on the loaded path once the
 * chunk resolves, so a render bug never meets this boundary (pinned in lazy-panels-render-gates).
 */
class PanelBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() {
    this.props.onFail();
    this.props.onChunkFail?.();
    this.props.onClose?.();
  }
  render() { return this.state.failed ? null : this.props.children; }
}

/**
 * The loader and a panel factory over any chunk loader (the tests drive a fake one; the game passes panelBundle).
 *
 * A panel whose chunk has LOADED renders the component directly (QUEUE R9.4): React.lazy suspends on its first
 * render even when its promise has already resolved (its .then marks it a microtask later — React 19.2.8's
 * lazyInitializer), so going through a lazy after the idle prefetch still showed a blank beat on every first open.
 * An instance that opened through the lazy stays on it: switching the element type under an open panel would
 * remount it and drop its state.
 */
export function makeLazyPanels(load, { onChunkFail } = {}) {
  let loaded = null;
  const loadPanels = onceRetrying(() => load().then((m) => { loaded = m; return m; }));
  const lazyPanel = (name) => {
    let Lazy = null;
    const Panel = (props) => {
      const direct = useRef(loaded !== null);
      if (direct.current) return createElement(loaded[name], props);
      if (!Lazy) Lazy = lazy(() => loadPanels().then((m) => ({ default: m[name] })));
      return createElement(PanelBoundary, { onFail: () => { Lazy = null; }, onChunkFail, onClose: props.onClose }, createElement(Lazy, props));
    };
    Panel.displayName = `Panel(${name})`;
    return Panel;
  };
  return { loadPanels, lazyPanel };
}

// The player hears why the panel did not open. Offline, or a tab left open across a deploy (its old hashed chunk now
// 404s on every retry) — the notice names both, since only a reload fixes the second.
const panels = makeLazyPanels(() => import('./panelBundle.js'), {
  onChunkFail: () => useGameStore.getState().addNotification?.(t('notice.panelLoadFailed'), 'warn'),
});

/** The panel chunk, imported once (and again only after a failure). */
export const loadPanels = panels.loadPanels;

/** Start loading the panels without waiting (called on idle after boot). A failure here is silent: loadPanels retries. */
export function prefetchPanels() {
  loadPanels().catch(() => {});
}

const lazyPanel = panels.lazyPanel;
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
