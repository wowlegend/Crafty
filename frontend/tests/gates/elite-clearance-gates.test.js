import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { OBB } from 'three/examples/jsm/math/OBB.js';
import { MOB_TYPES } from '../../src/game/mobTypes.js';
import { mobFeatures } from '../../src/game/mobFeatures.js';
import { drawnFeatures, nametagY, NAMETAG_Y } from '../../src/night/eliteLook.js';

// AN ELITE'S CREST AND BANNER CLEAR THE MOB THEY ARE WORN BY (siege plan Move E; W3-A PR A round 2). Round 1's crest sat
// at one place on every head: its side boxes went inside a duskhound's ears (the frame showed one peach box between two
// violet ears), into an ember husk's charred crown and a moss brute's moss crown, through a skitterling's antennae, and the
// nametag's bar ran through a zombie's crest. For every hostile type in the registry (any of them can roll an elite, and
// the captain is a husk or a brute) and both ranks, on the type's REAL dims and features, as MobModel draws them:
//   - an elite keeps every one of the type's own boxes; a box worn in ember with the type's own geometry is one
//     game/mobFeatures.js marks as the type's crest (the husk's crown);
//   - no box eliteLook places intersects one of the mob's own boxes (exact oriented-box test, 4 mm of contact allowed),
//     the head, or the body, and each crest box rests on the mob (the head or a box under it within 3 cm), not in air;
//   - every crest box shows at least half its face from the front (rays cast toward the eye; only the mob's own features
//     can hide it), so the crest reads as a crest where the player meets the mob;
//   - the nametag's bar clears the whole silhouette, crest and banner included, for a plain mob too, and a low mob's tag
//     stays at NAMETAG_Y.
// BLIND SPOT: geometry only. Whether the crest READS at night and at distance is judged on the lookbook's elite frames.
//
// Mutation-Proof: via scripts/dev/mutate.sh against these 44 tests, each RED, an identity mutant SURVIVED:
//   K10a the duskhound's seat dropped -> duskhound clash and front face
//   K10b the seat's back ignored -> skitterling and duskhound clash
//   K10c the seat's lift ignored -> moss_brute clash
//   K10d a crest stacked on the husk's own crown -> emberhusk clash and front face
//   K10e the husk's crown dropped instead of worn in ember -> emberhusk keeps its own boxes
//   K10f the tag ignores the rank -> zombie, skeleton and moss_brute elite tags
//   K10g the tag's clearance halved -> every raised tag
//   K10h the seat's spread ignored -> duskhound front face
//   K10i the crest at a fixed height -> the crest rests on the mob, six types

const HOSTILES = Object.entries(MOB_TYPES).filter(([, t]) => !t.passive).map(([type]) => type);
const CONTACT_M = 0.004;
const REST_M = 0.03;
const BAR_HALF_M = 0.06; // render/Nametags.jsx: the bar is a unit plane scaled to 0.12 m, centred on the tag's anchor
const TAG_CLEAR_M = 0.2; // the bar's bottom over the silhouette's top
const MIN_FRONT_FACE = 0.5;

const dimsOf = (type) => {
  const t = MOB_TYPES[type];
  const [bodyW, bodyH, bodyD] = t.bodySize;
  const [headW, headH, headD] = t.headSize;
  return { bodyW, bodyH, bodyD, headW, headH, headD };
};
const sig = (f) => JSON.stringify([f.pos, f.box, f.rot ?? null]);
/** What MobModel draws for a mob of `type` with elite `rank`, split: [the type's own boxes as drawn, the boxes eliteLook
 *  placed, the type's own boxes worn in ember]. */
const drawn = (rank, type, d) => {
  const all = drawnFeatures(type, rank, d);
  const own = new Set(mobFeatures(type, d).map(sig));
  return [all.filter((f) => !f.elite), all.filter((f) => f.elite && !own.has(sig(f))), all.filter((f) => f.elite && own.has(sig(f)))];
};
const tagY = (e) => nametagY(e);

const obb = (b, shrink = 0) => {
  const r = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...(b.rot || [0, 0, 0]))));
  return new OBB(new THREE.Vector3(...b.pos), new THREE.Vector3(...b.box).multiplyScalar(0.5).subScalar(shrink).max(new THREE.Vector3(1e-4, 1e-4, 1e-4)), r);
};
const topOf = (b) => {
  const o = obb(b);
  const c = [-1, 1];
  let top = -Infinity;
  for (const x of c) for (const y of c) for (const z of c) {
    const p = new THREE.Vector3(x * o.halfSize.x, y * o.halfSize.y, z * o.halfSize.z).applyMatrix3(o.rotation).add(o.center);
    top = Math.max(top, p.y);
  }
  return top;
};
/** The share of box `b`'s front face (+Z, the mob's facing) not hidden by any of `occluders`, by a 9x9 ray grid. */
const frontFace = (b, occluders) => {
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
  const hit = new THREE.Vector3();
  let seen = 0;
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
    ray.origin.set(b.pos[0] + b.box[0] * ((i + 0.5) / 9 - 0.5), b.pos[1] + b.box[1] * ((j + 0.5) / 9 - 0.5), b.pos[2] + b.box[2] / 2 + 1e-4);
    if (!occluders.some((o) => o.intersectRay(ray, hit))) seen += 1;
  }
  return seen / 81;
};

describe('an elite\'s crest and banner clear the mob that wears them', () => {
  it('the denominator: every hostile type, both ranks', () => {
    expect(HOSTILES.length).toBeGreaterThanOrEqual(7);
    for (const type of ['duskhound', 'emberhusk', 'moss_brute', 'skitterling', 'zombie']) expect(HOSTILES).toContain(type);
  });

  for (const type of HOSTILES) {
    for (const rank of ['ember', 'captain']) {
      it(`${type} ${rank}: an elite keeps its own boxes, and no box placed for it is inside them, the head or the body`, () => {
        const d = dimsOf(type);
        const [kept, placed, ignited] = drawn(rank, type, d);
        const own = mobFeatures(type, d);
        expect([...kept, ...ignited].map(sig).sort(), `${type} ${rank}: the type's own boxes, all drawn`).toEqual(own.map(sig).sort());
        for (const f of ignited) expect(own.find((o) => sig(o) === sig(f)).crest, `${type}: an own box worn in ember is its crest`).toBe(true);
        expect(placed.length + ignited.length, 'the elite boxes').toBe(rank === 'captain' ? 5 : 3);
        const head = { pos: [0, d.bodyH + d.headH / 2, d.bodyD / 3], box: [d.headW, d.headH, d.headD] };
        const body = { pos: [0, d.bodyH / 2, 0], box: [d.bodyW, d.bodyH, d.bodyD] };
        const solids = [...[...kept, ...ignited].map((f, i) => [`own box ${i}`, obb(f)]), ['head', obb(head)], ['body', obb(body)]];
        const clashes = [];
        for (const b of placed) {
          const e = obb(b, CONTACT_M);
          for (const [name, o] of solids) if (e.intersectsOBB(o)) clashes.push(`${JSON.stringify(b.pos.map((v) => +v.toFixed(3)))} x ${name}`);
        }
        expect(clashes, `${type} ${rank}: elite boxes clashing`).toEqual([]);
        // The crest rests on the mob: straight down from each crest box's base, the head or one of its own boxes within
        // REST_M. The banner hangs on the back and is held to no seat.
        const down = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
        const hit = new THREE.Vector3();
        const gaps = placed.filter((b) => b.tone === 'ember' && b.pos[2] > -d.bodyD / 2).map((b) => { // the banner is behind the body
          down.origin.set(b.pos[0], b.pos[1] - b.box[1] / 2, b.pos[2]);
          const ds = solids.map(([, o]) => (o.intersectRay(down, hit) ? hit.distanceTo(down.origin) : Infinity));
          return +Math.min(...ds).toFixed(3);
        });
        expect(gaps.length, `${type} ${rank}: crest boxes placed (the husk wears its own)`).toBe(type === 'emberhusk' ? 0 : 3);
        for (const g of gaps) expect(g, `${type} ${rank}: air under the crest ${JSON.stringify(gaps)}`).toBeLessThanOrEqual(REST_M);
      });
    }

    it(`${type}: every crest box shows at least half its face from the front`, () => {
      const d = dimsOf(type);
      const [kept, placed, ignited] = drawn('ember', type, d);
      const occluders = kept.map((f) => obb(f));
      const crest = [...placed, ...ignited].filter((b) => b.tone === 'ember');
      expect(crest.length, 'the crest boxes').toBe(3);
      const faces = crest.map((b) => +frontFace(b, occluders).toFixed(2));
      for (const f of faces) expect(f, `${type}: crest faces shown from the front ${JSON.stringify(faces)}`).toBeGreaterThanOrEqual(MIN_FRONT_FACE);
    });

    for (const rank of [null, 'ember', 'captain']) {
      it(`${type} ${rank ?? 'plain'}: the nametag's bar clears the silhouette`, () => {
        const d = dimsOf(type);
        const top = Math.max(d.bodyH + d.headH, ...drawnFeatures(type, rank, d).map(topOf));
        const y = tagY({ type, elite: rank });
        expect(y - BAR_HALF_M - top, `${type} ${rank}: the bar's bottom over the silhouette's top (${top.toFixed(3)} m)`).toBeGreaterThanOrEqual(TAG_CLEAR_M - 1e-9);
      });
    }
  }

  it('a low mob\'s nametag stays at NAMETAG_Y, 2.4 m', () => {
    expect(NAMETAG_Y).toBe(2.4);
    for (const type of ['skeleton', 'spider', 'skitterling', 'pig']) expect(tagY({ type, elite: null }), type).toBe(NAMETAG_Y);
  });
});
