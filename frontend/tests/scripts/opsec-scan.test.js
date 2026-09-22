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
import { describe, it, expect } from 'vitest';
import { scanText, verdict, RULES, EXEMPT } from '../../scripts/ci/opsec-scan.mjs';

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

describe('opsec-scan — the exemptions are gated (R10)', () => {
  it('exempts exactly two paths, and both have a structural reason', () => {
    expect([...EXEMPT].sort()).toEqual([
      '.claude/settings.local.json', // the designated home for machine-specific values
      'frontend/scripts/ci/opsec-scan.mjs', // contains the patterns, so it would report itself
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
