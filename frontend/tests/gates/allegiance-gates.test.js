import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip, sourceFiles, carriersOf } from './_srcWalk.js';

const read = (rel) => strip(readFileSync(resolve(SRC, rel), 'utf8'));

/**
 * S2-B3-M3 allegiance gates — `allegiance.js` owns the mob-to-ally conversion, and it is the ONLY door.
 *
 * REWRITTEN 2026-09-22, selected by `gate-census.mjs` at 0/5. Two of its three cases made a repo-wide
 * claim and checked a hand-written list: "nothing outside allegiance.js removes the isMob component"
 * looked in two files, and "no worldBlocks reader uses a comma-template key" looked in four. Both are
 * exactly the shape that survives review while being false — the assertion is correct about what it
 * examined, and the defect lands in the file nobody listed. The comma-key case is not hypothetical: it
 * was WRITTEN because one had already shipped as a silent always-miss (Components.jsx:808). A second one
 * appearing in a fifth file would have been invisible.
 *
 * Both now quantify over all of src/, and the expected carrier list is asserted by equality rather than
 * by `not.toMatch`, so the failure message NAMES the offending file instead of saying a regex matched.
 *
 * BLIND SPOT, stated (R7): these read source text. A component removed through a computed string, or a
 * worldBlocks key built in two statements, is invisible. The comma-key pattern also anchors on the
 * RECEIVER being spelled `worldBlocks` — measured by mutation 2026-09-22, an aliased read
 * (`const wb = state.worldBlocks; wb.get(...)`) survives it. Widening to any receiver would flag every
 * unrelated comma-keyed Map in the codebase, so the anchor stays and the hole is written down here
 * instead of being papered over. And nothing here proves `convertMobToAlly`
 * behaves correctly — that is `allegiance`'s own unit coverage; this gate only proves the seam is the
 * only route to it.
 *
 * Mutation-Proof: 4 mutations, recorded on the commit. Denominator asserted on the src walk.
 */
describe('allegiance gates (S2-B3-M3)', () => {
  const files = sourceFiles();

  it('the src walk reached the codebase — the repo-wide claims below need it', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('captureMob is registered and routes through convertMobToAlly', () => {
    // Named files, and deliberately so: this is a claim about WHERE the registration lives, which a
    // repo-wide search would dissolve. A1.8 moved captureMob to CombatSystem; both are read so the
    // assertion follows the code, but each is checked separately rather than concatenated — a
    // concatenation cannot tell you which file carries the line, and that is how a relocation goes
    // unnoticed (the same defect found in the elemancer wiring lock the same day).
    const combat = read('systems/CombatSystem.jsx');
    expect(combat, 'captureMob is no longer registered on GameMethods').toMatch(/GameMethods\.captureMob = captureMob/);
    expect(combat, 'the capture path no longer routes through the allegiance converter')
      .toMatch(/convertMobToAlly\(ecs, entity\)/);
  });

  it('allegiance.js is the ONLY module in src/ that removes the isMob component', () => {
    const carriers = carriersOf(/removeComponent\([^)]*['"]isMob['"]/, files);
    expect(carriers, 'the allegiance seam is being bypassed — isMob removed outside the converter')
      .toEqual(['game/allegiance.js']);
  });

  it('no module in src/ reads worldBlocks with a comma-template key (the always-miss shape)', () => {
    // worldBlocks keys are UNDERSCORE-shaped (`x_y_z`). A comma-template reader compiles, runs, and
    // silently never matches — which is how one shipped.
    const carriers = carriersOf(/worldBlocks\.(has|get)\(`[^`]*,\$\{/, files);
    expect(carriers, 'a comma-keyed worldBlocks lookup is a silent always-miss').toEqual([]);
  });
});
