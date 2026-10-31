#!/usr/bin/env node
/**
 * REGISTRY MIGRATE — apply the registry v2 dispositions to whatever `memory/registry.jsonl` holds now.
 *
 * The triage disposed of every row of the registry as it stood at a snapshot commit (`--base`). Lanes kept editing rows
 * after that, so this merges three ways, keyed by id, in the current file's order:
 *   B  the row at the base commit          T  the row in the current file          O  B with its disposition applied
 * A field the lane changed since the base (T differs from B) keeps the lane's value; every other field takes O's. A row
 * the lane closed keeps the lane's closure, and takes from O only kind, area, severity, playerVisible and title, each
 * only where the lane did not change it. A lane-changed note keeps the lane's text and gains only O's appends. A row
 * the lane set in flight stays in flight where O would close it. Text a lane added to the note of a row O closes as a
 * duplicate is also appended to the row it duplicates, as "From <id>: ...". Rows added after the base pass through byte
 * for byte unless a landing record names them. New rows are appended. It never deletes a line, and a second run
 * changes no byte: a row whose output is what the file holds is left as it is, and an append is never made twice.
 *
 * NOTHING A LANE WROTE IS WRITTEN OVER UNREAD. Every landing record carries `against`, the rowHash of the row as its
 * author read it. A row the run would rewrite that a lane changed since the base, or added, needs a landing record (a
 * READ when the merge may stand as it is), and a record whose row has changed since is not applied: both are
 * conflicts, and so is a landing replace that drops a cross-reference (a row id, sha, run id, PR or DECISIONS item)
 * of the note it replaces. A composed note over the cap, a new row whose id exists with other content, a placeholder
 * left in a closedBy, or any v2 gate finding on the result also fails the run. Every row a lane touched is listed
 * with the fields the run kept from the lane, and every field both sides changed is listed for reading.
 *
 *   node scripts/ci/registry-migrate.mjs --dispositions <path> [--landing <path>] \
 *        --triage-ref "DECISIONS 2026-10-31 (registry v2) item N" --date YYYY-MM-DD \
 *        [--base a150a93a] [--check | --write] [--allow-open-pr <n>]...
 *
 *   --dispositions   the triage's JSONL of disposition records (docs/superpowers/registry-v2-dispositions.jsonl)
 *   --landing        records applied on top of the merge, each read against the current row: v2 fields for rows added
 *                    after the base, the hand fix of a cap that a lane's own edit broke, and a READ for every other row
 *                    a lane changed (docs/superpowers/registry-v2-landing.jsonl)
 *   --triage-ref     the DECISIONS item that replaces every "@TRIAGE@" closedBy; without it the run refuses (exit 2)
 *   --date           the `updated` (and a new row's `opened`) written on every row whose bytes change
 *   --check          print the report and run the gate on the result; write nothing (the default)
 *   --write          write the registry, run the gate on it, and restore the old bytes if the gate fails
 *   --allow-open-pr  an open PR whose registry edits the operator has read; any other open PR that edits the registry
 *                    refuses the run, because its rows would come out of the next union merge twice
 * Exit: 0 clean · 1 a conflict or a gate finding · 2 refused (usage, a precondition, a disposition with no row).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, REGISTRY, DECISIONS, V2_FIELDS, NOTE_MAX, CLOSED_BY, parseRegistry, checkReferences, liveReferences,
  decisionsIndex, resolveDecision, countByRule, deepEqual,
} from './registry-harvest.mjs';

export const PLACEHOLDER = '@TRIAGE@';
const RETIRED = Object.freeze(['dupOf', 'closedNote']);
/** What a row the lane closed still takes from the disposition, where the lane left the field alone. */
const AFTER_LANE_CLOSURE = Object.freeze(['kind', 'area', 'severity', 'playerVisible', 'title']);

/** Python's json.dumps(..., ensure_ascii=False) with its default separators: the file's existing style. */
export function dumps(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `[${v.map(dumps).join(', ')}]`;
  if (typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${dumps(x)}`).join(', ')}}`;
  return JSON.stringify(v);
}

/** A JSON value with every object's keys sorted, as Python's sort_keys writes them. */
const sortedKeys = (v) => {
  if (Array.isArray(v)) return v.map(sortedKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortedKeys(v[k])]));
  return v;
};

/**
 * PURE. A row's hash: sha256 of its JSON with sorted keys in Python's default separators, 16 hex digits. It is the
 * dispositions' `baseHash` (the triage pinned each base row with it) and a landing record's `against`: the row as the
 * record's author read it, so a lane edit made after the record was written is seen, never written over.
 */
export function rowHash(row) {
  return createHash('sha256').update(dumps(sortedKeys(row))).digest('hex').slice(0, 16);
}

/**
 * PURE. The cross-references a text holds: row ids (a token that is one of `ids`), commit shas (7 to 40 hex digits with
 * a digit and a letter), CI run and job ids (10 to 13 digits), `PR #N`, and DECISIONS references, in the order the text
 * first names them. A landing record that shortens a note keeps every one of them.
 */
function crossReferences(text, ids) {
  const t = String(text ?? '');
  const at = new Map();
  const add = (m) => { if (!at.has(m[0])) at.set(m[0], m.index); };
  for (const m of t.matchAll(/[A-Z][A-Z_]*:[A-Za-z0-9:_./-]*[A-Za-z0-9]/g)) if (ids.has(m[0])) add(m);
  for (const m of t.matchAll(/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g)) add(m);
  for (const m of t.matchAll(/\b\d{10,13}\b/g)) add(m);
  for (const m of t.matchAll(/\bPR #\d+\b/g)) add(m);
  for (const m of t.matchAll(/DECISIONS \d{4}-\d{2}-\d{2}(?: \([^)]+\))? items? \d+[a-z]?(?:(?:, | and |-)\d+[a-z]?)*/g)) add(m);
  return [...at].sort((a, b) => a[1] - b[1]).map(([m]) => m);
}

/** The v2 fields in their order, then any other key in the order the row has it (the gate's S0 names those). */
export function ordered(row) {
  const out = {};
  for (const k of V2_FIELDS) if (row[k] !== undefined) out[k] = row[k];
  for (const k of Object.keys(row)) if (!V2_FIELDS.includes(k) && row[k] !== undefined) out[k] = row[k];
  return out;
}

/** Append `text` unless the note already holds it, before or after its own-id prefix is removed. */
function appendTo(note, text, id) {
  if (!text) return note;
  const own = `From ${id}: `;
  if (note.includes(text) || note.includes(text.split(own).join(''))) return note;
  return note ? `${note} ${text}`.trim() : text;
}

/**
 * PURE. A note composed from `start` by the records' ops: a replace sets the text (unless `appendsOnly`), an append and
 * a carried-in fact are added once, and the prefix "From <this id>: " is removed. Empty becomes undefined.
 */
export function composeNote(start, records, id, { appendsOnly = false } = {}) {
  let n = start ?? '';
  for (const d of records) {
    for (const op of d.noteOps ?? []) {
      if (op.op === 'replace') {
        if (!appendsOnly) n = op.text;
      } else n = appendTo(n, op.text, id);
    }
    for (const f of d.noteFrom ?? []) n = appendTo(n, f.text, id);
  }
  n = n.split(`From ${id}: `).join('');
  return n || undefined;
}

/** PURE. `row` with the records' `set` and `unset` applied (a null in `set` removes the field). The note is left alone. */
function applyFields(row, records) {
  const out = { ...row };
  for (const d of records) {
    for (const [k, v] of Object.entries(d.set ?? {})) {
      if (v === null) delete out[k];
      else out[k] = v;
    }
    for (const k of d.unset ?? []) delete out[k];
  }
  return out;
}

/** A closed row keeps a lane only where a record names one, and drops an empty acceptance. */
function closedRowRules(row, records) {
  if (row.state !== 'closed') return row;
  const out = { ...row };
  if (!records.some((d) => Object.hasOwn(d.set ?? {}, 'lane'))) delete out.lane;
  if (!out.acceptance) delete out.acceptance;
  return out;
}

/** Remove the retired fields; a closedNote's text joins the note. */
function retire(row, id) {
  const out = { ...row };
  if (out.closedNote) out.note = appendTo(out.note ?? '', out.closedNote, id) || undefined;
  for (const k of RETIRED) delete out[k];
  return out;
}

/** O: the base row with its disposition records applied. */
function ours(base, records) {
  const id = base.id;
  let o = applyFields(base, records);
  o.note = composeNote(base.note, records, id);
  o = closedRowRules(retire(o, id), records);
  return o;
}

/** A new row from its CREATE record. */
function created(record, date) {
  const row = applyFields({ id: record.id }, [record]);
  row.key ??= record.id;
  row.opened ??= date;
  row.updated = date;
  const note = composeNote(undefined, [record], record.id);
  if (note) row.note = note;
  else delete row.note;
  return ordered(row);
}

const fieldsOf = (...rows) => [...new Set(rows.flatMap((r) => Object.keys(r)))];

/** A landing record applied to a row as it stands after the merge: its replace ops apply, whoever changed the note. */
function landed(row, recs, id) {
  let o = applyFields(row, recs);
  o.note = composeNote(row.note, recs, id);
  return closedRowRules(retire(o, id), recs);
}

/**
 * The text a lane added to a note since the base: what follows the base note, less the records' own appends (so a
 * re-run over a migrated row finds the same text). `appended` is false when the lane rewrote the note instead.
 */
function laneAddedText(B, T, recs) {
  let t = String(T.note ?? '');
  for (const d of recs) {
    for (const op of d.noteOps ?? []) if (op.op !== 'replace' && op.text) t = t.split(op.text).join('');
    for (const f of d.noteFrom ?? []) if (f.text) t = t.split(f.text).join('');
  }
  t = t.trim();
  const b = String(B.note ?? '').trim();
  const appended = !b || t.startsWith(b);
  return { text: appended ? t.slice(b.length).trim() : t, appended };
}

/** True when a READ record carries an edit: a READ says the landing read a lane's edit and lets the merge stand. */
const readEdits = (d) => Object.keys(d.set ?? {}).length > 0 || (d.unset ?? []).length > 0 || (d.noteOps ?? []).length > 0 || (d.noteFrom ?? []).length > 0;

/**
 * PURE. Apply the dispositions to the current registry text.
 * @param {{baseText: string, currentText: string, dispositions: object[], landing?: object[], triageRef?: string,
 *   date: string, substitute?: boolean}} input
 *   dispositions: the triage's records, one per base row plus its CREATEs, merged three ways against the base.
 *   landing: records the landing writes on top of the merged rows, each with `against`, the rowHash of the row as its
 *   author read it: v2 fields for rows added after the base, the hand fix where a lane's edit breaks a cap, and a READ
 *   (no edit) for each other row a lane changed. A row the run rewrites that a lane changed or added needs one; a
 *   record whose row changed after it was written is not applied.
 *   substitute: false leaves "@TRIAGE@" in place, a test seam so the output can be compared byte for byte with the
 *   reference build, which never had the item number.
 */
export function migrate({ baseText, currentText, dispositions, landing = [], triageRef, date, substitute = true }) {
  const base = new Map();
  for (const line of baseText.split('\n')) if (line.trim()) { const r = JSON.parse(line); base.set(r.id, r); }
  const group = (records) => {
    const m = new Map();
    for (const d of records) {
      if (!m.has(d.id)) m.set(d.id, []);
      m.get(d.id).push(d);
    }
    return m;
  };
  const byId = group(dispositions);
  const landById = group(landing);
  const report = {
    rows: 0, unchanged: 0, migrated: 0, alreadyMigrated: 0, addedAfterBase: [], laneTouched: [], laneClosureKept: [], forReading: [],
    moved: [], landed: [], conflicts: [], created: [], createExists: [], refused: [],
  };
  for (const d of dispositions) if (d.action === 'READ') report.refused.push(`${d.id}: READ is a landing record's action; a triage record keeps, closes, reclassifies or creates`);
  for (const d of landing) {
    if (d.action === 'CREATE') report.refused.push(`${d.id}: a landing record cannot create a row; new rows are triage CREATEs`);
    if (!/^[0-9a-f]{16}$/.test(String(d.against ?? ''))) report.refused.push(`${d.id}: a landing record needs "against", the rowHash of the row as its author read it`);
    if (d.action === 'READ' && readEdits(d)) report.refused.push(`${d.id}: a READ record changes nothing; it says the landing read the lane's edit and lets the merge stand`);
  }
  const sub = (row) => (substitute && row.closedBy === PLACEHOLDER ? { ...row, closedBy: triageRef } : row);
  /** The row this run writes from a merged one: the landing records `L` applied, the placeholder replaced. */
  const complete = (id, merged, L) => sub(L.length ? landed(merged, L, id) : { ...merged });
  // `updated` is derived: it moves when the row's content does, so it is left out of the comparison.
  // ordered() drops a field set to undefined (a note composed to nothing), as the written line would.
  const sameContent = (row, current) => {
    const { updated: _a, ...a } = ordered(row);
    const { updated: _b, ...b } = current;
    return deepEqual(a, b);
  };

  // Pass 1: every current row merged three ways (M), before any landing record; sightings to move are collected.
  const entries = [];
  const seen = new Set();
  const moves = new Map();
  for (const line of currentText.split('\n')) {
    if (!line.trim()) continue;
    const T = JSON.parse(line);
    const id = T.id;
    seen.add(id);
    report.rows += 1;
    const recs = (byId.get(id) ?? []).filter((d) => d.action !== 'CREATE');
    const B = base.get(id);
    const e = { id, T, line, B, recs, merged: T, laneChanged: [], laneClosureKept: [], forReading: [], asIs: false };
    entries.push(e);
    if (!recs.length) {
      if (B) report.refused.push(`${id}: a row of the base with no disposition record (the dispositions are incomplete)`);
      else if (!byId.has(id)) report.addedAfterBase.push(id);
      // A CREATE whose row is already here is compared by the create pass below.
      e.asIs = Boolean(B) || byId.has(id);
      continue;
    }
    if (!B) {
      report.refused.push(`${id}: a triage record for a row the base does not hold; a row added after the base takes a landing record`);
      e.asIs = true;
      continue;
    }
    const O = ours(B, recs);
    const laneChanged = fieldsOf(B, T).filter((k) => !deepEqual(B[k], T[k]));
    e.laneChanged = laneChanged;
    if (!laneChanged.length) {
      e.merged = O;
      continue;
    }
    let M;
    if (T.state === 'closed' && B.state !== 'closed') {
      M = { ...T };
      for (const k of AFTER_LANE_CLOSURE) if (!laneChanged.includes(k) && O[k] !== undefined) M[k] = O[k];
      M = retire(M, id);
      const oClosedBy = sub(O).closedBy;
      const differs = O.state === 'closed' && (O.resolution !== T.resolution || oClosedBy !== T.closedBy);
      e.laneClosureKept.push(`${id}: the lane closed it (${T.resolution ?? 'no resolution'}, ${T.closedBy ?? 'no closedBy'})${differs ? `; the disposition closed it ${O.resolution} by ${oClosedBy}, read both` : '; consistent with the disposition'}`);
    } else {
      const triageCloses = O.state === 'closed' && T.state !== 'closed';
      M = { ...O };
      for (const k of laneChanged) {
        if (k === 'note') continue;
        if (T[k] === undefined) delete M[k];
        else M[k] = T[k];
        if (k === 'state' && triageCloses) continue;
        if (!deepEqual(O[k], B[k]) && !deepEqual(O[k], T[k])) e.forReading.push(`${id}.${k}: both changed it; kept the lane's ${dumps(T[k] ?? null).slice(0, 120)}, the disposition said ${dumps(O[k] ?? null).slice(0, 120)}`);
      }
      if (laneChanged.includes('note')) {
        M.note = composeNote(T.note, recs, id, { appendsOnly: true });
        if (M.note === undefined) delete M.note;
      }
      if (triageCloses && T.state === 'in-flight' && laneChanged.includes('state')) {
        // A lane at work on the row outranks a triage that never saw the work; the gate then asks for its lane.
        delete M.resolution;
        delete M.closedBy;
        e.forReading.push(`${id}: the lane set it in flight and the triage closes it ${O.resolution}; kept in flight, since the triage never saw the lane's work. A landing record gives it its in-flight lane and acceptance, or closes it`);
      } else if (triageCloses) {
        M.state = 'closed';
        M.resolution = O.resolution;
        M.closedBy = O.closedBy;
        if (laneChanged.includes('state')) e.forReading.push(`${id}: the lane moved it to ${T.state} and the triage closes it ${O.resolution}; the triage's closure stands`);
        if (O.resolution === 'duplicate' && laneChanged.includes('note')) {
          const added = laneAddedText(B, T, recs);
          const target = String(O.closedBy).replace(/^duplicate:/, '');
          if (added.text) {
            if (!moves.has(target)) moves.set(target, []);
            moves.get(target).push({ from: id, text: added.text, whole: !added.appended });
          }
        }
      }
      M = closedRowRules(retire(M, id), recs);
      if (B.state === 'closed' && M.state !== 'closed') e.forReading.push(`${id}: closed at the base and open now; closed is final (gate R2)`);
    }
    e.merged = M;
  }

  /** `row` with the sightings a lane added to its duplicates appended, each once, as "From <id>: ...". */
  const movedInto = (targetId, row) => {
    let note = row.note ?? '';
    for (const m of moves.get(targetId) ?? []) {
      const next = appendTo(note, `From ${m.from}: ${m.text}`, targetId);
      if (next !== note) report.moved.push(m.whole ? `${m.from}: the lane rewrote its note rather than appending, so the whole note moved to ${targetId}, which it duplicates` : `${m.from}: the lane's added note text moved to ${targetId}, which it duplicates`);
      note = next;
    }
    return note ? { ...row, note } : row;
  };
  const creates = dispositions.filter((d) => d.action === 'CREATE');
  const ids = new Set([...seen, ...creates.map((c) => c.id)]);
  for (const target of moves.keys()) if (!ids.has(target)) report.conflicts.push(`${target}: a lane's sighting moves here from a row closed as its duplicate, and no such row exists`);

  // Pass 2: the landing records, then write only what changes.
  const out = [];
  for (const e of entries) {
    const { id, T, line } = e;
    if (e.asIs) {
      out.push({ id, line });
      continue;
    }
    const merged = moves.has(id) ? movedInto(id, e.merged) : e.merged;
    const L = landById.get(id) ?? [];
    const h = rowHash(T);
    const stale = L.find((d) => d.against !== h);
    let row = complete(id, merged, L);
    // A stale record whose result the file already holds is a re-run; otherwise the lane edited the row after it.
    if (stale && !sameContent(row, T)) {
      report.conflicts.push(`${id}: the row changed after its landing record was written (the record read ${stale.against}, the row is ${h} now); read the row again and write the record against it`);
      row = complete(id, merged, []);
    }
    if (row.note && row.note.length > NOTE_MAX) report.conflicts.push(`${id}: the composed note is ${row.note.length} characters, over ${NOTE_MAX}`);
    if (substitute && row.closedBy === PLACEHOLDER) report.conflicts.push(`${id}: closedBy is still ${PLACEHOLDER}`);
    if (sameContent(row, T)) {
      report.unchanged += 1;
      if (e.recs.length) report.alreadyMigrated += 1;
      out.push({ id, line });
      continue;
    }
    if (!L.length && (!e.B || e.laneChanged.length)) {
      report.conflicts.push(`${id}: a lane ${e.B ? `changed ${e.laneChanged.join(', ')}` : 'added it'} since the snapshot, and no landing record has read it; read the lane's edit and record it against ${h}`);
    }
    if (L.length && !stale) {
      if (L.some((d) => (d.noteOps ?? []).some((op) => op.op === 'replace'))) {
        const dropped = crossReferences(complete(id, merged, []).note, ids).filter((r) => !String(row.note ?? '').includes(r));
        if (dropped.length) report.conflicts.push(`${id}: the landing record's replace drops ${dropped.join(', ')}`);
      }
      report.landed.push(id);
    }
    if (e.recs.length && e.laneChanged.length) {
      const kept = e.laneChanged.filter((k) => (k === 'note' ? String(row.note ?? '').includes(String(T.note ?? '')) : deepEqual(row[k], T[k])));
      const replaced = e.laneChanged.filter((k) => !kept.includes(k) && k !== 'updated');
      report.laneTouched.push(`${id}: the lane changed ${e.laneChanged.join(', ')}; ${kept.length ? `kept the lane's ${kept.join(', ')}` : 'kept none of them'}${replaced.length ? `; the triage or a landing record wrote ${replaced.join(', ')}` : ''}`);
      report.laneClosureKept.push(...e.laneClosureKept);
      report.forReading.push(...e.forReading);
    }
    report.migrated += 1;
    out.push({ id, line: dumps(ordered({ ...row, updated: date })) });
  }

  for (const id of landById.keys()) if (!seen.has(id)) report.refused.push(`${id}: a landing record names a row the current file does not hold`);
  for (const [id, recs] of byId) {
    const create = recs.find((d) => d.action === 'CREATE');
    if (!create && !seen.has(id)) report.refused.push(`${id}: a disposition names a row the current file does not hold`);
  }

  creates.sort((a, b) => (a.set?.kind === 'lane' ? 0 : 1) - (b.set?.kind === 'lane' ? 0 : 1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const current = new Map(out.map((o) => [o.id, o]));
  for (const c of creates) {
    const want = sub(ordered(movedInto(c.id, created(c, date))));
    const have = current.get(c.id);
    if (have) {
      const T = JSON.parse(have.line);
      want.opened = T.opened ?? want.opened;
      want.updated = T.updated ?? want.updated;
      if (deepEqual(want, T)) report.createExists.push(c.id);
      else report.conflicts.push(`${c.id}: a new row whose id is already a row with other content`);
      continue;
    }
    if (want.note && want.note.length > NOTE_MAX) report.conflicts.push(`${c.id}: the composed note is ${want.note.length} characters, over ${NOTE_MAX}`);
    out.push({ id: c.id, line: dumps(want) });
    report.created.push(c.id);
  }
  return { text: `${out.map((o) => o.line).join('\n')}\n`, report };
}

/** One JSONL file of disposition records. */
export function readDispositions(text, path) {
  return text.split('\n').filter((l) => l.trim()).map((l, i) => {
    const d = JSON.parse(l);
    if (typeof d.id !== 'string' || !['KEEP', 'CLOSE', 'RECLASSIFY', 'CREATE', 'READ'].includes(d.action)) {
      throw new Error(`${path}:${i + 1}: a record needs an id and an action of KEEP, CLOSE, RECLASSIFY, CREATE or READ (a landing record's)`);
    }
    return d;
  });
}

function arg(argv, name) {
  const out = [];
  argv.forEach((a, i) => { if (a === name && argv[i + 1] !== undefined) out.push(argv[i + 1]); });
  return out;
}

function refuse(msg) {
  console.error(`✖ registry-migrate: ${msg}`);
  process.exit(2);
}

/** Open PRs whose diff touches the registry, except those the operator named. */
function noisyPrs(git, allowed) {
  let prs;
  try {
    prs = JSON.parse(execFileSync('gh', ['pr', 'list', '--state', 'open', '--json', 'number,headRefOid'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (e) {
    refuse(`could not list open PRs to check for a quiet point (${String(e.message).split('\n')[0]})`);
  }
  const noisy = [];
  for (const pr of prs) {
    if (allowed.includes(String(pr.number))) continue;
    let stat;
    try {
      stat = git(['diff', '--stat', `origin/main...${pr.headRefOid}`, '--', REGISTRY]);
    } catch {
      refuse(`PR #${pr.number}'s head ${pr.headRefOid.slice(0, 8)} is not in this clone; git fetch, then run again`);
    }
    if (stat.trim()) noisy.push(pr.number);
  }
  return noisy;
}

function main() {
  const argv = process.argv.slice(2);
  const paths = arg(argv, '--dispositions');
  const landingPaths = arg(argv, '--landing');
  const [triageRef] = arg(argv, '--triage-ref');
  const [date] = arg(argv, '--date');
  const [baseRef = 'a150a93a'] = arg(argv, '--base');
  const write = argv.includes('--write');
  if (paths.length !== 1) refuse('--dispositions <path> is required, once');
  if (landingPaths.length > 1) refuse('--landing <path> is given at most once');
  if (!triageRef) refuse(`--triage-ref is required: the DECISIONS item that every ${PLACEHOLDER} closure cites`);
  if (!CLOSED_BY.decision.test(triageRef)) refuse(`--triage-ref "${triageRef}" is not a DECISIONS reference`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) refuse('--date YYYY-MM-DD is required');
  const d = resolveDecision(triageRef, decisionsIndex(readFileSync(join(ROOT, DECISIONS), 'utf8')));
  if (!d.ok) refuse(`--triage-ref "${triageRef}" does not resolve in ${DECISIONS}: ${d.why}`);

  const git = (args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git(['merge-base', '--is-ancestor', baseRef, 'HEAD']);
  } catch {
    refuse(`the base ${baseRef} is not an ancestor of HEAD`);
  }
  const noisy = noisyPrs(git, arg(argv, '--allow-open-pr'));
  if (noisy.length) refuse(`open PR(s) ${noisy.map((n) => `#${n}`).join(', ')} edit ${REGISTRY}; land them first, or read their edits and pass --allow-open-pr`);

  const path = join(ROOT, REGISTRY);
  const currentText = readFileSync(path, 'utf8');
  const repeats = parseRegistry(currentText).findings.filter((f) => f.rule === 'S1');
  if (repeats.length) refuse(`${REGISTRY} has lines that do not parse or ids that repeat (run registry-dedupe.mjs first):\n  ${repeats.map((f) => f.text).join('\n  ')}`);

  const dispositions = readDispositions(readFileSync(paths[0], 'utf8'), paths[0]);
  const landing = landingPaths.length ? readDispositions(readFileSync(landingPaths[0], 'utf8'), landingPaths[0]) : [];
  const { text, report } = migrate({ baseText: git(['show', `${baseRef}:${REGISTRY}`]), currentText, dispositions, landing, triageRef, date });
  if (report.refused.length) refuse(`the dispositions do not match the file:\n  ${report.refused.join('\n  ')}`);

  const list = (title, items) => {
    console.log(`${title}: ${items.length}`);
    for (const i of items) console.log(`  ${i}`);
  };
  console.log(`registry-migrate: ${report.rows} rows read from ${REGISTRY}; base ${baseRef}; ${dispositions.length} triage records, ${landing.length} landing records`);
  console.log(`  ${report.migrated} rows rewritten, ${report.unchanged} unchanged (${report.alreadyMigrated} of them already migrated), ${report.created.length} new rows appended, ${report.createExists.length} new rows already present`);
  list('rows a lane changed since the base (the lane\'s fields kept)', report.laneTouched);
  list('rows a lane closed (its closure kept)', report.laneClosureKept);
  list('fields both sides changed, and states kept or closed, for reading', report.forReading);
  list('sightings moved from a row closed as a duplicate to the row it duplicates', report.moved);
  list('rows added after the base (passed through unless a landing record names them)', report.addedAfterBase);
  list('rows a landing record finished', report.landed);

  const parsed = parseRegistry(text);
  const refs = checkReferences(parsed.rows, liveReferences(ROOT));
  const findings = [...parsed.findings, ...refs.findings];
  console.log(`v2 gate on the result: ${parsed.rows.length} rows, ${findings.length ? Object.entries(countByRule(findings)).map(([k, n]) => `${k} ${n}`).join(', ') : 'no findings'}`);
  for (const e of [...parsed.errors, ...refs.errors]) console.log(`  • ${e}`);
  list('conflicts', report.conflicts);
  const failed = report.conflicts.length > 0 || findings.length > 0;
  if (!write) {
    console.log(failed ? '✖ registry-migrate --check: not clean' : `✓ registry-migrate --check: clean; --write would change ${report.migrated + report.created.length} line(s)`);
    process.exit(failed ? 1 : 0);
  }
  if (failed) {
    console.error('✖ registry-migrate --write: refused; the registry is unchanged');
    process.exit(1);
  }
  writeFileSync(path, text);
  const again = parseRegistry(readFileSync(path, 'utf8'));
  const againRefs = checkReferences(again.rows, liveReferences(ROOT));
  if (again.findings.length || againRefs.findings.length) {
    writeFileSync(path, currentText);
    console.error('✖ registry-migrate --write: the written file failed the gate; the old bytes are restored');
    process.exit(1);
  }
  console.log(`✓ registry-migrate --write: wrote ${REGISTRY} (${report.migrated + report.created.length} line(s) changed); the v2 gate passes on it`);
}

if (import.meta.main) main();
