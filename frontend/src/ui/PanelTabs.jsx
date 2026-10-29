import React from 'react';
import { useT } from '../i18n/i18n.js';
import { PANEL_GROUPS, openTab } from './panelGroups.js';

// The strip of tabs over Character and Journal (ui/panelGroups.js): each tab is the panel that was there before, so a
// tab press opens that panel's flag and closes the group's others. Above the panels' scrim (z-50), so it stays tappable.
export const PanelTabs = ({ group, flags, onSelect }) => {
  const t = useT();
  const open = openTab(group, flags);
  if (!open) return null;
  return (
    <div data-testid={`panel-tabs-${group}`} role="tablist" className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex gap-1 pointer-events-auto">
      {PANEL_GROUPS[group].map((tab) => {
        const on = tab.id === open;
        return (
          <button key={tab.id} type="button" role="tab" aria-selected={on} data-testid={`panel-tab-${tab.id}`}
            onClick={() => onSelect(tab.flag)}
            className={`font-display px-3 py-1.5 rounded-md border-chrome border-ink text-sm tracking-wide ${on ? 'bg-accent text-text-inverse' : 'bg-panel-raise text-text-muted'}`}>
            {t(tab.labelKey)}
          </button>
        );
      })}
    </div>
  );
};
