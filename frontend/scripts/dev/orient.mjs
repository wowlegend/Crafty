#!/usr/bin/env node
/**
 * orient — the state a cold agent needs before its first edit, read live, never from prose.
 *
 * Prints: HEAD; main as GitHub has it (`git ls-remote`, so a checkout that has not fetched is not mistaken for current),
 * with any drift of the local `origin/main` and `main` refs from it; the CI verdict for that main and for HEAD; the sha
 * the live Production deployment serves, and whether it is main; open PRs with their `ci ok`; worktrees whose branch
 * holds commits main does not; the cursor's heading, task table and Next paragraph; and the registry's counts: by state
 * and owner, then the open work by kind and severity, what waits on Kevin, triage and its overdue rows, orphans, and the
 * count of backlog rows not updated in 60 days, which are re-read and never closed on age. Each source that cannot be
 * read (no git, no `gh`, no network, not authenticated) prints why on its own line, and the report exits 0, because
 * orientation that crashes orients no one. `--registry` is a lookup, not the report: an unreadable registry or a field
 * it cannot group by exits 2.
 *
 * A CI verdict is green only when the newest completed `ci.yml` run on that sha concluded `success`. GitHub reports a
 * job that hit its own time limit as `cancelled`, the same word as a superseded run, so `cancelled`, `timed_out`,
 * `skipped` and "no run" all print as NOT GREEN.
 *
 *   cd frontend && npm run orient          print the report for this checkout
 *   node scripts/dev/orient.mjs --root=<dir>   the same for another tree (a copy with no .git reports that)
 *   npm run orient -- --registry <lane|kind|area|owner>
 *                                          the open rows grouped by that field, HIGH first: the search to run before
 *                                          writing a row (.claude/rules/registry.md); no network, no git
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const TIMEOUT_MS = 20_000;
const SEVERITY_ORDER = Object.freeze(['HIGH', 'MED', 'LOW', 'unrated']);
const TRIAGE_DAYS = 7;
const BACKLOG_STALE_DAYS = 60;
export const VIEW_FIELDS = Object.freeze(['lane', 'kind', 'area', 'owner']);
const days = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
// Code-point order, so a view reads the same under every locale.
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function parseRows(text) {
  const rows = [];
  let bad = 0;
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      bad += 1;
    }
  }
  return { rows, bad };
}

/**
 * PURE: counts from `memory/registry.jsonl` text. By state, and open rows by owner; then the open and in-flight WORK
 * rows (every kind but lane) by kind and severity, those owned by Kevin, those in LANE:triage and how many are past its
 * 7 days, the orphans (a work row whose lane is missing, not a lane, or closed) and the LANE:backlog rows not updated in
 * 60 days. `today` (YYYY-MM-DD) dates the last two; without it they are 0. A bad line is counted, not thrown.
 */
export function registryCounts(text, { today } = {}) {
  const { rows, bad } = parseRows(text);
  const out = {
    rows: rows.length, open: 0, inFlight: 0, closed: 0, other: 0, bad, openByOwner: {},
    lanes: 0, work: 0, workByKind: {}, workBySeverity: {}, waitingOnKevin: 0, triage: 0, triageOverdue: 0, orphans: 0, staleBacklog: 0,
  };
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const row of rows) {
    if (row.state === 'open') {
      out.open += 1;
      bump(out.openByOwner, row.owner || '?');
    } else if (row.state === 'in-flight') out.inFlight += 1;
    else if (row.state === 'closed') out.closed += 1;
    else out.other += 1;
    if (row.state !== 'open' && row.state !== 'in-flight') continue;
    if (row.kind === 'lane') {
      out.lanes += 1;
      continue;
    }
    out.work += 1;
    bump(out.workByKind, row.kind || '?');
    bump(out.workBySeverity, row.severity || '?');
    if (row.owner === 'Kevin') out.waitingOnKevin += 1;
    const lane = byId.get(row.lane);
    if (!lane || lane.kind !== 'lane' || lane.state === 'closed') out.orphans += 1;
    if (row.lane === 'LANE:triage') {
      out.triage += 1;
      if (today && row.opened && days(today) - days(row.opened) > TRIAGE_DAYS) out.triageOverdue += 1;
    }
    if (today && row.lane === 'LANE:backlog' && row.updated && days(today) - days(row.updated) > BACKLOG_STALE_DAYS) out.staleBacklog += 1;
  }
  return out;
}

/** PURE: the registry lines of the report, from registryCounts. */
export function registryLines(c) {
  const owners = Object.entries(c.openByOwner).map(([o, n]) => `${o} ${n}`).join(', ');
  const list = (o, order) => Object.entries(o).sort(([a, x], [b, y]) => (order ? order.indexOf(a) - order.indexOf(b) : y - x || byText(a, b))).map(([k, n]) => `${k} ${n}`).join(', ');
  return [
    `registry    memory/registry.jsonl: ${c.rows} rows: ${c.open} open (${owners}), ${c.inFlight} in flight, ${c.closed} closed${c.bad ? `, ${c.bad} unparseable` : ''}`,
    `            open work: ${c.work} rows in ${c.lanes} lanes; ${list(c.workByKind) || 'none'}; ${list(c.workBySeverity, SEVERITY_ORDER) || 'none'}`,
    `            waiting on Kevin ${c.waitingOnKevin}; triage ${c.triage} (${c.triageOverdue} overdue); orphans ${c.orphans}; backlog rows not updated in ${BACKLOG_STALE_DAYS} days ${c.staleBacklog}`,
  ];
}

/**
 * PURE: the open and in-flight work rows grouped by `field` (lane, kind, area or owner). Groups run from the one with
 * the most severe row down, then by size; rows inside a group run HIGH first. Grouped by lane, a group's heading carries
 * the lane row's own title and state.
 */
export function registryView(text, field) {
  if (!VIEW_FIELDS.includes(field)) throw new Error(`--registry takes one of ${VIEW_FIELDS.join(', ')}, not "${field}"`);
  const { rows } = parseRows(text);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const rank = (r) => { const i = SEVERITY_ORDER.indexOf(r.severity); return i < 0 ? SEVERITY_ORDER.length : i; };
  const groups = new Map();
  for (const r of rows) {
    if ((r.state !== 'open' && r.state !== 'in-flight') || r.kind === 'lane') continue;
    const k = r[field] ?? '(none)';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const sorted = [...groups].map(([k, list]) => [k, list.sort((a, b) => rank(a) - rank(b) || byText(a.id, b.id))])
    .sort(([a, x], [b, y]) => rank(x[0]) - rank(y[0]) || y.length - x.length || byText(a, b));
  const total = sorted.reduce((n, [, list]) => n + list.length, 0);
  const out = [`registry by ${field}: ${total} open work rows in ${sorted.length} groups, the most severe first`];
  for (const [k, list] of sorted) {
    const lane = field === 'lane' && byId.get(k)?.kind === 'lane' ? byId.get(k) : null;
    out.push('', `${k} (${list.length})${lane ? `: ${lane.title} [${lane.state}]` : field === 'lane' ? ': NOT A LANE ROW' : ''}`);
    for (const r of list) out.push(`  ${String(r.severity ?? '?').padEnd(7)} ${r.id}${r.state === 'in-flight' ? ' [in flight]' : ''}  ${r.title}`);
  }
  return out;
}

/** PURE: the cursor's heading (its first `## ` line), every task-table row (separator rows dropped) and its Next paragraph. */
export function cursorSummary(md) {
  const lines = String(md).split('\n');
  const start = lines.findIndex((l) => /^## /.test(l));
  if (start < 0) return [];
  const body = lines.slice(start + 1);
  const out = [lines[start], ...body.filter((l) => /^\|/.test(l) && !/^\|[\s:|-]+\|\s*$/.test(l))];
  const next = body.findIndex((l) => /^\*\*Next:?\*\*/.test(l));
  for (let j = next; next >= 0 && j < body.length && body[j].trim(); j += 1) out.push(body[j]);
  return out;
}

/** PURE: the main line: GitHub's main, and how the local refs differ from it. Shas are full or null. */
export function mainLine({ remote, tracking, local, why }) {
  const s = (sha) => sha.slice(0, 10);
  if (!remote) return `main        GitHub's main not read (${why || 'unknown'}); the local origin/main ${tracking ? s(tracking) : 'is absent'} may be stale`;
  const drift = [];
  if (tracking && tracking !== remote) drift.push(`local origin/main is ${s(tracking)}, run git fetch`);
  if (!tracking) drift.push('no local origin/main');
  if (local && local !== remote) drift.push(`local main is ${s(local)}`);
  return `main        ${s(remote)} on GitHub; ${drift.length ? `DRIFT: ${drift.join('; ')}` : 'the local refs match'}`;
}

/** PURE: what the production line adds about main: equal, or the drift between them. */
export function productionNote(prod, main) {
  if (!prod || !main) return '';
  return prod === main ? '; this is main' : `; DRIFT: main is ${main.slice(0, 10)}, so its deploy is pending, failed or not triggered`;
}

/** PURE: `git worktree list --porcelain` -> [{ path, branch|null, head }]. */
export function parseWorktrees(porcelain) {
  const out = [];
  let cur = null;
  for (const line of String(porcelain).split('\n')) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice(9), branch: null, head: null };
      out.push(cur);
    } else if (cur && line.startsWith('HEAD ')) cur.head = line.slice(5);
    else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '');
  }
  return out;
}

/**
 * PURE: the verdict for one sha from `gh run list --json headSha,status,conclusion,databaseId,url,createdAt` output.
 * Only the newest COMPLETED run counts, and only `success` is green.
 */
export function ciVerdict(runs, sha) {
  const mine = (runs || []).filter((r) => !sha || r.headSha === sha);
  if (mine.length === 0) return { green: false, text: 'NOT GREEN: no ci.yml run on this sha' };
  const sorted = [...mine].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const running = sorted.find((r) => r.status !== 'completed');
  const done = sorted.find((r) => r.status === 'completed');
  if (!done) return { green: false, text: `NOT GREEN: run ${running.databaseId} still ${running.status}`, url: running.url };
  const green = done.conclusion === 'success';
  const pending = running && String(running.createdAt) > String(done.createdAt) ? `; a newer run ${running.databaseId} is ${running.status}` : '';
  return {
    green,
    text: `${green ? 'GREEN' : 'NOT GREEN'}: run ${done.databaseId} concluded ${done.conclusion || 'with no conclusion'}${pending}`,
    url: done.url,
  };
}

/** PURE: one PR line from `gh pr list --json number,title,headRefName,statusCheckRollup`. */
export function prLine(pr) {
  const checks = pr.statusCheckRollup || [];
  const ok = checks.find((c) => c.name === 'ci ok');
  const verdict = !ok ? 'ci ok: no check yet' : ok.status && ok.status !== 'COMPLETED' ? `ci ok: ${ok.status.toLowerCase()}` : `ci ok: ${String(ok.conclusion || '?').toLowerCase()}`;
  return `#${pr.number} ${pr.title} (${pr.headRefName}) ${verdict}`;
}

/** PURE: the newest Production deployment whose newest status is `success`. */
export function liveProduction(deployments) {
  const ok = (deployments || []).find((d) => d.state === 'success');
  return ok ? { sha: ok.sha, at: ok.createdAt, url: ok.url } : null;
}

function run(cmd, args, cwd) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { cwd, encoding: 'utf8', timeout: TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    const why = e.code === 'ENOENT' ? `${cmd} is not installed` : e.signal === 'SIGTERM' ? `${cmd} timed out` : String(e.stderr || e.message).trim().split('\n')[0];
    return { ok: false, why };
  }
}

const gitIn = (root) => (args) => run('git', ['-C', root, ...args], root);

function repoSlug(git) {
  const r = git(['remote', 'get-url', 'origin']);
  const m = r.ok && r.out.trim().match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/);
  return m ? m[1] : null;
}

function ghJson(args, cwd) {
  const r = run('gh', args, cwd);
  if (!r.ok) return { ok: false, why: r.why };
  try {
    return { ok: true, data: JSON.parse(r.out) };
  } catch {
    return { ok: false, why: 'gh printed no JSON' };
  }
}

async function productionSha(slug) {
  try {
    const api = `https://api.github.com/repos/${slug}/deployments`;
    const list = await fetch(`${api}?environment=Production&per_page=5`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!list.ok) return { why: `GitHub API ${list.status}` };
    const deployments = [];
    for (const d of await list.json()) {
      const st = await fetch(`${api}/${d.id}/statuses?per_page=1`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const [latest] = st.ok ? await st.json() : [];
      deployments.push({ sha: d.sha, createdAt: d.created_at, state: latest?.state, url: latest?.environment_url });
      if (latest?.state === 'success') break;
    }
    return liveProduction(deployments) || { why: 'no Production deployment with a success status in the newest five' };
  } catch (e) {
    return { why: `public read failed (${e.name === 'TimeoutError' ? 'timed out' : e.message})` };
  }
}

export async function report(root = ROOT) {
  const lines = [`orient: ${root}`];
  const git = gitIn(root);
  const inGit = git(['rev-parse', '--is-inside-work-tree']);
  const slug = inGit.ok ? repoSlug(git) : null;

  let main = null;
  if (!inGit.ok) lines.push('HEAD        not a git checkout here, so HEAD, CI, PRs and worktrees cannot be read');
  else {
    const head = git(['log', '-1', '--format=%H %s']).out?.trim() || '?';
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out?.trim();
    const dirty = (git(['status', '--porcelain']).out || '').split('\n').filter(Boolean).length;
    lines.push(`HEAD        ${head.slice(0, 10)} ${head.slice(41)} (branch ${branch}; ${dirty ? `${dirty} uncommitted path(s)` : 'clean'})`);
    const tracking = git(['rev-parse', '--verify', '--quiet', 'origin/main']).out?.trim() || null;
    const local = git(['rev-parse', '--verify', '--quiet', 'refs/heads/main']).out?.trim() || null;
    const ls = git(['ls-remote', 'origin', 'refs/heads/main']);
    const remote = ls.ok ? ls.out.trim().split(/\s+/)[0] || null : null;
    lines.push(mainLine({ remote, tracking, local, why: ls.ok ? 'origin has no main' : ls.why }));
    main = remote || tracking || local;
    const headSha = head.slice(0, 40);
    for (const [label, sha] of [['main CI', main], ['HEAD CI', headSha !== main ? headSha : null]]) {
      if (!sha) continue;
      const r = ghJson(['run', 'list', '--workflow=ci.yml', `--commit=${sha}`, '--limit=10', '--json', 'headSha,status,conclusion,databaseId,url,createdAt'], root);
      const v = r.ok ? ciVerdict(r.data, sha) : { text: `unknown: ${r.why}` };
      lines.push(`${label.padEnd(11)} ${sha.slice(0, 10)} ${v.text}${v.url ? ` ${v.url}` : ''}`);
    }
  }

  if (!slug) lines.push('production  unknown: no GitHub remote here to read deployments from');
  else {
    const p = await productionSha(slug);
    lines.push(p.sha ? `production  ${p.sha.slice(0, 10)} live since ${p.at} (GitHub deployments, environment Production)${productionNote(p.sha, main)}` : `production  unknown: ${p.why}`);
  }

  if (inGit.ok) {
    const prs = ghJson(['pr', 'list', '--state=open', '--limit=30', '--json', 'number,title,headRefName,statusCheckRollup'], root);
    if (!prs.ok) lines.push(`open PRs    unknown: ${prs.why}`);
    else lines.push(`open PRs    ${prs.data.length}`, ...prs.data.map((pr) => `  ${prLine(pr)}`));

    const base = git(['rev-parse', '--verify', '--quiet', 'origin/main']).ok ? 'origin/main' : 'main';
    const trees = parseWorktrees(git(['worktree', 'list', '--porcelain']).out || '');
    const ahead = trees
      .filter((t) => t.branch && t.branch !== 'main')
      .map((t) => ({ ...t, n: Number(git(['rev-list', '--count', `${base}..${t.branch}`]).out?.trim() || 0) }))
      .filter((t) => t.n > 0);
    lines.push(`worktrees   ${ahead.length} of ${trees.length} hold commits ${base} does not`, ...ahead.map((t) => `  ${t.branch} +${t.n} ${t.path}`));
  }

  const plan = join(root, 'memory/ACTIVE_PLAN.md');
  lines.push('cursor      memory/ACTIVE_PLAN.md');
  if (existsSync(plan)) lines.push(...cursorSummary(readFileSync(plan, 'utf8')).map((l) => `  ${l}`));
  else lines.push('  (missing)');

  const reg = join(root, 'memory/registry.jsonl');
  if (existsSync(reg)) {
    // The triage and backlog clocks read HEAD's committer date, as the registry gate does; without git, today's date.
    const today = (inGit.ok && git(['show', '-s', '--format=%cs', 'HEAD']).out?.trim()) || new Date().toISOString().slice(0, 10);
    lines.push(...registryLines(registryCounts(readFileSync(reg, 'utf8'), { today })));
  } else lines.push('registry    memory/registry.jsonl missing');
  return lines.join('\n');
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const arg = argv.find((a) => a.startsWith('--root='));
  const root = arg ? resolve(arg.slice(7)) : ROOT;
  const at = argv.indexOf('--registry');
  if (at >= 0) {
    try {
      console.log(registryView(readFileSync(join(root, 'memory/registry.jsonl'), 'utf8'), argv[at + 1]).join('\n'));
    } catch (e) {
      console.error(`orient: ${e.message}`);
      process.exit(2);
    }
  } else report(root).then(
    (text) => console.log(text),
    (e) => console.log(`orient: failed to build the report (${e.message})`),
  );
}
