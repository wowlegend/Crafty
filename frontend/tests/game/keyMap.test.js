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
