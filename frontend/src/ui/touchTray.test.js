import { describe, it, expect } from 'vitest';
import { TRAY_PANELS, togglePanel } from './touchTray';

const fakeStore = () => ({
  showInventory: false, setShowInventory(v) { this.showInventory = typeof v === 'function' ? v(this.showInventory) : v; },
  showCrafting: false, setShowCrafting(v) { this.showCrafting = typeof v === 'function' ? v(this.showCrafting) : v; },
  showBuildingTools: false, setShowBuildingTools(v) { this.showBuildingTools = typeof v === 'function' ? v(this.showBuildingTools) : v; },
  showMagic: false, setShowMagic(v) { this.showMagic = typeof v === 'function' ? v(this.showMagic) : v; },
});

describe('touchTray — the panel-access registry', () => {
  it('registers the 4 core touch-openable panels with complete fields', () => {
    expect(TRAY_PANELS.map(p => p.id)).toEqual(['inventory', 'craft', 'build', 'magic']);
    for (const p of TRAY_PANELS) {
      expect(p.label, `${p.id} label`).toBeTruthy();
      expect(p.icon, `${p.id} icon`).toBeTruthy();
      expect(p.action, `${p.id} action`).toMatch(/^setShow/);
      expect(p.show, `${p.id} show`).toMatch(/^show/);
    }
  });
  it('togglePanel flips the panel via the store setter (open when closed, close when open)', () => {
    const s = fakeStore();
    const inv = TRAY_PANELS.find(p => p.id === 'inventory');
    expect(togglePanel(inv, s)).toBe(true);
    expect(s.showInventory).toBe(true);   // opened
    togglePanel(inv, s);
    expect(s.showInventory).toBe(false);  // closed
  });
  it('togglePanel is null-safe (missing store action -> false, no throw)', () => {
    expect(togglePanel(TRAY_PANELS[0], {})).toBe(false);
    expect(togglePanel(null, fakeStore())).toBe(false);
  });
});
