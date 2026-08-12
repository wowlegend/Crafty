// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Inventory } from '../../src/ui/GamePanels.jsx';
import { useGameStore, EQUIPMENT_STATS } from '../../src/store/useGameStore.jsx';
import { gearStatRows, STAT_ORDER } from '../../src/game/gearCompare.js';

// THE GEAR INSPECTOR DELETED THE DOWNSIDE OF EVERY SWAP.
//
// It rendered one row per stat the INSPECTED item carries — `stats.armor !== undefined && <row/>`, four
// times over. So a stat the EQUIPPED item has and the inspected one does not was not shown as a minus,
// not shown as a zero: it was absent, with nothing on screen hinting anything had been left out.
//
// Wearing a Golden Crown (intellect 10, armor 5) and hovering an Iron Helmet (armor 6, strength 2), the
// panel said "+6 armor (+1)" and "+2 strength (+2)" and never mentioned the 10 intellect the swap costs.
// The one screen whose whole job is to answer "is this an upgrade?" answered it with the losses removed.
//
// Both halves are gated: the pure comparison over the union of stat keys, and the rendered panel, since
// a correct comparison rendered through a hardcoded row list would still show the player nothing.
beforeEach(() => {
  useGameStore.setState({
    inventory: { blocks: {}, magic: {}, tools: {} },
    equipment: { head: null, chest: null, weapon: null, offhand: null, feet: null },
    attributes: { strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints: 0 },
  });
});
afterEach(cleanup);

describe('gearStatRows — the comparison is over the UNION of both stat sets', () => {
  it('reports a stat the swap would LOSE, which the old row list omitted entirely', () => {
    const rows = gearStatRows(EQUIPMENT_STATS['Iron Helmet'], EQUIPMENT_STATS['Golden Crown']);
    const intellect = rows.find((r) => r.key === 'intellect');
    expect(intellect, 'intellect is missing from the comparison — the loss is invisible again').toBeTruthy();
    expect(intellect.value, 'the Iron Helmet grants no intellect').toBe(0);
    expect(intellect.active, 'the Golden Crown grants 10').toBe(10);
    expect(intellect.diff, 'the panel would not tell the player they lose 10 intellect').toBe(-10);
  });

  it('still reports the gains, so fixing the losses did not cost the other direction', () => {
    const rows = gearStatRows(EQUIPMENT_STATS['Iron Helmet'], EQUIPMENT_STATS['Golden Crown']);
    expect(rows.find((r) => r.key === 'armor').diff).toBe(1);   // 6 vs 5
    expect(rows.find((r) => r.key === 'strength').diff).toBe(2); // 2 vs 0
  });

  it('with an EMPTY slot every stat is a straight gain', () => {
    const rows = gearStatRows(EQUIPMENT_STATS['Golden Crown'], null);
    expect(rows.map((r) => [r.key, r.diff]).sort()).toEqual([['armor', 5], ['intellect', 10]]);
  });

  it('an identical item is all zeroes — not blank, and not a fake upgrade', () => {
    const rows = gearStatRows(EQUIPMENT_STATS['Iron Sword'], EQUIPMENT_STATS['Iron Sword']);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.diff, `${r.key} is not zero against itself`).toBe(0);
  });

  it('keeps a stable order, and does not drop a stat the data adds later', () => {
    // The hardcoded four-row list is precisely why a fifth stat would have been invisible. A new key
    // must still appear, after the known ones rather than in hash order.
    const rows = gearStatRows({ luck: 3, armor: 1 }, { strength: 2 });
    expect(rows.map((r) => r.key)).toEqual(['strength', 'armor', 'luck']);
    expect(STAT_ORDER).toContain('armor');
  });

  it('two items with no overlap at all report BOTH sides', () => {
    const rows = gearStatRows({ agility: 4 }, { armor: 9 });
    expect(rows).toEqual([
      { key: 'agility', value: 4, active: 0, diff: 4 },
      { key: 'armor', value: 0, active: 9, diff: -9 },
    ]);
  });
});

describe('the inspector RENDERS the loss, not just computes it', () => {
  /** Hover an inventory tile to open the inspector on it. */
  const hover = (item) => {
    const tile = document.querySelector(`[title="${item}"]`);
    expect(tile, `no inventory tile for "${item}"`).toBeTruthy();
    fireEvent.mouseEnter(tile);
  };

  it('hovering an Iron Helmet while wearing a Golden Crown shows the intellect loss on screen', () => {
    // The exact case from the finding, driven through the real panel.
    useGameStore.setState({
      inventory: { blocks: { 'Iron Helmet': 1 }, magic: {}, tools: {} },
      equipment: { head: 'Golden Crown', chest: null, weapon: null, offhand: null, feet: null },
    });
    render(<Inventory onClose={() => {}} />);
    hover('Iron Helmet');

    const row = screen.getByTestId('gear-stat-intellect');
    expect(row, 'the intellect row is absent — the player still cannot see what the swap costs').toBeTruthy();
    expect(row.textContent).toContain('-10');
  });

  it('the gain rows are still there alongside it', () => {
    useGameStore.setState({
      inventory: { blocks: { 'Iron Helmet': 1 }, magic: {}, tools: {} },
      equipment: { head: 'Golden Crown', chest: null, weapon: null, offhand: null, feet: null },
    });
    render(<Inventory onClose={() => {}} />);
    hover('Iron Helmet');
    expect(screen.getByTestId('gear-stat-armor').textContent).toContain('+1');
    expect(screen.getByTestId('gear-stat-strength').textContent).toContain('+2');
  });

  it('renders every row the comparison produces — no silent truncation in the JSX', () => {
    // The denominator. The original defect was not in the arithmetic at all; it was that the render
    // showed a subset. Asserting the count is what makes that class visible.
    useGameStore.setState({
      inventory: { blocks: { 'Iron Helmet': 1 }, magic: {}, tools: {} },
      equipment: { head: 'Golden Crown', chest: null, weapon: null, offhand: null, feet: null },
    });
    const { container } = render(<Inventory onClose={() => {}} />);
    hover('Iron Helmet');

    const expected = gearStatRows(EQUIPMENT_STATS['Iron Helmet'], EQUIPMENT_STATS['Golden Crown']);
    const rendered = container.querySelectorAll('[data-testid^="gear-stat-"]');
    expect(rendered.length, 'the panel rendered fewer rows than the comparison produced').toBe(expected.length);
    expect(expected.length, 'the fixture produces no rows, so this assertion is vacuous').toBeGreaterThan(2);
  });

  it('a plain block still gets the non-gear card rather than an empty stat list', () => {
    // The other branch, so "shows rows" cannot be satisfied by showing rows for everything.
    useGameStore.setState({ inventory: { blocks: { stone: 4 }, magic: {}, tools: {} } });
    const { container } = render(<Inventory onClose={() => {}} />);
    hover('stone');
    expect(container.querySelectorAll('[data-testid^="gear-stat-"]').length).toBe(0);
  });
});
