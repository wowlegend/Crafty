#!/usr/bin/env node
/**
 * REGISTRY HARVEST — every open item in the five old open-work sources has a row in `memory/registry.jsonl`.
 *
 * The SOTA reset (plan row 30) makes the registry the one home for open work. Until the old sources leave HEAD
 * (plan row 32), they still get edited, so this check runs on every unit run: it extracts the open items from each
 * source by a stated rule, and fails when one has no registry row. A row may close an item; it may not drop one.
 *
 * The five sources and what counts as an item in each (the extraction rules):
 *   STATUS        memory/STATUS.md section 2: a line opening with an open (▢) or in-flight (▣, not ▣✓) marker,
 *                 struck (~~) originals excluded; and every G-ledger table row whose State cell starts "open".
 *   ACTIVE_PLAN   memory/ACTIVE_PLAN.md: every LIVE TASK LIST row whose State is not DONE or REPAIRED; every bullet
 *                 of the "Owed after Wave 1 lands" block; the review #8 findings it names (#N SEVERITY); the
 *                 bake-off's B1, instrument-flaw and each semicolon-separated candidate (task T9 sends them here).
 *   QUEUE         docs/superpowers/sota-2026-09/QUEUE.md: every ranked row Q01-Q60 (the queue carries no state, so
 *                 all are in scope); each ### E<n> inconclusive item; each review-table row R<n>.<m> whose cells
 *                 say OPEN or PARTLY, and every "Follow-up R<n>.<m><x>" named in a row; each ## I<n>/L<n>/P<n>/
 *                 B<n> finding heading not marked FIXED; and a "**Related, also open:**" paragraph.
 *   OPEN_ITEMS    docs/superpowers/sota-2026-09/OPEN-ITEMS.md: every OI row in sections A, B and C, and any other
 *                 OI row that says STILL OPEN; the OI-03b heading; every STALE-<n> row of section G.
 *   MASTERPIECE   docs/superpowers/plans/2026-10-27-crafty-masterpiece.md: every Phase 0 table row, every bold-led
 *                 bullet under the Phase 1-3 headings, and every bullet under "Seen on a real GPU" and "Open questions".
 *
 * FLOORS. Each source's extracted count has a committed floor (`registry-floors.json`). A source that yields fewer
 * items than its floor fails, with both numbers printed: a renamed heading or a reworded row shape drops items from
 * extraction while every remaining key still has its row, and a check that asked only "is anything missing" would
 * pass. Closing items at the source lowers the count legitimately; the floor is lowered in the same change.
 *
 * ROWS. Each row has a unique id: the extracted key, or `key/part` when one source item holds several closable units.
 * This check proves every extracted key has at least one row. That a row, once written, is never deleted is a
 * property of a change, not of a tree, so `registry-append-only.mjs` checks it on the push range.
 *
 * BLIND SPOTS, stated: an open item written as plain prose with none of these shapes is not extracted (the rules
 * above are what the harvest proves, and nothing wider); a row's TEXT is not compared, so a registry row can carry
 * a wrong title or state and pass; a count above its floor leaves that slack unprotected until the floor is raised;
 * and keys made from a slug of the item's first words change when that text is edited, which fails the check until
 * the row's key is updated, the safe direction.
 *
 *   node scripts/ci/registry-harvest.mjs          check; prints each source's denominator and floor
 *   node scripts/ci/registry-harvest.mjs --list   print every extracted item (key, line, title) as TSV
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../../..');
export const REGISTRY = 'memory/registry.jsonl';
export const FLOORS_FILE = join(HERE, 'registry-floors.json');

export const DECISIONS = 'docs/superpowers/DECISIONS.md';

// Schema v2 (DECISIONS 2026-10-31 (registry v2) items 361-368; `.claude/rules/registry.md` says it in plain words).
// The field set is closed, in this order, which is also the order a row's keys are written in (registry-migrate.mjs).
export const V2_FIELDS = Object.freeze([
  'id', 'key', 'planUnit', 'title', 'kind', 'area', 'severity', 'playerVisible', 'owner', 'state', 'lane', 'acceptance',
  'blockedBy', 'evidence', 'note', 'opened', 'updated', 'resolution', 'closedBy', 'reopens',
]);
export const KINDS = Object.freeze(['bug', 'feature', 'debt', 'instrument', 'flake', 'decision', 'process', 'lane']);
export const AREAS = Object.freeze([
  'combat', 'world', 'physics', 'input', 'render', 'audio', 'ui', 'save', 'progression', 'perf', 'harness', 'docs', 'public',
]);
export const OWNERS = Object.freeze(['command session', 'Kevin', 'AB Command']);
export const STATES = Object.freeze(['open', 'in-flight', 'closed']);
export const SEVERITIES = Object.freeze(['HIGH', 'MED', 'LOW', 'unrated']);
export const RESOLUTIONS = Object.freeze(['done', 'duplicate', 'superseded', 'obsolete', 'wont-fix', 'false-positive']);
/** The forms a `closedBy` may take, and which forms each resolution accepts. */
export const CLOSED_BY = Object.freeze({
  commits: /^[0-9a-f]{7,40}(, [0-9a-f]{7,40})*$/,
  decision: /^DECISIONS \d{4}-\d{2}-\d{2}( \([^)]+\))? items? \d+[a-z]?(\([a-z]\))?((, | and |-)\d+[a-z]?(\([a-z]\))?)*$/,
  duplicate: /^duplicate:[^,\s]+$/,
  superseded: /^superseded:[^,\s]+(,[^,\s]+)*$/,
  pr: /^PR #\d+$/,
});
export const FORMS_BY_RESOLUTION = Object.freeze({
  done: ['commits', 'decision', 'pr'],
  duplicate: ['duplicate'],
  superseded: ['superseded', 'decision', 'commits'],
  obsolete: ['commits', 'decision'],
  'wont-fix': ['decision', 'pr'],
  'false-positive': ['decision'],
});
export const TITLE_MAX = 160;
export const NOTE_MAX = 1500;
export const ACCEPTANCE_MIN = 20;
export const ACCEPTANCE_MAX = 240;
export const TRIAGE_LANE = 'LANE:triage';
export const TRIAGE_DAYS = 7;
const REQUIRED_FIELDS = Object.freeze(['id', 'key', 'planUnit', 'title', 'kind', 'severity', 'playerVisible', 'owner', 'state', 'evidence', 'opened', 'updated']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// A part is a slug: the triage's split rows name theirs in words (`/sun-glow-fog`), not only a letter.
const PART = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LIVE = new Set(['open', 'in-flight']);

/** The words of a line, lower-cased, markup and tags removed, joined by '-'. */
export function slug(text, words = 5) {
  return text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[`*~_]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, words)
    .join('-');
}

const clean = (s) => s.replace(/[`*~]/g, '').replace(/\s+/g, ' ').trim();
const cells = (row) => row.split('|').slice(1, -1).map((c) => c.trim());

/** Push an item, suffixing a repeated key with ~2, ~3 so every extracted key is unique within a source. */
function adder(items) {
  const seen = new Map();
  return (key, line, title) => {
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    items.push({ key: n === 1 ? key : `${key}~${n}`, line, title: clean(title).slice(0, 160) });
  };
}

// --- STATUS -------------------------------------------------------------------------------------------------
const OPEN_MARK = /^\s*(?:- )?(?:\*\*)?(▢|▣)(?!✓)\s*(.*)$/;
const ITEM_ID = /^(?:\*\*)?(#\d+|[A-Z]{1,2}\d+[a-z]?(?:-bis)?)(?=[\s*—:]|$)/;

export function extractStatus(md) {
  const items = [];
  const add = adder(items);
  const lines = md.split('\n');
  let inTwo = false;
  let sub = '';
  let ledger = false;
  lines.forEach((line, i) => {
    if (/^## /.test(line)) inTwo = /^## 2\./.test(line);
    if (!inTwo) return;
    const h = line.match(/^### ([A-Z](?:-[a-z]+)?)[. ]/);
    if (h) {
      sub = h[1];
      ledger = sub === 'G-ledger';
      return;
    }
    if (ledger) {
      const row = line.match(/^\| (\d+) \|/);
      if (row) {
        const c = cells(line);
        if (/^open\b/i.test(c[c.length - 1])) add(`STATUS:G-ledger:${row[1]}`, i + 1, c[1]);
      }
      return;
    }
    // A struck original (`- ~~▢ ...~~`) never matches: the strike sits before the marker.
    const m = line.match(OPEN_MARK);
    if (!m) return;
    const body = m[2];
    const id = body.match(ITEM_ID);
    add(id ? `STATUS:${id[1]}` : `STATUS:${sub}:${slug(body)}`, i + 1, body);
  });
  return items;
}

// --- ACTIVE_PLAN --------------------------------------------------------------------------------------------
export function extractActivePlan(md) {
  const items = [];
  const add = adder(items);
  const lines = md.split('\n');
  let inTasks = false;
  let owed = false;
  let bakeoff = false;
  lines.forEach((line, i) => {
    if (/^#{2,3} /.test(line)) {
      inTasks = /LIVE TASK LIST/.test(line);
      bakeoff = false;
    }
    if (inTasks) {
      const row = line.match(/^\| (T\d+) \|/);
      if (row) {
        const c = cells(line);
        if (!/^(DONE|REPAIRED)\b/.test(c[c.length - 1])) add(`ACTIVE_PLAN:${row[1]}`, i + 1, c[1]);
      }
    }
    if (/^\*\*Owed after Wave 1 lands/.test(line)) {
      owed = true;
      return;
    }
    if (owed) {
      if (!line.trim() || /^#/.test(line)) owed = false;
      else if (/^- /.test(line)) {
        const text = line.slice(2);
        const colon = text.indexOf(':');
        add(`ACTIVE_PLAN:owed:${slug(colon > 0 && colon < 40 ? text.slice(0, colon) : text, colon > 0 && colon < 40 ? 8 : 4)}`, i + 1, text);
      }
    }
    if (/^- \*\*Review #8 findings still open\*\*/.test(line)) {
      let text = line;
      for (let j = i + 1; j < lines.length && /^\s{2,}\S/.test(lines[j]); j += 1) text += ` ${lines[j].trim()}`;
      for (const f of text.matchAll(/#(\d+) (HIGH|MED|LOW)\b/g)) add(`ACTIVE_PLAN:review8:#${f[1]}`, i + 1, text.slice(f.index, f.index + 140));
    }
    if (/^\*\*Findings from the 2026-10-27 review bake-off/.test(line)) bakeoff = true;
    if (bakeoff && /^- \*\*/.test(line)) {
      let text = line;
      for (let j = i + 1; j < lines.length && /^\s{2,}\S/.test(lines[j]); j += 1) text += ` ${lines[j].trim()}`;
      if (/^- \*\*B1\b/.test(line)) add('ACTIVE_PLAN:bakeoff:B1', i + 1, text.slice(2));
      else if (/^- \*\*Instrument flaw/.test(line)) add('ACTIVE_PLAN:bakeoff:instrument-flaw', i + 1, text.slice(2));
      else if (/^- \*\*Candidates, unverified:\*\*/.test(line)) {
        const list = text.replace(/^- \*\*Candidates, unverified:\*\*/, '').split(/\.\s+Already fixed on main/)[0];
        for (const c of list.split(/;\s+/)) add(`ACTIVE_PLAN:bakeoff:candidate:${slug(c, 4)}`, i + 1, c);
      }
    }
  });
  return items;
}

// --- QUEUE --------------------------------------------------------------------------------------------------
export function extractQueue(md) {
  const items = [];
  const add = adder(items);
  const lines = md.split('\n');
  let section = '';
  let heading = '';
  const headingIds = new Set();
  lines.forEach((line, i) => {
    if (/^## /.test(line)) {
      section = line;
      heading = '';
      const h = line.match(/^## ((?:I|L|P|B|G)\d+(?: partial)?)\b/);
      if (h) {
        heading = h[1].replace(' partial', '-partial');
        if (!/FIXED|✅/.test(line) && !headingIds.has(heading)) add(`QUEUE:${heading}`, i + 1, line.slice(3));
        headingIds.add(heading);
      }
      return;
    }
    const q = line.match(/^\| \*\*(Q\d\d)\*\* \|/);
    if (q) {
      add(`QUEUE:${q[1]}`, i + 1, cells(line)[1]);
      return;
    }
    const e = line.match(/^### (E\d+) — (.*)$/);
    if (e && /^## E\./.test(section)) {
      add(`QUEUE:${e[1]}`, i + 1, e[2]);
      return;
    }
    const r = line.match(/^\| (R\d+\.\d+[a-z]?) \|/);
    if (r) {
      const c = cells(line);
      if (c.slice(1).some((cell) => /^(\*\*)?(OPEN|PARTLY)\b/.test(cell))) add(`QUEUE:${r[1]}`, i + 1, c.slice(1).join(' — '));
      for (const f of line.matchAll(/Follow-up (R\d+\.\d+[a-z])/g)) add(`QUEUE:${f[1]}`, i + 1, line.slice(f.index, f.index + 140));
      return;
    }
    if (/^\*\*Related, also open:\*\*/.test(line) && heading) add(`QUEUE:${heading}:related-open`, i + 1, line);
  });
  return items;
}

// --- OPEN_ITEMS ---------------------------------------------------------------------------------------------
export function extractOpenItems(md) {
  const items = [];
  const add = adder(items);
  let section = '';
  md.split('\n').forEach((line, i) => {
    const s = line.match(/^## ([A-Z])\. /);
    if (s) section = s[1];
    else if (/^## /.test(line)) section = '';
    const oi = line.match(/^\| \*\*(OI-\d+)\*\* \|/);
    if (oi) {
      if ('ABC'.includes(section) && section || /STILL OPEN/.test(line)) add(`OPEN_ITEMS:${oi[1]}`, i + 1, cells(line)[1]);
      return;
    }
    const b = line.match(/^### (OI-\d+[a-z]) — (.*)$/);
    if (b) {
      add(`OPEN_ITEMS:${b[1]}`, i + 1, b[2]);
      return;
    }
    const st = line.match(/^\| \*\*(STALE-\d+)\*\* \|/);
    if (st && section === 'G') add(`OPEN_ITEMS:${st[1]}`, i + 1, cells(line).slice(1, 3).join(': '));
  });
  return items;
}

// --- MASTERPIECE --------------------------------------------------------------------------------------------
export function extractMasterpiece(md) {
  const items = [];
  const add = adder(items);
  let part = '';
  md.split('\n').forEach((line, i) => {
    if (/^## /.test(line)) {
      part = /^## Phase 0\b/.test(line) ? 'phase0'
        : /^## Phase [123]\b/.test(line) ? 'phase'
        : /^## Seen on a real GPU/.test(line) ? 'seen'
        : /^## Open questions/.test(line) ? 'question' : '';
      return;
    }
    if (part === 'phase0') {
      const row = line.match(/^\| (0[a-z]) \|/);
      if (row) add(`MASTERPIECE:${row[1]}`, i + 1, cells(line)[1]);
      return;
    }
    if (!/^- /.test(line)) return;
    const text = line.slice(2);
    const b = text.match(/^\*\*(.+?)\*\*/);
    if (part === 'phase' && b) add(`MASTERPIECE:${slug(b[1])}`, i + 1, text);
    else if (part === 'seen') add(`MASTERPIECE:seen:${slug(b ? b[1] : text)}`, i + 1, text);
    else if (part === 'question') add(`MASTERPIECE:question:${slug(text)}`, i + 1, text);
  });
  return items;
}

/** The five sources, in the order the reset plan names them. */
export const SOURCES = Object.freeze([
  { name: 'STATUS', path: 'memory/STATUS.md', extract: extractStatus },
  { name: 'ACTIVE_PLAN', path: 'memory/ACTIVE_PLAN.md', extract: extractActivePlan },
  { name: 'QUEUE', path: 'docs/superpowers/sota-2026-09/QUEUE.md', extract: extractQueue },
  { name: 'OPEN_ITEMS', path: 'docs/superpowers/sota-2026-09/OPEN-ITEMS.md', extract: extractOpenItems },
  { name: 'MASTERPIECE', path: 'docs/superpowers/plans/2026-10-27-crafty-masterpiece.md', extract: extractMasterpiece },
]);

/** A finding's printed form: the rule first, so a reader can count by rule. */
const said = (f) => `${f.rule} ${REGISTRY}:${f.line}${f.id === undefined ? '' : ` (${f.id})`}: ${f.text}`;

/** The form of a closedBy, or null when it fits none. */
export function closedByForm(closedBy) {
  return Object.keys(CLOSED_BY).find((form) => CLOSED_BY[form].test(String(closedBy ?? ''))) ?? null;
}

/** Ids a closure points at: the targets of `duplicate:<id>` and `superseded:<id>[,<id>...]`, else none. */
function closureTargets(closedBy) {
  const m = String(closedBy ?? '').match(/^(duplicate|superseded):(.+)$/);
  return m ? { kind: m[1], ids: m[2].split(',') } : { kind: null, ids: [] };
}

/** One row's own checks: everything that needs no other row, no git and no DECISIONS. */
function rowFindings(row, add) {
  const unknown = Object.keys(row).filter((k) => !V2_FIELDS.includes(k));
  if (unknown.length) add('S0', `unknown field(s) ${unknown.join(', ')}; the v2 field set is closed (.claude/rules/registry.md)`);

  const missing = REQUIRED_FIELDS.filter((f) => !Object.hasOwn(row, f) || row[f] === '' || row[f] === null);
  if (missing.length) add('S2', `missing ${missing.join(', ')}`);
  const enums = [['kind', KINDS], ['area', AREAS], ['severity', SEVERITIES], ['owner', OWNERS], ['state', STATES]];
  for (const [f, values] of enums) {
    if (row[f] !== undefined && row[f] !== null && !values.includes(row[f])) add('S2', `${f} "${row[f]}" is not one of ${values.join(' / ')}`);
  }
  if (row.playerVisible !== undefined && typeof row.playerVisible !== 'boolean') add('S2', 'playerVisible must be true or false');
  for (const f of ['opened', 'updated']) {
    if (row[f] && !DATE.test(row[f])) add('S2', `${f} "${row[f]}" is not a YYYY-MM-DD date`);
  }
  if (row.blockedBy !== undefined && !(Array.isArray(row.blockedBy) && row.blockedBy.length && row.blockedBy.every((b) => typeof b === 'string' && b))) {
    add('S2', 'blockedBy must be a list of row ids');
  }
  if (row.reopens !== undefined && !(typeof row.reopens === 'string' && row.reopens)) add('S2', 'reopens must be one row id');
  if (row.id && row.key && row.id !== row.key && !(row.id.startsWith(`${row.key}/`) && PART.test(row.id.slice(row.key.length + 1)))) {
    add('S2', `id is neither its key "${row.key}" nor "${row.key}/<part>"`);
  }

  if (LIVE.has(row.state)) {
    if (row.kind === 'lane' && row.lane !== undefined) add('S3', 'a lane row carries no lane of its own');
    if (row.kind !== 'lane' && !row.lane) add('S3', `an ${row.state} row needs a lane (a row of kind lane; standing lanes: LANE:backlog, LANE:flakes, LANE:kevin, ${TRIAGE_LANE})`);
    if (!row.area) add('S3', `an ${row.state} row needs an area`);
    const a = row.acceptance;
    if (typeof a !== 'string' || a.length < ACCEPTANCE_MIN || a.length > ACCEPTANCE_MAX || a === row.title) {
      add('S3', `acceptance must be one line of ${ACCEPTANCE_MIN} to ${ACCEPTANCE_MAX} characters naming the check that makes it done, not the title (it is ${typeof a === 'string' ? `${a.length} characters${a === row.title ? ', the title' : ''}` : 'missing'})`);
    }
    if (row.resolution !== undefined || row.closedBy !== undefined) add('S3', `an ${row.state} row carries a closure (resolution or closedBy)`);
  }

  if (row.state === 'closed') {
    const res = row.resolution;
    const form = closedByForm(row.closedBy);
    if (!RESOLUTIONS.includes(res)) add('S5', `closed with resolution ${res === undefined ? '(none)' : `"${res}"`}; one of ${RESOLUTIONS.join(' / ')}`);
    else if (!row.closedBy) add('S5', `closed ${res} with no closedBy`);
    else if (!FORMS_BY_RESOLUTION[res].includes(form)) add('S5', `closedBy "${row.closedBy}" is not a form a ${res} closure takes (${FORMS_BY_RESOLUTION[res].join(', ')})`);
    const note = row.note ?? '';
    if (res === 'wont-fix' && !/Won't fix: .{40,}/.test(note)) add('S5', 'a wont-fix closure needs the sentence "Won\'t fix: <a reason of at least 40 characters>" in its note');
    if (res === 'false-positive' && !(/False positive: /.test(note) && note.includes('`'))) add('S5', 'a false-positive closure needs "False positive: " in its note with the backticked command that shows it');
    if (res === 'obsolete' && form === 'decision' && !/Obsolete: /.test(note)) add('S5', 'an obsolete closure on a decision needs the sentence "Obsolete: <the grep that finds nothing>" in its note');
  }

  if (row.kind === 'bug' && row.playerVisible !== true) add('S9', 'a bug is something a player sees; playerVisible must be true (else it is debt or an instrument)');
  if (row.kind === 'decision' && row.state === 'closed' && row.resolution === 'done' && closedByForm(row.closedBy) !== 'decision') {
    add('S9', 'a decision closes done only on a DECISIONS item');
  }
  if (row.owner === 'Kevin' && row.state === 'closed' && !['duplicate', 'done', 'superseded'].includes(row.resolution)) {
    add('S9', `a Kevin row closes only as a duplicate of another Kevin row, or done or superseded on a DECISIONS item that records him (not ${row.resolution})`);
  }
  if (row.owner === 'Kevin' && row.state === 'closed' && ['done', 'superseded'].includes(row.resolution) && closedByForm(row.closedBy) !== 'decision') {
    add('S9', `a Kevin row closes ${row.resolution} only on a DECISIONS item that records him, never on inference`);
  }

  if (row.severity === 'unrated' && !(LIVE.has(row.state) && row.lane === TRIAGE_LANE)) add('S10', `severity unrated outside ${TRIAGE_LANE}`);

  if (typeof row.title === 'string' && row.title.length > TITLE_MAX) add('S11', `title is ${row.title.length} characters, over ${TITLE_MAX}; detail goes in note`);
  if (typeof row.note === 'string' && row.note.length > NOTE_MAX) add('S11', `note is ${row.note.length} characters, over ${NOTE_MAX}`);
}

/** The checks that read other rows: the orphan check (S4) and the pointers (S8, and S9's Kevin duplicate). */
function crossFindings(rows, findings) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const r of rows) {
    const add = (rule, text) => findings.push({ rule, line: r._line, id: r.id, text });
    if (LIVE.has(r.state) && r.kind !== 'lane') {
      const lane = r.lane ? byId.get(r.lane) : undefined;
      if (!r.lane) add('S4', 'an orphan: it names no lane, so no lane owns it');
      else if (!lane) add('S4', `lane "${r.lane}" is not a row`);
      else if (lane.kind !== 'lane') add('S4', `lane "${r.lane}" is a ${lane.kind ?? 'kindless'} row, not a lane`);
      else if (lane.state === 'closed') add('S4', `lane "${r.lane}" is closed: a lane lands only when every open row naming it has moved or closed`);
      else if (r.state === 'in-flight' && lane.state !== 'in-flight') add('S4', `an in-flight row's lane must be in flight; "${r.lane}" is ${lane.state}`);
    }
    if (r.state === 'closed') {
      const t = closureTargets(r.closedBy);
      for (const id of t.ids) {
        const target = byId.get(id);
        if (!target) add('S8', `${t.kind}:${id} names no row`);
        else if (id === r.id) add('S8', `${t.kind}: points at the row itself`);
        else if (t.kind === 'duplicate' && target.state === 'closed' && target.resolution === 'duplicate') {
          add('S8', `duplicate:${id} is itself closed as a duplicate; point at its root (${target.closedBy})`);
        }
      }
      if (r.owner === 'Kevin' && r.resolution === 'duplicate' && t.kind === 'duplicate' && byId.get(t.ids[0]) && byId.get(t.ids[0]).owner !== 'Kevin') {
        add('S9', `a Kevin row closes as a duplicate only of another Kevin row; ${t.ids[0]} is owned by ${byId.get(t.ids[0]).owner}`);
      }
    }
    for (const b of Array.isArray(r.blockedBy) ? r.blockedBy : []) {
      if (!byId.has(b)) add('S8', `blockedBy ${b} names no row`);
      else if (b === r.id) add('S8', 'blockedBy names the row itself');
    }
    if (typeof r.reopens === 'string') {
      const target = byId.get(r.reopens);
      if (!target) add('S8', `reopens ${r.reopens} names no row`);
      else if (target.state !== 'closed') add('S8', `reopens ${r.reopens}, which is not closed (a regression is a new row of a closed one)`);
    }
  }
}

/**
 * Parse the registry, one JSON object per line, and run every rule that needs nothing outside the file (S0-S5, S8,
 * S9's pure half, S10's unrated rule, S11). A bad line or a missing field is a finding, never a skip.
 * @returns {{rows: object[], errors: string[], findings: {rule: string, line: number, id?: string, text: string}[]}}
 */
export function parseRegistry(text) {
  const rows = [];
  const findings = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      findings.push({ rule: 'S1', line: i + 1, text: 'not a JSON object' });
      return;
    }
    if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id) {
      findings.push({ rule: 'S1', line: i + 1, text: 'not a JSON object with a string id' });
      return;
    }
    rowFindings(row, (rule, t) => findings.push({ rule, line: i + 1, id: row.id, text: t }));
    rows.push({ ...row, _line: i + 1 });
  });
  const ids = new Map();
  for (const r of rows) {
    if (ids.has(r.id)) findings.push({ rule: 'S1', line: r._line, text: `id "${r.id}" repeats line ${ids.get(r.id)}` });
    else ids.set(r.id, r._line);
  }
  crossFindings(rows, findings);
  findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule, 'en', { numeric: true }));
  return { rows, findings, errors: findings.map(said) };
}

/**
 * PURE. The DECISIONS record as entries: a `## YYYY-MM-DD...` heading, and the items in it, an item being a line
 * that opens `N. `. Each item keeps its text (to the next item or heading), so a check can read what it says.
 */
export function decisionsIndex(text) {
  const entries = [];
  let entry = null;
  let item = null;
  for (const line of String(text).split('\n')) {
    const h = line.match(/^## (\d{4}-\d{2}-\d{2})(.*)$/);
    if (h) {
      entry = { date: h[1], heading: line.trim(), items: new Map() };
      entries.push(entry);
      item = null;
      continue;
    }
    if (!entry) continue;
    const m = line.match(/^(\d+)\. /);
    if (m) {
      const n = Number(m[1]);
      item = { text: line };
      if (!entry.items.has(n)) entry.items.set(n, []);
      entry.items.get(n).push(item);
    } else if (item) item.text += `\n${line}`;
  }
  return entries;
}

/**
 * PURE. Resolve `DECISIONS <date> [(<tag>)] item[s] <n>[, <n>| and <n>|-<n>]...` against the index. Every number
 * must be exactly one item across the entries of that date (whose heading contains the tag, when one is given).
 * @returns {{ok: boolean, why: string, items: string[]}}
 */
export function resolveDecision(ref, entries) {
  const m = String(ref).match(/^DECISIONS (\d{4}-\d{2}-\d{2})(?: \(([^)]+)\))? items? (.+)$/);
  if (!m) return { ok: false, why: 'not a DECISIONS reference', items: [] };
  const [, date, tag, list] = m;
  const numbers = [];
  for (const part of list.split(/, | and /)) {
    const r = part.match(/^(\d+)[a-z]?(?:\([a-z]\))?(?:-(\d+)[a-z]?(?:\([a-z]\))?)?$/);
    if (!r) return { ok: false, why: `"${part}" is not an item number`, items: [] };
    const lo = Number(r[1]);
    const hi = r[2] === undefined ? lo : Number(r[2]);
    if (hi < lo || hi - lo > 50) return { ok: false, why: `"${part}" is not a range of items`, items: [] };
    for (let n = lo; n <= hi; n += 1) numbers.push(n);
  }
  const candidates = entries.filter((e) => e.date === date && (!tag || e.heading.includes(tag)));
  const items = [];
  for (const n of numbers) {
    const hits = candidates.flatMap((e) => e.items.get(n) ?? []);
    if (hits.length !== 1) {
      return { ok: false, why: `item ${n} is in ${hits.length} place(s) across the ${candidates.length} entr${candidates.length === 1 ? 'y' : 'ies'} dated ${date}${tag ? ` tagged "${tag}"` : ''}${hits.length > 1 ? '; name the entry by its tag' : ''}`, items: [] };
    }
    items.push(hits[0].text);
  }
  return { ok: true, why: 'ok', items };
}

/** A YYYY-MM-DD date as a day count, for differences in whole days. */
export const dayNumber = (date) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

/** Deep equality of parsed JSON values; key order does not matter, array order does. */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
}

/**
 * The rules that read outside the file, each dependency injected so a test can fix it: S6 (a commit sha in closedBy is
 * an ancestor of HEAD, or of MERGE_HEAD while a merge is unfinished: see liveReferences), S7 (a DECISIONS reference is
 * exactly one item), S9's Kevin half (the item names him) and S10's clock (no LANE:triage row older than TRIAGE_DAYS by
 * HEAD's committer date, so a sha always gets the same verdict).
 * @param {object[]} rows parsed rows (each with _line)
 * @param {{isAncestor: (sha: string) => boolean, decisionsText: string, headDate: string, mergeHead?: string|null}} refs
 *   `mergeHead` only words S6's message; which shas pass is `isAncestor`'s to decide.
 */
export function checkReferences(rows, { isAncestor, decisionsText, headDate, mergeHead = null } = {}) {
  if (typeof isAncestor !== 'function' || typeof decisionsText !== 'string' || !DATE.test(String(headDate))) {
    throw new Error('checkReferences needs isAncestor, decisionsText and a YYYY-MM-DD headDate: a reference check run blind is not a pass');
  }
  const entries = decisionsIndex(decisionsText);
  const findings = [];
  const today = dayNumber(headDate);
  for (const r of rows) {
    const add = (rule, text) => findings.push({ rule, line: r._line, id: r.id, text });
    if (r.state === 'closed') {
      const form = closedByForm(r.closedBy);
      if (form === 'commits') {
        for (const sha of r.closedBy.split(', ')) {
          if (!isAncestor(sha)) add('S6', `closedBy ${sha} is not an ancestor of HEAD${mergeHead ? ` or of MERGE_HEAD ${String(mergeHead).slice(0, 8)}` : ''}`);
        }
      }
      if (form === 'decision') {
        const d = resolveDecision(r.closedBy, entries);
        if (!d.ok) add('S7', `"${r.closedBy}" does not resolve to exactly one item: ${d.why}`);
        else if (r.owner === 'Kevin' && ['done', 'superseded'].includes(r.resolution) && !d.items.some((t) => /\bKevin\b/.test(t))) {
          add('S9', `a Kevin row closes ${r.resolution} only on an item that records him; "${r.closedBy}" does not name Kevin`);
        }
      }
    }
    if (LIVE.has(r.state) && r.lane === TRIAGE_LANE && DATE.test(String(r.opened)) && today - dayNumber(r.opened) > TRIAGE_DAYS) {
      add('S10', `in ${TRIAGE_LANE} since ${r.opened}, ${today - dayNumber(r.opened)} days before HEAD's ${headDate}; give it a kind, severity, lane and acceptance`);
    }
  }
  return { findings, errors: findings.map(said) };
}

/**
 * isAncestor, DECISIONS and HEAD's committer date read from the git checkout at `root`.
 *
 * A sha counts as on the history when HEAD reaches it, or, while a merge is unfinished, when MERGE_HEAD does. The
 * documented way to take main into a lane is a merge commit (CLAUDE.md "Landing"). A merge that stops, on a conflict or
 * with --no-commit, is finished with `git commit`, whose pre-commit hook can run S6 on the registry in the working
 * tree while HEAD is still the lane's own tip: without the second root every closedBy sha main added read "not an
 * ancestor of HEAD", and the only way through was --no-verify. (A clean merge commits at once and runs no pre-commit
 * hook, so CI is the first place S6 reads it.) Once the merge commits, HEAD reaches MERGE_HEAD's commits and the
 * allowance has nothing left to add. It is no wider than that: a sha on a branch the merge does not take in, or on no
 * branch, is still refused, and so is every sha after `git merge --abort`. A merge is in progress when the merge-state
 * file exists, never because a ref is NAMED MERGE_HEAD. An octopus merge reads only its first merged commit; a squash
 * merge leaves no MERGE_HEAD and so no allowance.
 */
export function liveReferences(root = ROOT) {
  // A hook's GIT_DIR must not choose the repository: `root` does.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const git = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', env, maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  let mergeHead = null;
  try {
    // A merge is in progress when the merge-state file exists. `rev-parse MERGE_HEAD` alone is a name lookup that goes
    // on to refs/MERGE_HEAD, refs/tags/MERGE_HEAD and refs/heads/MERGE_HEAD, and anyone can create a tag or branch by
    // that name. `--git-path` finds the file in a linked worktree too, where the merge state is not under `root/.git`.
    if (existsSync(resolve(root, git(['rev-parse', '--git-path', 'MERGE_HEAD']).trim()))) {
      mergeHead = git(['rev-parse', '-q', '--verify', 'MERGE_HEAD']).trim() || null;
    }
  } catch {
    // A git that is failing here fails the rev-list below the same way, and a MERGE_HEAD it cannot read (-q exits 1,
    // silently, for an unreadable one) leaves the strict rule, never a looser one.
  }
  // One rev-list instead of a merge-base per sha: the set of commits HEAD reaches is what --is-ancestor asks about.
  const reachable = new Map();
  for (const sha of git(['rev-list', 'HEAD', ...(mergeHead ? [mergeHead] : [])]).split('\n')) {
    if (!sha) continue;
    const k = sha.slice(0, 7);
    if (!reachable.has(k)) reachable.set(k, []);
    reachable.get(k).push(sha);
  }
  const shallow = git(['rev-parse', '--is-shallow-repository']).trim() === 'true';
  return {
    isAncestor: (sha) => !shallow && (reachable.get(sha.slice(0, 7)) ?? []).filter((full) => full.startsWith(sha)).length === 1,
    decisionsText: readFileSync(join(root, DECISIONS), 'utf8'),
    headDate: git(['show', '-s', '--format=%cs', 'HEAD']).trim(),
    shallow,
    mergeHead,
  };
}

/**
 * Pure: compare what the sources hold against the registry.
 * @param {{name:string, items:{key:string, line:number, title:string}[]}[]} extracted
 * @param {{key:string}[]} rows
 */
export function compare(extracted, rows) {
  const keys = new Set(rows.map((r) => r.key));
  const extractedKeys = new Set(extracted.flatMap((s) => s.items.map((it) => it.key)));
  return {
    perSource: extracted.map((s) => ({
      name: s.name,
      path: s.path,
      floor: s.floor,
      total: s.items.length,
      missing: s.items.filter((it) => !keys.has(it.key)),
    })),
    unextracted: rows.filter((r) => !extractedKeys.has(r.key)),
  };
}

/** The committed floor for each source's extracted count; a source with no floor, or a floor for no source, is an error. */
export function readFloors(text) {
  const errors = [];
  let floors = {};
  try {
    floors = JSON.parse(text);
  } catch {
    return { floors: {}, errors: ['registry-floors.json: not a JSON object'] };
  }
  for (const s of SOURCES) {
    if (!Number.isInteger(floors[s.name]) || floors[s.name] < 1) errors.push(`registry-floors.json: ${s.name} has no floor (a positive integer)`);
  }
  for (const name of Object.keys(floors)) {
    if (!SOURCES.some((s) => s.name === name)) errors.push(`registry-floors.json: floor for "${name}", which is not a source; a source that leaves SOURCES takes its floor with it`);
  }
  return { floors, errors };
}

/**
 * Read the five sources and the registry under `root`. A missing source is an error: the check never runs blind.
 * `floorsText` is the floors file's text; it is read beside this script, not under `root`, so a fixture tree tests the
 * committed floors.
 */
export function harvest(root = ROOT, floorsText = readFileSync(FLOORS_FILE, 'utf8'), references = liveReferences(ROOT)) {
  const errors = [];
  const { floors, errors: floorErrors } = readFloors(floorsText);
  errors.push(...floorErrors);
  const extracted = SOURCES.map((s) => {
    const abs = join(root, s.path);
    const floor = floors[s.name];
    if (!existsSync(abs)) {
      errors.push(`${s.path}: missing. A source that leaves HEAD (plan row 32) is removed from SOURCES in the same commit.`);
      return { ...s, floor, items: [] };
    }
    const items = s.extract(readFileSync(abs, 'utf8'));
    if (items.length === 0) errors.push(`${s.path}: 0 items extracted. Either the source changed shape or the rule broke; a check over nothing is not a pass.`);
    else if (Number.isInteger(floor) && items.length < floor) {
      errors.push(
        `${s.path}: ${items.length} items extracted, below its floor of ${floor}. If items were closed or removed at the source ` +
          `on purpose, lower ${s.name} in scripts/ci/registry-floors.json in the same change; if not, a heading or row shape ` +
          'changed and an extraction rule lost them.',
      );
    }
    return { ...s, floor, items };
  });
  const regAbs = join(root, REGISTRY);
  const parsed = existsSync(regAbs) ? parseRegistry(readFileSync(regAbs, 'utf8')) : { rows: [], findings: [], errors: [`${REGISTRY}: missing`] };
  const { rows } = parsed;
  const refs = checkReferences(rows, references);
  const findings = [...parsed.findings, ...refs.findings];
  errors.push(...parsed.errors, ...refs.errors);
  const result = compare(extracted, rows);
  for (const s of result.perSource) {
    for (const m of s.missing) errors.push(`${s.path}:${m.line}: open item "${m.key}" has no row in ${REGISTRY} (${m.title.slice(0, 90)})`);
  }
  return { extracted, rows, findings, errors, ...result };
}

/** Findings counted by rule, in rule order: the line a reader reads first. */
export function countByRule(findings) {
  const counts = {};
  for (const f of findings) counts[f.rule] = (counts[f.rule] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })));
}

function main() {
  const r = harvest();
  if (process.argv.includes('--list')) {
    for (const s of r.extracted) for (const it of s.items) console.log(`${it.key}\t${s.path}:${it.line}\t${it.title}`);
    return;
  }
  const byState = (st) => r.rows.filter((row) => row.state === st).length;
  for (const s of r.perSource) {
    console.log(`  ${s.name.padEnd(12)} ${String(s.total).padStart(4)} items extracted (floor ${s.floor ?? 'none'}) from ${s.path}; ${s.missing.length} missing from the registry`);
  }
  console.log(`  registry     ${r.rows.length} rows: ${byState('open')} open, ${byState('in-flight')} in flight, ${byState('closed')} closed; ${r.unextracted.length} not produced by the rules (harvested by reading)`);
  const byRule = countByRule(r.findings);
  console.log(`  schema v2    ${r.rows.length} rows checked by S0-S11: ${r.findings.length ? Object.entries(byRule).map(([k, n]) => `${k} ${n}`).join(', ') : 'no findings'}`);
  if (r.errors.length) {
    console.error(`\n✖ registry-harvest: ${r.errors.length} problem(s)`);
    for (const e of r.errors) console.error(`  • ${e}`);
    console.error(`\nAdd a row to ${REGISTRY} for each missing item (key = the quoted key); a row is closed there with closedBy, never deleted.`);
    if (r.errors.some((e) => e.includes('repeats line'))) console.error('A repeated id after a merge: node frontend/scripts/ci/registry-dedupe.mjs keeps the copy furthest along.');
    process.exit(1);
  }
  const total = r.perSource.reduce((a, s) => a + s.total, 0);
  console.log(`✓ registry-harvest: all ${total} extracted items from ${r.perSource.length} sources have a registry row, no source is below its floor, and all ${r.rows.length} rows pass schema v2`);
}

if (import.meta.main) main();
