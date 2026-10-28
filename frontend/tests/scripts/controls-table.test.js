import { describe, it, expect } from 'vitest';
import { renderBlock, checkBlock, BEGIN, END } from '../../scripts/ci/controls-table.mjs';
import { KEY_MAP, KEY_GROUPS } from '../../src/game/keyMap.js';

// Groups listed in an order different from the rows, so a renderer that walks rows in map order fails.
const MAP = [
  { key: 'Q', label: 'Panel row', group: 'Panels' },
  { key: 'WASD', label: 'Move', group: 'Move' },
  { key: 'LMB', label: 'Hit | mine', group: 'Combat' },
  { key: 'Space', label: 'Jump', group: 'Move' },
  { key: 'G', label: 'Trade <here>', group: 'Panels', panelHide: true },
];
const GROUPS = ['Move', 'Combat', 'Panels'];
const bodyRows = (block) => block.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| |'));

describe('controls-table renderBlock', () => {
  it('renders one row per key, grouped in the declared group order, naming each group once', () => {
    const rows = bodyRows(renderBlock(MAP, GROUPS));
    expect(rows).toHaveLength(MAP.length);
    expect(rows.map((r) => r.split(' | ')[0])).toEqual(['| **Move**', '| ', '| **Combat**', '| **Panels**', '| ']);
    expect(rows[0]).toContain('<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>');
    expect(rows[1]).toContain('<kbd>Space</kbd> | Jump');
    expect(rows[3]).toContain('<kbd>Q</kbd> | Panel row');
  });

  it('keeps rows the in-game panel hides, and escapes pipes and angle brackets', () => {
    const rows = bodyRows(renderBlock(MAP, GROUPS));
    expect(rows[2]).toContain('<kbd>Left click</kbd> | Hit \\| mine |');
    expect(rows[4]).toContain('<kbd>G</kbd> | Trade &lt;here&gt; |');
  });

  it('refuses a row in no known group rather than dropping it', () => {
    expect(() => renderBlock([...MAP, { key: 'K', label: 'Lost', group: 'Nowhere' }], GROUPS)).toThrow(/K/);
  });

  it('renders every row of the real KEY_MAP, including dodge, hold-heavy and the four Aspect keys', () => {
    const block = renderBlock();
    expect(bodyRows(block)).toHaveLength(KEY_MAP.length);
    expect(KEY_MAP.length).toBeGreaterThan(20);
    expect(block).toContain('<kbd>Shift</kbd> | Dodge-roll');
    expect(block).toMatch(/<kbd>Left click<\/kbd> \| Attack \(hold: heavy\)/);
    for (const k of ['R', 'V', 'X', 'Z']) expect(block).toContain(`| <kbd>${k}</kbd> |`);
    expect(KEY_GROUPS.every((g) => block.includes(`**${g}**`))).toBe(true);
  });
});

describe('controls-table checkBlock', () => {
  const fresh = `# Title\n\n${renderBlock(MAP, GROUPS)}\n\nafter\n`;

  it('passes a README carrying the current block', () => {
    expect(checkBlock(fresh, MAP, GROUPS)).toMatchObject({ ok: true, rows: MAP.length });
  });

  it('fails when one label in the block differs from the map', () => {
    const r = checkBlock(fresh.replace('| Jump |', '| Leap |'), MAP, GROUPS);
    expect(r).toMatchObject({ ok: false, reason: 'CONTROLS block is stale' });
  });

  it('fails when the map gains a row the README does not show', () => {
    const r = checkBlock(fresh, [...MAP, { key: 'H', label: 'Help', group: 'Panels' }], GROUPS);
    expect(r.ok).toBe(false);
  });

  it('fails when the block is missing or repeated', () => {
    expect(checkBlock('# no block\n', MAP, GROUPS)).toMatchObject({ ok: false, reason: 'CONTROLS block missing' });
    expect(checkBlock(`${fresh}\n${BEGIN}\n${END}\n`, MAP, GROUPS)).toMatchObject({ ok: false, reason: 'CONTROLS block appears more than once' });
  });
});
