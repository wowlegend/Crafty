import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEY_MAP, KEY_GROUPS } from '../../src/game/keyMap.js';
import { INTENT_KEYS } from '../../src/input/inputState.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(HERE, '../../src/', p), 'utf8');
// the handler universe: panel toggles live in InputManager, the verb intents + WASD/F in Components.
const handlers = read('InputManager.jsx') + read('Components.jsx');

describe('KEY_MAP — the binding single-source-of-truth (anti-drift)', () => {
  it('every row has a non-empty {key, label} in a known group', () => {
    const groups = new Set(KEY_GROUPS);
    for (const r of KEY_MAP) {
      expect(typeof r.key).toBe('string');
      expect(r.key.length).toBeGreaterThan(0);
      expect(typeof r.label).toBe('string');
      expect(r.label.length).toBeGreaterThan(0);
      expect(groups.has(r.group), `${r.key} group "${r.group}" must be one of ${KEY_GROUPS}`).toBe(true);
    }
  });

  it('teaches exactly the four signature Aspect verbs, each a REAL consumed intent + a named unlock', () => {
    const aspects = KEY_MAP.filter((r) => r.group === 'Aspects');
    expect(aspects.map((r) => r.key).sort()).toEqual(['R', 'V', 'X', 'Z']);
    for (const r of aspects) {
      expect(INTENT_KEYS, `${r.key} verb "${r.verb}" must be a live intent`).toContain(r.verb);
      expect(typeof r.talent).toBe('string');
      expect(r.talent.length).toBeGreaterThan(0);
    }
  });

  it('ANTI-LIE: every advertised keydown (`code`) row maps to a LIVE handler', () => {
    for (const r of KEY_MAP.filter((r) => r.code)) {
      expect(
        handlers.includes(`'${r.code}'`),
        `${r.key} (${r.code}) is advertised but has NO live keydown handler`,
      ).toBe(true);
    }
  });

  it('the M key (the regression that prompted this pass) is advertised AND handled', () => {
    const m = KEY_MAP.find((r) => r.key === 'M');
    expect(m?.code).toBe('KeyM');
    expect(read('InputManager.jsx').includes("'KeyM'")).toBe(true); // wired in T2
  });
});

describe('KEY_MAP — the REVERSE direction, which was never guarded', () => {
  // The gate above proves every ADVERTISED key has a handler. Nothing proved the converse, and two real
  // bindings had fallen through the gap: L (quest log) and Q (claim completed quests) were handled live in
  // InputManager and advertised nowhere, so the controls panel never taught either. Q at least appeared on
  // the title screen; L was invisible entirely, sitting right beside the E/M/C/B/U toggles that ARE listed.
  //
  // An advertised key with no handler is a LIE. A handler with no advertisement is a feature the player
  // never finds. Both are drift; only one had a gate.

  /** Codes covered by an informational row that names them collectively rather than by `code`. */
  const COVERED_BY_COMPOUND_ROW = {
    // KEY_MAP row `{ key: '1–4', label: 'Select spell' }` carries no `code` because it stands for four.
    Digit1: '1–4', Digit2: '1–4', Digit3: '1–4', Digit4: '1–4',
  };

  it('every LIVE keydown handler is advertised in KEY_MAP', () => {
    const handled = [...new Set([...handlers.matchAll(/event\.code\s*===\s*'([A-Za-z0-9]+)'/g)].map((m) => m[1]))];
    expect(handled.length, 'no handlers parsed — the regex or the files moved').toBeGreaterThan(8);

    const advertised = new Set(KEY_MAP.filter((r) => r.code).map((r) => r.code));
    const orphans = handled.filter((c) => !advertised.has(c) && !COVERED_BY_COMPOUND_ROW[c]);
    expect(
      orphans,
      `handled but advertised NOWHERE — the player cannot discover these: ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('the compound-row exemption names only codes that a real KEY_MAP row covers', () => {
    // Otherwise the exemption list becomes a place to hide orphans, which is the same defect wearing a
    // different hat.
    const keys = new Set(KEY_MAP.map((r) => r.key));
    for (const [code, row] of Object.entries(COVERED_BY_COMPOUND_ROW)) {
      expect(keys, `${code} claims coverage by a "${row}" row that does not exist`).toContain(row);
    }
  });

  it('teaches both quest bindings, which is the gap that motivated this gate', () => {
    const byCode = Object.fromEntries(KEY_MAP.filter((r) => r.code).map((r) => [r.code, r]));
    expect(byCode.KeyL, 'L (quest log) must be advertised').toBeDefined();
    expect(byCode.KeyQ, 'Q (claim completed quests) must be advertised').toBeDefined();
    for (const c of ['KeyL', 'KeyQ']) expect(KEY_GROUPS).toContain(byCode[c].group);
  });
});
