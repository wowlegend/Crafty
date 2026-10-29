// panelGroups.js — three panels where there were seven (the HUD lane's task script, decision 7). Character (Tab) holds
// the gear, the spells and the talents; Journal (J) the quests and the feats; Build (B) stays one panel. Each tab is
// the panel that was there before, opened through its own flag, so every reader of those flags (the key gate, the
// pause-on-unlock, the resume overlay, the canvas pace: ui/panelState.js) keeps working; a group is open when any of its
// tabs is, and a strip of tabs above it switches between them.

/** Each group's tabs, in strip order. `flag` is the panel flag the tab opens (two are React-local in App). */
export const PANEL_GROUPS = Object.freeze({
  character: Object.freeze([
    { id: 'gear', flag: 'showInventory', labelKey: 'panel.tab.gear' },
    { id: 'spells', flag: 'showMagic', labelKey: 'panel.tab.spells' },
    { id: 'talents', flag: 'showSpellUpgrades', labelKey: 'panel.tab.talents' },
  ]),
  journal: Object.freeze([
    { id: 'quests', flag: 'showQuestLog', labelKey: 'panel.tab.quests' },
    { id: 'feats', flag: 'showAchievements', labelKey: 'panel.tab.feats' },
  ]),
});

/** The panels a key or a tab closes before it opens its own: every grouped tab and the other key-opened panels. */
export const CLOSED_ON_SWITCH = Object.freeze([
  ...Object.values(PANEL_GROUPS).flat().map((t) => t.flag),
  'showBuildingTools', 'showForge', 'showSettings', 'showControls',
]);

/** PURE. The tab of `group` open in `flags` (the store's flags merged with the two React-local ones), else null. */
export function openTab(group, flags) {
  const tab = (PANEL_GROUPS[group] || []).find((t) => flags && flags[t.flag]);
  return tab ? tab.id : null;
}

/**
 * PURE. The flag writes that leave exactly `openFlag` open among the key-opened panels ({ flag: boolean }, every flag
 * in CLOSED_ON_SWITCH). `openFlag` null closes them all.
 */
export function panelWrites(openFlag) {
  const out = {};
  for (const f of CLOSED_ON_SWITCH) out[f] = f === openFlag;
  return out;
}

/**
 * PURE. What the group's key does in `flags`: close the group when one of its tabs is open (null), else open its first
 * tab (that tab's flag).
 */
export function toggleGroupTarget(group, flags) {
  return openTab(group, flags) ? null : PANEL_GROUPS[group][0].flag;
}

/** Apply `writes` through each flag's setter: `local` holds App's two React-local setters, `store` the rest. */
export function applyPanelWrites(writes, store, local = {}) {
  for (const [flag, value] of Object.entries(writes)) {
    const setter = `set${flag[0].toUpperCase()}${flag.slice(1)}`;
    const fn = local[setter] || store?.[setter];
    if (typeof fn === 'function') fn(value);
  }
}
