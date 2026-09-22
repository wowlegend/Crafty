#!/usr/bin/env node
/**
 * opsec-scan.mjs — this repo is PUBLIC. Refuse to publish an operator's machine or identity.
 *
 * WHY A GATE AND NOT A RULE. The trigger that produced this was not a person making a mistake: a
 * third-party statusline tool (`vibe-island`) rewrote `.claude/settings.json` and injected
 * `/Users/<user>/.vibe-island/bin/...` into a TRACKED file, unprompted. Its own wrapper says
 * "auto-generated, do not edit", so it will do it again the next time it runs. A convention cannot stop a
 * tool that edits your config while you are not looking; only something in the commit path can.
 *
 * WHAT IT REFUSES, and why each is scoped the way it is:
 *   HOME PATHS   — `/Users/<name>/` or `/home/<name>/` publishes the operator's username and directory
 *                  layout. The repo's own path is NOT exempt: it is the same disclosure.
 *   SECRETS      — the shapes that are catastrophic rather than embarrassing.
 *   ATTRIBUTION  — agent footers the estate forbids in git history.
 * Deliberately NOT refused: the operator's FIRST NAME. It appears in ~196 files as design attribution
 * ("Kevin-tunable") and is not sensitive; a gate that fires on it would be noise, and noise is how a gate
 * gets bypassed. Scoping a gate to what is actually dangerous is what keeps it enforceable.
 *
 * FAIL-CLOSED, on purpose (R5): it guards a PUBLISH boundary. An escape here is not recoverable by a
 * later fix — git history is permanent on a public remote, force-push does not erase it, and only a
 * support request plus deleting every fork truly does.
 *
 * SCOPE, stated because a gate's label is a claim (R9): it reads the files STAGED for commit (or, with
 * --all, every tracked file). It says NOTHING about history already pushed, about untracked files, or
 * about what a third-party bot publishes on your behalf — Vercel's PR comment embeds the team slug and
 * project id, and that is outside this repo's control.
 *
 * Exit: 0 = scanned and clean · 1 = scanned and found something · 3 = COULD NOT SCAN (control failure).
 *
 * Mutation-Proof: disabling the home-path rule's regex, and separately widening its negative lookahead
 * to exempt an ordinary username, each turned 4 assertions RED in tests/scripts/opsec-scan.test.js
 * (both home-path rows, the in-comment row, and the BLOCK verdict). Proven live both directions on a
 * staged canary: a file containing a home path and a file containing a ghp_ token each exited 1, and
 * the same file with a relative path exited 0.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export const RULES = [
  {
    id: 'home-path',
    severity: 'BLOCK',
    // A username after /Users/ or /home/. `git` and `runner` are CI-owned, not an operator's machine.
    re: /\/(?:Users|home)\/(?!runner\b|git\b)[A-Za-z0-9._-]+\//g,
    why: 'publishes the operator username and home-directory layout on a PUBLIC repo',
    fix: 'use a relative path, $HOME, or ${CLAUDE_PROJECT_DIR}; machine-specific config belongs in .claude/settings.local.json',
  },
  {
    id: 'secret',
    severity: 'BLOCK',
    re: /(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[0-9A-Za-z-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g,
    why: 'looks like a live credential — the one class where a public leak is unrecoverable',
    fix: 'remove it, ROTATE the credential (assume it is compromised the moment it is pushed), and keep it out of the tree entirely',
  },
  {
    id: 'agent-attribution',
    severity: 'BLOCK',
    // ANCHORED TO LINE START, because a git trailer is line-initial and PROSE ABOUT the rule never is.
    // Unanchored, this fired on all six places the repo DOCUMENTS the ban (`NO "Co-Authored-By: Claude"
    // footer.`) and on zero real attributions — reporting a violation by the people obeying it, which is
    // the classic anchored-to-prose defect. Matching the trailer's SHAPE, not its token, is the fix.
    re: /^(?:Co-Authored-By:\s*Claude|Claude-Session:|Generated with \[Claude)|noreply@anthropic\.com/gm,
    why: 'agent attribution in a tracked file; this estate keeps it out of git history',
    fix: 'delete the line',
  },
];

/**
 * The paths a scan must never flag: this file (it CONTAINS the patterns, so it would report itself — R6),
 * and the one local-override file that is supposed to hold machine-specific values.
 * Gated by the selftest so a third entry cannot be added quietly.
 */
export const EXEMPT = [
  'frontend/scripts/ci/opsec-scan.mjs', // contains the patterns, so it reports itself
  'frontend/tests/scripts/opsec-scan.test.js', // its FIXTURES are synthetic instances of each pattern
  '.claude/settings.local.json', // the designated home for machine-specific values
];

/** PURE. Scan one file's text; returns findings. Comments are NOT stripped — a home path in a comment
 *  is published exactly as loudly as one in code. */
export function scanText(text, file) {
  const out = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const re = new RegExp(rule.re.source, 'g');
      let m;
      while ((m = re.exec(lines[i])) !== null) {
        out.push({ file, line: i + 1, rule: rule.id, severity: rule.severity, match: m[0].slice(0, 60), why: rule.why, fix: rule.fix });
      }
    }
  }
  return out;
}

function gitFiles(all) {
  const cmd = all ? 'git ls-files' : 'git diff --cached --name-only --diff-filter=ACMR';
  return execSync(cmd, { encoding: 'utf8', cwd: REPO }).split('\n').map((s) => s.trim()).filter(Boolean);
}

export const REPO = resolve(process.cwd().includes('/frontend') ? '..' : '.');

export const LEDGER = resolve(REPO, 'frontend/tests/gates/.opsec-ledger.json');

/**
 * ACCEPTED DEBT, ratcheted. 373 home-path lines across 48 files predate this gate — mostly archived
 * audit JSON that records where files sat on the machine that produced it. A gate that reds on all of
 * them is permanently red, and a permanently-red gate becomes noise that hides the real finding behind
 * the structural one. So: existing findings are frozen per FILE, the count may FALL and never RISE, and
 * a finding in a file with NO ledger entry blocks outright.
 *
 * The SECRET and ATTRIBUTION rules are NEVER ratcheted — there are zero today (verified across all 1,902
 * commits of history), so there is no debt to grandfather, and a credential is the one class where
 * "accepted" is never the right word.
 */
export function applyRatchet(findings, ledger) {
  if (!ledger) return { blocking: findings, accepted: [] };
  const cap = ledger.files || {};
  const byFile = new Map();
  const blocking = [];
  const accepted = [];
  for (const f of findings) {
    if (f.rule !== 'home-path') { blocking.push(f); continue; } // secrets/attribution never ratchet
    const seen = (byFile.get(f.file) || 0) + 1;
    byFile.set(f.file, seen);
    if (seen <= (cap[f.file] || 0)) accepted.push(f);
    else blocking.push(f);
  }
  return { blocking, accepted };
}

/** The verdict, separated from I/O so the selftest can drive it. */
export function verdict(findings, scanned, accepted = 0) {
  // R3a — the zero-guard EXITS. "0 findings" and "scanned nothing" are the same reading from outside,
  // and only one of them is good news. A staged-file scan with an empty stage is legitimately empty, so
  // that case is reported as SKIPPED rather than as a pass.
  if (scanned === 0) {
    return { code: 0, skipped: true, line: 'opsec-scan: 0 files staged — nothing to scan (SKIPPED, not a pass)' };
  }
  const blocks = findings.filter((f) => f.severity === 'BLOCK');
  const head = `opsec-scan: ${scanned} file(s) scanned, ${findings.length} new finding(s), ${accepted} accepted (ratcheted debt)`;
  if (blocks.length === 0) return { code: 0, line: `${head}\n✓ opsec-scan: clean` };
  const body = blocks
    .map((f) => `  ✖ ${f.file}:${f.line}  [${f.rule}]  ${f.match}\n      ${f.why}\n      fix: ${f.fix}`)
    .join('\n');
  return { code: 1, line: `${head}\n${body}\n\nThis repo is PUBLIC. A push is not reversible: force-push does NOT erase history on GitHub.` };
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('opsec-scan.mjs')) {
  const all = process.argv.includes('--all');
  let files;
  try {
    files = gitFiles(all);
  } catch {
    console.error('opsec-scan: COULD NOT SCAN — git not available or not a repo');
    process.exit(3);
  }
  const findings = [];
  let scanned = 0;
  for (const f of files) {
    if (EXEMPT.includes(f)) continue;
    const p = resolve(REPO, f);
    if (!existsSync(p)) continue;
    const st = statSync(p);
    if (!st.isFile() || st.size > 2_000_000) continue; // skip binaries/large blobs (baseline PNGs)
    let text;
    try {
      text = readFileSync(p, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\u0000')) continue; // binary
    scanned += 1;
    findings.push(...scanText(text, f));
  }
  let ledger = null;
  try { ledger = JSON.parse(readFileSync(LEDGER, 'utf8')); } catch { /* absent -> nothing ratcheted */ }
  if (process.argv.includes('--write')) {
    const per = {};
    for (const f of findings) if (f.rule === 'home-path') per[f.file] = (per[f.file] || 0) + 1;
    const body = { _README: 'Accepted home-path debt, per file. MAY FALL, NEVER RISE. Secrets and agent attribution are never ratcheted. Regenerate: node scripts/ci/opsec-scan.mjs --all --write', _total: Object.values(per).reduce((a, b) => a + b, 0), _files: Object.keys(per).length, files: Object.fromEntries(Object.entries(per).sort()) };
    writeFileSync(LEDGER, `${JSON.stringify(body, null, 2)}\n`);
    console.log(`opsec-scan: froze ${body._total} accepted home-path line(s) across ${body._files} file(s)`);
    process.exit(0);
  }
  const { blocking, accepted } = applyRatchet(findings, ledger);
  const v = verdict(blocking, scanned, accepted.length);
  console.log(v.line);
  process.exit(v.code);
}
