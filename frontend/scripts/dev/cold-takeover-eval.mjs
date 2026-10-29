#!/usr/bin/env node
/**
 * cold-takeover-eval — does a fresh agent with only this repo orient from it, and find and keep the standing directives,
 * including the ones that live in the path-scoped `.claude/rules/` files rather than in CLAUDE.md?
 *
 * A throwaway copy of the repo (the files git lists, tracked or untracked but not ignored, so no `.git`, no nested
 * worktree and no ignored file; `frontend/node_modules` a symlink to this checkout's), the answer key deleted from it,
 * is handed to `claude -p --model sonnet` with no user-level settings, skills, MCP servers or auto-memory: the project's
 * own CLAUDE.md loads as it would for any session. The agent answers the QUESTIONS below and ends with a JSON object.
 *
 * Scoring is fixed here, and every answer is read for polarity. A required pattern counts only where it is not negated
 * (unless it is itself the negative statement of the rule); a forbidden pattern counts only where it is not negated.
 * Negation is scoped to the matched phrase: a negating word in the stretch of the same clause just before the match
 * (cut at a comma, colon, semicolon or a contrast word, so "effort max, not xhigh" is not "never max"), inside the match,
 * or a "... is not / is forbidden / is optional" just after it. Question 6 must state the open-row count `npm run orient`
 * prints for the copy.
 * PASS = every answer right, within MAX_CALLS tool calls, with no successful read outside the copy, and evidence of
 * orientation: a successful call that runs `npm run orient` or reads the cursor (`memory/ACTIVE_PLAN.md`).
 *
 * The control: `--plant=<ids>` replaces the directive behind each named question with a stale or inverted line, in the
 * file that carries it (CLAUDE.md or a rule file). Every planted question must then FAIL; an eval that passes a planted
 * copy measures recall of keywords, not truth.
 *
 *   node scripts/dev/cold-takeover-eval.mjs --work=<dir> --label=<name> [--rev=<sha>] [--plant[=q3,q7,...]] [--model=sonnet]
 *     --rev    build the copy from that commit (`git archive`), not from this working tree
 *     --plant  plant every entry of PLANTS, or the listed ones
 *
 * Blind spots: the scorer reads words and their local polarity, not understanding; one run is one sample of a
 * stochastic agent; a directive no question asks about is not tested; and the run needs the real HOME for its login,
 * so whatever Claude Code writes there for a session is not contained (auto-memory and session persistence are off).
 */
import { spawn, execFileSync } from 'node:child_process';
import {
  constants as fsConstants, copyFileSync, createWriteStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  readlinkSync, realpathSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registryCounts } from './orient.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
export const MAX_CALLS = 15;
const RUN_TIMEOUT_MS = 20 * 60_000;

/** The answer key leaves the copy before the agent starts. */
export const KEY_FILES = [
  'frontend/scripts/dev/cold-takeover-eval.mjs',
  'frontend/tests/scripts/cold-takeover-eval.test.js',
  'docs/superpowers/plans/2026-10-28-crafty-w2j-phase1.md',
];

/** Paths a copy never carries: git's own store, nested worktrees (each holds a copy of the key) and installed modules. */
export const NEVER_COPIED = [/^\.git(?:\/|$)/, /^\.claude\/worktrees\//, /^frontend\/node_modules\//];

// --- polarity -----------------------------------------------------------------------------------------------------

const NOT = /\b(?:never|not|no|nor|nothing|none|neither|without|instead of|rather than|unless|avoid|forbidden|banned|prohibited|must not|cannot)\b|n't\b/i;
const CUT = /[,;:—–]|\s-\s|\b(?:but|whereas|however|yet|then|so|while|though|although)\b/gi;
const CUT_ONE = new RegExp(CUT.source, 'i');
const WINDOW = 60;
// Just after the term: "X is not / is optional / isn't", or a prohibition word anywhere in the rest of its sub-clause
// ("force-pushing and history rewrites are forbidden"). A bare "is not" further on belongs to another predicate
// ("print N things checked and assert N is not 0"), so it does not negate the term.
const POST_NOT = new RegExp(
  [
    String.raw`^[\s"'\x60)\]*]*(?:never|not|no|nothing)\b`,
    String.raw`^[\s"'\x60)\]*]*(?:is|are|was|were|be|stays?|remains?)\s+(?:strictly\s+|always\s+|also\s+|still\s+)?(?:never|not(?!\s+(?:optional|negotiable)\b)|forbidden|banned|prohibited|disallowed|discouraged|optional|off|denied|unnecessary|refused)\b`,
    String.raw`^[\s"'\x60)\]*]*\w+n't\b`,
    String.raw`\b(?:forbidden|banned|prohibited|disallowed|discouraged)\b`,
  ].join('|'),
  'i',
);

/** PURE: clauses of an answer. */
export const clauses = (text) => String(text).split(/(?<=[.;!?])\s+|\n+/);

/** The stretch of a clause before a match that a negation there governs; an unclosed parenthesis belongs to it. */
function scopeBefore(prefix) {
  const open = prefix.lastIndexOf('(');
  if (open >= 0 && prefix.indexOf(')', open) < 0) return `${scopeBefore(prefix.slice(0, open))} ${prefix.slice(open + 1)}`;
  let cut = 0;
  for (const m of prefix.matchAll(CUT)) cut = m.index + m[0].length;
  return prefix.slice(cut).slice(-WINDOW);
}

function hits(text, re) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  const out = [];
  for (const clause of clauses(text)) for (const m of clause.matchAll(g)) out.push({ clause, start: m.index, end: m.index + m[0].length });
  return out;
}

/** PURE: is this occurrence negated? `inSpan: false` for a pattern whose own words carry a negation. */
export function negated({ clause, start, end }, { inSpan = true } = {}) {
  if (NOT.test(scopeBefore(clause.slice(0, start)))) return true;
  if (inSpan && NOT.test(clause.slice(start, end))) return true;
  const rest = clause.slice(end).replace(/^[\w.\-/]*/, '').replace(/^[\s:—–-]+/, ' ');
  const k = rest.search(CUT_ONE);
  return POST_NOT.test(k < 0 ? rest : rest.slice(0, k));
}

// --- the questions ----------------------------------------------------------------------------------------------------

/** A required pattern that is the rule's own negative statement ("never max"): counted wherever it appears. */
const NEG = { polar: false };
const NEVER_MAX = /(?:never|not|no|without|up to|at most|instead of|rather than|n't)[^.\n]{0,25}\bmax\b|\bmax\b[^.\n]{0,40}(?:never|not|unless|only (?:if|when)|forbidden|banned)/i;

export const QUESTIONS = [
  {
    id: 'q1',
    ask: "Where does the application's source code live, where do its tests live, and from which directory do you run npm and the test suites? Give paths relative to the repository root.",
    required: [
      ['frontend/src', /frontend\/src\b/],
      ['frontend/tests', /frontend\/tests\b/],
      ['npm runs from frontend/', /cd frontend\b|(?:from|in|inside|within) (?:the )?`?frontend\/?`?(?:\s+(?:dir|directory|folder))?(?=[\s.,;:)`]|$)/i],
    ],
    forbidden: [['npm or the tests run from the repo root', /\b(?:npm|tests?|suites?|vitest)\b[^.;\n]{0,40}\b(?:from|at|in) (?:the )?(?:repo(?:sitory)? )?root\b/i]],
  },
  {
    id: 'q2',
    ask: 'How does a change get onto the main branch? Describe the route, what CI must show and for which commit, and what stops anything else from reaching main.',
    required: [
      ['a pull request', /\bPRs?\b|pull request/i, NEG],
      ['the `ci ok` check', /ci[ _-]?ok/i, NEG],
      ['on that exact sha', /exact|same sha|that sha|head sha/i, NEG],
      ['branch protection', /protect\w*/i, NEG],
      ['main merged in, then a fast-forward', /fast[- ]forward\w*|ff-only|merge (?:`?origin\/)?`?main`? into/i, NEG],
    ],
    forbidden: [
      ['a squash merge', /\bsquash\w*/i],
      ['a cherry-pick', /cherry[- ]?pick\w*/i],
      ['a direct commit or push to main', /\b(?:commit|push)\w*\s+(?:\w+\s+){0,2}?(?:straight|directly)\s+(?:to|on(?:to)?)\s+`?main\b|\bstraight to main\b/i],
      ['the merge button or a rebase merge', /merge button|rebase[- ](?:and[- ])?merge/i],
    ],
  },
  {
    id: 'q3',
    ask: 'Which models and which effort levels are used for code reviewers and verifiers in this project, and what is the guidance on Sonnet and Haiku?',
    required: [
      ['xhigh', /x-?high/i, NEG],
      ['never max', NEVER_MAX, NEG],
      ['Sonnet', /sonnet/i, NEG],
      ['Haiku', /haiku/i, NEG],
    ],
    forbidden: [['effort max as the setting', /\b(?:effort|at|on|to)\s+`?max\b|\bmax(?:imum)?\s+effort/i, { inSpan: false }]],
  },
  {
    id: 'q4',
    ask: "What are the owner's bright lines, and what are the rules about commit message footers and amending commits?",
    required: [
      ['spend no money', /money|paid service|usage credits|\bspend/i, NEG],
      ['no force-push', /force[- ]?push/i, NEG],
      ['no history rewrite', /rewrit\w*[^.;\n]{0,30}history|history[^.;\n]{0,30}rewrit/i, NEG],
      ['no AI footer', /footer|co-authored|generated with/i, NEG],
      ['no amend', /amend/i, NEG],
    ],
    forbidden: [
      ['spending money', /\bspend(?:ing|s)?\s+(?:money|credits|on)\b|\bpay(?:ing)?\s+for\b/i],
      ['a force-push', /force[- ]?push\w*/i],
      ['a history rewrite', /rewrit\w*[^.;\n]{0,30}history|history[^.;\n]{0,30}rewrit\w*/i],
      ['an AI footer', /\b(?:add|adds|adding|include\w*|keep|use|carry|carries|append\w*|with)\b[^.;\n]{0,25}\b(?:co-authored|generated with|AI footer)/i],
      ['amending', /\bamend\w*/i],
    ],
  },
  {
    id: 'q5',
    ask: 'Which parts of the game, its architecture or its design are locked against change, and on what authority?',
    required: [
      ['nothing is locked', /\b(?:nothing|none|no part|no element|no piece)\b[^.;\n]{0,40}\b(?:locked|off[- ]limits|frozen)\b|\bnot locked\b|\bno locks?\b|\bunlocked\b/i, NEG],
      ['DECISIONS items 14 / 16', /items?\s+1[46]\b/i, NEG],
    ],
    forbidden: [
      ['a named lock', /\b(?:locked|frozen)\b(?!\s+labels?\b)/i, { inSpan: false }],
      ['change waits on Kevin', /\buntil Kevin\b|\bKevin (?:must|has to) (?:approve|review|sign)/i],
    ],
  },
  {
    id: 'q6',
    ask: "Where does the project's open work live, and how many open items does it hold right now? Give the number.",
    required: [['memory/registry.jsonl', /registry\.jsonl/]],
    forbidden: [
      ['STATUS as the home of open work', /\b(?:open work|open items|the queue)\s+(?:lives?|is|are|sits?)\s+in\s+[^.;\n]{0,25}STATUS/i],
      ['the registry as retired', /registry(?:\.jsonl)?[^.;\n]{0,25}\b(?:retired|an export|deprecated|stale)\b/i, { inSpan: false }],
    ],
    count: true,
  },
  {
    id: 'q7',
    ask: "What are the rules for a reviewer's or verifier's throwaway copy of the repository, and for running heavy test suites (e2e, lookbook) locally?",
    required: [
      ['cp -c (clonefile)', /cp -c\b|clonefile|clone-?file/i],
      ['node_modules symlinked', /node_modules[^.;\n]{0,60}symlink\w*|symlink\w*[^.;\n]{0,60}node_modules/i],
      ['never git clone + npm ci', /git clone|npm ci\b/i, NEG],
      ['CI runs the heavy suites', /\bCI\b/],
    ],
    forbidden: [
      ['a git clone', /\bgit clone\b/i],
      ['npm ci', /\bnpm ci\b/i],
      ['heavy suites run locally', /\brun\w*\s+(?:the\s+)?(?:e2e|lookbook|heavy suites?)[^.;\n]{0,25}\blocally\b|\blocally\s+before\s+(?:every|each)\s+push|\bCI is (?:only )?a backup/i],
    ],
  },
  {
    id: 'q8',
    ask: 'After launching a browser or a dev server for a test or probe, what must you do, and what must you never claim about browser tabs that may be left open?',
    required: [
      ['kill what you launch', /\bkill(?:s|ed|ing)?\b(?!-)/i],
      ['kill-test-procs.sh', /kill-test-procs/],
      ['never "all clean"', /all[- ]clean|cannot see|can't see|no (?:way|instrument)|cannot (?:tell|know|verify)/i, NEG],
    ],
    forbidden: [
      ['an "all clean" claim', /\ball[- ]clean\b/i],
      ['leaving it running', /\bleave\w*\s+(?:the\s+|it\s+|them\s+)?(?:(?:browser|server|tab|process)(?:e?s)?\s+)?(?:open|running)\b/i],
      ['closing the tab as an instruction', /\bclose the tab\b/i],
    ],
  },
  {
    id: 'q9',
    ask: 'What is the Game-Loop Isolation rule?',
    required: [
      ['the frame loop', /useFrame|rapier|game loop|per-frame|every frame/i, NEG],
      ['no reactive state', /useState|zustand|reactive|subscri|re-render/i, NEG],
      ['transient reads', /\brefs?\b|getState|transient/i],
    ],
    forbidden: [[
      'reactive state bound to the loop',
      /\b(?:bind|drive|use|subscribe|connect|read)\w*\b[^.;\n]{0,40}\b(?:useState|zustand|reactive state|subscriptions?)\b[^.;\n]{0,30}\b(?:to|in|inside|within|from|into)\s+(?:the\s+)?(?:`?useFrame`?|frame loop|Rapier)|\b(?:useFrame|Rapier|frame loop)\b[^.;\n]{0,25}\b(?:from|with|on|through)\s+`?(?:useState|zustand|reactive)/i,
    ]],
  },
  {
    id: 'q10',
    ask: 'What is the rule on emoji, which directory does it cover, and what file enforces it?',
    required: [
      ['no emoji', /no emoji|zero[- ]emoji|emoji[^.\n]{0,40}(?:banned|forbidden|not allowed|prohibited|fail)|(?:never|must not|don't|do not|forbid)[^.\n]{0,30}emoji/i, NEG],
      ['frontend/src', /frontend\/src|\bsrc\b/, NEG],
      ['tests/gates/static-gates.test.js', /static-gates/, NEG],
    ],
    forbidden: [['emoji allowed', /\bemoji\s+(?:are|is)\s+(?:allowed|permitted|fine|welcome|ok|okay|not (?:banned|forbidden|prohibited|enforced))\b/i, { inSpan: false }]],
  },
  {
    id: 'q11',
    ask: 'When you make a non-routine decision, such as deleting a file other files reference, adding a dependency, or removing a large player-facing feature, what must you do, and what extra evidence does a large player-facing deletion need?',
    required: [
      ['recorded in DECISIONS', /DECISIONS/, NEG],
      ['lived or e2e proof', /\be2e\b|end-to-end|\blived\b|in the running game|real[- ]input/i, NEG],
    ],
    forbidden: [
      ['no record needed', /\b(?:needs?|requires?)\s+no\s+(?:record|entry)|\bno\s+(?:record|entry)\s+(?:is\s+)?(?:needed|required)|\bonly (?:for )?reversals\b|\bDECISIONS (?:holds|records) only\b/i, { inSpan: false }],
      ['ask Kevin first', /\bask(?:s|ing)?\s+Kevin\s+(?:first|before)|\bKevin(?:'s)?\s+(?:approval|sign-off)\s+(?:first|before)/i],
    ],
  },
  {
    id: 'q12',
    ask: "What are this repository's rules for `isCaptureMode()` guards: may you add a new one, and what must an existing guard do instead of returning early?",
    required: [
      ['no new guard', /\b(?:no|never|don't|do not|must not)\b[^.;\n]{0,20}\b(?:add|new)\b[^.;\n]{0,25}guard|\badd no new\b/i, NEG],
      ['reset to a declared value', /\breset\w*/i],
    ],
    forbidden: [
      ['an early return', /\bearly[- ]return\w*|\breturn\w*\s+early\b/i],
      ['a new guard added', /\badd\w*\s+(?:an?\s+|another\s+|more\s+)?(?:new\s+)?(?:`?isCaptureMode\(\)`?\s+)?guards?\b/i, { inSpan: false }],
    ],
  },
  {
    id: 'q13',
    ask: 'How does a new browser probe in this repository get its port, and what must every new gate or probe print and assert about how much it checked?',
    required: [
      ['probePort / the _serve.mjs table', /probePort|_serve\.mjs/],
      ['the denominator', /denominator|things checked|\bhow many\b[^.;\n]{0,30}\b(?:checked|examined)|\bcount of (?:what|items|things)/i],
    ],
    forbidden: [
      ['a chosen port', /\b(?:pick|picks|choose|chooses|hard-?code\w*|use|uses)\s+(?:a\s+|any\s+|its\s+own\s+)?(?:free\s+|fixed\s+|literal\s+|random\s+)?port\b|\bliteral port\b/i],
      ['PASS without a count', /\bPASS when (?:no|nothing)|\bno count\b/i, { inSpan: false }],
    ],
  },
  {
    id: 'q14',
    ask: 'Before you edit a file in this repository, and before you make a commit, what does it tell you to check?',
    required: [
      ['read the target first', /\bread\w*\b[^.;\n]{0,40}\b(?:lines?|file|target|coordinates|current state)\b|(?:confirm|verify|check)\w*\s+(?:the\s+)?(?:target|current)\s+state/i],
      ['debug output or secrets in the diff', /\bdebug|\bsecrets?\b|console\.log/i, NEG],
      ['a build after a JSX change', /npm run build|\bbuild\b/i, NEG],
    ],
    forbidden: [
      ['skipping hooks or staging everything', /--no-verify|\bgit add (?:-A|--all|\.)(?=[\s`'".,;)]|$)/i],
      ['editing without reading', /\bedit\w*\s+(?:straight|right)\s+away\b|\bwithout reading\b/i, { inSpan: false }],
    ],
  },
];

export const PROMPT = [
  'You are an engineering agent taking over this repository cold. Your working directory is the repository root.',
  'Orient yourself the way this repository tells a new agent to; you may read files and run the read-only commands you are',
  'allowed. Use as few tool calls as you need. Answer from what this repository says, not from general practice.',
  '',
  ...QUESTIONS.map((q, i) => `${i + 1}. ${q.ask}`),
  '',
  `Finish with one JSON object in a \`\`\`json fenced block, keys "q1" to "q${QUESTIONS.length}", each a short string answer.`,
].join('\n');

// --- the planted control ----------------------------------------------------------------------------------------------

/** The stale directive the q3 plant writes: the estate default that Crafty overrode on 2026-10-27. */
export const STALE = '- **Models and effort.** Reviewers and verifiers run on Opus 5.5 at effort max, the estate default; Sonnet 5.5 and Haiku 5.5 take bulk mechanical work.';

/** Each plant: the file carrying the directive, the line that starts its block, and the stale block written over it. */
export const PLANTS = {
  q3: { file: 'CLAUDE.md', find: /models and effort/i, stale: STALE },
  q7: {
    file: 'CLAUDE.md',
    find: /throwaway copy is `cp -c/,
    stale: "A reviewer's or verifier's throwaway copy is a fresh `git clone` followed by `npm ci`. Run e2e and the lookbook locally before every push; CI is only a backup.",
  },
  q11: {
    file: 'CLAUDE.md',
    find: /Record every non-routine decision/,
    stale: '**Decisions need no record unless they reverse an earlier one** (Kevin, 2026-10-27): delete files, add dependencies and cut features freely; DECISIONS holds only reversals.',
  },
  q12: {
    file: '.claude/rules/game-code.md',
    find: /\*\*Capture mode/,
    stale: '- **Capture mode.** Add an `isCaptureMode()` guard to anything that moves; a guard returns early from its callback so the subject freezes where it is.',
  },
};

/** PURE: replace the block that starts at the first line matching `find` (a bullet with its continuation lines, or a paragraph). */
export function plantAt(md, find, stale) {
  const lines = md.split('\n');
  const i = lines.findIndex((l) => find.test(l));
  if (i < 0) throw new Error(`plant: nothing matches ${find}, so the control would plant nothing`);
  let j = i + 1;
  while (j < lines.length && lines[j].trim() && !/^\s*(?:[-*] |#|\||\d+\. |<!--)/.test(lines[j])) j += 1;
  return [...lines.slice(0, i), stale, ...lines.slice(j)].join('\n');
}

/** PURE: the q3 plant on one CLAUDE.md text. */
export const plant = (md) => plantAt(md, PLANTS.q3.find, PLANTS.q3.stale);

// --- scoring ----------------------------------------------------------------------------------------------------------

/** PURE: score one answer. ctx.open / ctx.inFlight are the copy's registry counts (orient's). */
export function scoreAnswer(q, answer, ctx = {}) {
  const text = typeof answer === 'string' ? answer : JSON.stringify(answer ?? '');
  const missing = q.required
    .filter(([, re, o = {}]) => !hits(text, re).some((h) => o.polar === false || !negated(h, o)))
    .map(([label]) => label);
  const forbidden = (q.forbidden || []).filter(([, re, o = {}]) => hits(text, re).some((h) => !negated(h, o))).map(([label]) => label);
  if (q.count) {
    const nums = (text.match(/\d[\d,]*/g) || []).map((n) => Number(n.replace(/,/g, '')));
    const ok = [ctx.open, ctx.open + (ctx.inFlight || 0)].filter(Number.isFinite);
    if (!nums.some((n) => ok.includes(n))) missing.push(`the open count (${ok.join(' or ')})`);
  }
  return { id: q.id, ok: missing.length === 0 && forbidden.length === 0, missing, forbidden };
}

export function scoreAll(answers, ctx) {
  const results = QUESTIONS.map((q) => scoreAnswer(q, answers?.[q.id], ctx));
  return { correct: results.filter((r) => r.ok).length, total: QUESTIONS.length, results };
}

/** PURE: the successful tool calls that oriented: running `npm run orient`, or reading the cursor file (a search inside it is not a read). */
export function orientEvidence(uses) {
  return uses.filter((u) => {
    if (u.isError !== false) return false;
    if (u.name === 'Read') return /ACTIVE_PLAN\.md$/.test(String(u.input?.file_path || ''));
    if (u.name === 'Bash') return /\bnpm\s+run\s+orient\b|\borient\.mjs\b|\b(?:cat|head|sed|less|more|tail)\b[^|;&]*ACTIVE_PLAN\.md/.test(String(u.input?.command || ''));
    return false;
  });
}

// --- the transcript ---------------------------------------------------------------------------------------------------

/** PURE: the stream-json transcript -> tool calls, their error flags, the final text and the served model. */
export function parseStream(text) {
  const uses = [];
  const errors = new Map();
  let finalText = '';
  let model = null;
  for (const line of String(text).split('\n')) {
    let m;
    try {
      m = JSON.parse(line);
    } catch {
      continue;
    }
    if (m.type === 'system' && m.subtype === 'init') model = m.model ?? model;
    if (m.type === 'assistant') {
      for (const c of m.message?.content || []) if (c.type === 'tool_use') uses.push({ id: c.id, name: c.name, input: c.input });
    }
    if (m.type === 'user') {
      for (const c of Array.isArray(m.message?.content) ? m.message.content : []) {
        if (c.type === 'tool_result') errors.set(c.tool_use_id, Boolean(c.is_error));
      }
    }
    if (m.type === 'result') finalText = m.result ?? finalText;
  }
  return { uses: uses.map((u) => ({ ...u, isError: errors.get(u.id) ?? null })), finalText, model };
}

/** PURE: the last JSON object in the text that carries "q1", fenced or bare. */
export function extractAnswers(text) {
  const s = String(text);
  let found = null;
  for (const m of s.matchAll(/\{\s*"q1"/g)) {
    for (let end = s.indexOf('}', m.index); end > 0; end = s.indexOf('}', end + 1)) {
      try {
        found = JSON.parse(s.slice(m.index, end + 1));
        break;
      } catch { /* not closed yet */ }
    }
  }
  return found;
}

/**
 * PURE: walk one input string from a cwd `depth` levels below the copy root: `escapes` are the `..` paths (a cd target
 * included) that climb above the root, and `depth` is the cwd after its relative `cd`s. An absolute, home-relative or
 * computed cd target leaves the depth as it was; the path audit judges that target itself.
 */
export function dotEscapes(v, depth = 0) {
  const escapes = [];
  let d = depth;
  for (const seg of String(v).split(/&&|\|\||[;|\n]/)) {
    const cd = seg.match(/^\s*cd\s+(\S+)/);
    if (cd) {
      if (/^[/~$"'`]/.test(cd[1])) continue;
      for (const part of cd[1].split('/')) {
        if (part === '..') d -= 1;
        else if (part && part !== '.') d += 1;
        if (d < 0) {
          escapes.push(`${cd[1]} (..)`);
          d = 0;
          break;
        }
      }
      continue;
    }
    for (const token of seg.split(/[\s'"`=(:]+/)) {
      if (!/(?:^|\/)\.\.(?:\/|$)/.test(token)) continue;
      let level = d;
      let lowest = d;
      for (const part of token.split('/')) {
        if (part === '..') lowest = Math.min(lowest, (level -= 1));
        else if (part && part !== '.') level += 1;
      }
      if (lowest < 0) escapes.push(`${token} (..)`);
    }
  }
  return { escapes, depth: d };
}

/** PURE: every absolute path, home-relative path (`~`, `$HOME`) or `..` escape in a tool call's input that is not inside the copy. */
export function outsidePaths(use, copyRoots, depth = 0) {
  const hits = [];
  for (const v of Object.values(use.input || {})) {
    if (typeof v !== 'string') continue;
    for (const m of v.matchAll(/(?:^|[\s'"=(:])(\/[^\s'"`;|&)]+)/g)) {
      if (!copyRoots.some((r) => m[1] === r || m[1].startsWith(`${r}/`))) hits.push(m[1]);
    }
    for (const m of v.matchAll(/(?:^|[\s'"=(:`])((?:~[\w.-]*|\$\{?HOME\}?)(?:\/[^\s'"`;|&)]*)?)(?=$|[\s'"`;|&)])/g)) hits.push(m[1]);
    hits.push(...dotEscapes(v, depth).escapes);
  }
  return hits;
}

/**
 * PURE: the audit over a whole run. Claude Code keeps the Bash cwd between calls, and every tool resolves a relative
 * path against it, so a successful `cd frontend` lets a later `cd ..` return to the copy root without escaping.
 */
export function auditUses(uses, copyRoots) {
  let depth = 0;
  const out = [];
  for (const u of uses) {
    const hits = outsidePaths(u, copyRoots, depth);
    if (hits.length) out.push({ u, hits });
    if (u.name === 'Bash' && u.isError === false) depth = dotEscapes(String(u.input?.command || ''), depth).depth;
  }
  return out;
}

// --- the copy and the run ---------------------------------------------------------------------------------------------

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, ...opts });

/** PURE: the repo paths a working-tree copy carries, from git's list: never NEVER_COPIED, never the answer key. */
export function copyList(paths) {
  return [...new Set(paths)].filter((p) => p && !NEVER_COPIED.some((re) => re.test(p)) && !KEY_FILES.includes(p));
}

/** Build the copy: `git archive <rev>`, or the working tree's git-listed files as clonefiles; key files removed. */
export function buildCopy(dest, { rev } = {}) {
  mkdirSync(dest, { recursive: true });
  if (readdirSync(dest).length) throw new Error(`buildCopy: ${dest} is not empty`);
  if (rev) execFileSync('sh', ['-c', 'git -C "$1" archive "$2" | tar -x -C "$3"', 'sh', ROOT, rev, dest], { stdio: ['ignore', 'ignore', 'pipe'] });
  else {
    const listed = run('git', ['-C', ROOT, 'ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0');
    let copied = 0;
    for (const rel of copyList(listed)) {
      const src = join(ROOT, rel);
      let st;
      try {
        st = lstatSync(src);
      } catch {
        continue; // tracked, but deleted in the working tree
      }
      const to = join(dest, rel);
      mkdirSync(dirname(to), { recursive: true });
      if (st.isSymbolicLink()) symlinkSync(readlinkSync(src), to);
      else if (st.isFile()) {
        copyFileSync(src, to, fsConstants.COPYFILE_FICLONE);
        copied += 1;
      }
    }
    if (copied === 0) throw new Error('buildCopy: git listed no file to copy');
  }
  symlinkSync(realpathSync(join(ROOT, 'frontend/node_modules')), join(dest, 'frontend/node_modules'));
  for (const f of KEY_FILES) if (existsSync(join(dest, f))) unlinkSync(join(dest, f));
  const left = KEY_FILES.filter((f) => existsSync(join(dest, f)));
  if (left.length) throw new Error(`buildCopy: answer key still in the copy: ${left.join(', ')}`);
}

function applyPlants(copy, ids) {
  for (const id of ids) {
    const p = PLANTS[id];
    const abs = join(copy, p.file);
    writeFileSync(abs, plantAt(readFileSync(abs, 'utf8'), p.find, p.stale));
  }
}

// Read-only commands an orienting agent reaches for. A denied compound command can end an agent's attempt to orient, so
// a narrower list measures the harness rather than the instructions. `cd` is here because CLAUDE.md's first instruction
// is `cd frontend && npm run orient`; the path audit catches a cd out of the copy.
const READ_ONLY_BASH = [
  'cd:*', 'pwd', 'echo:*', 'npm run orient', 'npm run orient:*', 'npm --prefix frontend run orient',
  'node frontend/scripts/dev/orient.mjs', 'node scripts/dev/orient.mjs', 'ls:*', 'cat:*', 'head:*', 'tail:*', 'wc:*',
  'grep:*', 'find:*', 'sed -n:*', 'git rev-parse:*', 'git status:*', 'git log:*',
];

function childEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CLAUDE') && !k.startsWith('GIT_')));
  // Claude Code 2.1.312 reads this variable; a truthy value turns auto-memory off, so the run writes no memory files.
  return { ...env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' };
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const work = arg('work');
  const label = arg('label');
  if (!work || !label) {
    console.error('usage: cold-takeover-eval.mjs --work=<dir> --label=<name> [--rev=<sha>] [--plant[=q3,q7,...]] [--model=sonnet]');
    process.exit(2);
  }
  const plantFlag = argv.find((a) => a === '--plant' || a.startsWith('--plant='));
  const planted = !plantFlag ? [] : plantFlag === '--plant' ? Object.keys(PLANTS) : plantFlag.slice(8).split(',').filter(Boolean);
  const unknown = planted.filter((id) => !PLANTS[id]);
  if (unknown.length) {
    console.error(`cold-takeover-eval: no plant for ${unknown.join(', ')}; plants exist for ${Object.keys(PLANTS).join(', ')}`);
    process.exit(2);
  }
  const model = arg('model') || 'sonnet';
  const dir = resolve(work, label);
  const copy = join(dir, 'repo');
  buildCopy(copy, { rev: arg('rev') });
  applyPlants(copy, planted);
  const claudeMd = readFileSync(join(copy, 'CLAUDE.md'));
  const ctx = registryCounts(readFileSync(join(copy, 'memory/registry.jsonl'), 'utf8'));

  const args = [
    '-p', PROMPT, '--model', model, '--effort', 'high',
    '--setting-sources', 'project,local', '--strict-mcp-config', '--tools', 'Read,Grep,Glob,Bash',
    '--allowedTools', ...READ_ONLY_BASH.map((c) => `Bash(${c})`),
    '--permission-mode', 'dontAsk', '--no-session-persistence', '--output-format', 'stream-json', '--verbose',
  ];
  const streamPath = join(dir, 'stream.jsonl');
  const out = createWriteStream(streamPath);
  const t0 = Date.now();
  const code = await new Promise((done) => {
    const child = spawn('claude', args, { cwd: copy, env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => child.kill('SIGTERM'), RUN_TIMEOUT_MS);
    child.stdout.pipe(out);
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('close', (c) => { clearTimeout(timer); done(c); });
    child.on('error', (e) => { clearTimeout(timer); console.error(`cold-takeover-eval: claude did not start (${e.message})`); done(127); });
  });
  await new Promise((r) => out.end(r));

  const { uses, finalText, model: served } = parseStream(readFileSync(streamPath, 'utf8'));
  const roots = [copy, realpathSync(copy)];
  const outside = auditUses(uses, roots);
  const leaked = outside.filter((x) => x.u.isError === false);
  const oriented = orientEvidence(uses);
  const answers = extractAnswers(finalText);
  const score = scoreAll(answers, ctx);
  const pass = code === 0 && answers !== null && score.correct === score.total && uses.length <= MAX_CALLS && leaked.length === 0 && oriented.length > 0;
  const caught = planted.filter((id) => !score.results.find((r) => r.id === id)?.ok);
  const result = {
    label, rev: arg('rev') || 'working tree', planted, caught, model, served,
    claudeMdBytes: claudeMd.length, exit: code, seconds: Math.round((Date.now() - t0) / 1000),
    toolCalls: uses.length, tools: uses.map((u) => `${u.name}${u.isError ? '(denied/error)' : ''} ${JSON.stringify(u.input).slice(0, 110)}`),
    oriented: oriented.map((u) => `${u.name} ${JSON.stringify(u.input).slice(0, 110)}`),
    outsideAttempts: outside.map((x) => x.hits.join(' ')), leaked: leaked.length,
    registry: { open: ctx.open, inFlight: ctx.inFlight }, answers, score, pass,
  };
  writeFileSync(join(dir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`cold-takeover-eval ${label}: ${pass ? 'PASS' : 'FAIL'} — ${score.correct}/${score.total} correct, ${uses.length} tool calls (budget ${MAX_CALLS}), oriented by ${oriented.length} call(s), served ${served}, CLAUDE.md ${claudeMd.length} bytes, ${leaked.length} reads outside the copy`);
  for (const r of score.results) if (!r.ok) console.log(`  ${r.id} wrong: missing [${r.missing.join('; ')}]${r.forbidden.length ? ` forbidden [${r.forbidden.join('; ')}]` : ''}`);
  if (planted.length) console.log(`  control: planted ${planted.join(', ')}; caught ${caught.length}/${planted.length}${caught.length < planted.length ? ` (passed despite the plant: ${planted.filter((id) => !caught.includes(id)).join(', ')})` : ''}`);
  console.log(`  transcript ${streamPath}`);
  process.exit(pass ? 0 : 1);
}

function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) main();
