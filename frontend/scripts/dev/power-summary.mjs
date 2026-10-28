#!/usr/bin/env node
/**
 * power-summary.mjs — powermetrics TEXT output to a mean and a median per rail; two logs to a B - A delta.
 * Read by scripts/dev/power-ab.sh (plan docs/superpowers/plans/2026-10-27-crafty-instruments.md, part c).
 *
 *   node scripts/dev/power-summary.mjs <powermetrics.txt>                       one arm
 *   node scripts/dev/power-summary.mjs <A/powermetrics.txt> <B/powermetrics.txt>  both arms, then B - A
 *
 * Exit 0 = summarised · 3 = COULD NOT SUMMARISE, named: a log with fewer than MIN_SAMPLES samples (powermetrics run
 * without sudo writes one error line and no samples), or with no GPU rail — the rail this A/B exists for; or, for two
 * arms, COULD NOT COMPARE: the `window:` or `scenario:` lines power-ab.sh writes into each arm's meta.txt differ (a
 * click that does not lock the pointer leaves an arm behind its resume overlay). A pair with those lines missing is
 * compared and flagged UNCHECKED.
 *
 * THE FORMAT, and how sure this is of it. `powermetrics -h` on the operator's Mac (macOS 27.0.1, M3 Max) lists the
 * cpu_power, gpu_power and thermal samplers and the text format. The line shapes parsed here — each sample opening with
 * `*** Sampled system activity (...) (N ms elapsed) ***`, `CPU Power: N mW`, `GPU Power: N mW` (printed in both the
 * processor and the GPU section when both samplers run; the GPU section's, the last, is taken),
 * `Combined Power (CPU + GPU + ANE): N mW`, and `Current pressure level: <level>` — come from three independent
 * published logs, not from a run on that Mac (it needs sudo; the agent never runs it). So the summary prints how many
 * samples it read for every rail: a format drift shows up as a short denominator, never as a silent number.
 *
 * powermetrics' own help says its power figures are ESTIMATES, not for comparing devices but fit for comparing one
 * app's builds on one machine — which is the only use here.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIN_SAMPLES = 10;
const SAMPLE_HEAD = /^\*\*\* Sampled system activity/m;

/** One record per sample: { elapsedMs, cpu, gpu, combined (mW, or null when absent), thermal (level, or null) }. */
export function parsePowermetrics(text) {
  // Everything before the first sample header is the preamble (machine model, OS, boot time), never a sample.
  return String(text).split(SAMPLE_HEAD).slice(1).map((b) => {
    const num = (re) => {
      const m = b.match(re);
      return m ? Number(m[1]) : null;
    };
    const gpu = [...b.matchAll(/^\s*GPU Power:\s*([\d.]+)\s*mW/gm)].map((m) => Number(m[1]));
    const thermal = b.match(/^\s*Current pressure level:\s*(\S+)/m);
    return {
      elapsedMs: num(/\(([\d.]+)\s*ms elapsed\)/),
      cpu: num(/^\s*CPU Power:\s*([\d.]+)\s*mW/m),
      gpu: gpu.length ? gpu[gpu.length - 1] : null,
      combined: num(/^\s*Combined Power \(CPU \+ GPU \+ ANE\):\s*([\d.]+)\s*mW/m),
      thermal: thermal ? thermal[1] : null,
    };
  });
}

/** n, mean, median, min, max over the finite values (nulls are absent samples, not zeros). */
export function stats(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x));
  if (v.length === 0) return { n: 0, mean: null, median: null, min: null, max: null };
  const s = [...v].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return { n: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length, median, min: s[0], max: s[s.length - 1] };
}

/** The per-rail stats of a parsed log, and how many samples sat at each thermal pressure level. */
export function summarise(samples) {
  const thermal = {};
  for (const s of samples) if (s.thermal) thermal[s.thermal] = (thermal[s.thermal] || 0) + 1;
  return {
    samples: samples.length,
    gpu: stats(samples.map((s) => s.gpu)),
    cpu: stats(samples.map((s) => s.cpu)),
    combined: stats(samples.map((s) => s.combined)),
    thermal,
  };
}

const RAILS = [['GPU', 'gpu'], ['CPU', 'cpu'], ['Combined', 'combined']];
const mw = (x) => (x === null ? '-' : String(Math.round(x)));
const row = (cells, widths) => cells.map((c, i) => (i === 0 ? String(c).padEnd(widths[i]) : String(c).padStart(widths[i]))).join('  ');

function describeArm(label, path, sum) {
  const lines = [`${label}: ${path}`, `  ${sum.samples} samples (per rail: ${RAILS.map(([n, k]) => `${n} ${sum[k].n}`).join(' · ')})`];
  const w = [9, 8, 9, 7, 7];
  lines.push(`  ${row(['rail', 'mean mW', 'median mW', 'min', 'max'], w)}`);
  for (const [name, k] of RAILS) {
    const s = sum[k];
    lines.push(`  ${row([name, mw(s.mean), mw(s.median), mw(s.min), mw(s.max)], w)}`);
  }
  const th = Object.entries(sum.thermal).map(([lvl, n]) => `${lvl} ${n}`).join(' · ');
  lines.push(`  thermal pressure: ${th || 'not in the log (was the thermal sampler on?)'}`);
  return lines;
}

/** Why a summarised arm cannot be used, or null. */
function unusable(path, sum) {
  if (sum.samples < MIN_SAMPLES) {
    return `COULD NOT SUMMARISE: ${path} has ${sum.samples} samples (need >= ${MIN_SAMPLES}) — is it powermetrics TEXT output, run with sudo?`;
  }
  if (sum.gpu.n === 0) return `COULD NOT SUMMARISE: ${path} has no GPU rail ("GPU Power: N mW") — was the gpu_power sampler on?`;
  if (sum.cpu.n === 0) return `COULD NOT SUMMARISE: ${path} has no CPU rail ("CPU Power: N mW") — was the cpu_power sampler on?`;
  return null;
}

/**
 * The conditions an arm ran in, from the meta.txt power-ab.sh writes beside its powermetrics.txt: `window:` (headed or
 * headless) and `scenario:` (in play with the pointer locked, or not). Either is null when its line is absent.
 */
export function armConditions(metaText) {
  const pick = (key) => {
    const m = String(metaText).match(new RegExp(`^${key}:[ \\t]*(\\S.*?)[ \\t]*$`, 'm'));
    return m ? m[1] : null;
  };
  return { window: pick('window'), scenario: pick('scenario') };
}

/**
 * Why two arms cannot be compared, or null. An arm whose click did not lock the pointer measures the game behind its
 * resume overlay; set beside an arm in play, the delta would be the overlay, not the build (review of PR #23, item 3).
 * Headed and headless differ in the renderer and the compositor as well, so the window must match too. A pair whose conditions are not both on record is compared, and `unchecked` names the arms without them.
 */
function conditionsVerdict(arms) {
  const missing = arms.filter((a) => !a.cond || a.cond.window === null || a.cond.scenario === null);
  if (missing.length) return { refuse: null, unchecked: missing.map((a) => a.path) };
  const [a, b] = arms.map((x) => x.cond);
  const diff = ['window', 'scenario'].filter((k) => a[k] !== b[k]).map((k) => `${k}: A ${a[k]}, B ${b[k]}`);
  return { refuse: diff.length ? `COULD NOT COMPARE: the arms ran in different conditions — ${diff.join('; ')}` : null, unchecked: [] };
}

/** The command. `io` is injected so a gate drives it without files or a process exit. Returns the exit code. */
export function main(argv, io = { read: (p) => readFileSync(p, 'utf8'), out: (s) => console.log(s), err: (s) => console.error(s) }) {
  const files = argv.filter((a) => !a.startsWith('-'));
  if (files.length < 1 || files.length > 2) {
    io.err('usage: node scripts/dev/power-summary.mjs <powermetrics.txt> [<second arm powermetrics.txt>]');
    return 3;
  }
  const arms = [];
  for (const path of files) {
    let text;
    try { text = io.read(path); } catch (e) { io.err(`COULD NOT SUMMARISE: cannot read ${path} — ${e.message}`); return 3; }
    const sum = summarise(parsePowermetrics(text));
    const why = unusable(path, sum);
    if (why) { io.err(why); return 3; }
    arms.push({ path, sum });
  }
  const labels = arms.length === 2 ? ['A', 'B'] : ['arm'];
  arms.forEach((a, i) => { for (const l of describeArm(labels[i], a.path, a.sum)) io.out(l); });
  if (arms.length === 2) {
    for (const a of arms) {
      try { a.cond = armConditions(io.read(join(dirname(a.path), 'meta.txt'))); } catch { a.cond = null; }
    }
    const v = conditionsVerdict(arms);
    if (v.refuse) { io.err(v.refuse); return 3; }
    if (v.unchecked.length) {
      io.err(`UNCHECKED: no window/scenario lines in meta.txt beside ${v.unchecked.join(', ')} — whether the two arms ran in the same conditions is not known`);
    } else {
      io.out(`both arms: window ${arms[0].cond.window} · scenario ${arms[0].cond.scenario}`);
    }
    const [a, b] = arms.map((x) => x.sum);
    const w = [9, 8, 8, 8, 7];
    io.out('B - A (means):');
    io.out(`  ${row(['rail', 'A mW', 'B mW', 'B-A mW', 'B-A %'], w)}`);
    for (const [name, k] of RAILS) {
      const am = a[k].mean, bm = b[k].mean;
      const d = am === null || bm === null ? null : bm - am;
      const pct = d === null || am === 0 ? '-' : `${((d / am) * 100).toFixed(1)}%`;
      io.out(`  ${row([name, mw(am), mw(bm), d === null ? '-' : (d > 0 ? '+' : '') + mw(d), pct], w)}`);
    }
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
