import { describe, it, expect, afterEach } from 'vitest';
import { sourceTexts } from './_srcWalk.js';
import { worldDelta, realDelta } from '../../src/game/worldClock.js';
import { useGameStore } from '../../src/store/useGameStore';

/**
 * THE FREEZE REACHES EVERY WORLD CONSUMER (QUEUE R2.6; plan 2026-09-22-crafty-sota-baseline-tranche Task 5).
 *
 * Hitstop froze the mobs, the AI clock and the boss because each was edited to read worldTimeScale — and
 * allies, projectiles, particles, zones, orbs and loot kept moving through it. Opt-in per consumer is the
 * defect shape: the next world system written would not opt in either. So this is a CENSUS over every
 * useFrame in src/: a callback that takes the frame delta must route it through worldDelta (it freezes) or
 * realDelta (it runs on real time, and says so at its own call site). A raw use anywhere in the body is red.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   D1 a world site reads its raw delta again (LootSystem)   D2 plausible-wrong: worldDelta inverted (frozen = moving)
 *   D3 plausible-wrong: worldDelta ignores the freeze        D4 the census's arrow-head pattern misses a site
 *   D5 plausible-wrong: an ally system routed through realDelta   D6 a routed site reads the raw delta once more
 *
 * BLIND SPOT: the census proves each site DECIDED, not that it decided right — a world system routed through
 * realDelta passes. The world/real split is listed in the plan task and is the review surface. Callbacks passed
 * by reference (useFrame(tick)) and consumers animated by ABSOLUTE time (state.clock, performance.now()) are
 * not delta readers and are invisible here; the latter still move through a freeze (R2.7).
 */

// The useFrame callbacks that take a delta: `useFrame((state, delta) =>` in any spelling.
const HEAD = /useFrame\(\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*([A-Za-z_$][\w$]*)\s*\)\s*=>/g;

/** From the `(` after useFrame to its matching `)`, skipping strings and template literals. */
function callBody(src, open) {
  let depth = 0;
  const tpl = []; // brace depth at which each open template literal's ${ } began
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'") {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (c === '`' || (c === '}' && tpl.length && tpl[tpl.length - 1] === depth)) {
      if (c === '}') tpl.pop();
      for (i++; i < src.length && src[i] !== '`'; i++) {
        if (src[i] === '\\') i++;
        else if (src[i] === '$' && src[i + 1] === '{') { tpl.push(depth); i++; break; }
      }
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error('unbalanced useFrame call');
}

function census() {
  const sites = [];
  for (const { file, code } of sourceTexts()) {
    for (const m of code.matchAll(HEAD)) {
      const name = m[1];
      const body = callBody(code, m.index + 'useFrame'.length);
      const uses = body.match(new RegExp(`(?<![\\w$.])${name.replace('$', '\\$')}(?![\\w$])`, 'g')) || [];
      const routed = new RegExp(`\\b(worldDelta|realDelta)\\(\\s*${name}\\s*\\)`).exec(body);
      sites.push({ file, name, uses: uses.length, via: routed ? routed[1] : null });
    }
  }
  return sites;
}

describe('R2.6 census — every useFrame that takes a delta decided: frozen world, or real time on purpose', () => {
  const sites = census();

  it('finds the sites (a census over nothing is not a pass)', () => {
    // 15 when written: 12 world consumers, 3 real-time. The count is a presence control, not a pin.
    expect(sites.length, 'the arrow-head pattern stopped matching useFrame callbacks').toBeGreaterThanOrEqual(15);
    console.log(`[world-delta-census] ${sites.length} delta-taking useFrame sites: `
      + `${sites.filter((s) => s.via === 'worldDelta').length} world, ${sites.filter((s) => s.via === 'realDelta').length} real`);
  });

  it('each routes its delta through worldDelta or realDelta, and never reads it raw', () => {
    const bad = sites.filter((s) => !s.via || s.uses !== 2)
      .map((s) => `${s.file}: '${s.name}' ${s.via ? `used raw (${s.uses - 2} extra read(s))` : 'never routed'}`);
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('the world consumers the review named are on the FROZEN side', () => {
    const world = new Set(sites.filter((s) => s.via === 'worldDelta').map((s) => s.file));
    for (const f of [
      'EnhancedMagicSystem.jsx', 'render/MobModel.jsx', 'render/BossEntity.jsx', 'world/BlockParticleSystem.jsx',
      'world/SquadAISystem.jsx', 'world/ElementZoneSystem.jsx', 'world/HurlSystem.jsx', 'world/SnareTetherSystem.jsx',
      'systems/XPOrbSystem.jsx', 'systems/LootSystem.jsx', 'systems/EnemyProjectileSystem.jsx', 'systems/AIWorkerSystem.jsx',
    ]) expect(world.has(f), `${f} runs through a freeze`).toBe(true);
  });
});

describe('worldDelta — through the real store', () => {
  afterEach(() => useGameStore.setState({ hitstopUntil: 0 }));

  it('is 0 inside a freeze and the frame\'s delta outside it', () => {
    useGameStore.setState({ hitstopUntil: performance.now() + 60000 });
    expect(worldDelta(0.016)).toBe(0);
    useGameStore.setState({ hitstopUntil: performance.now() - 1 });
    expect(worldDelta(0.016)).toBe(0.016);
    useGameStore.setState({ hitstopUntil: 0 });
    expect(worldDelta(0.033)).toBe(0.033);
  });

  it('realDelta is the delta, freeze or not — the name is the decision', () => {
    useGameStore.setState({ hitstopUntil: performance.now() + 60000 });
    expect(realDelta(0.016)).toBe(0.016);
  });
});
