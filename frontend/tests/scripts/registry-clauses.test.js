import { describe, it, expect } from 'vitest';
import { parseRegistry, checkReferences, TITLE_MAX, NOTE_MAX, ACCEPTANCE_MIN, ACCEPTANCE_MAX } from '../../scripts/ci/registry-harvest.mjs';
import { changeFindings, missingIds } from '../../scripts/ci/registry-append-only.mjs';

// Sited in tests/scripts/: the subject is the registry gate's two scripts, driven on fixture registries where the
// answer is known by construction. One case per clause of S0-S11 and R1-R4, each asserting that clause's own message
// and nothing else, so deleting or weakening one clause turns its case red even where a sibling clause would also fire.

const DAY = '2026-10-31';
/** An open lane, and an open row it owns that passes every rule. */
const lane = (o = {}) => ({
  id: 'L', key: 'L', planUnit: 'p', title: 'a lane', kind: 'lane', area: 'harness', severity: 'LOW', playerVisible: false,
  owner: 'command session', state: 'open', acceptance: 'every row it owns has closed', evidence: 'e', opened: '2026-10-30', updated: DAY, ...o,
});
const row = (o = {}) => ({
  id: 'K', key: 'K', planUnit: 'p', title: 't', kind: 'debt', area: 'harness', severity: 'LOW', playerVisible: false,
  owner: 'command session', state: 'open', lane: 'L', acceptance: 'a named check that makes it done', evidence: 'e',
  opened: '2026-10-30', updated: DAY, ...o,
});
/** A row closed done on a commit, with no lane or acceptance. */
const closed = (o = {}) => {
  const { lane: _l, acceptance: _a, ...r } = row({ state: 'closed', resolution: 'done', closedBy: 'abc1234' });
  return { ...r, ...o };
};
const kevin = { owner: 'Kevin' };
const DECISIONS = ['## 2026-10-30 (T) — a', '1. Kevin ran it on his iPad.', '2. The session decided it.', '3. Another.',
  '## 2026-10-30 (U) — b', '1. A second item 1 on the same date.',
  '## 2026-10-29 (R) — c', ...Array.from({ length: 60 }, (_, i) => `${i + 1}. item ${i + 1}`)].join('\n');
const REFS = { isAncestor: (sha) => ['abc1234', 'def5678'].includes(sha), decisionsText: DECISIONS, headDate: DAY };

/** Every finding of both tree checks on `rows` (objects, or raw lines as strings), as "<rule> <text>". */
function findings(rows, refs = REFS) {
  const text = rows.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n');
  const p = parseRegistry(text);
  return [...p.findings, ...checkReferences(p.rows, refs).findings].map((f) => `${f.rule} ${f.text}`);
}
const one = (rule, re) => [expect.stringMatching(new RegExp(`^${rule} .*${re.source}`))];

describe('every clause of S0-S11 fires on a fixture built for it alone', () => {
  it('the fixtures pass: an open row, a closed one of each form, and every value at its bound', () => {
    expect(findings([lane(), row()])).toEqual([]);
    expect(findings([lane(), row({ acceptance: 'x'.repeat(ACCEPTANCE_MIN) }), row({ id: 'K/a', acceptance: 'y'.repeat(ACCEPTANCE_MAX) })])).toEqual([]);
    expect(findings([lane(), row({ title: 'x'.repeat(TITLE_MAX), note: 'n'.repeat(NOTE_MAX) })])).toEqual([]);
    expect(findings([lane(), row({ id: 'K/sun-glow-fog' }), row({ id: 'K/b2' })])).toEqual([]);
    expect(findings([lane(), row({ id: 'K2', key: 'K2' }), row({ blockedBy: ['K2'] }), closed({ id: 'K3', key: 'K3' }), row({ id: 'K4', key: 'K4', reopens: 'K3' })])).toEqual([]);
  });

  const forms = [
    ['done', 'abc1234, def5678'], ['done', 'DECISIONS 2026-10-30 (T) item 2'], ['done', 'PR #12'],
    ['duplicate', 'duplicate:K2'], ['superseded', 'superseded:K2,K3'], ['superseded', 'DECISIONS 2026-10-30 (T) item 2'],
    ['superseded', 'abc1234'], ['obsolete', 'abc1234'], ['obsolete', 'DECISIONS 2026-10-30 (T) item 3'],
    ['wont-fix', 'DECISIONS 2026-10-30 (T) item 2'], ['wont-fix', 'PR #12'], ['false-positive', 'DECISIONS 2026-10-30 (T) item 2'],
  ];
  const reasons = { 'wont-fix': `Won't fix: ${'r'.repeat(40)}`, 'false-positive': 'False positive: `grep -c x y` prints 0.', obsolete: 'Obsolete: `grep -rn x src` finds nothing.' };
  it.each(forms)('a %s closure on "%s" passes', (resolution, closedBy) => {
    const others = [lane(), row({ id: 'K2', key: 'K2' }), row({ id: 'K3', key: 'K3' })];
    expect(findings([...others, closed({ resolution, closedBy, note: reasons[resolution] })])).toEqual([]);
  });

  const cases = [
    ['S0', 'a field outside the set', [lane(), row({ priority: 'P1' })], /unknown field\(s\) priority/],
    ['S1', 'a line that is not JSON', [lane(), row(), 'not json'], /not a JSON object$/],
    ['S1', 'a line that is not an object with a string id', [lane(), row(), '{"id": 5}'], /not a JSON object with a string id/],
    ['S1', 'a repeated id', [lane(), row(), row()], /id "K" repeats line 2/],
    ...['key', 'planUnit', 'title', 'kind', 'severity', 'playerVisible', 'owner', 'state', 'evidence', 'opened', 'updated']
      .map((f) => ['S2', `a missing ${f}`, [lane(), row({ [f]: undefined })], new RegExp(`missing ${f}$`)]),
    ['S2', 'an empty required field', [lane(), row({ evidence: '' })], /missing evidence/],
    ...[['kind', 'thing'], ['area', 'garden'], ['severity', 'P1'], ['owner', 'someone'], ['state', 'done']]
      .map(([f, v]) => ['S2', `a ${f} outside its values`, [lane(), row({ [f]: v })], new RegExp(`${f} "${v}" is not one of`)]),
    ['S2', 'playerVisible that is not a boolean', [lane(), row({ playerVisible: 'yes' })], /playerVisible must be true or false/],
    ['S2', 'an opened that is not a date', [lane(), row({ opened: '10-30' })], /opened "10-30" is not a YYYY-MM-DD date/],
    ['S2', 'an updated that is not a date', [lane(), row({ updated: '31 Oct' })], /updated "31 Oct" is not a YYYY-MM-DD date/],
    ['S2', 'blockedBy as a string', [lane(), row({ id: 'K2', key: 'K2' }), row({ blockedBy: 'K2' })], /blockedBy must be a list of row ids/],
    ['S2', 'blockedBy as an empty list', [lane(), row({ blockedBy: [] })], /blockedBy must be a list of row ids/],
    ['S2', 'reopens that is not one id', [lane(), closed({ id: 'K2', key: 'K2' }), row({ reopens: ['K2'] })], /reopens must be one row id/],
    ['S2', 'an id that is not its key', [lane(), row({ id: 'KX' })], /id is neither its key "K"/],
    ['S2', 'a part that is not a slug', [lane(), row({ id: 'K/B' })], /id is neither its key "K"/],
    ['S2', 'a part joined to its key by a dash, not a slash', [lane(), row({ id: 'K-b' })], /id is neither its key "K"/],
    ['S3', 'a lane row with a lane', [lane({ lane: 'L' }), row()], /a lane row carries no lane of its own/],
    ['S3', 'an open row with no area', [lane(), row({ area: undefined })], /an open row needs an area/],
    ['S3', 'an acceptance one short of its floor', [lane(), row({ acceptance: 'x'.repeat(ACCEPTANCE_MIN - 1) })], new RegExp(`acceptance must be one line .*it is ${ACCEPTANCE_MIN - 1} characters\\)`)],
    ['S3', 'an acceptance one over its cap', [lane(), row({ acceptance: 'x'.repeat(ACCEPTANCE_MAX + 1) })], new RegExp(`acceptance must be one line .*it is ${ACCEPTANCE_MAX + 1} characters\\)`)],
    ['S3', 'an acceptance that is the title', [lane(), row({ title: 'the same words, twenty and more', acceptance: 'the same words, twenty and more' })], /acceptance must be one line .*, the title\)/],
    ['S3', 'no acceptance', [lane(), row({ acceptance: undefined })], /acceptance must be one line .*it is missing\)/],
    ['S3', 'an open row with a resolution', [lane(), row({ resolution: 'done' })], /an open row carries a closure/],
    ['S3', 'an open row with a closedBy', [lane(), row({ closedBy: 'abc1234' })], /an open row carries a closure/],
    ['S4', 'a lane that is not a row', [lane(), row({ lane: 'NOPE' })], /lane "NOPE" is not a row/],
    ['S4', 'a lane that is a debt row', [lane(), row({ id: 'K2', key: 'K2' }), row({ lane: 'K2' })], /lane "K2" is a debt row, not a lane/],
    ['S4', 'a closed lane with an open row', [closed({ id: 'L', key: 'L', kind: 'lane' }), row()], /lane "L" is closed/],
    ['S4', 'an in-flight row in an open lane', [lane(), row({ state: 'in-flight' })], /an in-flight row's lane must be in flight; "L" is open/],
    ['S5', 'a closure with a resolution outside the set', [lane(), closed({ resolution: 'decided' })], /closed with resolution "decided"/],
    ['S5', 'a closure with no resolution', [lane(), closed({ resolution: undefined })], /closed with resolution \(none\)/],
    ['S5', 'a closure with no closedBy', [lane(), closed({ closedBy: undefined })], /closed done with no closedBy/],
    ...[['done', 'superseded:L'], ['done', 'abc123'], ['done', 'PR 12'], ['duplicate', 'abc1234'], ['duplicate', 'duplicate:L,L'],
      ['superseded', 'PR #12'], ['obsolete', 'PR #12'], ['wont-fix', 'abc1234'], ['false-positive', 'abc1234'], ['false-positive', 'PR #12']]
      .map(([res, by]) => ['S5', `a ${res} closure on "${by}"`, [lane(), closed({ resolution: res, closedBy: by, note: reasons[res] })], new RegExp(`closedBy "${by}" is not a form a ${res} closure takes`)]),
    ['S5', 'a wont-fix reason one short of 40 characters', [lane(), closed({ resolution: 'wont-fix', closedBy: 'PR #12', note: `Won't fix: ${'r'.repeat(39)}` })], /a wont-fix closure needs the sentence/],
    ['S5', 'a false-positive with no command', [lane(), closed({ resolution: 'false-positive', closedBy: 'DECISIONS 2026-10-30 (T) item 2', note: 'False positive: it was never so.' })], /a false-positive closure needs/],
    ['S5', 'a false-positive with a command and no sentence', [lane(), closed({ resolution: 'false-positive', closedBy: 'DECISIONS 2026-10-30 (T) item 2', note: 'It was never so: `grep -c x y`.' })], /a false-positive closure needs/],
    ['S5', 'an obsolete closure on an item with no sentence', [lane(), closed({ resolution: 'obsolete', closedBy: 'DECISIONS 2026-10-30 (T) item 3', note: 'gone' })], /an obsolete closure on a decision needs/],
    ['S6', 'a closing sha that is not an ancestor', [lane(), closed({ closedBy: 'abc1234, dead567' })], /closedBy dead567 is not an ancestor of HEAD$/],
    ['S7', 'an item that does not exist', [lane(), closed({ resolution: 'superseded', closedBy: 'DECISIONS 2026-10-30 (T) item 9' })], /does not resolve to exactly one item: item 9 is in 0 place/],
    ['S7', 'an item in two entries of its date, named without a tag', [lane(), closed({ resolution: 'superseded', closedBy: 'DECISIONS 2026-10-30 item 1' })], /item 1 is in 2 place\(s\)/],
    ['S7', 'a range that runs backwards', [lane(), closed({ resolution: 'superseded', closedBy: 'DECISIONS 2026-10-30 (T) items 3-2' })], /"3-2" is not a range of items/],
    ['S7', 'a range of more than 50 items', [lane(), closed({ resolution: 'superseded', closedBy: 'DECISIONS 2026-10-29 (R) items 1-60' })], /"1-60" is not a range of items/],
    ['S8', 'a duplicate of no row', [lane(), closed({ resolution: 'duplicate', closedBy: 'duplicate:NOPE' })], /duplicate:NOPE names no row/],
    ['S8', 'a supersession by no row', [lane(), row({ id: 'K2', key: 'K2' }), closed({ resolution: 'superseded', closedBy: 'superseded:K2,NOPE' })], /superseded:NOPE names no row/],
    ['S8', 'a duplicate of itself', [lane(), closed({ resolution: 'duplicate', closedBy: 'duplicate:K' })], /duplicate: points at the row itself/],
    ['S8', 'a duplicate of a duplicate', [lane(), row({ id: 'K3', key: 'K3' }), closed({ id: 'K2', key: 'K2', resolution: 'duplicate', closedBy: 'duplicate:K3' }), closed({ resolution: 'duplicate', closedBy: 'duplicate:K2' })], /duplicate:K2 is itself closed as a duplicate/],
    ['S8', 'a blockedBy that names no row', [lane(), row({ blockedBy: ['NOPE'] })], /blockedBy NOPE names no row/],
    ['S8', 'a blockedBy that names the row itself', [lane(), row({ blockedBy: ['K'] })], /blockedBy names the row itself/],
    ['S8', 'a reopens that names no row', [lane(), row({ reopens: 'NOPE' })], /reopens NOPE names no row/],
    ['S8', 'a reopens of an open row', [lane(), row({ id: 'K2', key: 'K2' }), row({ reopens: 'K2' })], /reopens K2, which is not closed/],
    ['S9', 'a bug no player sees', [lane(), row({ kind: 'bug', playerVisible: false })], /a bug is something a player sees/],
    ['S9', 'a decision closed done on a commit', [lane(), closed({ kind: 'decision' })], /a decision closes done only on a DECISIONS item/],
    ['S9', 'a Kevin row closed wont-fix', [lane(), closed({ ...kevin, resolution: 'wont-fix', closedBy: 'DECISIONS 2026-10-30 (T) item 1', note: reasons['wont-fix'] })], /a Kevin row closes only as a duplicate of another Kevin row/],
    ['S9', 'a Kevin row closed done on a commit', [lane(), closed(kevin)], /a Kevin row closes done only on a DECISIONS item that records him, never on inference/],
    ['S9', 'a Kevin row superseded by a row', [lane(), row({ id: 'K2', key: 'K2', ...kevin }), closed({ ...kevin, resolution: 'superseded', closedBy: 'superseded:K2' })], /a Kevin row closes superseded only on a DECISIONS item that records him/],
    ['S9', 'a Kevin row that duplicates a row that is not his', [lane(), row({ id: 'K2', key: 'K2' }), closed({ ...kevin, resolution: 'duplicate', closedBy: 'duplicate:K2' })], /a Kevin row closes as a duplicate only of another Kevin row; K2 is owned by command session/],
    ['S9', 'a Kevin row done on an item that does not name him', [lane(), closed({ ...kevin, closedBy: 'DECISIONS 2026-10-30 (T) item 2' })], /a Kevin row closes done only on an item that records him; "DECISIONS 2026-10-30 \(T\) item 2" does not name Kevin/],
    ['S9', 'a Kevin row superseded on an item that does not name him', [lane(), closed({ ...kevin, resolution: 'superseded', closedBy: 'DECISIONS 2026-10-30 (T) item 2' })], /a Kevin row closes superseded only on an item that records him/],
    ['S10', 'an unrated row outside triage', [lane(), row({ severity: 'unrated' })], /severity unrated outside LANE:triage/],
    ['S10', 'an unrated closed row', [lane(), closed({ severity: 'unrated' })], /severity unrated outside LANE:triage/],
    ['S10', 'a triage row on its eighth day', [lane({ id: 'LANE:triage', key: 'LANE:triage' }), row({ lane: 'LANE:triage', opened: '2026-10-23' })], /in LANE:triage since 2026-10-23, 8 days before HEAD's 2026-10-31/],
    ['S10', 'an in-flight triage row on its eighth day', [lane({ id: 'LANE:triage', key: 'LANE:triage', state: 'in-flight' }), row({ state: 'in-flight', lane: 'LANE:triage', opened: '2026-10-23' })], /in LANE:triage since 2026-10-23, 8 days/],
    ['S11', 'a title one over its cap', [lane(), row({ title: 'x'.repeat(TITLE_MAX + 1) })], new RegExp(`title is ${TITLE_MAX + 1} characters, over ${TITLE_MAX}`)],
    ['S11', 'a note one over its cap', [lane(), row({ note: 'n'.repeat(NOTE_MAX + 1) })], new RegExp(`note is ${NOTE_MAX + 1} characters, over ${NOTE_MAX}`)],
  ];
  it.each(cases)('%s: %s', (rule, _what, rows, re) => {
    expect(findings(rows)).toEqual(one(rule, re));
  });

  it('S2 and S8 together: a blockedBy holding an empty id is malformed and names no row', () => {
    expect(findings([lane(), row({ blockedBy: [''] })])).toEqual([
      expect.stringMatching(/^S2 blockedBy must be a list of row ids/), expect.stringMatching(/^S8 blockedBy {2}names no row/),
    ]);
  });

  it('S3 and S4 together: an open row with no lane is both a missing field and an orphan', () => {
    expect(findings([lane(), row({ lane: undefined })])).toEqual([
      expect.stringMatching(/^S3 an open row needs a lane/), expect.stringMatching(/^S4 an orphan: it names no lane/),
    ]);
  });

  it('the clocks and lists that pass at their bounds: a triage row on day 7, unrated in triage, a Kevin item that names him', () => {
    const triage = lane({ id: 'LANE:triage', key: 'LANE:triage' });
    expect(findings([triage, row({ lane: 'LANE:triage', opened: '2026-10-24', severity: 'unrated' })])).toEqual([]);
    expect(findings([lane(), closed({ ...kevin, closedBy: 'DECISIONS 2026-10-30 (T) item 1' })])).toEqual([]);
    expect(findings([lane(), row({ id: 'K2', key: 'K2', ...kevin }), closed({ ...kevin, resolution: 'duplicate', closedBy: 'duplicate:K2' })])).toEqual([]);
    expect(findings([lane({ state: 'in-flight' }), row({ state: 'in-flight' })])).toEqual([]);
    expect(findings([lane(), closed({ kind: 'decision', closedBy: 'DECISIONS 2026-10-30 (T) item 2' }), closed({ id: 'K/a', kind: 'decision', resolution: 'superseded', closedBy: 'abc1234' })])).toEqual([]);
    expect(findings([lane(), closed({ resolution: 'superseded', closedBy: 'DECISIONS 2026-10-29 (R) items 1-50' })])).toEqual([]);
    // The "Obsolete: " sentence is owed only by a closure on an item; the commit that removed the subject is its proof.
    expect(findings([lane(), closed({ resolution: 'obsolete', closedBy: 'abc1234', note: 'gone' })])).toEqual([]);
  });
});

describe('every clause of R1-R4 fires on a change built for it alone', () => {
  const v2 = (o = {}) => ({ id: 'K', key: 'K', title: 'a title', kind: 'debt', state: 'open', note: 'n', updated: '2026-10-20', ...o });
  const text = (...rows) => rows.map((r) => JSON.stringify(r)).join('\n');
  const rules = (base, head, headDate = DAY) => changeFindings(text(base), text(head), { headDate }).map((f) => `${f.rule} ${f.text}`);
  const shut = v2({ state: 'closed', resolution: 'done', closedBy: 'abc1234', severity: 'LOW', owner: 'command session', area: 'harness' });

  it('R1: a row at the base that the head lacks', () => {
    expect(missingIds(text(v2(), v2({ id: 'K2' })), text(v2())).missing).toEqual([{ id: 'K2', title: 'a title' }]);
    expect(missingIds(text(v2()), text(v2({ note: 'changed' }))).missing).toEqual([]);
  });

  it('R2: a row closed at the base and open at the head, reported once', () => {
    expect(rules(shut, { ...shut, state: 'open', updated: DAY })).toEqual([expect.stringMatching(/^R2 closed at the base and open at the head/)]);
  });

  it('R3: a changed row with no date, a date moved back, or a date two days behind the head', () => {
    expect(rules(v2(), v2({ note: 'more', updated: undefined }))).toEqual([expect.stringMatching(/^R3 its content changed and it has no YYYY-MM-DD updated/)]);
    expect(rules(v2(), v2({ note: 'more', updated: '2026-10-19' }))).toEqual([expect.stringMatching(/^R3 its content changed and updated moved backwards/)]);
    expect(rules(v2({ updated: '2026-10-29' }), v2({ note: 'more', updated: '2026-10-29' }))).toEqual([expect.stringMatching(/^R3 its content changed and updated stayed 2026-10-29/)]);
    expect(rules(v2({ updated: '2026-10-30' }), v2({ note: 'more', updated: '2026-10-30' }))).toEqual([]);
  });

  it('R4: a v2 closed row changes its closure, note, kind, area, lane and acceptance freely, and anything else is refused', () => {
    const free = { ...shut, resolution: 'superseded', closedBy: 'superseded:X', note: 'more', kind: 'flake', area: 'docs', lane: 'L', acceptance: 'a named check', updated: DAY };
    expect(rules(shut, free)).toEqual([]);
    // A row closed before v2 (no kind at the base) is exempt, so the migration could retitle it once (item 365.1).
    const { kind: _k, ...v1shut } = shut;
    expect(rules(v1shut, { ...v1shut, kind: 'debt', title: 'a short title', updated: DAY })).toEqual([]);
    for (const [k, v] of [['title', 'a new title'], ['severity', 'MED'], ['owner', 'Kevin'], ['evidence', 'elsewhere'], ['planUnit', 'q'], ['playerVisible', true]]) {
      expect(rules(shut, { ...shut, [k]: v, updated: DAY }), k).toEqual([expect.stringMatching(new RegExp(`^R4 closed at the base, and changed ${k};`))]);
    }
  });
});
