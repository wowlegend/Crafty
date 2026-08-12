import { describe, it, expect } from 'vitest';
import { LOOT_TABLES, CHEST_LOOT } from '../../src/data/lootTables.js';
import { MOB_TYPES } from '../../src/game/mobTypes.js';
import { NAME_TO_ID } from '../../src/data/items.js';

// Loot-coverage gate (content-coherence, 2026-06-14). The kill -> loot -> reward loop is
// core: a hostile mob that drops nothing feels unrewarding (the moss_brute is a 220-HP rare
// tank). Four hostiles shipped lootless after the variety/content passes (skitterling,
// duskhound, moss_brute, emberhusk) because LOOT_TABLES wasn't extended alongside MOB_TYPES.
// This gate makes that class of drift impossible: every HOSTILE mob MUST drop something, and
// every dropped item MUST be a real registry item so the pickup renders a real icon + rarity.

const hostileTypes = Object.entries(MOB_TYPES)
    .filter(([, cfg]) => cfg.passive !== true)
    .map(([key]) => key);

describe('loot-coverage gate: every hostile mob drops something real', () => {
    it('there is at least one hostile mob to check (guards the filter itself)', () => {
        expect(hostileTypes.length).toBeGreaterThan(0);
    });

    it.each(hostileTypes)('hostile "%s" has a non-empty loot table', (key) => {
        const table = LOOT_TABLES[key];
        expect(table, `LOOT_TABLES["${key}"] is missing — add a drop table for this hostile`).toBeDefined();
        expect(Array.isArray(table)).toBe(true);
        expect(table.length).toBeGreaterThan(0);
    });

    it('every loot row across ALL tables is a valid registry item with a sane chance + xp', () => {
        for (const [mob, table] of Object.entries(LOOT_TABLES)) {
            for (const row of table) {
                expect(NAME_TO_ID[row.item], `${mob} drops "${row.item}" which is not in the ITEMS registry`).toBeDefined();
                expect(row.chance).toBeGreaterThan(0);
                expect(row.chance).toBeLessThanOrEqual(1);
                expect(row.xp).toBeGreaterThanOrEqual(0);
            }
        }
    });

    // CHEST LOOT WAS OUTSIDE THE DENOMINATOR. lootTables.js's own header says "Every `item` string MUST
    // be a valid display name ... The loot-coverage gate enforces that invariant" — and the gate iterated
    // LOOT_TABLES only, so half the module it was named for went unexamined. A chest row naming an item
    // the registry does not have spawns a pickup with no icon and no rarity, which is exactly the
    // downstream identity break the header warns about.
    it('CHEST_LOOT rows are valid registry items too — the header claims this and nothing checked it', () => {
        const rows = Array.isArray(CHEST_LOOT) ? CHEST_LOOT : Object.values(CHEST_LOOT || {}).flat();
        expect(rows.length, 'CHEST_LOOT enumerated nothing — this assertion is measuring an empty set').toBeGreaterThan(0);
        for (const row of rows) {
            expect(NAME_TO_ID[row.item], `CHEST_LOOT offers "${row.item}" which is not in the ITEMS registry`).toBeDefined();
            expect(row.chance).toBeGreaterThan(0);
            expect(row.chance).toBeLessThanOrEqual(1);
            if (row.xp !== undefined) expect(row.xp).toBeGreaterThanOrEqual(0);
        }
    });
});
