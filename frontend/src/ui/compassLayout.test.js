import { describe, it, expect } from 'vitest';
import { layoutCompass, wrapAngle, bearingTo, npcShortName, GAP_PX } from './compassLayout.js';

const DEG = Math.PI / 180;
const STRIP = 280;
const VIEW = { heading: 0, fov: Math.PI, stripPx: STRIP };

/** Every pair of shown labels as [left, right] boxes; true when two of them overlap or come within the gap. */
function crowded(out, widths) {
  const shown = out.filter((m) => m.labelVisible).map((m) => [m.labelX - widths[m.id] / 2, m.labelX + widths[m.id] / 2]);
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      const [a, b] = [shown[i], shown[j]];
      if (a[0] < b[1] + GAP_PX && b[0] < a[1] + GAP_PX) return true;
    }
  }
  return false;
}

describe('the compass layout', () => {
  it('two markers 1 degree apart: both pips show, the later kind\'s label yields', () => {
    const out = layoutCompass([
      { id: 'npc:mara', kind: 'npc', bearing: 10 * DEG, labelWidth: 54 },
      { id: 'home', kind: 'home', bearing: 11 * DEG, labelWidth: 62 },
    ], VIEW);
    expect(out.map((m) => m.id), 'priority order: home before an NPC').toEqual(['home', 'npc:mara']);
    expect(out.map((m) => m.labelVisible)).toEqual([true, false]);
    expect(out[1].x - out[0].x, 'each pip keeps its own bearing').toBeCloseTo(-STRIP / 180, 6);
  });

  it('a cluster of five within ten degrees: no two shown labels crowd, and the most important shows', () => {
    const widths = { boss: 60, home: 62, shrine: 70, 'npc:a': 40, 'npc:b': 44 };
    const out = layoutCompass([
      { id: 'npc:a', kind: 'npc', bearing: 2 * DEG, labelWidth: widths['npc:a'] },
      { id: 'shrine', kind: 'shrine', bearing: 4 * DEG, labelWidth: widths.shrine },
      { id: 'npc:b', kind: 'npc', bearing: 6 * DEG, labelWidth: widths['npc:b'] },
      { id: 'home', kind: 'home', bearing: 8 * DEG, labelWidth: widths.home },
      { id: 'boss', kind: 'boss', bearing: 10 * DEG, labelWidth: widths.boss },
    ], VIEW);
    expect(out).toHaveLength(5);
    expect(out.find((m) => m.id === 'boss').labelVisible).toBe(true);
    expect(crowded(out, widths), 'two shown labels overlap').toBe(false);
    expect(out.filter((m) => m.labelVisible).length, 'something must still be labelled').toBeGreaterThan(0);
  });

  it('the same five spread a quarter of the strip apart all keep their labels', () => {
    const out = layoutCompass(['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, kind: 'npc', bearing: (-60 + i * 30) * DEG, labelWidth: 40 })), VIEW);
    expect(out.every((m) => m.labelVisible)).toBe(true);
  });

  it('a marker across the wrap point sits by the centre (bearing 179 at heading -179 is 2 degrees left)', () => {
    const [m] = layoutCompass([{ id: 'home', kind: 'home', bearing: 179 * DEG, labelWidth: 50 }], { ...VIEW, heading: -179 * DEG });
    expect(m.x).toBeCloseTo(STRIP / 2 - (2 / 90) * (STRIP / 2), 6);
    expect(wrapAngle(358 * DEG)).toBeCloseTo(-2 * DEG, 9);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(-Math.PI, 9);
  });

  it('a marker out of view is left out, and a label at the edge is kept on the strip', () => {
    const out = layoutCompass([
      { id: 'behind', kind: 'home', bearing: 135 * DEG, labelWidth: 50 },
      { id: 'edge', kind: 'shrine', bearing: 89 * DEG, labelWidth: 60 },
    ], VIEW);
    expect(out.map((m) => m.id)).toEqual(['edge']);
    expect(out[0].labelX).toBe(STRIP - 30);
    expect(out[0].x).toBeGreaterThan(STRIP - 30);
  });

  it('bearings use the heading convention (north is -Z, east +X), and NPCs are named short', () => {
    expect(bearingTo(0, -10, 0, 0)).toBeCloseTo(0, 9);
    expect(bearingTo(10, 0, 0, 0)).toBeCloseTo(90 * DEG, 9);
    expect(npcShortName('Mara the Smith')).toBe('Mara');
    expect(npcShortName('Old Pike the Warden')).toBe('Old Pike');
    expect(npcShortName('Sister Wren')).toBe('Sister Wren');
  });
});
