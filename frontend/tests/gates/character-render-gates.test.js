import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TIERS } from '../../src/render/quality.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('M2b static gates', () => {
  it('mob AI worker tick is capture-gated (deterministic closeup)', () => {
    const src = read('src/SimplifiedNPCSystem.jsx');
    // The worker-tick useFrame must early-return in capture mode BEFORE it posts the
    // AI TICK to the worker, so a spawned closeup mob never moves. Asserted as two
    // length-independent facts (guard exists + precedes the post) rather than a
    // brittle length-bounded span. Both anchors are unique in the file: the only
    // brace-less `if (isCaptureMode()) return;` is the worker-tick guard (the spawn
    // guard at ~line 556 is braced), and there is exactly one `postMessage`.
    const guardIdx = src.indexOf('if (isCaptureMode()) return;');
    const postIdx = src.indexOf('workerRef.current.postMessage');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(postIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(postIdx); // capture guard precedes the AI TICK post
  });

  it('boss emissive telegraph is PRESERVED (not stripped by the outline pass)', () => {
    const src = read('src/render/BossEntity.jsx'); // S3-M4 p4: BossEntity moved to render/ (the 3 boss gates follow it)
    // The boss's attack language is its emissive glow — the M2b outline must be purely
    // additive. Both the torso emissive binding and its intensity binding must remain.
    expect(src).toMatch(/emissive=\{bodyEmissive\}/);
    expect(src).toMatch(/emissiveIntensity=\{emissiveIntensityVal\}/);
  });

  it('boss is NOT converted to a toon material', () => {
    const src = read('src/render/BossEntity.jsx'); // S3-M4 p4: BossEntity moved to render/ (the 3 boss gates follow it)
    // The boss keeps meshStandardMaterial; it must never reference the toon material.
    expect(src).not.toMatch(/MobToonMaterial|meshToonMaterial/);
  });

  it('boss useFrame is capture-gated BEFORE it moves the boss (deterministic closeup)', () => {
    const src = read('src/render/BossEntity.jsx'); // S3-M4 p4: BossEntity moved to render/ (the 3 boss gates follow it)
    // In capture the boss freezes; the `if (isCaptureMode())` guard must precede the
    // movement write `bossPositionRef.current = [next...` so the dragon never moves.
    const guardIdx = src.indexOf('if (isCaptureMode()) {');
    const moveIdx = src.indexOf('bossPositionRef.current = [next');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(moveIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(moveIdx); // capture guard precedes the movement write
  });
});

describe('character ink outline is tier-independent (locked-look regression guard)', () => {
  // BUG (Kevin caught 2026-06-02): mob/boss/pet/prop inverted-hull <Outlines> appeared at
  // spawn then vanished mid-session. Root cause: every outline site gates on the quality
  // tier's `charOutline`, and the in-game PerformanceMonitor.onDecline ratchets the tier
  // ONE-WAY toward `low` under FPS pressure (more mobs => lower FPS). With low.charOutline
  // false, the signature ink contour unmounted on every entity, permanently for the session.
  //
  // FIX + DECISION: the ink outline is the LOCKED character render language (S1-B-M2b) and is
  // CHEAP (one backface mesh per object). The perf budget at `low` is recovered from the
  // genuinely-expensive toggles (ao/godRays/shadowMapSize/dprCap/renderDistance/outlineWorldEdge),
  // NOT from the character outline. So charOutline must be TRUE at every tier — never a
  // perf-downgrade casualty. (charRim — the fresnel onBeforeCompile patch — stays high-only.)
  it('charOutline is ON at every quality tier (never dropped by a perf downgrade)', () => {
    for (const tier of ['low', 'med', 'high']) {
      expect(TIERS[tier].charOutline, `${tier}.charOutline must be true (tier-independent signature ink outline)`).toBe(true);
    }
  });
});
