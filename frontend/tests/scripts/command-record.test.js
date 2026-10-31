import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/ci/registry-harvest.mjs';
import { openWorkRow, waitingRows } from '../../scripts/ci/command-record.mjs';

// Sited in tests/scripts/: the subject is the Command Record's writer and its data file. The two registry readers are
// driven on fixture rows whose answers are known by construction.

const rows = [
  { id: 'LANE:kevin', kind: 'lane', state: 'open', owner: 'command session', severity: 'HIGH', title: 'What only Kevin can do' },
  { id: 'LANE:W3-A', kind: 'lane', state: 'open', owner: 'command session', severity: 'MED', title: 'The First Night' },
  { id: 'a', kind: 'bug', state: 'open', owner: 'command session', severity: 'HIGH', lane: 'LANE:W3-A', title: 'a' },
  { id: 'b', kind: 'feature', state: 'in-flight', owner: 'command session', severity: 'MED', lane: 'LANE:W3-A', title: 'b' },
  { id: 'c', kind: 'instrument', state: 'open', owner: 'Kevin', severity: 'LOW', lane: 'LANE:kevin', title: 'Kevin checks c' },
  { id: 'd', kind: 'decision', state: 'open', owner: 'Kevin', severity: 'HIGH', lane: 'LANE:kevin', title: 'Kevin decides d' },
  { id: 'e', kind: 'process', state: 'open', owner: 'Kevin', severity: 'MED', lane: 'LANE:W3-A', title: 'Kevin does e' },
  { id: 'f', kind: 'instrument', state: 'closed', owner: 'Kevin', severity: 'HIGH', title: 'done already' },
  { id: 'g', kind: 'debt', state: 'closed', owner: 'command session', severity: 'LOW', title: 'closed' },
];

describe('the Command Record reads the registry', () => {
  it('open work counts work rows only (a lane is not work), by severity, in a line of 15 words or fewer', () => {
    const row = openWorkRow(rows);
    expect(row).toEqual({ lead: 'Open work', text: '5 open: 2 high, 2 medium, 1 low; 3 wait on you; 2 closed.' });
    expect(row.text.split(/\s+/).length).toBeLessThanOrEqual(15);
  });

  it('waiting on you lists every open row Kevin owns, highest first, by lane, with the ask its kind makes', () => {
    expect(waitingRows(rows)).toEqual([
      { lane: 'LANE:kevin', rows: [{ what: 'Decide', why: 'Kevin decides d' }, { what: 'Check', why: 'Kevin checks c' }] },
      { lane: 'LANE:W3-A', rows: [{ what: 'Do', why: 'Kevin does e' }] },
    ]);
  });

  it('the data file keeps no hand-written list of what waits on Kevin: the registry is its one home', () => {
    const data = JSON.parse(readFileSync(join(ROOT, 'docs/superpowers/command-record.json'), 'utf8'));
    expect(data.details.waiting.title).toBe('Waiting on you');
    expect(data.details.waiting.rows).toBeUndefined();
  });
});
