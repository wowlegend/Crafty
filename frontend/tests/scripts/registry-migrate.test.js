import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fixtureGit } from './_isolatedGit.js';
import { ROOT, REGISTRY } from '../../scripts/ci/registry-harvest.mjs';
import { migrate, readDispositions, dumps, rowHash, PLACEHOLDER } from '../../scripts/ci/registry-migrate.mjs';

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
/** A landing record that says its author read `row` (a lane's edit) and lets the merge stand. */
const read = (row) => ({ id: row.id, action: 'READ', why: 'read', against: rowHash(row) });

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
    const { text, report } = run(current, { landing: [read(rowOf(current, 'QUEUE:Q49'))] });
    expect(report.conflicts).toEqual([]);
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
    const landing = [read(rowOf(current, 'REVIEW:l1:ios-device-run'))];
    const once = run(current, { landing, dispositions: [...DISPOSITIONS.filter((x) => x.id !== d.id), { ...d, noteOps: [...d.noteOps, { op: 'append', text: 'An appended fact.' }] }] });
    expect(once.report.conflicts).toEqual([]);
    const row = rowOf(once.text, 'REVIEW:l1:ios-device-run');
    expect(row.note).toBe('The lane\'s own note. An appended fact.');
    expect(row.evidence).toBe('the lane\'s evidence');
    expect(row.kind).toBe('instrument');
    const twice = run(once.text, { landing, dispositions: [...DISPOSITIONS.filter((x) => x.id !== d.id), { ...d, noteOps: [...d.noteOps, { op: 'append', text: 'An appended fact.' }] }] });
    expect(rowOf(twice.text, 'REVIEW:l1:ios-device-run').note).toBe('The lane\'s own note. An appended fact.');
    expect(twice.text).toBe(once.text);
  });

  it('a row added after the snapshot passes through as it is, unless a landing record gives it its fields', () => {
    const row = { id: 'REVIEW:x:new', key: 'REVIEW:x:new', title: 'a row a lane added', state: 'open', note: 'old words' };
    const added = dumps(row);
    const current = `${SNAPSHOT}${added}\n`;
    const plain = run(current);
    expect(plain.text.split('\n')).toContain(added);
    expect(plain.report.addedAfterBase).toEqual(['REVIEW:x:new']);
    const landing = [{ id: 'REVIEW:x:new', action: 'KEEP', against: rowHash(row), set: { kind: 'debt', lane: 'LANE:backlog' }, unset: [], noteOps: [{ op: 'replace', text: 'new words' }], noteFrom: [] }];
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

describe('registry-migrate never writes over a lane edit it has not read', () => {
  const ADDED_ID = 'REVIEW:x:new';
  const added = (note) => ({ id: ADDED_ID, key: ADDED_ID, title: 'a row a lane added', state: 'open', note });
  const withAdded = (row) => `${SNAPSHOT}${dumps(row)}\n`;
  /** A landing record written against `row`, as a landing author who read it would write it. */
  const record = (row, o = {}) => ({ id: row.id, action: 'KEEP', why: 'read', against: rowHash(row), set: {}, unset: [], noteOps: [], noteFrom: [], ...o });
  const v2 = { kind: 'debt', area: 'harness', severity: 'LOW', playerVisible: false, owner: 'command session', planUnit: 'x', evidence: 'e', opened: DATE, lane: 'LANE:backlog', acceptance: 'a named check that makes it done' };

  it('rowHash is the triage\'s baseHash: every disposition\'s pinned hash is its snapshot row\'s', () => {
    const base = new Map(rows(SNAPSHOT).map((r) => [r.id, r]));
    const pinned = DISPOSITIONS.filter((d) => d.baseHash);
    expect(pinned).toHaveLength(767);
    for (const d of pinned) expect(rowHash(base.get(d.id)), d.id).toBe(d.baseHash);
  });

  it('a landing record applies to the row it was read against; a lane edit after it is a conflict, and the lane\'s text stands', () => {
    const A = added('First seen in run 41000000001.');
    const rec = record(A, { set: v2, noteOps: [{ op: 'replace', text: 'Seen in run 41000000001.' }] });
    const fresh = run(withAdded(A), { landing: [rec] });
    expect(fresh.report.conflicts).toEqual([]);
    expect(rowOf(fresh.text, ADDED_ID).note).toBe('Seen in run 41000000001.');
    const later = added('First seen in run 41000000001. Seen again in run 41000000002.');
    const stale = run(withAdded(later), { landing: [rec] });
    expect(stale.report.conflicts).toEqual([expect.stringMatching(/^REVIEW:x:new: the row changed after its landing record was written/)]);
    expect(rowOf(stale.text, ADDED_ID).note).toContain('41000000002');
  });

  it('a lane edit to a snapshot row is rewritten only when a landing record has read it', () => {
    const current = laneEdit('QUEUE:Q49', (r) => ({ ...r, note: `${r.note ?? ''} Seen again in run 41000000003.`.trim() }));
    const T = rowOf(current, 'QUEUE:Q49');
    expect(run(current).report.conflicts).toEqual([expect.stringMatching(/^QUEUE:Q49: a lane changed note since the snapshot, and no landing record has read it/)]);
    const ok = run(current, { landing: [read(T)] });
    expect(ok.report.conflicts).toEqual([]);
    expect(rowOf(ok.text, 'QUEUE:Q49').note).toContain('41000000003');
    expect(ok.report.laneTouched).toEqual(['QUEUE:Q49: the lane changed note; kept the lane\'s note']);
    // The snapshot's note names three commits, so a shorter note keeps them.
    const shorter = 'The compass and the ocean are done (8ebd6192, a562f25b, 9860eaa9). Seen again in run 41000000003.';
    const shortened = run(current, { landing: [record(T, { noteOps: [{ op: 'replace', text: shorter }] })] });
    expect(shortened.report.conflicts).toEqual([]);
    expect(rowOf(shortened.text, 'QUEUE:Q49').note).toBe(shorter);
    expect(shortened.report.laneTouched).toEqual(['QUEUE:Q49: the lane changed note; kept none of them; the triage or a landing record wrote note']);
  });

  it('a landing record names what it read (against) and a READ record changes nothing', () => {
    const A = added('n');
    const { against: _a, ...blind } = record(A, { set: v2 });
    expect(run(withAdded(A), { landing: [blind] }).report.refused).toEqual([expect.stringContaining('REVIEW:x:new: a landing record needs "against"')]);
    expect(run(withAdded(A), { landing: [{ ...read(A), set: { kind: 'debt' } }] }).report.refused).toEqual([expect.stringContaining('REVIEW:x:new: a READ record changes nothing')]);
    expect(run(SNAPSHOT, { dispositions: [...DISPOSITIONS, read(rowOf(SNAPSHOT, 'QUEUE:Q49'))] }).report.refused).toEqual([expect.stringContaining('QUEUE:Q49: READ is a landing record\'s action')]);
  });

  it('a landing replace keeps every cross-reference of the note it replaces', () => {
    const A = added('Seen in run 41000000001 at abc1234f; see QUEUE:Q49, PR #71 and DECISIONS 2026-10-28 (W1-H) item 9.');
    const drops = record(A, { set: v2, noteOps: [{ op: 'replace', text: 'Seen once; see QUEUE:Q49.' }] });
    expect(run(withAdded(A), { landing: [drops] }).report.conflicts)
      .toEqual([expect.stringMatching(/^REVIEW:x:new: the landing record's replace drops 41000000001, abc1234f, PR #71, DECISIONS 2026-10-28 \(W1-H\) item 9$/)]);
    const keeps = record(A, { set: v2, noteOps: [{ op: 'replace', text: 'Run 41000000001 (abc1234f); QUEUE:Q49; PR #71; DECISIONS 2026-10-28 (W1-H) item 9.' }] });
    expect(run(withAdded(A), { landing: [keeps] }).report.conflicts).toEqual([]);
  });

  it('a sighting a lane added to a row the triage closes as a duplicate moves to the row it duplicates, once', () => {
    const X = 'REVIEW:e2e-flakes:dragon-fight-parried-bite-move';
    const Y = 'REVIEW:e2e-flakes:dragon-fight-parried-bite';
    expect(DISPOSITIONS.find((d) => d.id === X).set.closedBy).toBe(`duplicate:${Y}`);
    const current = laneEdit(X, (r) => ({ ...r, note: `${r.note} Seen again in run 41000000004.` }));
    const landing = [read(rowOf(current, X))];
    const first = run(current, { landing });
    expect(first.report.conflicts).toEqual([]);
    expect(rowOf(first.text, X)).toMatchObject({ state: 'closed', resolution: 'duplicate', closedBy: `duplicate:${Y}` });
    expect(rowOf(first.text, Y).note).toContain(`From ${X}: Seen again in run 41000000004.`);
    expect(first.report.moved).toEqual([`${X}: the lane's added note text moved to ${Y}, which it duplicates`]);
    const second = run(first.text, { landing });
    expect(second.text).toBe(first.text);
    expect(second.report.conflicts).toEqual([]);
  });

  it('a row a lane set in flight stays in flight when the triage closes it, and the report says why', () => {
    const d = DISPOSITIONS.find((x) => x.action === 'CLOSE' && x.set.resolution === 'wont-fix');
    const current = laneEdit(d.id, (r) => ({ ...r, state: 'in-flight' }));
    const { text, report } = run(current, { landing: [read(rowOf(current, d.id))] });
    const row = rowOf(text, d.id);
    expect(row.state).toBe('in-flight');
    expect(row.resolution).toBeUndefined();
    expect(row.closedBy).toBeUndefined();
    expect(report.forReading).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`^${d.id}: the lane set it in flight and the triage closes it wont-fix; kept in flight`))]));
    expect(report.laneTouched).toEqual([`${d.id}: the lane changed state; kept the lane's state`]);
  });

  it('a row a lane took out of flight is closed by the triage, and the report says the closure stands', () => {
    const d = DISPOSITIONS.find((x) => x.action === 'CLOSE' && x.set.resolution === 'wont-fix');
    const inFlight = (text) => text.split('\n').map((l) => (l.includes(`"id": "${d.id}"`) ? dumps({ ...JSON.parse(l), state: 'in-flight' }) : l)).join('\n');
    const baseText = inFlight(SNAPSHOT);
    const current = laneEdit(d.id, (r) => ({ ...r, state: 'open' }));
    const { text, report } = run(current, { baseText, landing: [read(rowOf(current, d.id))] });
    expect(rowOf(text, d.id)).toMatchObject({ state: 'closed', resolution: 'wont-fix' });
    expect(report.forReading).toEqual(expect.arrayContaining([`${d.id}: the lane moved it to open and the triage closes it wont-fix; the triage's closure stands`]));
    expect(report.laneTouched).toEqual([`${d.id}: the lane changed state; kept none of them; the triage or a landing record wrote state`]);
  });

  it('a re-run over a lane-edited result rewrites nothing and lists no lane edit', () => {
    const closer = laneEdit('QUEUE:Q49', (r) => ({ ...r, state: 'closed', resolution: 'done', closedBy: 'abc1234', note: 'Closed by the lane.' }));
    const current = closer.split('\n').map((l) => (l.includes('"id": "REVIEW:l1:ios-device-run"') ? dumps({ ...JSON.parse(l), note: 'The lane\'s own note.' }) : l)).join('\n');
    const landing = [read(rowOf(current, 'QUEUE:Q49')), read(rowOf(current, 'REVIEW:l1:ios-device-run'))];
    const first = run(current, { landing });
    expect(first.report.laneTouched).toHaveLength(2);
    const second = run(first.text, { landing });
    expect(second.text).toBe(first.text);
    expect(second.report).toMatchObject({ migrated: 0, laneTouched: [], laneClosureKept: [], forReading: [], conflicts: [] });
    expect(second.report.alreadyMigrated).toBe(767);
  });

  it('the retired fields leave a row a lane touched, and a closedNote\'s text joins the lane\'s note', () => {
    // STATUS:R2 carries dupOf at the snapshot; ACTIVE_PLAN:T19 (closed there) carries a closedNote.
    expect(rowOf(SNAPSHOT, 'STATUS:R2').dupOf).toBeDefined();
    const closedNote = rowOf(SNAPSHOT, 'ACTIVE_PLAN:T19').closedNote;
    expect(closedNote).toBeTruthy();
    const closer = laneEdit('STATUS:R2', (r) => ({ ...r, state: 'closed', resolution: 'done', closedBy: 'abc1234', lane: 'LANE:backlog', note: 'Closed by the lane.' }));
    const current = closer.split('\n').map((l) => (l.includes('"id": "ACTIVE_PLAN:T19"') ? dumps({ ...JSON.parse(l), note: 'The lane\'s note.' }) : l)).join('\n');
    const landing = [read(rowOf(current, 'STATUS:R2')), read(rowOf(current, 'ACTIVE_PLAN:T19'))];
    // T19's own record appends the closedNote's text; without it, only the merge can carry that text.
    const dispositions = DISPOSITIONS.map((d) => (d.id === 'ACTIVE_PLAN:T19' ? { ...d, noteOps: [] } : d));
    const { text, report } = run(current, { landing, dispositions });
    expect(report.conflicts).toEqual([]);
    const r2 = rowOf(text, 'STATUS:R2');
    expect(r2).toMatchObject({ state: 'closed', resolution: 'done', closedBy: 'abc1234' });
    expect(r2.dupOf).toBeUndefined();
    expect(r2.lane).toBeUndefined();
    const t19 = rowOf(text, 'ACTIVE_PLAN:T19');
    expect(t19.closedNote).toBeUndefined();
    expect(t19.note).toContain('The lane\'s note.');
    expect(t19.note).toContain(closedNote);
  });

  it('a lane closure the same as the triage\'s, placeholder and all, is reported consistent', () => {
    const d = DISPOSITIONS.find((x) => x.action === 'CLOSE' && x.set.closedBy === PLACEHOLDER && x.set.resolution === 'wont-fix');
    const current = laneEdit(d.id, (r) => ({ ...r, state: 'closed', resolution: 'wont-fix', closedBy: REF }));
    const { report } = run(current, { landing: [read(rowOf(current, d.id))] });
    expect(report.laneClosureKept).toEqual([`${d.id}: the lane closed it (wont-fix, ${REF}); consistent with the disposition`]);
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
