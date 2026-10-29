import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import {
  MEDIA_SHOTS,
  MEDIA_BUDGETS,
  MEDIA_TIMES,
  OG_CARD,
  SOCIAL_PREVIEW,
  shotTableProblems,
  pngSize,
  jpegSize,
  imageSize,
  mediaProblems,
  mediaShotVerdict,
  nearestHostile,
  nearestMobM,
  mergeManifest,
  ogCardHtml,
  cardSubtitle,
  dirtyOutsideOutputs,
  jpegEncodeArgv,
  pngPaletteArgv,
} from '../../scripts/visual/_media.mjs';
import { LOOKBOOK_PLACES, OBSTRUCTION_M } from '../../scripts/visual/_lookbook.mjs';
import { BRAND } from '../../src/brand.js';

// The pure half of the media pipeline (scripts/visual/media.mjs): the declared shot table, the size readers the file
// gate trusts, the manifest check, the per-shot verdict and the og card. The committed files themselves are checked in
// tests/scripts/media.test.js; this file drives the logic on fixtures whose answer is known by construction.

const SHA = 'a'.repeat(40);
const HW = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)';

/** A JPEG header a decoder would stop reading after: SOI, an APP0 and a DQT segment to skip, then the frame header. */
function jpegBytes(width, height, sof = 0xc0) {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const dqt = [0xff, 0xdb, 0x00, 0x05, 0x00, 0x01, 0x02];
  const frame = [0xff, sof, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  return Buffer.from([0xff, 0xd8, ...app0, ...dqt, ...frame, 0xff, 0xd9]);
}

function pngBytes(width, height) {
  return PNG.sync.write(new PNG({ width, height }));
}

/** A manifest and a disk listing that agree, built from the real table: every shot present unless `skip` names it. */
function goodSet({ shots = MEDIA_SHOTS, skip = [] } = {}) {
  const files = [];
  const entries = [];
  for (const s of shots) {
    if (skip.includes(s.name)) continue;
    const [width, height] = s.size;
    const bytes = Math.min(s.targetBytes, 100_000);
    files.push({ path: s.out, bytes, width, height, format: s.format });
    entries.push({ file: s.out, shot: s.name, purpose: s.purpose, sha: SHA, dirty: false, renderer: HW, time: s.time,
      cycle: MEDIA_TIMES[s.time], width, height, bytes, format: s.format });
  }
  return { manifest: { files: entries }, files, manifestBytes: 4000 };
}

const optional = MEDIA_SHOTS.filter((s) => s.optional).map((s) => s.name);

describe('the declared shot table', () => {
  it('is well formed, and every check below runs over a non-empty table', () => {
    expect(MEDIA_SHOTS.length).toBeGreaterThanOrEqual(4);
    expect(shotTableProblems()).toEqual([]);
  });

  it('declares exactly one hero, one og card and one social preview, at the sizes their hosts use', () => {
    const one = (p) => MEDIA_SHOTS.filter((s) => s.purpose === p);
    expect(one('hero')).toHaveLength(1);
    expect(one('og')).toHaveLength(1);
    expect(one('social')).toHaveLength(1);
    expect(one('og')[0].size).toEqual([OG_CARD.width, OG_CARD.height]);
    expect(one('og')[0].out).toBe(OG_CARD.file);
    expect(one('social')[0].size).toEqual([SOCIAL_PREVIEW.width, SOCIAL_PREVIEW.height]);
    expect([OG_CARD.width, OG_CARD.height, SOCIAL_PREVIEW.width, SOCIAL_PREVIEW.height]).toEqual([1200, 630, 1280, 640]);
  });

  it('refuses a table whose byte targets add up past the folder budget', () => {
    const fat = MEDIA_SHOTS.map((s) => (s.format === 'jpg' ? { ...s, targetBytes: MEDIA_BUDGETS.jpgBytes } : s));
    const extra = Array.from({ length: 6 }, (_, i) => ({ ...fat.find((s) => s.purpose === 'still'), name: `extra-${i}`,
      out: `docs/media/stills/extra-${i}.jpg` }));
    expect(shotTableProblems([...fat, ...extra]).join('\n')).toMatch(/folder budget/);
  });

  it('refuses a file target past its format ceiling, a second hero, an unknown place and a duplicate name', () => {
    const hero = MEDIA_SHOTS.find((s) => s.purpose === 'hero');
    const pose = MEDIA_SHOTS.find((s) => s.recipe.kind === 'pose');
    expect(shotTableProblems(MEDIA_SHOTS.map((s) => (s === hero ? { ...s, targetBytes: MEDIA_BUDGETS.jpgBytes + 1 } : s))).join('\n'))
      .toMatch(/hero.*ceiling/);
    expect(shotTableProblems([...MEDIA_SHOTS, { ...hero, name: 'hero-2', out: 'docs/media/hero-2.jpg' }]).join('\n')).toMatch(/2 hero/);
    expect(shotTableProblems(MEDIA_SHOTS.map((s) => (s === pose ? { ...s, recipe: { kind: 'pose', place: 'nowhere' } } : s))).join('\n'))
      .toMatch(/nowhere/);
    expect(shotTableProblems([...MEDIA_SHOTS, { ...pose }]).join('\n')).toMatch(/named twice/);
  });

  it('names its places from the lookbook, so a still and a lookbook frame of one place stand on the same ground', () => {
    const ids = LOOKBOOK_PLACES.map((p) => p.id);
    const poses = MEDIA_SHOTS.filter((s) => s.recipe.kind === 'pose');
    expect(poses.length).toBeGreaterThan(0);
    for (const s of poses) expect(ids).toContain(s.recipe.place);
  });
});

describe('the size readers the file gate trusts', () => {
  it('read a PNG as width then height (a non-square fixture, so a transposition shows)', () => {
    expect(pngSize(pngBytes(7, 3))).toEqual({ width: 7, height: 3 });
    expect(imageSize(pngBytes(7, 3))).toEqual({ format: 'png', width: 7, height: 3 });
  });

  it('read a baseline and a progressive JPEG past the segments before the frame header', () => {
    expect(jpegSize(jpegBytes(1280, 640))).toEqual({ width: 1280, height: 640 });
    expect(jpegSize(jpegBytes(1600, 1000, 0xc2))).toEqual({ width: 1600, height: 1000 });
    expect(imageSize(jpegBytes(1280, 640))).toEqual({ format: 'jpg', width: 1280, height: 640 });
  });

  it('say null for bytes that are neither, rather than a size', () => {
    expect(imageSize(Buffer.from('not an image at all'))).toBe(null);
    expect(jpegSize(pngBytes(4, 2))).toBe(null);
    expect(pngSize(jpegBytes(4, 2))).toBe(null);
  });
});

describe('the manifest check', () => {
  it('passes a set that agrees, with the optional fight absent from both the manifest and the disk', () => {
    expect(optional.length, 'the table declares no optional shot: the FAIL-but-right case is vacuous').toBeGreaterThan(0);
    const set = goodSet({ skip: optional });
    const r = mediaProblems(set);
    expect(r.problems).toEqual([]);
    expect(r.checked).toBe(MEDIA_SHOTS.length - optional.length);
  });

  it('refuses a stray file on disk that the manifest does not list', () => {
    const set = goodSet();
    set.files.push({ path: 'docs/media/stills/old.jpg', bytes: 1000, width: 1600, height: 1000, format: 'jpg' });
    expect(mediaProblems(set).problems.join('\n')).toMatch(/docs\/media\/stills\/old\.jpg.*not listed/);
  });

  it('refuses a listed file the disk does not have', () => {
    const set = goodSet();
    set.files = set.files.filter((f) => !f.path.endsWith('hero.jpg'));
    expect(mediaProblems(set).problems.join('\n')).toMatch(/hero\.jpg.*missing/);
  });

  it('refuses a file whose bytes, or width and height, differ from what the manifest says', () => {
    const bytes = goodSet();
    bytes.files[0].bytes += 1;
    expect(mediaProblems(bytes).problems.join('\n')).toMatch(/bytes/);
    const turned = goodSet();
    const social = turned.manifest.files.find((e) => e.purpose === 'social');
    [social.width, social.height] = [social.height, social.width];
    expect(mediaProblems(turned).problems.join('\n')).toMatch(/social-preview\.jpg.*640x1280/);
  });

  it('refuses a frame over its budget, a software renderer, an empty renderer, a short sha and a dirty tree', () => {
    const cases = [
      [(e, f) => { e.bytes = f.bytes = MEDIA_BUDGETS.jpgBytes + 1; }, /over its .*budget/],
      [(e) => { e.renderer = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))'; }, /software/],
      [(e) => { e.renderer = ''; }, /renderer/],
      [(e) => { e.sha = 'abc1234'; }, /sha/],
      [(e) => { e.dirty = true; }, /dirty/],
    ];
    for (const [mutate, re] of cases) {
      const set = goodSet();
      const i = set.manifest.files.findIndex((e) => e.format === 'jpg');
      mutate(set.manifest.files[i], set.files.find((f) => f.path === set.manifest.files[i].file));
      expect(mediaProblems(set).problems.join('\n')).toMatch(re);
    }
  });

  it('refuses a required shot with no entry, an entry for a shot the table dropped, and a folder over its budget', () => {
    const required = MEDIA_SHOTS.find((s) => !s.optional && s.purpose === 'still');
    expect(mediaProblems(goodSet({ skip: [required.name] })).problems.join('\n')).toMatch(new RegExp(`${required.name}.*no file`));
    const dropped = goodSet();
    dropped.manifest.files[0].shot = 'retired-shot';
    expect(mediaProblems(dropped).problems.join('\n')).toMatch(/retired-shot/);
    const heavy = goodSet();
    for (const f of heavy.files) if (f.path.startsWith('docs/media/')) f.bytes = MEDIA_BUDGETS.jpgBytes;
    for (const e of heavy.manifest.files) if (e.file.startsWith('docs/media/')) e.bytes = MEDIA_BUDGETS.jpgBytes;
    heavy.manifestBytes = MEDIA_BUDGETS.docsMediaBytes;
    expect(mediaProblems(heavy).problems.join('\n')).toMatch(/docs\/media.*over its 3000000-byte budget/);
  });
});

describe('the per-shot verdict', () => {
  const hero = MEDIA_SHOTS.find((s) => s.recipe.kind === 'eye');
  const pose = MEDIA_SHOTS.find((s) => s.recipe.kind === 'pose');
  const cycle = MEDIA_TIMES[hero.time];
  const stand = [0, 52.95, 0];
  const reading = (over = {}) => ({ active: true, isAlive: true, worldBuilt: true, cycle, contextLosses: 0, tier: 'high',
    gl: { renderer: HW }, pose: null, handNodes: 9, body: [0.1, 52.95, 0], heading: hero.recipe.heading,
    hostiles: { nearestM: 20, within8m: 0 }, ...over });
  const eye = (after, over = {}) => mediaShotVerdict({ shot: hero, heading: hero.recipe.heading, stand, handsHidden: 0,
    hudVisible: false, nearestMobM: 20, before: reading(), after, ...over });

  it('passes an eye shot with the hands mounted, the HUD hidden, the body stood and the bearing held', () => {
    expect(eye(reading())).toEqual({ valid: true, why: [] });
  });

  it('refuses an eye shot with the HUD on screen, the hands hidden, a hostile in the face or a lower tier', () => {
    expect(eye(reading(), { hudVisible: true }).why.join('\n')).toMatch(/HUD/);
    expect(eye(reading({ handNodes: 0 })).why.join('\n')).toMatch(/hands/);
    expect(eye(reading({ hostiles: { nearestM: OBSTRUCTION_M - 0.5, within8m: 1 } })).why.join('\n')).toMatch(/hostile/);
    expect(eye(reading({ tier: 'med' })).why.join('\n')).toMatch(/tier/);
    expect(eye(reading({ heading: hero.recipe.heading + 5 })).why.join('\n')).toMatch(/facing/);
    expect(eye(reading({ body: [3, 52.95, 0] })).why.join('\n')).toMatch(/stand/);
  });

  it('refuses an eye shot with any mob in the eye, a passive animal too, and one whose mobs were not read', () => {
    // An ox at arm's length passed every check above in the first shoot: the seam counts hostiles only.
    expect(eye(reading(), { nearestMobM: OBSTRUCTION_M - 1 }).why.join('\n')).toMatch(/mob .* from the eye/);
    expect(eye(reading(), { nearestMobM: undefined }).why.join('\n')).toMatch(/mobs not checked/);
    expect(eye(reading(), { nearestMobM: null }).valid).toBe(true);
    expect(eye(reading(), { nearestMobM: OBSTRUCTION_M + 0.5 }).valid).toBe(true);
  });

  it('measures the nearest mob of any kind from the eye', () => {
    const mobs = [{ type: 'ox', passive: true, position: [0, 50, 2] }, { type: 'zombie', passive: false, position: [5, 50, 0] }];
    expect(nearestMobM(mobs, [0, 50, 0])).toBeCloseTo(2, 5);
    expect(nearestMobM([], [0, 50, 0])).toBe(null);
  });

  it('refuses any shot on a software renderer, a dead player or a clock that drifted', () => {
    expect(eye(reading({ gl: { renderer: 'SwiftShader' } })).why.join('\n')).toMatch(/software/);
    expect(eye(reading({ isAlive: false })).why.join('\n')).toMatch(/dead/);
    expect(eye(reading({ cycle: cycle + 0.05 })).why.join('\n')).toMatch(/clock/);
  });

  it('wants a pose shot pinned at its place, and does not ask a pose for hands', () => {
    const place = LOOKBOOK_PLACES.find((p) => p.id === pose.recipe.place);
    const pc = MEDIA_TIMES[pose.time];
    const pinned = reading({ cycle: pc, handNodes: 0, pose: { position: place.position, lookAt: place.lookAt, fov: 75 } });
    const v = (after) => mediaShotVerdict({ shot: pose, before: reading({ cycle: pc }), after, hudVisible: false });
    expect(v(pinned)).toEqual({ valid: true, why: [] });
    expect(v({ ...pinned, pose: null }).why.join('\n')).toMatch(/pose/);
  });

  it('wants a fight shot to have a hostile in range, not past it and not in the eye', () => {
    const fight = MEDIA_SHOTS.find((s) => s.recipe.kind === 'fight');
    expect(fight, 'the table declares no fight shot').toBeTruthy();
    const fc = MEDIA_TIMES[fight.time];
    const v = (nearestM) => mediaShotVerdict({ shot: fight, heading: 90, stand, handsHidden: 0, hudVisible: false, nearestMobM: 6,
      before: reading({ cycle: fc }), after: reading({ cycle: fc, heading: 90, hostiles: { nearestM, within8m: 1 } }) });
    expect(v(6).valid).toBe(true);
    expect(v(fight.recipe.maxM + 3).why.join('\n')).toMatch(/hostile/);
    expect(v(null).why.join('\n')).toMatch(/hostile/);
    expect(v(OBSTRUCTION_M - 1).why.join('\n')).toMatch(/hostile/);
  });
});

describe('the fight target', () => {
  it('picks the nearest hostile in range, never a passive animal, a quest NPC or one out of range', () => {
    // The animal and the NPC stand inside the range and nearer than any hostile, so only their own exclusion keeps
    // them out; the zombie is nearer still but inside the eye's obstruction distance.
    const mobs = [
      { type: 'cow', passive: true, position: [4.5, 50, 0] },
      { type: 'guide', passive: false, npcName: 'Old Pike', position: [5, 50, 0] },
      { type: 'zombie', passive: false, position: [1, 50, 0] },
      { type: 'skeleton', passive: false, position: [0, 50, 9] },
      { type: 'spider', passive: false, position: [0, 50, 6] },
      { type: 'brute', passive: false, position: [40, 50, 0] },
    ];
    const t = nearestHostile(mobs, [0, 50, 0], { minM: 4, maxM: 14 });
    expect(t.type).toBe('spider');
    expect(t.distance).toBeCloseTo(6, 5);
    expect(nearestHostile(mobs.slice(0, 3), [0, 50, 0], { minM: 4, maxM: 14 })).toBe(null);
  });
});

describe('merging a re-shoot into the manifest', () => {
  it('replaces the re-shot entries, keeps the rest, drops shots the table no longer declares, in table order', () => {
    const { manifest } = goodSet();
    const old = { files: [...manifest.files, { ...manifest.files[0], shot: 'retired', file: 'docs/media/stills/retired.jpg' }] };
    const fresh = [{ ...manifest.files[1], sha: 'b'.repeat(40) }];
    const merged = mergeManifest(old, fresh);
    expect(merged.files.map((e) => e.shot)).toEqual(MEDIA_SHOTS.map((s) => s.name));
    expect(merged.files[1].sha).toBe('b'.repeat(40));
    expect(merged.files[0].sha).toBe(SHA);
  });
});

describe('the og card', () => {
  const html = ogCardHtml({ frame: 'data:image/png;base64,AAAA', wordmarkFont: 'data:font/woff2;base64,BBBB',
    textFont: 'data:font/woff2;base64,CCCC', width: OG_CARD.width, height: OG_CARD.height });

  it('carries the wordmark in the game\'s Lilita One, gold on ink, with the brand subtitle and the frame', () => {
    expect(html).toContain(`>${BRAND.name}<`);
    expect(html).toContain('Lilita One');
    expect(html).toContain(BRAND.accent);
    expect(html).toContain(BRAND.ground);
    expect(html).toContain(cardSubtitle());
    expect(html).toContain('data:image/png;base64,AAAA');
    expect(html).toContain(`width: ${OG_CARD.width}px`);
  });

  it('has no buttons and no controls text', () => {
    expect(html).not.toMatch(/<button|Start Adventure|WASD|<kbd/i);
  });

  it('takes its subtitle from the brand title, capitalised, and escapes what it prints', () => {
    expect(cardSubtitle({ ...BRAND, title: 'Crafty: a voxel action-RPG in your browser' })).toBe('A voxel action-RPG in your browser');
    expect(ogCardHtml({ frame: 'x', wordmarkFont: 'y', textFont: 'z', width: 10, height: 5,
      brand: { ...BRAND, name: '<b>', title: 'X: a & b' } })).toContain('&lt;b&gt;');
  });
});

describe('the tree check and the encoder argv', () => {
  it('counts a dirty file outside the outputs, and not the outputs a re-shoot rewrites', () => {
    const porcelain = [' M docs/media/hero.jpg', '?? docs/media/stills/coast.jpg', ' M frontend/public/og-image.png',
      ' M frontend/src/App.jsx', ''].join('\n');
    expect(dirtyOutsideOutputs(porcelain)).toEqual(['frontend/src/App.jsx']);
    expect(dirtyOutsideOutputs('')).toEqual([]);
  });

  it('encodes a JPEG to the exact size and a byte target, and an og PNG to a palette, stripped of metadata', () => {
    const j = jpegEncodeArgv('m.png', 'o.jpg', { width: 1600, height: 900, targetBytes: 330000 });
    expect(j).toEqual(expect.arrayContaining(['m.png', '-resize', '1600x900!', '-strip', '-define', 'jpeg:extent=330000', 'o.jpg']));
    expect(j.indexOf('m.png')).toBeLessThan(j.indexOf('-resize'));
    expect(j[j.length - 1]).toBe('o.jpg');
    const p = pngPaletteArgv('c.png', 'o.png', { width: 1200, height: 630, colors: 192 });
    expect(p).toEqual(expect.arrayContaining(['-resize', '1200x630!', '-strip', '-colors', '192', 'PNG8:o.png']));
  });
});
