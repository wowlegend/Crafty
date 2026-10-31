import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fixtureGit } from './_isolatedGit.js';
import { ROOT, REGISTRY } from '../../scripts/ci/registry-harvest.mjs';
import { migrate, readDispositions, dumps, PLACEHOLDER } from '../../scripts/ci/registry-migrate.mjs';

// Sited in tests/scripts/: the subject is a tooling script, driven on the real snapshot and its committed dispositions,
// where the right output is known by construction (the triage's reference build wrote it independently, in Python).

const SCRIPT = resolve(__dirname, '../../scripts/ci/registry-migrate.mjs');
const DISPOSITIONS_PATH = join(ROOT, 'docs/superpowers/registry-v2-dispositions.jsonl');
// fixtureGit trims; the file ends with one newline, as every registry write does.
const SNAPSHOT = `${fixtureGit(ROOT, 'show', `a150a93a:${REGISTRY}`)}\n`;
const DISPOSITIONS = readDispositions(readFileSync(DISPOSITIONS_PATH, 'utf8'), DISPOSITIONS_PATH);
// The reference build's output on the snapshot, before the triage item's number was known: 799 lines.
const EMULATED_SHA256 = '412cf8a92c9ca07e7e12df264750fd492e727078ec5bc4606686cd55f5165cd6';
const DATE = '2026-10-31';
const REF = 'DECISIONS 2026-10-31 (registry v2) item 366';

const sha256 = (t) => createHash('sha256').update(t).digest('hex');
const rows = (text) => text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const rowOf = (text, id) => rows(text).find((r) => r.id === id);
/** The snapshot with one row replaced by `fn(row)`, as a lane would have left it. */
const laneEdit = (id, fn) => SNAPSHOT.split('\n').map((l) => (l.includes(`"id": "${id}"`) ? dumps(fn(JSON.parse(l))) : l)).join('\n');
const run = (currentText, extra = {}) => migrate({ baseText: SNAPSHOT, currentText, dispositions: DISPOSITIONS, triageRef: REF, date: DATE, ...extra });

describe('registry-migrate on the snapshot', () => {
  const first = run(SNAPSHOT, { substitute: false });

  it('golden: the snapshot plus the dispositions is the reference build, byte for byte', () => {
    expect(rows(first.text)).toHaveLength(799);
    expect(sha256(first.text)).toBe(EMULATED_SHA256);
  });

  it('idempotent: a second run changes no byte and rewrites no row', () => {
    const second = run(first.text, { substitute: false });
    expect(second.text).toBe(first.text);
    expect(second.report.migrated).toBe(0);
    expect(second.report.alreadyMigrated).toBe(767);
    expect(second.report.laneTouched).toEqual([]);
    expect(second.report.laneClosureKept).toEqual([]);
    expect(second.report.created).toEqual([]);
    expect(second.report.createExists).toHaveLength(32);
  });

  it('never deletes: every snapshot id is still a row, in the same order, and the new rows come after them', () => {
    const before = rows(SNAPSHOT).map((r) => r.id);
    const after = rows(first.text).map((r) => r.id);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.length - before.length).toBe(32);
  });

  it('creates once: the 32 new rows are appended, lanes first, and a re-run appends none of them again', () => {
    const created = first.report.created;
    expect(created).toHaveLength(32);
    expect(created.slice(0, 12).every((id) => id.startsWith('LANE:'))).toBe(true);
    const again = run(first.text, { substitute: false }).text;
    for (const id of created) expect(rows(again).filter((r) => r.id === id), id).toHaveLength(1);
  });

  it('the triage reference replaces every placeholder, and none is left', () => {
    const real = run(SNAPSHOT).text;
    expect(real.includes(PLACEHOLDER)).toBe(false);
    expect(rows(real).filter((r) => r.closedBy === REF)).toHaveLength(57);
    expect(rows(first.text).filter((r) => r.closedBy === PLACEHOLDER)).toHaveLength(57);
  });
});

describe('registry-migrate merges three ways: what a lane changed since the snapshot stands', () => {
  it('lane closure kept: a row a lane closed keeps its closure and note, and takes only kind, area, severity, playerVisible and title', () => {
    // QUEUE:Q49 stays open under the triage; here a lane closed it after the snapshot.
    const current = laneEdit('QUEUE:Q49', (r) => ({ ...r, state: 'closed', resolution: 'done', closedBy: 'abc1234', note: 'Closed by the lane.' }));
    const { text, report } = run(current);
    const row = rowOf(text, 'QUEUE:Q49');
    expect(row).toMatchObject({ state: 'closed', resolution: 'done', closedBy: 'abc1234', note: 'Closed by the lane.', kind: 'debt' });
    expect(row.lane).toBeUndefined();
    expect(row.acceptance).toBeUndefined();
    expect(row.title).toBe(rowOf(run(SNAPSHOT).text, 'QUEUE:Q49').title);
    expect(report.laneClosureKept).toEqual([expect.stringMatching(/^QUEUE:Q49: the lane closed it \(done, abc1234\)/)]);
  });

  it('a lane-edited open row: the lane\'s note stands, the triage\'s replace is dropped and its appends are added once', () => {
    // REVIEW:l1:ios-device-run's disposition replaces its note; a lane edited the note after the snapshot.
    const d = DISPOSITIONS.find((x) => x.id === 'REVIEW:l1:ios-device-run');
    expect(d.noteOps.map((o) => o.op)).toContain('replace');
    const current = laneEdit('REVIEW:l1:ios-device-run', (r) => ({ ...r, note: 'The lane\'s own note.', evidence: 'the lane\'s evidence' }));
    const once = run(current, { dispositions: [...DISPOSITIONS.filter((x) => x.id !== d.id), { ...d, noteOps: [...d.noteOps, { op: 'append', text: 'An appended fact.' }] }] });
    const row = rowOf(once.text, 'REVIEW:l1:ios-device-run');
    expect(row.note).toBe('The lane\'s own note. An appended fact.');
    expect(row.evidence).toBe('the lane\'s evidence');
    expect(row.kind).toBe('instrument');
    const twice = run(once.text, { dispositions: [...DISPOSITIONS.filter((x) => x.id !== d.id), { ...d, noteOps: [...d.noteOps, { op: 'append', text: 'An appended fact.' }] }] });
    expect(rowOf(twice.text, 'REVIEW:l1:ios-device-run').note).toBe('The lane\'s own note. An appended fact.');
    expect(twice.text).toBe(once.text);
  });

  it('a row added after the snapshot passes through as it is, unless a landing record gives it its fields', () => {
    const added = dumps({ id: 'REVIEW:x:new', key: 'REVIEW:x:new', title: 'a row a lane added', state: 'open', note: 'old words' });
    const current = `${SNAPSHOT}${added}\n`;
    const plain = run(current);
    expect(plain.text.split('\n')).toContain(added);
    expect(plain.report.addedAfterBase).toEqual(['REVIEW:x:new']);
    const landing = [{ id: 'REVIEW:x:new', action: 'KEEP', set: { kind: 'debt', lane: 'LANE:backlog' }, unset: [], noteOps: [{ op: 'replace', text: 'new words' }], noteFrom: [] }];
    const finished = rowOf(run(current, { landing }).text, 'REVIEW:x:new');
    expect(finished).toMatchObject({ kind: 'debt', lane: 'LANE:backlog', note: 'new words', updated: DATE });
  });

  it('refuses a disposition whose row the file does not hold, and a base row with no disposition', () => {
    const without = SNAPSHOT.split('\n').filter((l) => !l.includes('"id": "QUEUE:Q49"')).join('\n');
    expect(run(without).report.refused).toEqual([expect.stringContaining('QUEUE:Q49: a disposition names a row the current file does not hold')]);
    expect(run(SNAPSHOT, { dispositions: DISPOSITIONS.filter((d) => d.id !== 'QUEUE:Q49') }).report.refused)
      .toEqual([expect.stringContaining('QUEUE:Q49: a row of the base with no disposition record')]);
  });
});

describe('the CLI', () => {
  it('no --triage-ref refuses with exit 2 and writes nothing', () => {
    const before = readFileSync(join(ROOT, REGISTRY), 'utf8');
    const r = spawnSync('node', [SCRIPT, '--dispositions', DISPOSITIONS_PATH, '--date', DATE, '--write'], { encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(2);
    expect(r.stderr).toMatch(/--triage-ref is required/);
    expect(readFileSync(join(ROOT, REGISTRY), 'utf8')).toBe(before);
  });

  it('a --triage-ref that is not exactly one DECISIONS item refuses with exit 2', () => {
    const r = spawnSync('node', [SCRIPT, '--dispositions', DISPOSITIONS_PATH, '--date', DATE, '--triage-ref', 'DECISIONS 2026-10-28 item 1'], { encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(2);
    expect(r.stderr).toMatch(/does not resolve/);
  });
});
