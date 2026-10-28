// startPlayActive is the shared instrument that replaced three hand-rolled copies of the same
// re-assert loop. It guards a race that is INVISIBLE to every other gate here: the input gate gets
// set, then cleared 44ms later by a pointer-lock refusal the harness never sees, and the spec dies
// 15s later inside an assertion about something else entirely.
//
// WHY THIS LIVES IN tests/scripts/ AND NOT tests/gates/. Its subject is a FILE'S exported behaviour
// driven against fakes, and siting it here keeps it out of the frozen source-grep population
// (tests/gates/.source-grep-ledger.json, which may fall and never rise). It reads no source text at
// all — see below.
//
// AND IT IS NOT A SOURCE-GREP. The obvious cheap version of this test asserts that _boot.js contains
// a re-assert loop, which is a proxy: a comment satisfies it, and a text match cannot tell which
// occurrence is load-bearing. Instead the fake page EXECUTES the real arrow functions _boot.js hands
// to page.evaluate(), against a fake `window` that behaves like the real game — including the
// refusal that clears the gate. The subject is driven, not read.
//
// WHAT THIS DOES NOT PROVE, stated so nobody reads more into a green than is there: it says nothing
// about whether the real world ever fails to build in 90s, and nothing about the real Chromium
// pointer-lock refusal. It proves that GIVEN a gate that gets cleared, this helper re-asserts it and
// refuses to return until it holds — and that given a world that never builds, it never forces play.
import { describe, it, expect } from 'vitest';
import { startPlayActive, startPlay, bootDev } from '../e2e/_boot.js';

/** A fake game whose `active` gate behaves like the real one: forcePlay sets it, and the first
 *  `clobbers` writes are immediately undone — the world-ready pointer-lock refusal, in miniature. */
function makeGame({ clobbers = 0, forcePlayWorks = true } = {}) {
  let active = false;
  let forcePlays = 0;
  let remaining = clobbers;
  const calls = [];
  const win = {
    __craftyTest: {
      call(name, arg) {
        calls.push(arg === undefined ? name : `${name}:${arg}`);
        if (name === 'setQualityTier') return undefined;
        if (name === 'forcePlay') {
          forcePlays += 1;
          active = forcePlayWorks;
          if (remaining > 0) {
            remaining -= 1;
            active = false; // the refusal lands right after the write
          }
          return undefined;
        }
        if (name === 'readIntents') return { active };
        throw new Error(`unknown test hook: ${name}`);
      },
    },
    useGameStore: { getState: () => ({ isSpawnChunkLoaded: true }) },
  };
  return { win, stats: () => ({ forcePlays, active }), log: () => calls };
}

/** A fake page that RUNS the real predicates _boot.js passes it, with `window` bound to the game. */
function makePage(game, { worldBuilds = true } = {}) {
  const withWindow = (fn) => {
    const prev = globalThis.window;
    globalThis.window = game.win;
    try {
      return fn();
    } finally {
      globalThis.window = prev;
    }
  };
  return {
    async waitForFunction(fn, _arg, opts) {
      if (!worldBuilds) throw new Error(`page.waitForFunction: Timeout ${opts.timeout}ms exceeded.`);
      if (!withWindow(fn)) throw new Error('world predicate false');
    },
    async waitForTimeout() {},
    async evaluate(fn) {
      return withWindow(fn);
    },
  };
}

describe('startPlayActive', () => {
  // PRESENCE CONTROL, written first. Every assertion below it is about a REFUSAL to proceed, and a
  // refusal assertion is worth nothing until the same instrument has shown it can see the happy path.
  it('forces play once and returns when the gate holds first try', async () => {
    const game = makeGame();
    await startPlayActive(makePage(game));
    const { forcePlays, active } = game.stats();
    expect(forcePlays, 'startPlayActive stopped calling forcePlay at all — the instrument is dead').toBe(1);
    expect(active, 'returned without the input gate live').toBe(true);
  });

  // THE DEFECT ITSELF. One forcePlay is silently undone; the helper must notice and re-assert.
  it('re-asserts the gate when a refusal clears it, instead of returning on a dead gate', async () => {
    const game = makeGame({ clobbers: 1 });
    await startPlayActive(makePage(game));
    const { forcePlays, active } = game.stats();
    expect(forcePlays, 'the cleared gate was never re-asserted — this is the imbue-latch failure').toBe(2);
    expect(active, 'returned with the gate cleared, exactly as startPlay did').toBe(true);
  });

  it('throws NAMING the gate when it can never be held', async () => {
    const game = makeGame({ forcePlayWorks: false });
    await expect(startPlayActive(makePage(game))).rejects.toThrow(/active never held/);
  });

  // The precondition half: a world that never builds must fail HERE, and must not force play into it.
  it('fails on the world, and does not force play into a world that never built', async () => {
    const game = makeGame();
    await expect(startPlayActive(makePage(game, { worldBuilds: false }))).rejects.toThrow(/Timeout 90000ms/);
    expect(game.stats().forcePlays, 'forcePlay ran against a world that never built').toBe(0);
  });

  // A longer world wait (E2E_WORLD_TIMEOUT) used to run into the spec's test budget, so Playwright's flat "Test timeout"
  // fired before the SETUP rethrow could name the world, and mutate-e2e.sh scored a slow world as a kill (2026-10-27).
  // The budget grows by exactly the extra wait. Presence first: at the default wait, it must not touch the budget.
  const fakeInfo = (timeout) => {
    const info = { timeout, calls: [], setTimeout(v) { this.calls.push(v); this.timeout = v; } };
    return info;
  };
  it('leaves the test budget alone at the default world wait', async () => {
    const info = fakeInfo(180000);
    await startPlayActive(makePage(makeGame()), { worldTimeout: 90000, testInfo: info });
    expect(info.calls, 'the default wait changed the test budget').toEqual([]);
  });
  it('extends the test budget by exactly the extra world wait', async () => {
    const info = fakeInfo(180000);
    await startPlayActive(makePage(makeGame()), { worldTimeout: 240000, testInfo: info });
    expect(info.calls, 'a 240 s world wait left a budget sized for 90 s').toEqual([330000]);
  });
  it('does not turn "no timeout" into a timeout', async () => {
    const info = fakeInfo(0);
    await startPlayActive(makePage(makeGame()), { worldTimeout: 240000, testInfo: info });
    expect(info.calls).toEqual([]);
  });
  it('fails a long world wait as SETUP, naming the world', async () => {
    const info = fakeInfo(180000);
    await expect(
      startPlayActive(makePage(makeGame(), { worldBuilds: false }), { worldTimeout: 240000, testInfo: info })
    ).rejects.toThrow(/^SETUP: the world never built/);
  });
});

describe('bootDev', () => {
  it('tags an app that never comes up as SETUP, not as a failure of the spec', async () => {
    const page = {
      async goto() {},
      async waitForFunction() { throw new Error('page.waitForFunction: Timeout 30000ms exceeded.'); },
      on() {},
    };
    await expect(bootDev(page)).rejects.toThrow(/^SETUP: bootDev: the dev app never came up/);
  });
  it('returns when the app is up (presence control)', async () => {
    const page = { async goto() {}, async waitForFunction() {}, on() {} };
    await expect(bootDev(page)).resolves.toEqual([]);
  });
  it('opens the root by default and the path it is given otherwise (the lookbook seam installs only for ?lookbook=1)', async () => {
    const opened = [];
    const page = { async goto(url) { opened.push(url); }, async waitForFunction() {}, on() {} };
    await bootDev(page);
    await bootDev(page, { path: '/?lookbook=1' });
    expect(opened).toEqual(['/', '/?lookbook=1']);
  });
});

describe('the play helpers pin the quality tier the suite was built on, before they force play', () => {
  // The tier governor starts in play now; at the device-picked tier it would step a software renderer down
  // mid-spec. The fake game logs every hook call in order, so the pin is observed as a call, not read as source.
  for (const [name, run] of [['startPlayActive', (p) => startPlayActive(p)], ['startPlay', (p) => startPlay(p)]]) {
    it(`${name}: setQualityTier('low') precedes the first forcePlay`, async () => {
      const game = makeGame();
      await run(makePage(game));
      const log = game.log();
      expect(log.indexOf('setQualityTier:low'), `${name} left the tier to the device pick and the governor: ${log}`).toBeGreaterThan(-1);
      expect(log.indexOf('setQualityTier:low'), `${name} pinned the tier after play began: ${log}`).toBeLessThan(log.indexOf('forcePlay'));
    });
  }
});
