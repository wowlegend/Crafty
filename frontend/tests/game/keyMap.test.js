import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEY_MAP, KEY_GROUPS } from '../../src/game/keyMap.js';
import { INTENT_KEYS } from '../../src/input/inputState.js';
import { EXPRESS_VERBS } from '../../src/input/expressVerbs.js';
import { blankComments } from '../../scripts/ci/gate-shape.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(HERE, '../../src/', p), 'utf8');
// the handler universe: panel toggles live in InputManager, the verb intents + WASD/F in Components.
// Comments are blanked first, so a comment that names a handler, or records one's removal, cannot stand in for it.
const handlers = ['InputManager.jsx', 'Components.jsx'].map((f) => blankComments(read(f)) ?? '').join('\n');

// ONE PATTERN, BOTH DIRECTIONS, AND IT MATCHES ANY RECEIVER. The reverse test below parsed
// `event.code === 'X'` — but Components.jsx:397 handles F as `e.code === 'KeyF'`, so every handler
// written against a differently-named event object was invisible to it. That blind spot made the
// reverse gate undercount live handlers, and it made the forward gate (which used a bare substring
// instead) look like the lenient one when both were wrong in different directions.
const CODE_HANDLER = /\b[A-Za-z_$][\w$]*\.code\s*===\s*'([A-Za-z0-9]+)'/g;

// A handler may test `event.key` instead of `event.code`. For a function key the two are the same string
// (F3 is key 'F3' and code 'F3'), so its key joins the same set and an advertised `code: 'F3'` row matches it.
// A printable key differs ('e' against 'KeyE'): one handled by `key` surfaces as an orphan named 'e', and the
// reverse gate below then asks for it to be advertised rather than letting it pass unseen.
const KEY_HANDLER = /\b[A-Za-z_$][\w$]*\.key\s*===\s*'([A-Za-z0-9]+)'/g;

// AND THE KEYS HANDLED BY A ROUTER TABLE RATHER THAN AN INLINE BRANCH.
//
// `input/expressVerbs.js` maps KeyF -> cast and KeyT -> melee. Components dispatches through it instead
// of testing `e.code` twice inline, so a pattern that only understands `x.code === 'KeyF'` sees no
// handler for either and reports two advertised-but-dead keys. That is the gate being right about its own
// blindness rather than about the code: the keys ARE handled, through a seam it could not read.
//
// Imported, not grepped. The table is the live object the router consults, so a key listed here is
// handled by construction — and a key silently dropped from it goes red on this gate immediately, which
// is stronger than the regex it replaces.
const handledCodes = () => new Set([
  ...[...handlers.matchAll(CODE_HANDLER)].map((m) => m[1]),
  ...[...handlers.matchAll(KEY_HANDLER)].map((m) => m[1]),
  ...Object.keys(EXPRESS_VERBS),
]);

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
    // ANCHORED TO THE SYNTACTIC FORM, not to the bare quoted string. This asserted
    // `handlers.includes(\`'${r.code}'\`)`, which any occurrence of the quoted code satisfies —
    // a comment naming the key, a string in an unrelated array, a data table, a disabled branch. The
    // REVERSE test in this same file (:67) already parses `event.code === 'X'`, so the two halves of one
    // invariant were reading the source two different ways and only one of them could see a handler.
    const handled = handledCodes();
    expect(handled.size, 'no handlers parsed — the regex or the files moved, so this asserts nothing').toBeGreaterThan(8);

    const advertised = KEY_MAP.filter((r) => r.code);
    expect(advertised.length, 'no advertised keydown rows — the denominator is empty').toBeGreaterThan(4);
    for (const r of advertised) {
      expect(
        handled.has(r.code),
        `${r.key} (${r.code}) is advertised but has NO live keydown handler`,
      ).toBe(true);
    }
  });

  it('the panels are three keys and H: Tab (Character), J (Journal), B (Build), each advertised AND handled', () => {
    // The HUD lane (DECISIONS 2026-10-29 item 96) folded E, M, U, L and Q into Character and Journal. The panel rows
    // are exactly these, so a fold half-undone (a key back in the table, or a handler left behind) is red here or in
    // the two-way cases.
    const panels = KEY_MAP.filter((r) => r.group === 'Panels').map((r) => r.code);
    expect(panels).toEqual(['Tab', 'KeyJ', 'KeyB', 'KeyG', 'KeyH', 'F3', 'Escape']);
    const handled = handledCodes();
    for (const c of ['Tab', 'KeyJ', 'KeyB', 'KeyH']) expect(handled.has(c), `${c} has no live handler`).toBe(true);
    for (const c of ['KeyE', 'KeyM', 'KeyU', 'KeyL', 'KeyQ']) expect(handled.has(c), `${c} is handled again`).toBe(false);
  });

  it('every row a player is taught has a label key both dictionaries carry', async () => {
    const { STRINGS } = await import('../../src/i18n/strings.js');
    const taught = KEY_MAP.filter((r) => !r.panelHide);
    expect(taught.length, 'SETUP: no taught rows').toBeGreaterThan(15);
    for (const r of KEY_MAP) {
      expect(STRINGS.en[r.labelKey], `${r.key} has no English label key`).toBeTruthy();
      expect(STRINGS['zh-CN'][r.labelKey], `${r.key} has no zh-CN label`).toBeTruthy();
    }
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
    // Movement, same shape: the rows are `{ key: 'WASD', label: 'Move' }`, `{ key: 'Space', ... }` and
    // `{ key: 'Shift', label: 'Dodge-roll' }`, none of which carry a `code` — WASD because it stands for
    // four, Space and Shift because their handlers key off ShiftLeft/ShiftRight and the row names the
    // key a player presses, not the DOM code. These surfaced only once the handler pattern stopped
    // requiring the receiver to be literally named `event`, and they are advertised, not missing.
    KeyW: 'WASD', KeyA: 'WASD', KeyS: 'WASD', KeyD: 'WASD',
    Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift',
  };

  it('every LIVE keydown handler is advertised in KEY_MAP', () => {
    const handled = [...handledCodes()];
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

  it('teaches F3 (Show stats), the key the bug report form asks players to press', () => {
    const f3 = KEY_MAP.find((r) => r.code === 'F3');
    expect(f3, 'F3 must be advertised').toBeDefined();
    expect(handledCodes().has('F3'), 'F3 must have a live handler').toBe(true);
  });

  it('teaches the quest binding, which is the gap that motivated this gate: J opens the Journal\'s quests', () => {
    // L and Q were handled and advertised nowhere (8a5e008). The quest log is now the Journal's first tab (J), and quests
    // claim themselves on completion, so no claim key is left to teach.
    const byCode = Object.fromEntries(KEY_MAP.filter((r) => r.code).map((r) => [r.code, r]));
    expect(byCode.KeyJ, 'J (the Journal: quests) must be advertised').toBeDefined();
    expect(KEY_GROUPS).toContain(byCode.KeyJ.group);
  });
});
