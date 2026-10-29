import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dedupe } from '../../scripts/ci/registry-dedupe.mjs';
import { ROOT, REGISTRY } from '../../scripts/ci/registry-harvest.mjs';

const row = (id, state, extra = {}) => JSON.stringify({ id, key: id, title: `t ${id}`, state, ...extra });
const file = (...rows) => `${rows.join('\n')}\n`;
const ids = (text) => text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l).id);
const stateOf = (text, id) => text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)).find((r) => r.id === id).state;

describe('registry-dedupe: one row per id, the copy furthest along kept', () => {
  it('an open copy after its closed copy is dropped, and the closed row keeps its place', () => {
    const r = dedupe(file(row('A', 'open'), row('B', 'closed', { closedBy: 'x' }), row('C', 'open'), row('B', 'open')));
    expect(r.conflicts).toEqual([]);
    expect(ids(r.text)).toEqual(['A', 'B', 'C']);
    expect(stateOf(r.text, 'B')).toBe('closed');
    expect(r.collapsed).toEqual([{ id: 'B', kept: 'closed', dropped: 'open' }]);
  });

  it('a closed copy after its open copy replaces it at the open copy\'s place', () => {
    const r = dedupe(file(row('B', 'open'), row('A', 'open'), row('B', 'closed', { closedBy: 'x' })));
    expect(ids(r.text)).toEqual(['B', 'A']);
    expect(stateOf(r.text, 'B')).toBe('closed');
  });

  it('in flight outranks open, and closed outranks in flight', () => {
    expect(stateOf(dedupe(file(row('B', 'open'), row('B', 'in-flight'))).text, 'B')).toBe('in-flight');
    expect(stateOf(dedupe(file(row('B', 'closed', { closedBy: 'x' }), row('B', 'in-flight'))).text, 'B')).toBe('closed');
  });

  it('two identical copies become one', () => {
    const r = dedupe(file(row('B', 'open'), row('B', 'open')));
    expect(ids(r.text)).toEqual(['B']);
  });

  it('two different copies at the same state are refused and the text is left as it was', () => {
    const input = file(row('B', 'open', { note: 'one' }), row('B', 'open', { note: 'two' }));
    const r = dedupe(input);
    expect(r.conflicts).toEqual(['B']);
    expect(r.text).toBe(input);
    expect(r.collapsed).toEqual([]);
  });

  it('a registry with no repeated id comes back byte-identical, the real one included', () => {
    const input = file(row('A', 'open'), row('B', 'closed', { closedBy: 'x' }));
    expect(dedupe(input).text).toBe(input);
    const real = readFileSync(join(ROOT, REGISTRY), 'utf8');
    const r = dedupe(real);
    expect(r.conflicts, 'the real registry has a same-state conflict').toEqual([]);
    expect(r.collapsed, 'the real registry has a repeated id').toEqual([]);
    expect(r.text).toBe(real);
  });
});
