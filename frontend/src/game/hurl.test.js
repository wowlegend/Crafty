import { describe, it, expect } from 'vitest';
import { makeHurl, stepHurl, stepHurlChunked, resolveSlam, resolveAnvil, ANVIL_RANGE, ANVIL_MULT, HURL_SPEED, HURL_TTL_SEC, HURL_HIT_RADIUS, HURL_KNOCK, SLAM_RADIUS, SLAM_DAMAGE_MULT, HURL_DAMAGE, adoptHurlRequest, flightSlot, MAX_FLIGHTS } from './hurl';
import { requestHurl, consumeHurlRequest } from './hurlChannel.js';
import { GRAB_COOLDOWN_SEC, GRAB_CHARGE_SEC } from './voidhand.js';
import { VERB_BASE } from './verbMods.js';
import { ASPECT_TREES } from './talentTree.js';
import { RELICS } from './relics.js';

const mob = (id, x, y, z) => ({ id, position: { x, y, z } });

describe('hurl core (S2-B2-M3)', () => {
  it('makeHurl launches along dir at HURL_SPEED with a small lift', () => {
    const h = makeHurl({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(h.velocity.x).toBeCloseTo(HURL_SPEED, 5);
    expect(h.velocity.y).toBeGreaterThan(0);
    expect(h.age).toBe(0);
  });

  it('stepHurl advances ballistically (gravity bends the arc)', () => {
    const h = makeHurl({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    const vy0 = h.velocity.y;
    stepHurl(h, 0.1, []);
    expect(h.position.x).toBeCloseTo(HURL_SPEED * 0.1, 3);
    expect(h.velocity.y).toBeLessThan(vy0);
  });

  it('hits the nearest mob inside HURL_HIT_RADIUS and reports pos+dir (the M4 anvil seam)', () => {
    const h = makeHurl({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    const m = mob('a', HURL_SPEED * 0.1 + 0.5, 10, 0); // just past the first step, inside radius
    const r = stepHurl(h, 0.1, [m]);
    expect(r.done).toBe(true);
    expect(r.hit.id).toBe('a');
    expect(r.hit.pos.x).toBeCloseTo(h.position.x, 5);
    const mag = Math.hypot(r.hit.dir.x, r.hit.dir.y, r.hit.dir.z);
    expect(mag).toBeCloseTo(1, 3); // normalized flight dir for knockback + the M4 wall ray
  });

  it('misses mobs outside the radius and expires at TTL', () => {
    const h = makeHurl({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    const far = mob('b', 0, 10, 9);
    let r = stepHurl(h, 0.1, [far]);
    expect(r.done).toBe(false);
    r = stepHurl(h, HURL_TTL_SEC, [far]);
    expect(r.done).toBe(true);
    expect(r.hit).toBeNull();
  });

  it('resolveSlam returns radial knock events for mobs inside SLAM_RADIUS only', () => {
    const center = { x: 0, y: 10, z: 0 };
    const events = resolveSlam(center, [mob('in', 1.5, 10, 0), mob('edge', 0, 10, SLAM_RADIUS + 0.1), mob('in2', 0, 10.5, -2)]);
    expect(events.map((e) => e.id).sort()).toEqual(['in', 'in2']);
    const e = events.find((x) => x.id === 'in');
    expect(e.dir.x).toBeCloseTo(1, 3); // radial, horizontal, normalized
    expect(e.dir.y).toBe(0);
  });

  it('resolveSlam at a mob directly under the center still yields a finite dir', () => {
    const events = resolveSlam({ x: 0, y: 10, z: 0 }, [mob('under', 0, 9.5, 0)]);
    expect(events).toHaveLength(1);
    expect(Number.isFinite(events[0].dir.x)).toBe(true);
    expect(Math.hypot(events[0].dir.x, events[0].dir.z)).toBeCloseTo(1, 3);
  });

  it('exports the tuning table', () => {
    expect(HURL_SPEED).toBe(22);
    expect(HURL_HIT_RADIUS).toBeCloseTo(1.4, 5);
    expect(HURL_KNOCK).toBe(12);
    expect(SLAM_RADIUS).toBe(3);
    expect(SLAM_DAMAGE_MULT).toBeCloseTo(1.3, 5);
    expect(HURL_DAMAGE).toBe(30);
  });
});

describe('hurl substepping (frame-spike tunneling guard)', () => {
  it('a single 0.5s frame spike must NOT tunnel through a mob on the flight path', () => {
    // dt=0.5 at 22 m/s = an 11m jump; the mob sits at 5m, radius 1.4 — naive stepping tunnels.
    const h = makeHurl({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    const m = { id: 'spike', position: { x: 5, y: 10.2, z: 0 } };
    const r = stepHurlChunked(h, 0.5, [m]);
    expect(r.done).toBe(true);
    expect(r.hit && r.hit.id).toBe('spike');
  });
  it('chunked stepping matches plain stepping for small dt', () => {
    const a = makeHurl({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    const b = makeHurl({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    stepHurl(a, 0.016, []);
    stepHurlChunked(b, 0.016, []);
    expect(b.position.x).toBeCloseTo(a.position.x, 6);
    expect(b.velocity.y).toBeCloseTo(a.velocity.y, 6);
  });
  it('caps a pathological frame (age never jumps past the cap in one call)', () => {
    const h = makeHurl({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    stepHurlChunked(h, 5, []); // absurd 5s frame
    expect(h.age).toBeLessThanOrEqual(0.25 + 1e-9);
  });
});

describe('base-as-anvil (M4)', () => {
  const hit = { id: 'm', pos: { x: 0, y: 10, z: 0 }, dir: { x: 1, y: 0, z: 0 } };
  it('mob next to a wall along the hurl line -> ANVIL_MULT', () => {
    const castRay = () => ({ toi: 1.2 }); // a wall 1.2m past the impact
    expect(resolveAnvil(castRay, hit)).toBe(ANVIL_MULT);
  });
  it('open air -> 1x', () => {
    expect(resolveAnvil(() => null, hit)).toBe(1);
  });
  it('wall beyond ANVIL_RANGE -> 1x (the ray is range-capped by the caller contract)', () => {
    const castRay = (o, d, max) => (max >= 99 ? { toi: 50 } : null);
    expect(resolveAnvil(castRay, hit)).toBe(1);
  });
  it('exports the tuning', () => {
    expect(ANVIL_RANGE).toBe(3);
    expect(ANVIL_MULT).toBe(3);
  });
});

// A THROW YOU PAID FOR ALWAYS FLIES, AND NEVER CUTS ANOTHER SHORT.
//
// The channel's consume is destructive (it nulls its slot on read) and the producer has already spent the grab's ember
// and let go of the block, so a request the consumer declines is a paid throw that never happened. stepHurl has no
// terrain collision, so a miss stays airborne the full HURL_TTL_SEC, and a grab that keeps a second block (Twin Grasp,
// Lodestone) throws it inside the first one's flight: the HurlSystem flies a pool of MAX_FLIGHTS blocks side by side.
describe('adoptHurlRequest and flightSlot — a paid throw always throws', () => {
  const REQ = (color) => ({ origin: { x: 0, y: 2, z: 0 }, dir: { x: 0, y: 0, z: -1 }, color });
  const emptyPool = () => Array.from({ length: MAX_FLIGHTS }, () => null);
  // The consumer's lines against the real channel: consume, adopt, place in the slot flightSlot names.
  const frame = (slots) => { const a = adoptHurlRequest(consumeHurlRequest()); if (a) slots[flightSlot(slots)] = a; };
  const flying = (slots) => slots.filter(Boolean).map((f) => f.color);

  it('cannot refuse: it takes no current-flight argument', () => {
    expect(adoptHurlRequest.length).toBe(1);
  });

  it('a second throw flies beside the first instead of replacing it', () => {
    const slots = emptyPool();
    requestHurl(REQ('#aaa').origin, REQ('#aaa').dir, '#aaa');
    frame(slots);
    expect(flying(slots), 'the first throw never flew').toEqual(['#aaa']);
    stepHurl(slots.find(Boolean).h, 0.1, []); // the first is mid-flight when the kept block goes
    requestHurl(REQ('#bbb').origin, REQ('#bbb').dir, '#bbb');
    frame(slots);
    expect(flying(slots), 'the second throw cut the first short, or was swallowed').toEqual(['#aaa', '#bbb']);
  });

  it('only a full pool gives up a block, and then the one flying longest', () => {
    const slots = emptyPool();
    for (let i = 0; i < MAX_FLIGHTS; i++) {
      requestHurl(REQ(`#${i}`).origin, REQ(`#${i}`).dir, `#${i}`);
      frame(slots);
    }
    expect(flying(slots), 'a throw below the cap replaced one in flight').toHaveLength(MAX_FLIGHTS);
    // The oldest sits in the middle slot, so "the first slot", "the last slot" and "the oldest" are different answers.
    const oldest = Math.floor(MAX_FLIGHTS / 2);
    slots.forEach((f, i) => { f.h.age = i === oldest ? HURL_TTL_SEC - 0.01 : 0.01 * (i + 1); });
    requestHurl(REQ('#new').origin, REQ('#new').dir, '#new');
    frame(slots);
    expect(slots[oldest].color, 'the full pool did not give up the block flying longest').toBe('#new');
    expect(flying(slots)).toHaveLength(MAX_FLIGHTS);
  });

  it('holds every block two grabs in a row can have in the air at once', () => {
    // A grab throws as fast as the clicks come; the next grab commits GRAB_COOLDOWN_SEC + GRAB_CHARGE_SEC after the
    // last throw, so every grab whose commit falls inside one flight's HURL_TTL_SEC can have its blocks up together.
    const throwsPerGrab = VERB_BASE.grabThrows
      + ASPECT_TREES.flatMap((t) => t.nodes).filter((n) => n.mod?.key === 'grabThrows').reduce((s, n) => s + n.mod.add * n.limit, 0)
      + Math.max(0, ...Object.values(RELICS).filter((r) => r.mod.key === 'grabThrows').map((r) => r.mod.add));
    const grabsPerFlight = Math.ceil(HURL_TTL_SEC / (GRAB_COOLDOWN_SEC + GRAB_CHARGE_SEC));
    expect(throwsPerGrab, 'SETUP: the trees and relics no longer add a throw').toBeGreaterThan(1);
    expect(MAX_FLIGHTS, `${grabsPerFlight} grabs of ${throwsPerGrab} blocks`).toBeGreaterThanOrEqual(throwsPerGrab * grabsPerFlight);
  });

  it('an empty channel adopts nothing, so a quiet frame does not respawn the last throw', () => {
    consumeHurlRequest(); // drain
    expect(adoptHurlRequest(consumeHurlRequest())).toBe(null);
    expect(adoptHurlRequest(null)).toBe(null);
    expect(adoptHurlRequest({})).toBe(null);
    expect(adoptHurlRequest({ origin: { x: 0, y: 0, z: 0 } })).toBe(null);
  });

  it('defaults the colour rather than handing undefined to a material', () => {
    const a = adoptHurlRequest({ origin: { x: 0, y: 0, z: 0 }, dir: { x: 1, y: 0, z: 0 } });
    expect(typeof a.color).toBe('string');
    expect(a.color.startsWith('#')).toBe(true);
  });
});
