// _firstNightAwaits.js — the First Night's record of what is not built yet (tests/e2e/first-night.spec.js; DECISIONS
// 2026-11-01 (W3-A PR C) items 482, 485 and 488). Node only: the spec, the check that keeps the record honest
// (tests/scripts/first-night-awaits.test.js) and its gate (tests/gates/first-night-awaits-gates.test.js) import it.
//
// AWAITS names, for each beat still waiting for its feature, every check the beat makes that is red today: the unit
// whose landing turns that check green, the check's name, and the red line it shows until then. A listed beat is skipped
// in CI; under FIRST_NIGHT_AWAITING=1 it runs, every check is reached (a red is recorded and the beat goes on, on a
// stand-in where the missing feature leaves nothing to read), and the reds it shows must be exactly the ones listed here
// (compareReds). A beat with no entry is a gate on every CI sha and stops at its first red.
//
// LANDED says, for each unit that owns a red, what in the repo shows it has landed: an export the task script names, or
// a behaviour of a pure module only that unit adds. The check fails while a listed red belongs to a landed unit, so the
// unit that lands a feature also rewrites or deletes its reds, and a beat whose last red is gone leaves the table. A
// unit that builds its piece under another name changes its probe here, in the commit that lands it.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The eight beats, in the order the spec declares them. */
export const BEATS = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);

const red = (unit, check, reason) => Object.freeze({ unit, check, reason });

/** Each awaiting beat's reds, in the order the beat reaches its checks. */
export const AWAITS = Object.freeze({
  a: Object.freeze([
    red('D2', 'cold', /^the brazier is lit at Start \(intensity [\d.]+\)/),
    red('D2', 'kindle', /^G 2 m from the brazier lit no cold brazier: intensity [\d.]+ before the press/),
    red('D2', 'lit', /^the store does not say the Hearth went from cold to lit with the kindle \(hearthLit true before the press, true after\)/),
  ]),
  b: Object.freeze([
    red('N5', 'siege', /^no siege at the crossing: the store holds null/),
    red('U3', 'wedge', /^facing the bearing, the compass wedge is not drawn/),
    red('U3', 'pinned', /^with the bearing behind the player, the compass wedge is not drawn/),
    red('N5', 'sector', /^no wave-1 hostile came from the siege's bearing: no bearing to read/),
    red('N5', 'march', /^no wave-1 hostile marched on the Hearth/),
    red('N5', 'horn', /^the horn sounded 1 time at the crossing and 1 time on a load into night/),
  ]),
  c: Object.freeze([
    red('B1', 'held', /^the camera is back at the eye at [\d.]+ s of a [\d.]+ s form/),
    red('B1', 'return', /^the camera was not held to the form's end/),
    red('B1', 'eye', /^playerPosition left the body by [\d.]+ m during the form/),
  ]),
  d: Object.freeze([
    red('V2', 'regen', /^no regeneration: 0\.0 HP\/s from 4\.1 s/),
    red('V2', 'restart', /^after a hit at 3 s health held to [\d.]+ s and did not come back/),
  ]),
  e: Object.freeze([
    red('N5', 'captain', /^no siege, so no captain at wave 3: the store holds null/),
    red('N6a', 'day', /^the captain's kill did not bring day within 6 s/),
    red('N6a', 'sky', /^no dawn rush to read: the sky log never saw day/),
    red('N6a', 'reward', /^the dawn reward is not counted once for night 1 \(lastRewardedNight 0\)/),
    red('D3', 'payoff', /^the payoff is not one dawn notice and then the lantern line: \[/),
    red('D3', 'swell', /^no bloom swell after the kill/),
  ]),
  f: Object.freeze([
    red('L2', 'slot', /^no lantern slot on the hotbar: block 16 is not in the game/),
    red('L2', 'place', /^a real right click with the lantern selected placed none: there was no lantern slot to select/),
    red('N8', 'near', /^a death 12 m from the lantern and [\d.]+ m from the Hearth rose [\d.]+ m from the lantern/),
    red('L2', 'hearth', /^no lantern stands, so a death nearer the Hearth cannot tell the nearest light from any lantern/),
    red('L2', 'mine', /^no lantern in the store's index to mine \(it holds 0\)/),
    red('L2', 'fallback', /^no lantern was placed and mined, so a death beside its place cannot show the fallback/),
  ]),
  g: Object.freeze([
    red('L3', 'forge', /^the Forge sells no lantern: buyForgeOffer\(goods:lantern\) answered stale/),
    red('L2', 'slot', /^no lantern slot on the hotbar: block 16 is not in the game/),
    red('L2', 'place', /^a real right click with the lantern selected placed none: there was no lantern slot to select/),
    red('N2', 'hook', /^no ambientAttempts hook to drive the ambient spawner/),
    red('N2', 'ward', /^no attempts to read the ward by: no ambientAttempts hook/),
    red('L2', 'mine', /^no lantern in the store's index to mine \(it holds 0\)/),
    red('N2', 'open', /^no attempts to read the open ground by: no ambientAttempts hook/),
  ]),
  h: Object.freeze([
    red('N5', 'wave3', /^no siege, so no wave 3 to lend at: the store holds null/),
    red('R1', 'lend', /^wave 3 of night 1 left the bar at 40, not 100/),
    red('R1', 'line', /^the lend's line showed 0 times/),
    red('N5', 'night2', /^no wave 3 on night 2 to refuse the lend at/),
  ]),
});

/** The units a beat's reds wait for, in order of first mention. */
export const unitsOf = (reds) => [...new Set((reds || []).map((x) => x.unit))];

/** The line a beat's red throws or records: `RED (<beat>) <check>: <why>`. */
export const redLine = (id, check, why) => `RED (${id}) ${check}: ${why}`;

/**
 * PURE. Whether an awaiting beat's run showed exactly its recorded reds: null when it did, else what differs. `shown` is
 * the red lines the run recorded, in order. Each recorded check must show once with a line its reason matches; a run
 * with none is GREEN while listed; a red on a check the record does not hold, or a check red twice, is a difference.
 */
export function compareReds(id, recorded, shown) {
  const lines = shown || [];
  if (lines.length === 0) return `(${id}) is GREEN while AWAITS still lists it (${unitsOf(recorded).join(', ')}): delete its entry, so CI gates it`;
  const prefix = `RED (${id}) `;
  const byCheck = new Map();
  const wrong = [];
  for (const line of lines) {
    const m = line.startsWith(prefix) ? /^([\w-]+): ([\s\S]*)$/.exec(line.slice(prefix.length)) : null;
    if (!m) { wrong.push(`not a red of (${id}): ${line}`); continue; }
    if (byCheck.has(m[1])) wrong.push(`${m[1]} red twice`);
    byCheck.set(m[1], m[2]);
  }
  for (const r of recorded) {
    const why = byCheck.get(r.check);
    if (why === undefined) wrong.push(`${r.check} (${r.unit}) showed no red: it is green now, so rewrite the record`);
    else if (!r.reason.test(why)) wrong.push(`${r.check} (${r.unit}) is not its recorded ${r.reason}: ${why}`);
    byCheck.delete(r.check);
  }
  for (const [check, why] of byCheck) wrong.push(`${check} is red and the record holds no such check: ${why}`);
  return wrong.length ? `(${id}) did not show its recorded reds (${lines.length} shown, ${recorded.length} recorded): ${wrong.join('; ')}` : null;
}

/**
 * PURE. The record's problems against the set of units that have landed: a listed red whose unit has landed, and a
 * beat listed with no red. `[{ beat, check?, unit?, why }]`, empty when the record is current.
 */
export function staleReds(awaits, landed) {
  const out = [];
  for (const [beat, reds] of Object.entries(awaits)) {
    if (!reds || reds.length === 0) out.push({ beat, why: `(${beat}) is listed with no red: delete its entry` });
    for (const r of reds || []) {
      if (landed.has(r.unit)) {
        out.push({ beat, check: r.check, unit: r.unit, why: `(${beat}) ${r.check} is ${r.unit}'s red, and ${r.unit} has landed: run the beat with FIRST_NIGHT_AWAITING=1 and rewrite or delete the red (and the beat's entry once none is left)` });
      }
    }
  }
  return out;
}

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
const word = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A reader of the repo under `root` (the APP directory), for the probes: a fixture root drives them in the gate. */
export function repoReader(root) {
  const code = (path) => {
    const file = join(root, path);
    return existsSync(file) ? stripComments(readFileSync(file, 'utf8')) : null;
  };
  const sources = () => {
    const out = [];
    const walk = (dir) => {
      if (!existsSync(dir)) return;
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(js|jsx|mjs)$/.test(name) && !/\.test\.(js|jsx)$/.test(name)) out.push(relative(root, p));
      }
    };
    walk(join(root, 'src'));
    return out;
  };
  return {
    /** Does `path` export `name` (a declaration or an export list)? */
    exports(path, name) {
      const src = code(path);
      if (src === null) return false;
      const n = word(name);
      return new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function\\*?|const|let|var|class)\\s+${n}\\b`).test(src)
        || new RegExp(`\\bexport\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
    },
    /** Does a source file other than `except` import `name` from a module path matching `from`? */
    imports(name, from, except) {
      const re = new RegExp(`\\bimport\\s*\\{[^}]*\\b${word(name)}\\b[^}]*\\}\\s*from\\s*['"][^'"]*${from.source}['"]`);
      return sources().some((p) => p !== except && re.test(code(p) || ''));
    },
    /** Does a source file register the DEV test hook `name` (devtest/testBridge.js registerTestHook)? */
    registersHook(name) {
      const re = new RegExp(`\\bregisterTestHook\\(\\s*['"]${word(name)}['"]`);
      return sources().some((p) => re.test(code(p) || ''));
    },
    /** The module at `path`, imported, or null when there is no such file. */
    async load(path) {
      const file = join(root, path);
      return existsSync(file) ? import(pathToFileURL(file).href) : null;
    },
  };
}

const EMPTY_FORGE_STATE = Object.freeze({ inventory: { blocks: {}, tools: {}, magic: {} }, coins: 0, equipment: {}, relicTiers: {} });

/** What shows each unit has landed (the task script, docs/superpowers/plans/2026-11-01-w3a-first-night-tasks.md). */
export const LANDED = Object.freeze({
  D2: { says: 'src/night/kindle.js exports kindleBeat', probe: (r) => r.exports('src/night/kindle.js', 'kindleBeat') },
  N5: { says: 'src/night/SiegeDirectorSystem.jsx exports SiegeDirectorSystem', probe: (r) => r.exports('src/night/SiegeDirectorSystem.jsx', 'SiegeDirectorSystem') },
  U3: {
    says: 'layoutCompass keeps a siege marker that is behind the player (pinned to the edge, not dropped)',
    probe: async (r) => {
      const m = await r.load('src/ui/compassLayout.js');
      const out = m?.layoutCompass?.([{ id: 'siege:0', kind: 'siege', bearing: Math.PI, labelWidth: 0 }], { heading: 0, fov: Math.PI, stripPx: 248 });
      return Array.isArray(out) && out.some((p) => p.id === 'siege:0');
    },
  },
  B1: { says: 'src/game/playerPoint.js exports steadyEye', probe: (r) => r.exports('src/game/playerPoint.js', 'steadyEye') },
  V2: { says: 'src/game/vitality.js exports isCalm', probe: (r) => r.exports('src/game/vitality.js', 'isCalm') },
  N6a: {
    says: 'followSkyClock follows a 60-unit tick at the rush rate instead of cutting to it',
    probe: async (r) => {
      const m = await r.load('src/render/skyClock.js');
      if (!m?.followSkyClock || !m.makeSkyClock) return false;
      const clock = m.makeSkyClock();
      m.followSkyClock(clock, 100, 1 / 60, 60);
      return m.followSkyClock(clock, 160, 1 / 60, 60) < 160;
    },
  },
  D3: { says: 'src/night/dawnPayoff.js exports dawnPayoffBeat', probe: (r) => r.exports('src/night/dawnPayoff.js', 'dawnPayoffBeat') },
  L2: { says: 'BLOCK_ID.lantern is 16 (src/world/blockIds.js)', probe: async (r) => (await r.load('src/world/blockIds.js'))?.BLOCK_ID?.lantern === 16 },
  L3: {
    says: 'forgeOffers lists the lantern (src/game/forge.js)',
    probe: async (r) => {
      const m = await r.load('src/game/forge.js');
      return Boolean(m?.forgeOffers?.(EMPTY_FORGE_STATE)?.some?.((o) => o.give === 'lantern'));
    },
  },
  N8: { says: 'a module other than game/lights.js imports nearestLit from it', probe: (r) => r.imports('nearestLit', /game\/lights(?:\.js)?/, join('src', 'game', 'lights.js')) },
  N2: { says: 'a source file registers the ambientAttempts test hook', probe: (r) => r.registersHook('ambientAttempts') },
  R1: { says: "the en strings hold 'notice.hearthLends'", probe: async (r) => (await r.load('src/i18n/strings.js'))?.STRINGS?.en?.['notice.hearthLends'] !== undefined },
});
