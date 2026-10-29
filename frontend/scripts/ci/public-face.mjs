#!/usr/bin/env node
/**
 * PUBLIC FACE — renders every outward description of Crafty from src/brand.js: the brand block of
 * index.html's head, the page a browser without JavaScript shows, the web manifest, the README's lead, and the
 * GitHub repository metadata in docs/superpowers/public-face.json. doc-currency fails when a committed copy
 * differs from a fresh render.
 *
 *   node scripts/ci/public-face.mjs            exit 1 if any rendered target is stale
 *   node scripts/ci/public-face.mjs --write    re-render every target
 *   node scripts/ci/public-face.mjs --live     compare the live GitHub repository with public-face.json and
 *                                              print the requests --apply would send; changes nothing
 *   node scripts/ci/public-face.mjs --apply    send those requests through `gh api`
 *
 * --live and --apply refuse while any rendered target is stale, because the plan would then come from a
 * public-face.json that brand.js no longer renders. --apply also refuses, sending nothing, when a label it would
 * delete is on an open issue or pull request: GitHub strips a deleted label from every issue and PR, so a label
 * added by hand, or a Dependabot label dropped from LABELS, would otherwise vanish at the next session close.
 * Keep such a label by adding it to LABELS, or delete it anyway with `--apply --delete-used-labels`.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND, ICONS } from '../../src/brand.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const FACE_REL = 'docs/superpowers/public-face.json';

export const REPO = 'wowlegend/Crafty';
export const TOPICS = Object.freeze([
  'browser-game', 'action-rpg', 'rpg-game', 'voxel', 'voxel-game', 'procedural-generation', 'threejs',
  'react-three-fiber', 'webgl', 'webgl-game', 'rapier-physics', 'game-development', 'ipad',
]);
// The full label set. `javascript` and `github_actions` stay because Dependabot puts them on every PR it opens.
export const LABELS = Object.freeze([
  { name: 'bug', color: 'd73a4a', description: "Something isn't working" },
  { name: 'ipad', color: '5aa9ff', description: 'Touch, layout or performance on iPad' },
  { name: 'looks', color: 'c9a86a', description: 'Light, colour, materials or UI that look wrong' },
  { name: 'perf', color: 'f2b33d', description: 'Frame rate, load time, heat or battery' },
  { name: 'dependencies', color: '0366d6', description: 'Pull requests that update a dependency file' },
  { name: 'javascript', color: '168700', description: 'Pull requests that update javascript code' },
  { name: 'github_actions', color: '000000', description: 'Pull requests that update GitHub Actions code' },
]);

export const HEAD_BEGIN = '<!-- BEGIN BRAND (generated from src/brand.js: node scripts/ci/public-face.mjs --write) -->';
export const HEAD_END = '<!-- END BRAND -->';
export const NOSCRIPT_BEGIN = '<!-- BEGIN NOSCRIPT (generated from src/brand.js: node scripts/ci/public-face.mjs --write) -->';
export const NOSCRIPT_END = '<!-- END NOSCRIPT -->';
export const PITCH_BEGIN = '<!-- BEGIN PITCH (generated from frontend/src/brand.js: node frontend/scripts/ci/public-face.mjs --write) -->';
export const PITCH_END = '<!-- END PITCH -->';

export function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const absolute = (brand, file) => new URL(file, brand.url).href;
const appleIcon = () => ICONS.find((i) => i.purpose === 'apple');

export function renderHead(brand = BRAND) {
  const a = escapeAttr;
  const og = absolute(brand, 'og-image.png');
  const lines = [
    HEAD_BEGIN,
    `<title>${a(brand.title)}</title>`,
    `<meta name="description" content="${a(brand.pitch)}" />`,
    `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`,
    `<link rel="apple-touch-icon" sizes="${appleIcon().size}x${appleIcon().size}" href="/${appleIcon().file}" />`,
    `<link rel="manifest" href="/manifest.webmanifest" />`,
    `<meta name="theme-color" content="${a(brand.ground)}" />`,
    `<meta name="apple-mobile-web-app-capable" content="yes" />`,
    `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${a(brand.url)}" />`,
    `<meta property="og:site_name" content="${a(brand.name)}" />`,
    `<meta property="og:title" content="${a(brand.title)}" />`,
    `<meta property="og:description" content="${a(brand.pitch)}" />`,
    `<meta property="og:image" content="${a(og)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${a(brand.ogImageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${a(brand.title)}" />`,
    `<meta name="twitter:description" content="${a(brand.pitch)}" />`,
    `<meta name="twitter:image" content="${a(og)}" />`,
    `<meta name="twitter:image:alt" content="${a(brand.ogImageAlt)}" />`,
    HEAD_END,
  ];
  return lines.map((l) => `    ${l}`).join('\n').trimStart();
}

// WebGL 2 because three r172's WebGLRenderer throws on a WebGL 1 context.
export function renderNoscript(brand = BRAND) {
  const a = escapeAttr;
  const lines = [
    NOSCRIPT_BEGIN,
    '<noscript>',
    `    <div style="position: fixed; inset: 0; display: grid; place-items: center; padding: 24px; background: ${a(brand.ground)}; color: ${a(brand.ink)}; font: 17px/1.55 system-ui, sans-serif; text-align: center;">`,
    '        <div style="max-width: 34em;">',
    `            <p style="margin: 0 0 12px; font-size: 40px; font-weight: 800; color: ${a(brand.accent)};">${a(brand.name)}</p>`,
    `            <p style="margin: 0 0 12px;">${a(brand.name)} is a voxel action-RPG that runs in your browser. It needs JavaScript to start and WebGL 2 to draw the world.</p>`,
    `            <p style="margin: 0; color: ${a(brand.inkMuted)};">Turn JavaScript on for this site and reload the page. If it is already on, open the game in a current version of Chrome, Edge, Firefox or Safari.</p>`,
    '        </div>',
    '    </div>',
    '</noscript>',
    NOSCRIPT_END,
  ];
  return lines.map((l) => `    ${l}`).join('\n').trimStart();
}

export function renderManifest(brand = BRAND, icons = ICONS) {
  const manifest = {
    id: '/',
    name: brand.name,
    short_name: brand.name,
    description: brand.pitch,
    lang: 'en',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: brand.ground,
    theme_color: brand.ground,
    // PNG only: with an SVG in this list, iOS 16.4+ ignores every manifest icon and shows the system
    // letter icon on the home screen (WebKit bug 256429, open).
    icons: icons
      .filter((i) => i.purpose === 'any' || i.purpose === 'maskable')
      .map((i) => ({ src: `/${i.file}`, sizes: `${i.size}x${i.size}`, type: 'image/png', purpose: i.purpose })),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function renderPitch(brand = BRAND) {
  return [PITCH_BEGIN, brand.pitch, '', `**[Play it now](${brand.url})**: nothing to install.`, PITCH_END].join('\n');
}

export function renderFace(brand = BRAND) {
  const face = {
    repo: REPO,
    description: brand.pitch,
    homepage: brand.url,
    topics: [...TOPICS],
    has_discussions: false,
    has_projects: false,
    labels: LABELS,
  };
  return `${JSON.stringify(face, null, 2)}\n`;
}

/** Every rendered file: `block` targets replace the text between markers, `file` targets the whole file. */
export const TARGETS = Object.freeze([
  { rel: 'frontend/index.html', begin: HEAD_BEGIN, end: HEAD_END, render: renderHead },
  { rel: 'frontend/index.html', begin: NOSCRIPT_BEGIN, end: NOSCRIPT_END, render: renderNoscript },
  { rel: 'frontend/public/manifest.webmanifest', render: renderManifest },
  { rel: 'README.md', begin: PITCH_BEGIN, end: PITCH_END, render: renderPitch },
  { rel: FACE_REL, render: renderFace },
]);

function splice(text, t) {
  const i = text.indexOf(t.begin);
  const j = text.indexOf(t.end);
  if (i < 0 || j < i || text.indexOf(t.begin, i + 1) >= 0) return null;
  return { before: text.slice(0, i), got: text.slice(i, j + t.end.length), after: text.slice(j + t.end.length) };
}

/** `{ checked, stale: [{ rel, reason }] }` for the files under `root`. */
export function check(root = ROOT, brand = BRAND) {
  const stale = [];
  for (const t of TARGETS) {
    const abs = join(root, t.rel);
    if (!existsSync(abs)) {
      stale.push({ rel: t.rel, reason: 'missing' });
      continue;
    }
    const text = readFileSync(abs, 'utf8');
    const want = t.render(brand);
    if (!t.begin) {
      if (text !== want) stale.push({ rel: t.rel, reason: 'stale' });
      continue;
    }
    const s = splice(text, t);
    if (!s) stale.push({ rel: t.rel, reason: 'markers missing or repeated' });
    else if (s.got !== want) stale.push({ rel: t.rel, reason: 'stale' });
  }
  return { checked: TARGETS.length, stale };
}

export function write(root = ROOT, brand = BRAND) {
  for (const t of TARGETS) {
    const abs = join(root, t.rel);
    if (!t.begin) {
      writeFileSync(abs, t.render(brand));
      continue;
    }
    const s = splice(readFileSync(abs, 'utf8'), t);
    if (!s) throw new Error(`public-face: ${t.rel} has no single ${t.begin} / ${t.end} pair`);
    writeFileSync(abs, s.before + t.render(brand) + s.after);
  }
}

const enc = encodeURIComponent;

/**
 * The `gh api` requests that turn `live` into `face`. `live` is `{ repo, topics, labels }` as GitHub returns
 * them. An empty list means the repository already matches.
 */
export function planRequests(face, live) {
  const out = [];
  const repoFields = {};
  for (const k of ['description', 'homepage', 'has_discussions', 'has_projects']) {
    if (live.repo[k] !== face[k]) repoFields[k] = face[k];
  }
  if (Object.keys(repoFields).length) out.push({ method: 'PATCH', path: `repos/${face.repo}`, fields: repoFields });

  const want = [...face.topics].sort().join(',');
  if ([...live.topics].sort().join(',') !== want) {
    out.push({ method: 'PUT', path: `repos/${face.repo}/topics`, fields: { 'names[]': face.topics } });
  }

  const liveByName = new Map(live.labels.map((l) => [l.name, l]));
  for (const l of face.labels) {
    const have = liveByName.get(l.name);
    if (!have) out.push({ method: 'POST', path: `repos/${face.repo}/labels`, fields: { ...l } });
    else if (have.color !== l.color || (have.description ?? '') !== l.description) {
      out.push({ method: 'PATCH', path: `repos/${face.repo}/labels/${enc(l.name)}`, fields: { color: l.color, description: l.description } });
    }
  }
  const keep = new Set(face.labels.map((l) => l.name));
  for (const l of live.labels) {
    if (!keep.has(l.name)) out.push({ method: 'DELETE', path: `repos/${face.repo}/labels/${enc(l.name)}`, fields: {}, label: l.name });
  }
  return out;
}

/** The `gh api` argv for one request. Booleans go through -F so GitHub receives JSON true/false. */
export function ghArgs(req) {
  const args = ['api', '-X', req.method, req.path];
  for (const [k, v] of Object.entries(req.fields)) {
    if (Array.isArray(v)) for (const item of v) args.push('-f', `${k}=${item}`);
    else if (typeof v === 'boolean') args.push('-F', `${k}=${v}`);
    else args.push('-f', `${k}=${v}`);
  }
  return args;
}

const shellQuote = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`);

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function readLive(repo, run = gh) {
  const r = JSON.parse(run(['api', `repos/${repo}`]));
  const labels = JSON.parse(run(['api', '--paginate', '--slurp', `repos/${repo}/labels?per_page=100`])).flat();
  return {
    repo: { description: r.description, homepage: r.homepage, has_discussions: r.has_discussions, has_projects: r.has_projects },
    topics: r.topics ?? [],
    labels: labels.map((l) => ({ name: l.name, color: l.color, description: l.description ?? '' })),
  };
}

// GraphQL, not the REST `labels=` filter, because that filter splits its value on commas and a label name may hold one.
export const LABEL_USAGE_QUERY =
  'query($owner: String!, $name: String!, $label: String!) { repository(owner: $owner, name: $name) { ' +
  'label(name: $label) { issues(states: OPEN) { totalCount } pullRequests(states: OPEN) { totalCount } } } }';

/**
 * Map of label name -> open issues plus open pull requests carrying it. Throws when GitHub's answer holds no
 * count, so a count that could not be read never passes as zero. Only an explicit `label: null` (GitHub no longer
 * has the label) counts 0.
 */
export function labelUsage(repo, names, run = gh) {
  const [owner, name] = repo.split('/');
  const usage = new Map();
  for (const label of names) {
    const res = JSON.parse(run(['api', 'graphql', '-f', `query=${LABEL_USAGE_QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-f', `label=${label}`]));
    const node = res?.data?.repository?.label;
    const n = node === null ? 0 : node?.issues?.totalCount + node?.pullRequests?.totalCount;
    if (!Number.isInteger(n)) throw new Error(`public-face: GitHub did not report the use of label "${label}": ${JSON.stringify(res)}`);
    usage.set(label, n);
  }
  return usage;
}

/** The CLI; returns its exit code. `deps` lets a test run it on a scratch tree with a stand-in for `gh`. */
export function main(argv = process.argv.slice(2), { root = ROOT, brand = BRAND, run = gh, log = console.log, error = console.error } = {}) {
  if (argv.includes('--write')) {
    write(root, brand);
    log(`public-face: rendered ${TARGETS.length} targets from src/brand.js`);
    return 0;
  }
  const live = argv.includes('--live') || argv.includes('--apply');
  const { checked, stale } = check(root, brand);
  if (stale.length) {
    for (const s of stale) error(`  ${s.rel}: ${s.reason}`);
    error(`public-face: ${stale.length} of ${checked} rendered targets differ from src/brand.js; run with --write${live ? ' and commit before comparing with GitHub' : ''}`);
    return 1;
  }
  if (!live) {
    log(`public-face: ${checked} rendered targets match src/brand.js`);
    return 0;
  }

  const apply = argv.includes('--apply');
  const face = JSON.parse(readFileSync(join(root, FACE_REL), 'utf8'));
  const reqs = planRequests(face, readLive(face.repo, run));
  if (!reqs.length) {
    log(`public-face: ${face.repo} already matches public-face.json`);
    return 0;
  }
  for (const r of reqs) log(`  gh ${ghArgs(r).map(shellQuote).join(' ')}`);
  const doomed = reqs.filter((r) => r.method === 'DELETE').map((r) => r.label);
  const used = [...labelUsage(face.repo, doomed, run)].filter(([, n]) => n > 0);
  for (const [name, n] of used) error(`  label "${name}" is on ${n} open issue(s) or pull request(s); deleting it removes it from them`);
  if (!apply) {
    log(`public-face: ${reqs.length} request(s) would bring ${face.repo} in line; run with --apply to send them`);
    if (used.length) log(`public-face: --apply will refuse while ${used.length} label(s) it would delete are in use`);
    return 0;
  }
  if (used.length && !argv.includes('--delete-used-labels')) {
    error(
      `public-face: refusing --apply, nothing sent: ${used.length} label(s) it would delete are in use. Keep them by ` +
        'adding them to LABELS in frontend/scripts/ci/public-face.mjs, or delete them with --apply --delete-used-labels',
    );
    return 1;
  }
  for (const r of reqs) run(ghArgs(r));
  log(`public-face: sent ${reqs.length} request(s) to ${face.repo}`);
  return 0;
}

if (import.meta.main) process.exitCode = main();
