import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  mobFeed,
  fightTarget,
  posePlace,
  runProvenance,
  buildIdentity,
  filesUnder,
  sha256Hex,
  BUILT_CLEAN,
  COULD_NOT_CHECK,
  mergeManifest,
  ogCardHtml,
  cardSubtitle,
  dirtyOutsideOutputs,
  jpegEncodeArgv,
  pngPaletteArgv,
} from '../../scripts/visual/_media.mjs';
import { LOOKBOOK_PLACES, LOOKBOOK_CYCLES, OBSTRUCTION_M } from '../../scripts/visual/_lookbook.mjs';
import { LOOK_TIMES, scriptKeysAt } from '../../src/render/colourScript.js';
import { HUB_NPCS } from '../../src/world/npcSpawn.js';
import { BRAND } from '../../src/brand.js';

// The pure half of the media pipeline (scripts/visual/media.mjs): the declared shot table, the size readers the file
// gate trusts, the manifest check, the per-shot verdict and the og card. The committed files themselves are checked in
// tests/scripts/media.test.js; this file drives the logic on fixtures whose answer is known by construction.

const SHA = 'a'.repeat(40);
const BUILD_ID = 'b'.repeat(64);
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
    const sha256 = sha256Hex(s.name);
    files.push({ path: s.out, bytes, width, height, format: s.format, sha256 });
    entries.push({ file: s.out, shot: s.name, purpose: s.purpose, sha: SHA, dirty: false, provenance: BUILT_CLEAN,
      build: 'index-BqaKcxrk.js', buildId: BUILD_ID, renderer: HW, time: s.time, cycle: MEDIA_TIMES[s.time],
      cycleAtShot: MEDIA_TIMES[s.time] + 0.002, width, height, bytes, format: s.format, sha256 });
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

  it('pins each pose at a lookbook place or at a camera of its own, and refuses a pose that names both or neither', () => {
    const poses = MEDIA_SHOTS.filter((s) => s.recipe.kind === 'pose');
    expect(poses.length).toBeGreaterThan(0);
    for (const s of poses) expect(posePlace(s.recipe), s.name).not.toBe(null);
    const place = LOOKBOOK_PLACES[0];
    expect(posePlace({ kind: 'pose', place: place.id })).toEqual({ position: place.position, lookAt: place.lookAt });
    expect(posePlace({ kind: 'pose', position: [1, 2, 3], lookAt: [4, 5, 6] })).toEqual({ position: [1, 2, 3], lookAt: [4, 5, 6] });
    const pose = poses[0];
    const swap = (recipe) => shotTableProblems(MEDIA_SHOTS.map((s) => (s === pose ? { ...s, recipe } : s))).join('\n');
    expect(swap({ kind: 'pose', position: [1, 2, 3], lookAt: [4, 5, 6] })).toBe('');
    expect(swap({ kind: 'pose', place: place.id, position: [1, 2, 3], lookAt: [4, 5, 6] })).toMatch(/not both/);
    expect(swap({ kind: 'pose', position: [1, 2, NaN], lookAt: [4, 5, 6] })).toMatch(/finite/);
    expect(swap({ kind: 'pose', position: [1, 2, 3] })).toMatch(/finite/);
    expect(swap({ kind: 'pose' })).toMatch(/no lookbook place/);
    expect(posePlace({ kind: 'pose', position: [1, 2, 3] })).toBe(null);
  });

  it('names its times from the light script, and each name sits where the light script\'s keys say it is', () => {
    expect(MEDIA_TIMES).toBe(LOOK_TIMES);
    expect([...LOOKBOOK_CYCLES], 'the lookbook and the media shoot the same four times').toEqual(Object.values(LOOK_TIMES));
    // Which of the six keys brackets each named time (render/colourScript.js scriptKeysAt): a "golden hour" moved to
    // noon, or a "blue hour" moved past midnight, reads its name falsely and fails here.
    const keys = (name) => { const k = scriptKeysAt(MEDIA_TIMES[name]); return [k.from, k.to]; };
    expect(keys('golden hour')).toContain('sunset');
    expect(keys('blue hour')).toContain('dusk');
    expect(scriptKeysAt(MEDIA_TIMES.afternoon)).toMatchObject({ to: 'day', t: 1 });
    expect(scriptKeysAt(MEDIA_TIMES.midnight)).toMatchObject({ from: 'night', t: 0 });
    for (const s of MEDIA_SHOTS) expect(Object.keys(LOOK_TIMES), s.name).toContain(s.time);
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
      [(e, f) => { e.bytes = f.bytes = MEDIA_BUDGETS.jpgBytes + 1; }, /over its .*ceiling/],
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

  it('holds each file to the table, not only to media.json: its format, its byte target, its purpose and its cycle', () => {
    const hero = MEDIA_SHOTS.find((s) => s.purpose === 'hero');
    const pick = (set) => [set.manifest.files.find((e) => e.shot === hero.name), set.files.find((f) => f.path === hero.out)];
    // A PNG named hero.jpg, with media.json rewritten to agree with it: only the table can refuse it.
    const png = goodSet();
    { const [e, f] = pick(png); e.format = f.format = 'png'; }
    expect(mediaProblems(png).problems.join('\n')).toMatch(/hero\.jpg: the file is a png, the table declares a jpg/);
    // Over the table's target and still under the JPEG budget: the table's number is the ceiling.
    expect(hero.targetBytes).toBeLessThan(MEDIA_BUDGETS.jpgBytes);
    const fat = goodSet();
    { const [e, f] = pick(fat); e.bytes = f.bytes = hero.targetBytes + 1; }
    expect(mediaProblems(fat).problems.join('\n')).toMatch(new RegExp(`hero\\.jpg: ${hero.targetBytes + 1} bytes, over its ${hero.targetBytes}-byte ceiling`));
    const purpose = goodSet();
    pick(purpose)[0].purpose = 'still';
    expect(mediaProblems(purpose).problems.join('\n')).toMatch(/hero\.jpg: purpose still, the table says hero/);
    const cycle = goodSet();
    pick(cycle)[0].cycle = MEDIA_TIMES['blue hour'];
    expect(mediaProblems(cycle).problems.join('\n')).toMatch(/hero\.jpg: media\.json says cycle 0\.55/);
    const drift = goodSet();
    pick(drift)[0].cycleAtShot = MEDIA_TIMES[hero.time] + 0.03;
    expect(mediaProblems(drift).problems.join('\n')).toMatch(/hero\.jpg: the clock read/);
  });

  it('compares every file by its sha256, so a re-encode of the same size and length fails', () => {
    const set = goodSet();
    set.files[0].sha256 = sha256Hex('a re-encoded frame');
    expect(mediaProblems(set).problems.join('\n')).toMatch(new RegExp(`${set.files[0].path.replace(/\./g, '\\.')}: media\.json says sha256`));
  });

  it('refuses a stray dotfile among the media, even one media.json lists', () => {
    const set = goodSet();
    set.files.push({ path: 'docs/media/stills/.draft.jpg', bytes: 10, width: 1600, height: 1000, format: 'jpg', sha256: sha256Hex('x') });
    expect(mediaProblems(set).problems.join('\n')).toMatch(/\.draft\.jpg: a dotfile among the media/);
    set.manifest.files.push({ ...set.manifest.files.find((e) => e.purpose === 'still'), file: 'docs/media/stills/.draft.jpg' });
    expect(mediaProblems(set).problems.join('\n')).toMatch(/\.draft\.jpg: a dotfile among the media/);
  });

  it('refuses a file whose provenance is not a bundle the run built: a handed build, no build chunk, no build identity', () => {
    const cases = [
      [(e) => { Object.assign(e, runProvenance({ ownBuild: false, headBefore: SHA, headAfter: SHA, porcelainBefore: '', porcelainAfter: '' })); }, /sha "null"|dirty|provenance/],
      [(e) => { e.provenance = undefined; }, /provenance ""/],
      [(e) => { e.build = null; }, /build "null" is not an index chunk/],
      [(e) => { e.buildId = 'abc'; }, /buildId "abc"/],
    ];
    for (const [mutate, re] of cases) {
      const set = goodSet();
      mutate(set.manifest.files[0]);
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

/** The Hearth's named NPCs, standing 20 m and more from `at`: what a live mob feed always lists. */
const hearthNpcs = (at) => HUB_NPCS.map((n, i) => ({ type: 'villager', hostile: false, npc: n.name, position: [at[0] + 20 + i, at[1], at[2]] }));
const EYE = [0, 54.6, 0];
/** The seam's mob list as mobFeed reads it: the Hearth's NPCs plus `mobs`. */
const liveFeed = (mobs = [], at = EYE) => mobFeed([...hearthNpcs(at), ...mobs], at);

describe('the mob feed', () => {
  it('measures the nearest mob of any kind from the eye, a named NPC included', () => {
    const f = liveFeed([{ type: 'ox', hostile: false, npc: null, position: [0, 54.6, 2] }, { type: 'zombie', hostile: true, npc: null, position: [5, 54.6, 0] }]);
    expect(f).toMatchObject({ checked: true, named: HUB_NPCS.length, nearestType: 'ox' });
    expect(f.nearestM).toBeCloseTo(2, 5);
    expect(liveFeed().nearestM).toBeCloseTo(20, 5);
  });

  it('calls a feed that cannot be the world\'s COULD NOT CHECK, never "no mob near": none, empty, nameless, an NPC short', () => {
    expect(HUB_NPCS.length, 'no named NPC to look for: the presence check is vacuous').toBeGreaterThan(0);
    const dead = [null, undefined, [], [{ type: 'zombie', hostile: true, npc: null, position: [9, 54.6, 0] }], hearthNpcs(EYE).slice(1)];
    for (const list of dead) {
      const f = mobFeed(list, EYE);
      expect(f.checked, JSON.stringify(list)).toBe(false);
      expect(f.why).toMatch(new RegExp(`^${COULD_NOT_CHECK}`));
    }
    expect(mobFeed(hearthNpcs(EYE), null).checked, 'no eye to measure from').toBe(false);
  });
});

describe('the per-shot verdict', () => {
  const hero = MEDIA_SHOTS.find((s) => s.recipe.kind === 'eye');
  const pose = MEDIA_SHOTS.find((s) => s.recipe.kind === 'pose' && s.recipe.place);
  const cycle = MEDIA_TIMES[hero.time];
  const stand = [0, 52.95, 0];
  const reading = (over = {}) => ({ active: true, isAlive: true, worldBuilt: true, cycle, contextLosses: 0, tier: 'high',
    gl: { renderer: HW }, pose: null, handNodes: 9, body: [0.1, 52.95, 0], eye: EYE, heading: hero.recipe.heading,
    hostiles: { nearestM: 20, within8m: 0 }, ...over });
  const eye = (after, over = {}) => mediaShotVerdict({ shot: hero, heading: hero.recipe.heading, stand, handsHidden: 0,
    hudSeenOn: true, hudVisible: false, mobs: liveFeed(), before: reading(), after, ...over });
  const at = (m, type = 'boar') => ({ type, hostile: false, npc: null, position: [EYE[0] + m, EYE[1], EYE[2]] });

  it('passes an eye shot with the hands mounted, the HUD hidden, the body stood and the bearing held', () => {
    expect(eye(reading())).toEqual({ valid: true, why: [], couldNotCheck: false });
  });

  it('refuses an eye shot with the HUD on screen, the hands hidden, a hostile in the face or a lower tier', () => {
    expect(eye(reading(), { hudVisible: true }).why.join('\n')).toMatch(/HUD/);
    expect(eye(reading({ handNodes: 0 })).why.join('\n')).toMatch(/hands/);
    expect(eye(reading({ hostiles: { nearestM: OBSTRUCTION_M - 0.5, within8m: 1 } })).why.join('\n')).toMatch(/hostile/);
    expect(eye(reading({ tier: 'med' })).why.join('\n')).toMatch(/tier/);
    expect(eye(reading({ heading: hero.recipe.heading + 5 })).why.join('\n')).toMatch(/facing/);
    expect(eye(reading({ body: [3, 52.95, 0] })).why.join('\n')).toMatch(/stand/);
  });

  it('counts the HUD hidden only after this run saw it on screen', () => {
    const blind = eye(reading(), { hudSeenOn: false, hudVisible: false });
    expect(blind.valid).toBe(false);
    expect(blind.couldNotCheck).toBe(true);
    expect(blind.why.join('\n')).toMatch(/never saw it on screen/);
    expect(eye(reading(), { hudSeenOn: undefined }).valid).toBe(false);
  });

  it('a dead mob feed must not pass; a mob at 2 m fails the frame; one at 8 m passes it', () => {
    const dead = eye(reading(), { mobs: mobFeed([], EYE) });
    expect(dead.valid).toBe(false);
    expect(dead.couldNotCheck).toBe(true);
    expect(eye(reading(), { mobs: undefined }).valid, 'no reading at all').toBe(false);
    const close = eye(reading(), { mobs: liveFeed([at(2)]) });
    expect(close.valid).toBe(false);
    expect(close.couldNotCheck).toBe(false);
    expect(close.why.join('\n')).toMatch(/a mob \(boar\) 2\.0 m from the eye/);
    expect(eye(reading(), { mobs: liveFeed([at(8)]) })).toEqual({ valid: true, why: [], couldNotCheck: false });
  });

  it('refuses any shot on a software renderer, a dead player or a clock that drifted', () => {
    expect(eye(reading({ gl: { renderer: 'SwiftShader' } })).why.join('\n')).toMatch(/software/);
    expect(eye(reading({ isAlive: false })).why.join('\n')).toMatch(/dead/);
    expect(eye(reading({ cycle: cycle + 0.05 })).why.join('\n')).toMatch(/clock/);
  });

  it('wants a pose shot pinned at its place, does not ask a pose for hands, and holds it to the mob rule too', () => {
    const place = posePlace(pose.recipe);
    const pc = MEDIA_TIMES[pose.time];
    const pinned = reading({ cycle: pc, handNodes: 0, eye: place.position, pose: { position: place.position, lookAt: place.lookAt, fov: 75 } });
    const v = (after, mobs = liveFeed([], place.position)) => mediaShotVerdict({ shot: pose, before: reading({ cycle: pc }), after,
      hudSeenOn: true, hudVisible: false, mobs });
    expect(v(pinned)).toEqual({ valid: true, why: [], couldNotCheck: false });
    expect(v({ ...pinned, pose: null }).why.join('\n')).toMatch(/pose/);
    expect(v(pinned, mobFeed(null, place.position)).couldNotCheck).toBe(true);
    const goat = { type: 'goat', hostile: false, npc: null, position: [place.position[0] + 1.5, place.position[1], place.position[2]] };
    expect(v(pinned, liveFeed([goat], place.position)).why.join('\n')).toMatch(/goat/);
    const own = { ...pose, recipe: { kind: 'pose', position: [-13, 60, 5], lookAt: [8, 53, -8] } };
    const at = (position) => mediaShotVerdict({ shot: own, before: reading({ cycle: pc }), hudSeenOn: true, hudVisible: false,
      mobs: liveFeed([], position), after: { ...pinned, eye: position, pose: { position, lookAt: own.recipe.lookAt, fov: 75 } } });
    expect(at([-13, 60, 5]).valid, 'pinned at its own camera').toBe(true);
    expect(at(place.position).why.join('\n')).toMatch(/not pinned at the declared pose/);
  });

  it('wants a fight shot to have a hostile in range, not past it and not in the eye', () => {
    const fight = MEDIA_SHOTS.find((s) => s.recipe.kind === 'fight');
    expect(fight, 'the table declares no fight shot').toBeTruthy();
    const fc = MEDIA_TIMES[fight.time];
    const v = (nearestM) => mediaShotVerdict({ shot: fight, heading: 90, stand, handsHidden: 0, hudSeenOn: true, hudVisible: false,
      mobs: liveFeed([at(6, 'zombie')]), before: reading({ cycle: fc }), after: reading({ cycle: fc, heading: 90, hostiles: { nearestM, within8m: 1 } }) });
    expect(v(6).valid).toBe(true);
    expect(v(fight.recipe.maxM + 3).why.join('\n')).toMatch(/hostile/);
    expect(v(null).why.join('\n')).toMatch(/hostile/);
    expect(v(OBSTRUCTION_M - 1).why.join('\n')).toMatch(/hostile/);
  });
});

describe('the fight target', () => {
  const from = [0, 50, 0];
  const range = { minM: 4, maxM: 14 };

  it('picks the nearest hostile in range, never a passive animal, a named NPC or one out of range', () => {
    // The animal and the NPC stand inside the range and nearer than any hostile, so only their own exclusion keeps
    // them out; the zombie is nearer still but inside the eye's obstruction distance.
    const mobs = [
      ...hearthNpcs(from),
      { type: 'cow', hostile: false, npc: null, position: [4.5, 50, 0] },
      { type: 'villager', hostile: true, npc: HUB_NPCS[0].name, position: [5, 50, 0] },
      { type: 'zombie', hostile: true, npc: null, position: [1, 50, 0] },
      { type: 'skeleton', hostile: true, npc: null, position: [0, 50, 9] },
      { type: 'spider', hostile: true, npc: null, position: [0, 50, 6] },
      { type: 'brute', hostile: true, npc: null, position: [40, 50, 0] },
    ];
    const t = fightTarget(mobs, from, range);
    expect(t.checked).toBe(true);
    expect(t.target.type).toBe('spider');
    expect(t.target.distance).toBeCloseTo(6, 5);
    expect(fightTarget(mobs.slice(0, HUB_NPCS.length + 3), from, range)).toEqual({ checked: true, why: null, target: null });
  });

  it('on a dead feed says COULD NOT CHECK, never "no hostile came"', () => {
    const zombie = { type: 'zombie', hostile: true, npc: null, position: [0, 50, 6] };
    for (const list of [null, [], [zombie]]) {
      const t = fightTarget(list, from, range);
      expect(t.checked).toBe(false);
      expect(t.target).toBe(null);
      expect(t.why).toMatch(new RegExp(`^${COULD_NOT_CHECK}`));
    }
  });
});

describe('the provenance a run may stamp', () => {
  const HEAD = 'c'.repeat(40);
  const clean = { ownBuild: true, headBefore: HEAD, headAfter: HEAD, porcelainBefore: '', porcelainAfter: '' };

  it('stamps HEAD only on a bundle the run built from a clean tree at a HEAD that held still', () => {
    expect(runProvenance(clean)).toEqual({ sha: HEAD, dirty: false, provenance: BUILT_CLEAN });
    expect(runProvenance({ ...clean, porcelainBefore: ' M docs/media/hero.jpg\n M frontend/public/og-image.png\n' }).sha,
      'the run\'s own outputs do not make the tree dirty').toBe(HEAD);
  });

  it('stamps no sha on a handed build, a dirty tree, a HEAD that moved or an unread HEAD', () => {
    const cases = [
      [{ ownBuild: false }, /--build-dir/],
      [{ ownBuild: undefined }, /--build-dir/],
      [{ porcelainBefore: ' M frontend/src/App.jsx\n' }, /dirty.*App\.jsx/],
      [{ porcelainAfter: '?? frontend/src/new.js\n' }, /dirty.*new\.js/],
      [{ headAfter: 'd'.repeat(40) }, /moved/],
      [{ headBefore: 'HEAD', headAfter: 'HEAD' }, /not read/],
    ];
    for (const [over, re] of cases) {
      const p = runProvenance({ ...clean, ...over });
      expect(p.sha, JSON.stringify(over)).toBe(null);
      expect(p.dirty).not.toBe(false);
      expect(p.provenance).not.toBe(BUILT_CLEAN);
      expect(p.provenance).toMatch(re);
    }
  });

  it('names a build by every byte it serves, in any listing order', () => {
    const files = [{ path: 'index.html', sha256: sha256Hex('<html>') }, { path: 'assets/index-a.js', sha256: sha256Hex('js') }];
    const id = buildIdentity(files);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(buildIdentity([...files].reverse())).toBe(id);
    expect(buildIdentity([files[0], { ...files[1], sha256: sha256Hex('js ') }])).not.toBe(id);
    expect(buildIdentity([files[0], { ...files[1], path: 'assets/index-b.js' }])).not.toBe(id);
    expect(buildIdentity(files.slice(0, 1))).not.toBe(id);
  });
});

describe('the folder listing the file check and the build identity count', () => {
  it('lists every file, dotfiles and dot-folders included, and leaves out only .DS_Store', () => {
    const dir = mkdtempSync(join(tmpdir(), 'media-walk-'));
    mkdirSync(join(dir, 'stills'));
    mkdirSync(join(dir, '.cache'));
    for (const f of ['hero.jpg', '.stray', 'stills/a.jpg', 'stills/.b.jpg', '.cache/c.bin', '.DS_Store', 'stills/.DS_Store']) {
      writeFileSync(join(dir, f), 'x');
    }
    expect(filesUnder(dir)).toEqual(['.cache/c.bin', '.stray', 'hero.jpg', 'stills/.b.jpg', 'stills/a.jpg']);
    expect(filesUnder(join(dir, 'stills'), dir)).toEqual(['stills/.b.jpg', 'stills/a.jpg']);
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
  const html = ogCardHtml({ frame: 'og-frame.png', wordmarkFont: 'data:font/woff2;base64,BBBB',
    textFont: 'data:font/woff2;base64,CCCC', width: OG_CARD.width, height: OG_CARD.height });

  it('carries the wordmark in the game\'s Lilita One, gold on ink, with the brand subtitle and the frame', () => {
    expect(html).toContain(`>${BRAND.name}<`);
    expect(html).toContain('Lilita One');
    expect(html).toContain(BRAND.accent);
    expect(html).toContain(BRAND.ground);
    expect(html).toContain(cardSubtitle());
    expect(html.match(/<img class="frame" src="og-frame\.png"/g), 'the frame is drawn by exactly one img.frame, which media.mjs checks loaded')
      .toHaveLength(1);
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
