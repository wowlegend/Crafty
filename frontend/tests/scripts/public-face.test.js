import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import {
  TARGETS, TOPICS, LABELS, check, write, renderHead, renderNoscript, renderManifest, renderFace, renderPitch,
  planRequests, ghArgs, escapeAttr, NOSCRIPT_BEGIN, NOSCRIPT_END,
} from '../../scripts/ci/public-face.mjs';
import { BRAND, ICONS, MASKABLE_SAFE_RADIUS } from '../../src/brand.js';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const TRICKY = { ...BRAND, title: 'Crafty "beta" & <friends>', pitch: 'Fight & build "now".' };

describe('the brand source', () => {
  it('names the production URL the Vercel project serves', () => {
    // Every other assertion in this file reads BRAND.url back, so a typo in it would pass them all while the
    // README play link, og:url and both card images 404. This literal is the independent copy.
    expect(BRAND.url).toBe('https://crafty-game.vercel.app/');
  });
});

describe('public-face rendering', () => {
  it('puts the brand into every head tag that describes the page, escaped for an attribute', () => {
    const head = renderHead(TRICKY);
    expect(head).toContain('<title>Crafty &quot;beta&quot; &amp; &lt;friends&gt;</title>');
    for (const tag of ['og:title', 'twitter:title']) {
      expect(head).toMatch(new RegExp(`(property|name)="${tag}" content="Crafty &quot;beta&quot; &amp; &lt;friends&gt;"`));
    }
    for (const tag of ['description', 'og:description', 'twitter:description']) {
      expect(head).toMatch(new RegExp(`(property|name)="${tag}" content="Fight &amp; build &quot;now&quot;\\."`));
    }
    expect(head).toContain(`<meta property="og:image" content="${BRAND.url}og-image.png" />`);
    expect(head).toContain(`<meta name="theme-color" content="${BRAND.ground}" />`);
  });

  it('renders the no-JavaScript page from the brand: its name, ground, ink and accent, and what the game needs', () => {
    const other = { ...BRAND, name: 'Kraft & "Co"', ground: '#010203', ink: '#040506', inkMuted: '#070809', accent: '#0A0B0C' };
    const html = renderNoscript(other);
    expect(html.startsWith(NOSCRIPT_BEGIN)).toBe(true);
    expect(html.endsWith(NOSCRIPT_END)).toBe(true);
    expect(html.match(/<noscript>/g)).toHaveLength(1);
    expect(html).toContain('background: #010203; color: #040506;');
    expect(html).toContain('color: #0A0B0C;">Kraft &amp; &quot;Co&quot;</p>');
    expect(html).toContain('<p style="margin: 0 0 12px;">Kraft &amp; &quot;Co&quot; is a voxel action-RPG');
    expect(html).toContain('color: #070809;">Turn JavaScript on');
    expect(html).toContain('It needs JavaScript to start and WebGL 2 to draw the world.');
    expect(html).not.toContain(BRAND.ground);
  });

  it('escapes the four characters an attribute value cannot carry raw', () => {
    expect(escapeAttr(`a&b"c<d>e`)).toBe('a&amp;b&quot;c&lt;d&gt;e');
  });

  it('lists every PNG icon in the manifest with its purpose, and the apple icon only in the head', () => {
    const m = JSON.parse(renderManifest());
    expect(m.icons.map((i) => i.type)).toEqual(['image/png', 'image/png', 'image/png']);
    expect(m.icons.map((i) => `${i.src} ${i.sizes} ${i.purpose}`)).toEqual([
      '/icon-192.png 192x192 any',
      '/icon-512.png 512x512 any',
      '/icon-maskable-512.png 512x512 maskable',
    ]);
    expect(m.description).toBe(BRAND.pitch);
    expect(m.orientation).toBe('any');
    expect(renderHead()).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />');
  });

  it('describes the repository with the pitch, the live URL and Discussions and Projects off', () => {
    const face = JSON.parse(renderFace(TRICKY));
    expect(face).toMatchObject({ description: TRICKY.pitch, homepage: BRAND.url, has_discussions: false, has_projects: false });
    expect(face.topics).toEqual([...TOPICS]);
    expect(new Set(face.topics).size).toBe(13);
    expect(face.labels.map((l) => l.name)).toContain('bug');
    expect(renderPitch(TRICKY)).toContain(TRICKY.pitch);
  });
});

describe('public-face check and write, on a scratch tree', () => {
  let root;
  const host = {
    'frontend/index.html': ([head, body]) => `<html>\n  <head>\n    ${head}\n  </head>\n  <body>\n    ${body}\n  </body>\n</html>\n`,
    'README.md': ([block]) => `# Crafty\n\n${block}\n\nThe rest of the README.\n`,
  };
  const seed = () => {
    for (const rel of new Set(TARGETS.map((t) => t.rel))) {
      const blocks = TARGETS.filter((t) => t.rel === rel && t.begin).map((t) => `${t.begin}\nold\n${t.end}`);
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), blocks.length ? host[rel](blocks) : 'old\n');
    }
  };
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'public-face-'));
    seed();
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reports every target stale before a write, and none after, keeping text outside the markers', () => {
    const before = check(root);
    expect(before.checked).toBe(5);
    expect(before.stale.map((s) => s.rel).sort()).toEqual(TARGETS.map((t) => t.rel).sort());
    write(root);
    expect(check(root)).toEqual({ checked: 5, stale: [] });
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toMatch(/^# Crafty\n\n[\s\S]*\n\nThe rest of the README\.\n$/);
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toContain(BRAND.pitch);
  });

  it('names the one file that drifted, whichever kind of target it is', () => {
    write(root);
    const manifest = join(root, 'frontend/public/manifest.webmanifest');
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('"any"', '"portrait"'));
    const readme = join(root, 'README.md');
    writeFileSync(readme, readFileSync(readme, 'utf8').replace('nothing to install', 'no install'));
    expect(check(root).stale).toEqual([
      { rel: 'frontend/public/manifest.webmanifest', reason: 'stale' },
      { rel: 'README.md', reason: 'stale' },
    ]);
  });

  it('a deleted or hand-edited noscript is reported, and the head block beside it is not', () => {
    write(root);
    const html = join(root, 'frontend/index.html');
    const written = readFileSync(html, 'utf8');
    writeFileSync(html, written.replace('WebGL 2', 'WebGL'));
    expect(check(root).stale).toEqual([{ rel: 'frontend/index.html', reason: 'stale' }]);
    const i = written.indexOf(NOSCRIPT_BEGIN);
    writeFileSync(html, written.slice(0, i) + written.slice(written.indexOf(NOSCRIPT_END) + NOSCRIPT_END.length));
    expect(check(root).stale).toEqual([{ rel: 'frontend/index.html', reason: 'markers missing or repeated' }]);
  });

  it('reports a missing file and a lost marker rather than passing over them', () => {
    write(root);
    rmSync(join(root, 'docs/superpowers/public-face.json'));
    const html = join(root, 'frontend/index.html');
    writeFileSync(html, readFileSync(html, 'utf8').replace('<!-- END BRAND -->', ''));
    expect(check(root).stale).toEqual([
      { rel: 'frontend/index.html', reason: 'markers missing or repeated' },
      { rel: 'docs/superpowers/public-face.json', reason: 'missing' },
    ]);
  });

  it('refuses a second marker pair, which would leave one copy unchecked', () => {
    write(root);
    const readme = join(root, 'README.md');
    const t = TARGETS.find((x) => x.rel === 'README.md');
    writeFileSync(readme, `${readFileSync(readme, 'utf8')}\n${t.begin}\nhand-edited copy\n${t.end}\n`);
    expect(check(root).stale).toEqual([{ rel: 'README.md', reason: 'markers missing or repeated' }]);
    expect(() => write(root)).toThrow(/README\.md/);
  });
});

describe('public-face planRequests', () => {
  const face = JSON.parse(renderFace());
  const matching = () => ({
    repo: { description: face.description, homepage: face.homepage, has_discussions: false, has_projects: false },
    topics: [...face.topics].reverse(),
    labels: face.labels.map((l) => ({ ...l })),
  });

  it('sends nothing when the repository already matches, whatever order GitHub lists topics in', () => {
    expect(planRequests(face, matching())).toEqual([]);
  });

  it('patches only the repository fields that differ, booleans included', () => {
    const live = matching();
    live.repo.description = 'old pitch';
    live.repo.has_discussions = true;
    expect(planRequests(face, live)).toEqual([
      { method: 'PATCH', path: 'repos/wowlegend/Crafty', fields: { description: face.description, has_discussions: false } },
    ]);
  });

  it('patches the homepage and the Projects switch too, the two fields the case above leaves alone', () => {
    const live = matching();
    live.repo.homepage = 'https://crafty-sand.vercel.app/';
    live.repo.has_projects = true;
    expect(planRequests(face, live)).toEqual([
      { method: 'PATCH', path: 'repos/wowlegend/Crafty', fields: { homepage: face.homepage, has_projects: false } },
    ]);
  });

  it('replaces the whole topic list when one topic differs', () => {
    const live = matching();
    live.topics = [...face.topics.slice(1), 'minecraft-clone'];
    expect(planRequests(face, live)).toEqual([
      { method: 'PUT', path: 'repos/wowlegend/Crafty/topics', fields: { 'names[]': face.topics } },
    ]);
  });

  it('creates missing labels, updates changed ones and deletes labels outside the set', () => {
    const live = matching();
    live.labels = live.labels.filter((l) => l.name !== 'looks');
    live.labels.find((l) => l.name === 'bug').description = '';
    live.labels.find((l) => l.name === 'perf').color = '000000';
    live.labels.push({ name: 'good first issue', color: '7057ff', description: 'Good for newcomers' });
    const [bug, looks, perf] = ['bug', 'looks', 'perf'].map((n) => LABELS.find((l) => l.name === n));
    expect(planRequests(face, live)).toEqual([
      { method: 'PATCH', path: 'repos/wowlegend/Crafty/labels/bug', fields: { color: bug.color, description: bug.description } },
      { method: 'POST', path: 'repos/wowlegend/Crafty/labels', fields: looks },
      { method: 'PATCH', path: 'repos/wowlegend/Crafty/labels/perf', fields: { color: perf.color, description: perf.description } },
      { method: 'DELETE', path: 'repos/wowlegend/Crafty/labels/good%20first%20issue', fields: {} },
    ]);
  });

  it('builds gh arguments that send booleans as JSON and repeat array fields', () => {
    expect(ghArgs({ method: 'PATCH', path: 'repos/x/y', fields: { homepage: 'https://a/', has_projects: false } }))
      .toEqual(['api', '-X', 'PATCH', 'repos/x/y', '-f', 'homepage=https://a/', '-F', 'has_projects=false']);
    expect(ghArgs({ method: 'PUT', path: 'repos/x/y/topics', fields: { 'names[]': ['a', 'b'] } }))
      .toEqual(['api', '-X', 'PUT', 'repos/x/y/topics', '-f', 'names[]=a', '-f', 'names[]=b']);
  });
});

describe('the committed app icons', () => {
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const ground = hex(BRAND.ground);
  const accent = hex(BRAND.accent);
  const read = (file) => PNG.sync.read(readFileSync(join(APP, 'public', file)));
  const at = (png, x, y) => png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4);
  const same = (px, rgb) => px[0] === rgb[0] && px[1] === rgb[1] && px[2] === rgb[2];

  it('every icon in ICONS exists at its declared size, fully opaque', () => {
    expect(ICONS).toHaveLength(4);
    for (const icon of ICONS) {
      expect(existsSync(join(APP, 'public', icon.file)), `${icon.file} is missing; run scripts/visual/make-icons.mjs`).toBe(true);
      const png = read(icon.file);
      expect([png.width, png.height], icon.file).toEqual([icon.size, icon.size]);
      let transparent = 0;
      for (let i = 3; i < png.data.length; i += 4) if (png.data[i] !== 255) transparent++;
      expect(transparent, `${icon.file} carries alpha`).toBe(0);
    }
  });

  it('draws the gold glyph on the ground colour, and keeps the maskable glyph inside the safe zone', () => {
    for (const icon of ICONS) {
      const png = read(icon.file);
      const c = (png.width - 1) / 2;
      const safe = MASKABLE_SAFE_RADIUS * png.width;
      let gold = 0;
      let outsideSafe = 0;
      let outsideNotGround = 0;
      for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
          const px = at(png, x, y);
          if (same(px, accent)) gold++;
          if (Math.hypot(x - c, y - c) > safe) {
            outsideSafe++;
            if (!same(px, ground)) outsideNotGround++;
          }
        }
      }
      expect(same(at(png, 0, 0), ground), `${icon.file} corner is not the ground colour`).toBe(true);
      expect(gold / (png.width * png.height), `${icon.file} shows too little of the gold glyph`).toBeGreaterThan(0.12);
      if (icon.purpose === 'maskable') {
        expect(outsideSafe).toBeGreaterThan(0);
        expect(outsideNotGround, `${icon.file} draws outside the maskable safe zone`).toBe(0);
      }
    }
  });
});
