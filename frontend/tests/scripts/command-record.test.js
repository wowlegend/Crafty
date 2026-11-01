import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/ci/registry-harvest.mjs';
import { NOW, openWorkRow, picNow, waitingRows } from '../../scripts/ci/command-record.mjs';

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

describe('the Working-on-now pictures follow the cell state', () => {
  const draw = (pic, state) => picNow({ alt: 'x', cells: [{ pic, state, tag: state === 'ok' ? 'Done' : 'Now', lines: ['a', 'b'] }] });
  // check() draws <circle class="ok"> and busy() draws <circle class="run">; the tag is a rect, the shrine's glow another class.
  const shows = (svg, marker) => svg.includes(`<circle class="${marker}"`);

  it('draws the markers at all: a tick when done and a spinner under way, on the pictures that carry one', () => {
    for (const pic of ['stall', 'rock']) {
      expect(shows(draw(pic, 'ok'), 'ok'), `${pic} done has no tick`).toBe(true);
      expect(shows(draw(pic, 'run'), 'run'), `${pic} under way has no spinner`).toBe(true);
    }
    expect(shows(draw('shrine', 'ok'), 'ok'), 'shrine done has no tick').toBe(true);
  });

  it('never shows the other state\'s marker, on every picture', () => {
    const pics = Object.keys(NOW);
    expect(pics.length).toBeGreaterThanOrEqual(5);
    for (const pic of pics) {
      expect(shows(draw(pic, 'ok'), 'run'), `${pic} done shows a spinner`).toBe(false);
      expect(shows(draw(pic, 'run'), 'ok'), `${pic} under way shows a tick`).toBe(false);
    }
  });
});

describe('the data file keeps every detail line to 15 words', () => {
  it('counts the lines it checks, and none runs over', () => {
    const d = JSON.parse(readFileSync(join(ROOT, 'docs/superpowers/command-record.json'), 'utf8')).details;
    const lines = [
      ...d.log.rows.flatMap((day) => day.rows), ...d.hunt.groups.flatMap((g) => g.rows), ...d.hunt.lanes.rows,
      ...d.calls.rows, ...d.next.rows, ...d.health.rows,
    ].map((r) => r.text);
    expect(lines.length).toBeGreaterThan(100);
    const over = lines.filter((t) => t.split(/\s+/).length > 15);
    expect(over).toEqual([]);
  });
});
