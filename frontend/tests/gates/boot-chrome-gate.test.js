import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../');
const HTML = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

/*
 * ENHANCED 2026-09-22, selected by `gate-census.mjs` at 0/5.
 *
 * Every case asserted that a <link> TAG exists. None asserted that what it points AT exists. A
 * `<link rel="icon" href="/favicon-v2.svg">` against a file that was renamed passes every check here
 * and ships a broken icon — the tag is the claim, the file is the fact, and only the fact matters to a
 * browser. Two assets were spot-checked by hardcoded path (favicon.svg, manifest.webmanifest), which is
 * the instance rather than the class: a THIRD linked asset was covered by nothing.
 *
 * Now every local href in the head is extracted and resolved against public/.
 *
 * BLIND SPOT, stated (R7): resolution only, and only for LOCAL hrefs — a remote URL is not fetched, and
 * nothing validates that the favicon is a valid SVG, that the manifest parses, or that the OG image is
 * the right size. It also cannot see what a browser does with them.
 *
 * Mutation-Proof: 3 mutations, recorded on the commit.
 */
describe('boot chrome (index.html shipped <head>)', () => {
  it('every LOCAL asset the head links actually exists on disk', () => {
    const head = HTML.slice(0, HTML.indexOf('</head>'));
    const hrefs = [...head.matchAll(/(?:href|content)=["'](\/[^"']+\.(?:svg|png|ico|webmanifest|jpg|jpeg|webp))["']/g)]
      .map((m) => m[1]);
    // R3a: zero extracted hrefs would make the loop below pass over nothing and report clean chrome.
    expect(hrefs.length, 'no local asset links were extracted — this reports clean over an empty set')
      .toBeGreaterThanOrEqual(3);
    const missing = hrefs.filter((h) => !existsSync(resolve(ROOT, 'public', h.replace(/^\//, ''))));
    expect(missing, 'the head links an asset that does not exist — it ships broken').toEqual([]);
  });

  it('links a favicon', () => {
    expect(/<link[^>]+rel=["']icon["'][^>]*>/.test(HTML)).toBe(true);
  });
  it('links a PWA web manifest', () => {
    expect(/<link[^>]+rel=["']manifest["'][^>]*>/.test(HTML)).toBe(true);
    expect(existsSync(resolve(ROOT, 'public/manifest.webmanifest'))).toBe(true);
  });
  it('links an apple-touch-icon', () => {
    expect(/<link[^>]+rel=["']apple-touch-icon["'][^>]*>/.test(HTML)).toBe(true);
  });
  it('declares a theme-color', () => {
    expect(/<meta[^>]+name=["']theme-color["'][^>]*>/.test(HTML)).toBe(true);
  });
  it('declares Open Graph + Twitter card meta', () => {
    expect(/property=["']og:title["']/.test(HTML)).toBe(true);
    expect(/property=["']og:description["']/.test(HTML)).toBe(true);
    expect(/name=["']twitter:card["']/.test(HTML)).toBe(true);
  });
  it('ships the favicon asset', () => {
    expect(existsSync(resolve(ROOT, 'public/favicon.svg'))).toBe(true);
  });
  it('contains NO trademark-risk "Minecraft" copy', () => {
    expect(/minecraft/i.test(HTML)).toBe(false);
  });
});
