import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSourceTree } from '../_support/primitiveCallSites.js';
import { deadSetters, STORE_FILE } from '../_support/storeSetters.js';

/**
 * EVERY SETTER THE STORE DECLARES HAS A CALLER (deep audit 2026-10-30, lane L12; AUDIT:debt:three-call-channels-dead-wires).
 *
 * The audit found 17 `set*` members of the zustand store that nothing called, written when a channel between two systems
 * was built and left behind when the channel moved (the bus, then GameMethods). knip cannot see them: they are members of
 * an object literal, not exports. A dead setter is more than clutter. Its key is a slot a reader may trust to be
 * published, so a missing publisher reads as a silent no-op (callers guard with `?.()`), and it hides which of the
 * three channels is the live one. Lane L6 removed 13 by hand and lane L3 the last two with the boss mirror; this is the check that keeps the count at its floor, zero.
 *
 * A setter has a caller when its name is used as a member of something, anywhere in the non-test source (the store's own file
 * included): `get().setX(...)`, `state.setX`, `store['setX']`, `const { setX } = ...`. It reads the syntax tree
 * (@babel/parser), so a comment or a template text naming a setter cannot satisfy it, and a bare identifier does not count
 * either: a component's own `const [v, setX] = useState()` would credit a dead store setter of the same name. It does not
 * prove the caller RUNS (that is runtime-reach's question, and a different grain); it proves the name is used.
 * Members that are not `set*` functions are out of scope (getPlayerXP and isBeastFormActive are read by tests and e2e only).
 *
 * SITED IN tests/scripts/, not tests/gates/: the subject is the shape of the source (which members it declares and which
 * names it uses), so the check must read source by its nature, and gate-shape freezes the source-reading population in
 * tests/gates/.
 *
 * Mutation-Proof: scripts/dev/mutate.sh, receipts in the commit.
 */
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('every set* member of the store has a caller', () => {
  const storeText = readFileSync(resolve(APP, STORE_FILE), 'utf8');
  const tree = readSourceTree();
  const r = deadSetters(tree, storeText);

  it('the instrument sees: the store, its setters and the source tree it searches', () => {
    // Floors under the counts when the check was written (about 60 setters, 410 source files).
    expect(r.setters.length, 'the store declares almost no setters: the create() object was not read whole').toBeGreaterThan(55);
    expect(r.files, 'the source tree came back short').toBeGreaterThan(350);
    expect(r.live.length, 'almost every setter reads as dead: the search is blind').toBeGreaterThan(r.setters.length - 8);
    // One setter used from another file and one used only inside the store, each seen as live.
    expect(r.live, 'a setter called from a system was not seen as live').toContain('setPlayerHealth');
    expect(r.live, 'a setter used from a hook was not seen as live').toContain('setQuestState');
  });

  it('no setter is declared that nothing uses', () => {
    expect(r.dead, 'set* members of useGameStore.jsx with no use anywhere in src: delete them').toEqual([]);
  });

  it('the detector, on a store and a tree it is handed, names the dead setter, credits every form of use and not a namesake', () => {
    const store = [
      'import { create } from "zustand";',
      'export const useS = create((set, get) => ({',
      '  setDead: (v) => set({ dead: v }),',
      '  setViaMember: (v) => set({ a: v }),',
      '  setViaDestructure: (v) => set({ b: v }),',
      '  setViaString: (v) => set({ c: v }),',
      '  setViaOptional: (v) => set({ i: v }),',
      '  setInStore: (v) => set({ d: v }),',
      '  setCommentOnly: (v) => set({ e: v }),',
      '  setNamesake: (v) => set({ h: v }),',
      '  setTemplateOnly: (v) => set({ f: v }),',
      '  setMethod(v) { set({ g: v }); },',
      '  notASetter: () => 1,',
      '  caller: () => get().setInStore(1),',
      '}));',
    ].join('\n');
    const files = [{
      file: 'src/a.js',
      text: [
        '// setCommentOnly is mentioned here only',
        'const t = `setTemplateOnly ${1}`;',
        'useS.getState().setViaMember(1);',
        'const { setViaDestructure } = useS.getState(); setViaDestructure(2);',
        'useS.getState()["setViaString"](3);',
        'useS.getState()?.setViaOptional(5);',
        'useS.getState().setMethod(4);',
        'function C() { const [v, setNamesake] = useState(0); setNamesake(1); return v; }',
      ].join('\n'),
    }];
    const out = deadSetters(files, store);
    expect(out.setters).toEqual(['setDead', 'setViaMember', 'setViaDestructure', 'setViaString', 'setViaOptional', 'setInStore', 'setCommentOnly', 'setNamesake', 'setTemplateOnly', 'setMethod']);
    expect(out.dead).toEqual(['setDead', 'setCommentOnly', 'setNamesake', 'setTemplateOnly']);
    expect(out.live).toEqual(['setViaMember', 'setViaDestructure', 'setViaString', 'setViaOptional', 'setInStore', 'setMethod']);
  });
});
