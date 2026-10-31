import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, V2_FIELDS, KINDS, AREAS, SEVERITIES, OWNERS, STATES, RESOLUTIONS,
} from '../../scripts/ci/registry-harvest.mjs';

// Sited in tests/scripts/: the subject is the content of the rule file a writer reads before writing a row. Its value
// lists and field table must say what the gate enforces, so the two cannot drift apart.

const MD = readFileSync(join(ROOT, '.claude/rules/registry.md'), 'utf8');
const section = (heading) => {
  const start = MD.indexOf(`\n## ${heading}\n`);
  expect(start, `the "## ${heading}" section`).toBeGreaterThan(-1);
  const end = MD.indexOf('\n## ', start + 1);
  return MD.slice(start, end < 0 ? undefined : end);
};
const ticked = (s) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

describe('.claude/rules/registry.md says what the registry gate enforces', () => {
  it('the Values section lists exactly the gate\'s enums, in its order', () => {
    const lists = Object.fromEntries([...section('Values').matchAll(/^- (\w+): (.+)$/gm)].map((m) => [m[1], ticked(m[2])]));
    expect(lists).toEqual({
      kind: [...KINDS], area: [...AREAS], severity: [...SEVERITIES], owner: [...OWNERS], state: [...STATES], resolution: [...RESOLUTIONS],
    });
  });

  it('the field table names every v2 field once, and no other', () => {
    const fields = section('A row').split('\n').filter((l) => /^\| `/.test(l)).flatMap((l) => ticked(l.split('|')[1]));
    expect(fields).toHaveLength(V2_FIELDS.length);
    expect([...fields].sort()).toEqual([...V2_FIELDS].sort());
  });

  it('the closing table has one row per resolution', () => {
    const lines = section('Closing a row').split('\n');
    const body = lines.slice(lines.findIndex((l) => /^\|-/.test(l)) + 1).filter((l) => l.startsWith('| '));
    const first = body.map((l) => l.split('|')[1].trim());
    expect(first).toEqual([...RESOLUTIONS]);
  });
});
