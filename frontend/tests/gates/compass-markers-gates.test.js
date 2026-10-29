import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { markersNow, CARDINALS } from '../../src/ui/compassMarkers.js';
import { bearingTo } from '../../src/ui/compassLayout.js';
import { nearestLandmark } from '../../src/world/shrines.js';
import { blightHeartSite } from '../../src/world/blightHeart.js';
import { ecs } from '../../src/ecs/world.js';
import { makeNpcEntity, HUB_NPCS } from '../../src/world/npcSpawn.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';

/**
 * What the compass shows, driven through the real marker builder (src/ui/compassMarkers.js) against the real ECS, the
 * real landmark and Blight Heart sites and the real dictionaries. It replaces three source-grep gates that read the old
 * `innerHTML` block in HUD.jsx for the strings "HOME (", "SHRINE (" and "BLIGHT HEART (" (compass-hearth's wiring half,
 * shrine-marker, blight-marker): those could be satisfied by the text existing anywhere in the file, and their
 * capture-suppression assertions guarded baselines the capture oracle no longer takes (DECISIONS item 91).
 *
 * NOT CHECKED HERE: where a marker lands on the strip (src/ui/compassLayout.test.js) and that the strip shows it in a
 * browser (tests/e2e/compass-labels.spec.js).
 */
const byId = (list) => Object.fromEntries(list.map((m) => [m.id, m]));
const fresh = () => ({});
const NO_PROPS = { bossActive: false, chests: [], openedChestIds: new Set() };
const added = [];

beforeEach(() => useGameStore.setState({ locale: 'en' }));
afterEach(() => { while (added.length) ecs.remove(added.pop()); useGameStore.setState({ locale: 'en' }); });

describe('the compass markers', () => {
  it('the eight cardinals, HOME with its distance and bearing, the nearest shrine and the Blight Heart', () => {
    const pp = { x: 30, y: 50, z: 40 };
    const m = byId(markersNow({}, pp, NO_PROPS, fresh()));
    expect(CARDINALS.every(([key]) => m[`cardinal:${key}`]), 'a cardinal is missing').toBe(true);
    expect(m['cardinal:compass.n'].text).toBe('N');
    expect(m.home.text).toBe('HOME 50m');
    expect(m.home.bearing).toBeCloseTo(bearingTo(0, 0, 30, 40), 9);
    const s = nearestLandmark(pp.x, pp.z);
    expect(s, 'SETUP: no shrine near the test position').toBeTruthy();
    expect(m.shrine.text).toBe(`SHRINE ${Math.round(Math.hypot(s.worldX - pp.x, s.worldZ - pp.z))}m`);
    const bh = blightHeartSite();
    expect(m.blight.text).toBe(`BLIGHT HEART ${Math.round(Math.hypot(bh.x - pp.x, bh.z - pp.z))}m`);
    expect(m.boss, 'a boss marker with no boss up').toBeUndefined();
  });

  it('standing on the Hearth hides HOME; a live boss is marked', () => {
    const m = byId(markersNow({ getBossPosition: () => [100, 60, 0] }, { x: 2, y: 50, z: 2 }, { ...NO_PROPS, bossActive: true }, fresh()));
    expect(m.home, 'HOME shown while standing on it').toBeUndefined();
    expect(m.boss.text).toBe('BOSS 98m');
  });

  it('a hub NPC in the live mob query is marked by its short name; one too far or dead is not', () => {
    const near = makeNpcEntity(HUB_NPCS.find((n) => n.role === 'smith'), 99101, 50);
    near.position.set(10, 50, 0);
    const far = makeNpcEntity(HUB_NPCS.find((n) => n.role === 'merchant'), 99102, 50);
    far.position.set(200, 50, 0);
    const dead = makeNpcEntity(HUB_NPCS.find((n) => n.role === 'healer'), 99103, 50);
    dead.position.set(0, 50, 10);
    dead.health = 0;
    for (const e of [near, far, dead]) added.push(ecs.add(e));
    const npcs = markersNow({}, { x: 0, y: 50, z: 0 }, NO_PROPS, fresh()).filter((x) => x.kind === 'npc');
    expect(npcs.map((x) => x.text)).toEqual(['Mara 10m']);
  });

  it('unopened chests within 80 m are marked; an opened or a far one is not', () => {
    const chests = [{ id: 'a', position: [0, 50, -20] }, { id: 'b', position: [0, 50, -30] }, { id: 'c', position: [0, 50, -300] }];
    const list = markersNow({}, { x: 0, y: 50, z: 0 }, { bossActive: false, chests, openedChestIds: new Set(['b']) }, fresh());
    expect(list.filter((x) => x.kind === 'chest').map((x) => x.text)).toEqual(['Chest 20m']);
  });

  it('in zh-CN every label reads in Chinese', () => {
    useGameStore.setState({ locale: 'zh-CN' });
    const m = byId(markersNow({}, { x: 30, y: 50, z: 40 }, NO_PROPS, fresh()));
    expect(m.home.text).toBe('家 50米');
    expect(m['cardinal:compass.n'].text).toBe('北');
    expect(m.blight.text).toMatch(/^凋敝之心 \d+米$/);
  });
});
