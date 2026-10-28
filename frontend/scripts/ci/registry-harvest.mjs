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
 * BLIND SPOTS, stated: an open item written as plain prose with none of these shapes is not extracted (the rules
 * above are what the harvest proves, and nothing wider); a row's TEXT is not compared, so a registry row can carry
 * a wrong title or status and pass; and keys made from a slug of the item's first words change when that text is
 * edited, which fails the check until the row's key is updated, the safe direction.
 *
 *   node scripts/ci/registry-harvest.mjs          check; prints each source's denominator
 *   node scripts/ci/registry-harvest.mjs --list   print every extracted item (key, line, title) as TSV
 */
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../../..');
export const REGISTRY = 'memory/registry.jsonl';

export const OWNERS = Object.freeze(['command session', 'Kevin', 'AB Command']);
export const STATUSES = Object.freeze(['open', 'in-flight', 'closed']);
export const SEVERITIES = Object.freeze(['HIGH', 'MED', 'LOW', 'unrated']);
const REQUIRED_FIELDS = Object.freeze(['id', 'key', 'source', 'title', 'owner', 'severity', 'status', 'planUnit', 'playerVisible']);

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

/** Parse the registry, one JSON object per line; a bad line or a missing field is an error, not a skip. */
export function parseRegistry(text) {
  const rows = [];
  const errors = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      errors.push(`${REGISTRY}:${i + 1}: not a JSON object`);
      return;
    }
    const missing = REQUIRED_FIELDS.filter((f) => !Object.hasOwn(row, f) || row[f] === '' || row[f] === null);
    if (missing.length) errors.push(`${REGISTRY}:${i + 1} (${row.id ?? '?'}): missing ${missing.join(', ')}`);
    if (row.owner && !OWNERS.includes(row.owner)) errors.push(`${REGISTRY}:${i + 1} (${row.id}): owner "${row.owner}" is not one of ${OWNERS.join(' / ')}`);
    if (row.status && !STATUSES.includes(row.status)) errors.push(`${REGISTRY}:${i + 1} (${row.id}): status "${row.status}" is not one of ${STATUSES.join(' / ')}`);
    if (row.severity && !SEVERITIES.includes(row.severity)) errors.push(`${REGISTRY}:${i + 1} (${row.id}): severity "${row.severity}" is not one of ${SEVERITIES.join(' / ')}`);
    if (row.status === 'closed' && !row.closedBy) errors.push(`${REGISTRY}:${i + 1} (${row.id}): closed with no closedBy (the commit or decision that closed it)`);
    if (row.playerVisible !== undefined && typeof row.playerVisible !== 'boolean') errors.push(`${REGISTRY}:${i + 1} (${row.id}): playerVisible must be true or false`);
    rows.push({ ...row, _line: i + 1 });
  });
  const ids = new Map();
  for (const r of rows) {
    if (ids.has(r.id)) errors.push(`${REGISTRY}:${r._line}: id "${r.id}" repeats line ${ids.get(r.id)}`);
    else ids.set(r.id, r._line);
  }
  return { rows, errors };
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
      total: s.items.length,
      missing: s.items.filter((it) => !keys.has(it.key)),
    })),
    unextracted: rows.filter((r) => !extractedKeys.has(r.key)),
  };
}

/** Read the five sources and the registry under `root`. A missing source is an error: the check never runs blind. */
export function harvest(root = ROOT) {
  const errors = [];
  const extracted = SOURCES.map((s) => {
    const abs = join(root, s.path);
    if (!existsSync(abs)) {
      errors.push(`${s.path}: missing. A source that leaves HEAD (plan row 32) is removed from SOURCES in the same commit.`);
      return { ...s, items: [] };
    }
    const items = s.extract(readFileSync(abs, 'utf8'));
    if (items.length === 0) errors.push(`${s.path}: 0 items extracted. Either the source changed shape or the rule broke; a check over nothing is not a pass.`);
    return { ...s, items };
  });
  const regAbs = join(root, REGISTRY);
  const { rows, errors: regErrors } = existsSync(regAbs) ? parseRegistry(readFileSync(regAbs, 'utf8')) : { rows: [], errors: [`${REGISTRY}: missing`] };
  errors.push(...regErrors);
  const result = compare(extracted, rows);
  for (const s of result.perSource) {
    for (const m of s.missing) errors.push(`${s.path}:${m.line}: open item "${m.key}" has no row in ${REGISTRY} (${m.title.slice(0, 90)})`);
  }
  return { extracted, rows, errors, ...result };
}

function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

function main() {
  const r = harvest();
  if (process.argv.includes('--list')) {
    for (const s of r.extracted) for (const it of s.items) console.log(`${it.key}\t${s.path}:${it.line}\t${it.title}`);
    return;
  }
  const byStatus = (st) => r.rows.filter((row) => row.status === st).length;
  for (const s of r.perSource) console.log(`  ${s.name.padEnd(12)} ${String(s.total).padStart(4)} items extracted from ${s.path}; ${s.missing.length} missing from the registry`);
  console.log(`  registry     ${r.rows.length} rows: ${byStatus('open')} open, ${byStatus('in-flight')} in flight, ${byStatus('closed')} closed; ${r.unextracted.length} not produced by the rules (harvested by reading)`);
  if (r.errors.length) {
    console.error(`\n✖ registry-harvest: ${r.errors.length} problem(s)`);
    for (const e of r.errors) console.error(`  • ${e}`);
    console.error(`\nAdd a row to ${REGISTRY} for each missing item (key = the quoted key), or close it there with closedBy.`);
    process.exit(1);
  }
  const total = r.perSource.reduce((a, s) => a + s.total, 0);
  console.log(`✓ registry-harvest: all ${total} extracted items from ${r.perSource.length} sources have a registry row`);
}

if (invokedDirectly()) main();
