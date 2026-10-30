// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore';
import { listWorlds, readWorld, getActiveWorldId, setActiveWorldId, writeWorld } from '../../src/game/worldSaves';
import { buildSaveData } from '../../src/game/saveSchema';

// B2a — THE AUTOSAVE DESTROYS THE PLAYER'S WORLD ON THEIR NEXT VISIT.
// (18-domain review, CRITICAL, confirmed by an independent refuter and re-derived by reading the code.)
//
// `loadWorldData` is called from exactly ONE place in the entire app: the World Manager's "Load" button
// (MenuSystem.jsx:170). Nothing resumes a save at boot. But `saveActiveWorld` reuses `getActiveWorldId()`,
// which lives in localStorage and therefore SURVIVES the session. So:
//
//   session 1: play to level 15, 3150 coins -> autosave mints world `local_X`, ACTIVE = local_X.
//   session 2: page loads. Store is fresh (level 1, 0 coins). Player never clicks Load.
//              First autosave fires -> getActiveWorldId() -> local_X -> writeWorld(local_X, <level 1>).
//              Session 1 is GONE. Overwritten by a brand-new world.
//
// THE INVARIANT: an autosave may only ever write to a world slot THIS SESSION OPENED — one it loaded, or
// one it created. If the session owns no slot, the autosave MINTS A NEW ONE. A save you never opened is
// not a save you are allowed to overwrite.
//
// MUTATION-PROOF: drop the session-ownership check in `saveActiveWorld` (make it fall back to
// getActiveWorldId() again) and `the autosave does not overwrite...` goes RED.

const resetStorage = () => {
  localStorage.clear();
  useGameStore.setState({ isCaptureMode: false, _sessionWorldId: null });
};

describe('B2a save-slot ownership — an autosave may not overwrite a world it never opened', () => {
  beforeEach(resetStorage);

  it('reproduces the shape of session 1: playing mints a world and makes it active', () => {
    useGameStore.setState({ level: 15, coins: 3150 });
    useGameStore.getState().saveActiveWorld({ x: 0, y: 18, z: 0 });

    const id = getActiveWorldId();
    expect(id).toBeTruthy();
    expect(readWorld(id).progression.level).toBe(15);
    expect(listWorlds()).toHaveLength(1);
  });

  it('THE BUG: a fresh session that never loaded must NOT overwrite the existing save', () => {
    // --- session 1 ---
    useGameStore.setState({ level: 15, coins: 3150 });
    useGameStore.getState().saveActiveWorld({ x: 0, y: 18, z: 0 });
    const session1Id = getActiveWorldId();

    // --- session 2: a page reload. The store is fresh; localStorage (and ACTIVE_WORLD) persists. ---
    useGameStore.setState({ level: 1, coins: 0, _sessionWorldId: null });
    expect(getActiveWorldId()).toBe(session1Id);   // the stale pointer is still there — this is the trap

    useGameStore.getState().saveActiveWorld({ x: 0, y: 18, z: 0 });   // player walks around; autosave fires

    // Session 1 must have survived.
    const survived = readWorld(session1Id);
    expect(survived).not.toBeNull();
    expect(survived.progression.level).toBe(15);   // <- RED before the fix: this was 1
    expect(survived.progression.coins ?? survived.coins).toBe(3150);

    // ...and session 2's progress went somewhere NEW, not on top of it.
    expect(listWorlds().length).toBe(2);
    expect(getActiveWorldId()).not.toBe(session1Id);
  });

  it('a session that DID load a world autosaves back into that same slot (no slot spam)', () => {
    useGameStore.setState({ level: 15, coins: 3150 });
    useGameStore.getState().saveActiveWorld({ x: 0, y: 18, z: 0 });
    const id = getActiveWorldId();

    // the player opens it from the World Manager
    useGameStore.setState({ level: 1, coins: 0, _sessionWorldId: null });
    useGameStore.getState().loadWorldData(readWorld(id));

    useGameStore.setState({ coins: 4000 });
    useGameStore.getState().saveActiveWorld({ x: 0, y: 18, z: 0 });

    expect(listWorlds()).toHaveLength(1);          // still ONE world — it saved back into the one it opened
    expect(getActiveWorldId()).toBe(id);
    expect(readWorld(id).progression.level).toBe(15);
  });

  it("an autosave does not clobber the player's chosen world NAME with Save_<timestamp>", () => {
    // Kevin's son names his world. One autosave later it is called "Save_7/13/2026, 10:25:06 AM".
    const data = buildSaveData(useGameStore.getState(), { position: { x: 0, y: 18, z: 0 } });
    writeWorld('w1', { name: "Skyhold Keep", created_at: 'x', is_owner: true }, data);
    setActiveWorldId('w1');
    useGameStore.setState({ _sessionWorldId: 'w1', level: 4 });

    useGameStore.getState().saveActiveWorld({ x: 0, y: 18, z: 0 });

    expect(listWorlds()[0].name).toBe("Skyhold Keep");
    expect(readWorld('w1').name).toBe("Skyhold Keep");
  });

  it('B2b: "Create New World" creates a NEW world — it does not clone the one you are playing', () => {
    // The old createWorld wrote a fresh blob to disk but never reset the store and never loaded it, so
    // the live game kept level 12 / 4321 coins / its blocks — and the next autosave wrote all of that
    // into the "new" slot. Creating a world CLONED the old one.
    useGameStore.setState({
      level: 12, coins: 4321, currentXP: 900, talentPoints: 5, gameWon: true, nightCount: 7,
      worldBlocks: new Map([['1_2_3', 5], ['4_5_6', 2]]),
    });
    useGameStore.getState().saveActiveWorld({ x: 0, y: 18, z: 0 });
    const oldId = getActiveWorldId();

    useGameStore.getState().startNewWorld('w_new');

    const s = useGameStore.getState();
    expect(s.level).toBe(1);
    expect(s.coins).toBe(0);
    expect(s.currentXP).toBe(0);
    expect(s.talentPoints).toBe(0);
    expect(s.gameWon).toBe(false);
    expect(s.nightCount).toBe(0);
    expect(s.worldBlocks.size).toBe(0);
    expect(s._sessionWorldId).toBe('w_new');

    // ...and the world we were playing is untouched on disk.
    expect(readWorld(oldId).progression.level).toBe(12);
    expect(readWorld(oldId).progression.coins).toBe(4321);
  });

  it('B2b: the reset is DRIFT-PROOF — every field saveSchema persists comes back to its initial value', () => {
    // This is the gate that matters. A hand-maintained list of "fields to reset" is exactly what shipped
    // the clone bug. `startNewWorld` round-trips the store's INITIAL state through buildSaveData, so this
    // compares the post-reset save blob against a pristine one, key by key. Add a persisted field and
    // forget to reset it, and this goes RED without anyone having to remember to update the test.
    const pristine = buildSaveData(useGameStore.getInitialState(), { position: { x: 0, y: 18, z: 0 } });

    useGameStore.setState({
      level: 12, coins: 4321, totalXP: 5000, gameWon: true, nightCount: 7, lastRewardedNight: 6,
      ember: 50, emberBuildDay: { night: 7, built: 30 },
      gameTime: 900, achievements: ['first_kill'], selectedBlock: 'diamond',
      worldBlocks: new Map([['1_2_3', 5]]), chests: new Map([['9_9_9', []]]),
    });
    useGameStore.getState().startNewWorld('w_x');

    const after = buildSaveData(useGameStore.getState(), { position: { x: 0, y: 18, z: 0 } });

    // save_name is a fresh timestamp on every serialize — the only field expected to differ.
    delete pristine.save_name;
    delete after.save_name;
    expect(after).toEqual(pristine);
  });

  it('capture mode still never touches localStorage', () => {
    useGameStore.setState({ isCaptureMode: true, level: 9 });
    useGameStore.getState().saveActiveWorld({ x: 0, y: 18, z: 0 });
    expect(listWorlds()).toHaveLength(0);
    expect(getActiveWorldId()).toBeNull();
  });
});
