// registry-dedupe.mjs — collapse a row that a merge left twice in memory/registry.jsonl.
//
// The registry merges by union (.gitattributes). A row that one side edited while the other side moved it (an earlier
// union merge reordered the tail) comes out of a merge twice, and registry-harvest refuses the repeated id. This keeps
// one row per id: the copy further along (closed, then in flight, then open). Two copies at the same state must be
// identical, or it refuses and names them for a hand merge. The kept row takes the first copy's place.
//
//   node scripts/ci/registry-dedupe.mjs          rewrite the registry in place, printing what it collapsed
//   node scripts/ci/registry-dedupe.mjs --check  exit 1 if anything would collapse; write nothing
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, REGISTRY } from './registry-harvest.mjs';

const RANK = Object.freeze({ open: 0, 'in-flight': 1, closed: 2 });

/**
 * PURE. One row per id, the copy furthest along kept at the first copy's place.
 * @param {string} text the registry file
 * @returns {{text: string, collapsed: {id: string, kept: string, dropped: string}[], conflicts: string[]}}
 */
export function dedupe(text) {
  const out = [];
  const at = new Map();
  const collapsed = [];
  const conflicts = [];
  for (const line of text.split('\n')) {
    let row = null;
    try {
      row = line.trim() ? JSON.parse(line) : null;
    } catch {
      row = null;
    }
    if (!row || typeof row.id !== 'string') {
      out.push(line);
      continue;
    }
    const i = at.get(row.id);
    if (i === undefined) {
      at.set(row.id, out.length);
      out.push(line);
      continue;
    }
    const kept = JSON.parse(out[i]);
    const rNew = RANK[row.state] ?? -1;
    const rKept = RANK[kept.state] ?? -1;
    if (rNew > rKept) {
      out[i] = line;
      collapsed.push({ id: row.id, kept: row.state, dropped: kept.state });
    } else if (rNew < rKept) {
      collapsed.push({ id: row.id, kept: kept.state, dropped: row.state });
    } else if (line.trim() === out[i].trim()) {
      collapsed.push({ id: row.id, kept: kept.state, dropped: 'an identical copy' });
    } else {
      conflicts.push(row.id);
    }
  }
  return conflicts.length ? { text, collapsed: [], conflicts } : { text: out.join('\n'), collapsed, conflicts };
}

function main() {
  const path = join(ROOT, REGISTRY);
  const before = readFileSync(path, 'utf8');
  const r = dedupe(before);
  if (r.conflicts.length) {
    console.error(`✖ registry-dedupe: ${r.conflicts.length} id(s) appear twice at the same state with different text; merge each by hand:`);
    for (const id of r.conflicts) console.error(`  • ${id}`);
    process.exit(1);
  }
  for (const c of r.collapsed) console.log(`  ${c.id}: kept the ${c.kept} row, dropped ${c.dropped === 'an identical copy' ? c.dropped : `the ${c.dropped} one`}`);
  if (process.argv.includes('--check')) {
    if (r.collapsed.length) {
      console.error(`✖ registry-dedupe: ${r.collapsed.length} repeated id(s); run node frontend/scripts/ci/registry-dedupe.mjs`);
      process.exit(1);
    }
    console.log('✓ registry-dedupe: every id appears once');
    return;
  }
  if (r.text !== before) writeFileSync(path, r.text);
  console.log(`✓ registry-dedupe: ${r.collapsed.length} repeated id(s) collapsed`);
}

if (import.meta.main) main();
