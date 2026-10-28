// The public-repo OPSEC gate's own selftest.
//
// Mutation-Proof: deleting the `home-path` rule from RULES left "detects a home path" RED
// ("expected 0 to be 1"); widening that rule's negative lookahead to also exempt a normal username left
// the same row RED; and removing the EXEMPT list made the self-exemption row RED (the scanner reports
// its own pattern table). Disjoint failures per mutation. Restored from a cp backup.
//
// DRIVEN, NOT GREPPED: scanText/verdict are exported so this runs the real matcher on synthetic text
// where the answer is known by construction, rather than asserting the source contains a regex.
//
// WHAT THIS DOES NOT CHECK: history already pushed, untracked files, or anything a third-party bot
// publishes on your behalf (Vercel's PR comment embeds the team slug and project id — outside this
// repo's control). It also deliberately does not flag the operator's first name; see the module header.
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, symlinkSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanText, verdict, RULES, EXEMPT, readForScan } from '../../scripts/ci/opsec-scan.mjs';

const ids = (f) => f.map((x) => x.rule).sort();

describe('opsec-scan — what it must refuse', () => {
  it('detects a home path, the case that actually happened', () => {
    // A third-party statusline tool injected exactly this into a TRACKED .claude/settings.json.
    const f = scanText('"command": "/Users/someone/.vibe-island/bin/chain"', 'x.json');
    expect(f.length).toBe(1);
    expect(f[0].rule).toBe('home-path');
  });

  it('detects a linux home path too', () => {
    expect(ids(scanText('/home/alice/secrets/x', 'x.sh'))).toEqual(['home-path']);
  });

  it('detects credential shapes', () => {
    expect(ids(scanText('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 'a'))).toEqual(['secret']);
    expect(ids(scanText('AKIAIOSFODNN7EXAMPLE', 'a'))).toEqual(['secret']);
    expect(ids(scanText('-----BEGIN RSA PRIVATE KEY-----', 'a'))).toEqual(['secret']);
  });

  it('detects agent attribution as a LINE-INITIAL trailer', () => {
    expect(ids(scanText('Co-Authored-By: Claude <x>', 'a'))).toEqual(['agent-attribution']);
    expect(ids(scanText('feat: thing\n\nCo-Authored-By: Claude <x>', 'a'))).toEqual(['agent-attribution']);
  });

  // THE ALLOW CASE, one match away from denying. Unanchored, this rule fired on all six places the repo
  // DOCUMENTS the ban and on zero real attributions — a gate reporting a violation by the people obeying
  // it. Prose about a trailer is never line-initial; the trailer always is.
  it('does NOT flag prose that FORBIDS the footer', () => {
    expect(scanText('- NO "Generated with" / "Co-Authored-By: Claude" footer.', 'AGENTS.md')).toHaveLength(0);
    expect(scanText('No `Generated with`/`Co-Authored-By: Claude` lines.', 'plan.md')).toHaveLength(0);
  });

  // A home path inside a COMMENT is published exactly as loudly as one in code, so unlike gate-shape
  // this scanner must NOT strip comments. If it ever starts to, this row goes red.
  it('flags a home path in a COMMENT — publication does not care about syntax', () => {
    expect(ids(scanText('// see /Users/someone/Code/thing', 'a.js'))).toEqual(['home-path']);
  });
});

describe('opsec-scan — what it must NOT refuse, so it stays enforceable', () => {
  // Every one of these is a FALSE-POSITIVE guard. A gate that cries wolf gets bypassed, and a bypassed
  // gate on a publish boundary is worse than none.
  it('does not flag CI runner paths — those are not an operator machine', () => {
    expect(scanText('/home/runner/work/Crafty/Crafty/frontend', 'ci.yml')).toHaveLength(0);
  });

  it('does not flag relative or project-relative paths', () => {
    expect(scanText('./frontend/src/x.js and ${CLAUDE_PROJECT_DIR}/.claude/h.cjs', 'a')).toHaveLength(0);
  });

  it('does not flag the operator FIRST NAME — ~196 files use it as design attribution', () => {
    expect(scanText('export const WINDUP_MS = 380; // Kevin FEEL #50 tunable', 'a.js')).toHaveLength(0);
  });

  it('does not flag an ordinary hex colour that merely looks like an acronym', () => {
    expect(scanText("color: '#CCFF33',", 'a.jsx')).toHaveLength(0);
  });
});

describe('opsec-scan — verdict shape', () => {
  it('BLOCKS on a finding and names the irreversibility', () => {
    const v = verdict(scanText('/Users/someone/x', 'a'), 1);
    expect(v.code).toBe(1);
    expect(v.line).toMatch(/force-push does NOT erase history/);
  });

  it('passes clean and emits the DENOMINATOR', () => {
    const v = verdict([], 12);
    expect(v.code).toBe(0);
    expect(v.line).toMatch(/12 file\(s\) scanned/);
  });

  // An empty STAGE is legitimately empty, so it reports SKIPPED rather than claiming a clean scan —
  // "scanned nothing" and "found nothing" must not read identically (R3a).
  it('reports SKIPPED, not a pass, when nothing was scanned', () => {
    const v = verdict([], 0);
    expect(v.skipped).toBe(true);
    expect(v.line).toMatch(/SKIPPED, not a pass/);
  });
});

describe('opsec-scan — a SYMLINK is scanned by its target string, never followed (U3)', () => {
  // A committed symlink publishes its TARGET STRING — that is what GitHub stores and shows. The CLI used to
  // `existsSync` then `statSync`, which FOLLOW the link: a link to an operator home path whose target is absent
  // (or a directory) was skipped, and a link to a file was scanned as that file's text. Neither is what ships.
  // Mutation-Proof: `lstatSync` -> `statSync` in readForScan -> the dangling-link and link-to-file rows RED.
  const dir = mkdtempSync(join(tmpdir(), 'crafty-opsec-link-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  // Assembled at runtime so this file never holds the literal.
  const home = ['', 'Users', 'someone', 'Code', 'elsewhere', 'AGENTS.md'].join('/');

  it('positive control: a regular file holding a home path is a finding', () => {
    const p = join(dir, 'plain.md');
    writeFileSync(p, `${home}\n`);
    expect(ids(scanText(readForScan(p), 'plain.md'))).toEqual(['home-path']);
  });

  it('a symlink whose target matches the home-path rule is a finding (the target need not exist)', () => {
    const link = join(dir, 'dangling-link');
    symlinkSync(home, link);
    expect(readForScan(link)).toBe(home);
    expect(ids(scanText(readForScan(link), 'link'))).toEqual(['home-path']);
  });

  it('a symlink to a FILE is read as its target string, not the file text', () => {
    const target = join(dir, 'target.md');
    writeFileSync(target, `${home}\n`); // the TEXT would be a finding; the link's target string is not
    const link = join(dir, 'to-file-link');
    symlinkSync('target.md', link);
    expect(readForScan(link)).toBe('target.md');
    expect(scanText(readForScan(link), 'link')).toEqual([]);
  });

  it('allow case, one token away: a symlink to .agent/AGENTS.md is no finding', () => {
    const link = join(dir, 'CLAUDE.md');
    symlinkSync('.agent/AGENTS.md', link);
    expect(readForScan(link)).toBe('.agent/AGENTS.md');
    expect(scanText(readForScan(link), 'CLAUDE.md')).toEqual([]);
  });

  it('a directory, or a file with a NUL byte, is not scanned (null)', () => {
    mkdirSync(join(dir, 'sub'));
    expect(readForScan(join(dir, 'sub'))).toBeNull();
    writeFileSync(join(dir, 'bin.dat'), 'a\u0000b');
    expect(readForScan(join(dir, 'bin.dat'))).toBeNull();
    expect(readForScan(join(dir, 'absent'))).toBeNull();
  });
});

describe('opsec-scan — the exemptions are gated (R10)', () => {
  // Three entries, each with the SAME structural reason rather than an ad-hoc pass: a scanner cannot
  // scan its own pattern table or its own synthetic fixtures without reporting itself, and the .local
  // file is the designated home for the machine-specific values this gate pushes people toward. A FOURTH
  // entry is a real carve-out and fails here — which is the point, since a gate's exception is where the
  // next defect lives. Learned the hard way: this gate blocked its own first push on its own fixtures.
  it('exempts exactly three paths, each for a structural reason', () => {
    expect([...EXEMPT].sort()).toEqual([
      '.claude/settings.local.json',
      'frontend/scripts/ci/opsec-scan.mjs',
      'frontend/tests/scripts/opsec-scan.test.js',
    ]);
  });

  it('every rule states WHY and a FIX — a finding nobody can act on gets ignored', () => {
    for (const r of RULES) {
      expect(r.why, `${r.id} has no why`).toBeTruthy();
      expect(r.fix, `${r.id} has no fix`).toBeTruthy();
      expect(r.severity).toBe('BLOCK');
    }
  });
});
