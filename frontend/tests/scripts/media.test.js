import { describe, it, expect } from 'vitest';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_SHOTS, MEDIA_DIR, MEDIA_MANIFEST, OG_CARD, imageSize, mediaProblems, filesUnder, sha256Hex } from '../../scripts/visual/_media.mjs';
import { BRAND } from '../../src/brand.js';

// THE COMMITTED MEDIA AGAINST THEIR MANIFEST (scripts/visual/media.mjs writes both).
//
// Sited in tests/scripts/: the subject is files (everything under docs/media, the og card, the README), read from disk.
// The logic it runs is _media.mjs's mediaProblems, driven on fixtures of every defect shape in
// tests/gates/media-plan-gates.test.js; this file applies it to what ships. What it cannot check: how a frame looks (a
// person opens each one before it is committed) and whether the live site serves the card (only a deploy shows that).

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = resolve(APP, '..');

/** What a file is, measured from its own bytes. */
function facts(rel) {
  const bytes = readFileSync(join(ROOT, rel));
  const size = imageSize(bytes);
  return { path: rel, bytes: bytes.length, width: size?.width ?? null, height: size?.height ?? null, format: size?.format ?? null,
    sha256: sha256Hex(bytes) };
}

const manifestPath = join(ROOT, MEDIA_MANIFEST);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const onDisk = [
  // Every file under docs/media, dotfiles too (filesUnder skips only .DS_Store), so a stray one is listed and refused.
  ...filesUnder(join(ROOT, MEDIA_DIR), ROOT).filter((p) => p !== MEDIA_MANIFEST),
  ...(existsSync(join(ROOT, OG_CARD.file)) ? [OG_CARD.file] : []),
].map(facts);

describe('docs/media and the og card agree with media.json', () => {
  it('lists every file, has every listed file, and each keeps its bytes, size, format, budget, built commit and hardware renderer', () => {
    const { problems, checked } = mediaProblems({ manifest, files: onDisk, manifestBytes: statSync(manifestPath).size });
    expect(problems).toEqual([]);
    // The denominator: every file on disk was compared, and that covers at least every shot that is not optional.
    expect(checked).toBe(onDisk.length);
    expect(checked).toBeGreaterThanOrEqual(MEDIA_SHOTS.filter((s) => !s.optional).length);
  });

  it('reads every file as a PNG or a JPEG (a file of neither kind would compare as nulls)', () => {
    expect(onDisk.length).toBeGreaterThan(0);
    for (const f of onDisk) expect(f.format, `${f.path} is neither a PNG nor a JPEG`).toMatch(/^(png|jpg)$/);
  });
});

describe('the README hero', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  const hero = MEDIA_SHOTS.find((s) => s.purpose === 'hero');

  it('is the media hero with its declared alt text, linked to the live game, above the pitch', () => {
    const line = `[![${hero.alt}](${hero.out})](${BRAND.url})`;
    expect(readme, `README.md has no line ${line}`).toContain(line);
    expect(readme.indexOf(line)).toBeLessThan(readme.indexOf('<!-- BEGIN PITCH'));
    expect(manifest.files.map((e) => e.file)).toContain(hero.out);
  });
});
