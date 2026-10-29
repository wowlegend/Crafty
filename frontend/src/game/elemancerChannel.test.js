import { describe, it, expect } from 'vitest';
import { requestZone, consumeZoneRequest } from './elemancerChannel';

describe('S2-B4-M3: the zone request channel (single-slot)', () => {
  it('request -> consume returns once, then null', () => {
    requestZone({ kind: 'burning', pos: { x: 1, y: 2, z: 3 } });
    expect(consumeZoneRequest()).toEqual({ kind: 'burning', pos: { x: 1, y: 2, z: 3 }, chain: 0, radiusMult: 1 });
    expect(consumeZoneRequest()).toBe(null);
  });
  it('a second request before consumption overwrites (last-cast-wins)', () => {
    requestZone({ kind: 'burning', pos: { x: 1, y: 2, z: 3 } });
    requestZone({ kind: 'frozen', pos: { x: 4, y: 5, z: 6 } });
    expect(consumeZoneRequest().kind).toBe('frozen');
  });
});

describe('S2-B4-M5: the cast-arm slot (consume -> spawn handoff)', () => {
  it('armImbueCast -> consumeImbueCast returns the kind once, then null', async () => {
    const { armImbueCast, consumeImbueCast } = await import('./elemancerChannel');
    armImbueCast('burning');
    expect(consumeImbueCast()).toBe('burning');
    expect(consumeImbueCast()).toBe(null);
  });
});

describe('the zone request carries the imbue\'s verb numbers', () => {
  it('passes chain and radiusMult through, and reads junk as no chain and no widening', () => {
    requestZone({ kind: 'frozen', pos: { x: 0, y: 0, z: 0 }, chain: 2, radiusMult: 1.5 });
    expect(consumeZoneRequest()).toMatchObject({ kind: 'frozen', chain: 2, radiusMult: 1.5 });
    requestZone({ kind: 'frozen', pos: { x: 0, y: 0, z: 0 }, chain: NaN, radiusMult: 'x' });
    expect(consumeZoneRequest()).toMatchObject({ chain: 0, radiusMult: 1 });
  });
});
