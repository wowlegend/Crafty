import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// S1-D-M1: Spell-VFX SPINE static gates.
//
// The spell path was "glowy balls fly and disappear": projectiles + impacts rendered
// as 25-40 individual React `<mesh>` spheres (SpellTrail / SpellImpact / ImpactParticle)
// mounting/unmounting per cast, no camera-shake, and a MAIN-THREAD BUSY-WAIT hitstop on
// the shared damageMob path. M1 routes impacts through the repo's existing 1200-spark
// GPU pool (`triggerGPUSparks`), shakes the camera on impact/kill, replaces the busy-wait
// with a non-blocking store-flag hitstop, and deletes the per-instance React-sphere slop.
//
// These gates are STATIC (source-text) so they run GPU-free in CI. They assert the
// structural outcome, not pixels (the puppeteer visual gate covers pixels).

const SRC = resolve(process.cwd(), 'src');
const magic = () => readFileSync(resolve(SRC, 'EnhancedMagicSystem.jsx'), 'utf8');
const npc = () => readFileSync(resolve(SRC, 'SimplifiedNPCSystem.jsx'), 'utf8');
const gameScene = () => readFileSync(resolve(SRC, 'GameScene.jsx'), 'utf8');
const sparks = () => readFileSync(resolve(SRC, 'world', 'GPUSparkSystem.jsx'), 'utf8');
const app = () => readFileSync(resolve(SRC, 'App.jsx'), 'utf8');
const capture = () => readFileSync(resolve(SRC, 'devtest', 'captureMode.js'), 'utf8');

describe('S1-D-M1 spell-VFX spine', () => {
  // (a) The spell-impact path routes through the SOTA GPU spark pool (reuse, not fork).
  it('spell impacts route through triggerGPUSparks (reuse the GPU pool)', () => {
    expect(magic(), 'EnhancedMagicSystem must call store.triggerGPUSparks on impact')
      .toMatch(/triggerGPUSparks\s*\(/);
  });

  // Per-element spark type profiles must be passed (fire warm / ice shards / lightning
  // fast / arcane swirl) — the GPU pool branches on these type strings.
  it('spell impacts pass per-element spark type profiles', () => {
    const src = magic();
    for (const t of ['fireball', 'iceball', 'lightning', 'arcane']) {
      expect(src, `spark profile for ${t} expected on the spell-impact path`)
        .toMatch(new RegExp(`['"\`]${t}['"\`]`));
    }
  });

  // (b) Camera-shake on spell impact — spells previously never shook.
  it('spell impacts trigger camera-shake', () => {
    expect(magic(), 'EnhancedMagicSystem must call triggerCameraShake on impact')
      .toMatch(/triggerCameraShake\s*\(/);
  });

  // (c) NO main-thread busy-wait hitstop remains on the damage path. The old form was a
  //     `while (performance.now() < hitstopEnd) {}` spin loop inside damageMob. Strip
  //     line comments first so a prose mention of the old pattern can't trip the gate.
  it('no while(performance.now()) busy-wait remains on the damage path', () => {
    const code = npc().replace(/\/\/[^\n]*/g, '');
    expect(code, 'main-thread busy-wait hitstop must be removed from damageMob')
      .not.toMatch(/while\s*\(\s*performance\.now\s*\(\s*\)/);
  });

  // The non-blocking hitstop replacement must exist as a store-flag the loop reads.
  it('non-blocking hitstop store flag is set on the damage path', () => {
    expect(npc(), 'damageMob must set a non-blocking hitstop flag (hitstopUntil)')
      .toMatch(/hitstopUntil/);
  });

  // (d) The per-instance React-sphere slop components are GONE. Asserting the component
  //     declarations are removed (not merely unused) — these were the draw-call hogs.
  //     Word-boundary `\b` after the name so the replacement `SpellImpactPop` (the new
  //     single ring+light mesh) is NOT a false positive for the deleted `SpellImpact`.
  it('per-instance React-sphere slop components are removed', () => {
    const src = magic();
    for (const name of ['SpellTrail', 'SpellImpact', 'ImpactParticle', 'FireImpactEffect', 'IceImpactEffect', 'LightningImpactEffect', 'ArcaneImpactEffect']) {
      const decl = new RegExp(`const\\s+${name}\\b`);
      expect(src, `const ${name} must be deleted (per-instance sphere slop)`).not.toMatch(decl);
    }
  });

  // The slop's JSX usages must also be gone (no <SpellImpact/> / <ImpactParticle/> etc).
  // `(?![\\w])` lookahead keeps `<SpellImpactPop` (the new mesh) from matching `<SpellImpact`.
  it('slop component JSX usages are removed', () => {
    const src = magic();
    for (const name of ['SpellTrail', 'SpellImpact', 'ImpactParticle', 'FireImpactEffect', 'IceImpactEffect', 'LightningImpactEffect', 'ArcaneImpactEffect']) {
      const tag = new RegExp(`<${name}(?![\\w])`);
      expect(src, `<${name}> JSX usage must be removed`).not.toMatch(tag);
    }
  });

  // The transient bloom-spike must be drivable. NOTE: attaching a React `ref` to <Bloom>
  // crashes the canvas in @react-three/postprocessing@3.0.4 (circular-JSON on the effect's
  // Textures), so the spike is driven by reaching the live BloomEffect through the composer
  // context instead. This gate asserts THAT mechanism (driver + intensity write), and that
  // the store exposes triggerBloomSpike + the impact path calls it.
  it('bloom-spike is wired via the composer-context driver (no broken Bloom ref)', () => {
    const gs = gameScene();
    expect(gs, 'a BloomSpikeDriver must be mounted in the composer').toMatch(/<BloomSpikeDriver\s*\/?>/);
    expect(gs, 'the driver must reach the BloomEffect via the composer context').toMatch(/EffectComposerContext/);
    expect(gs, 'the driver must write the effect intensity for the spike').toMatch(/\.intensity\s*=/);
    expect(magic(), 'spell impacts must request a bloom spike').toMatch(/triggerBloomSpike\s*\(/);
  });

  // GAMEPLAY PRESERVATION: damage / cooldown / mana / targeting calls must remain.
  it('spell gameplay preserved (damage, mana, targeting)', () => {
    const src = magic();
    expect(src, 'mana cost gate must remain').toMatch(/useMana/);
    expect(src, 'damage application must remain').toMatch(/damageMob/);
    expect(src, 'mob targeting must remain').toMatch(/checkMobCollision/);
    expect(src, 'damage solver must remain').toMatch(/solveSpellDamage/);
  });
});

// S1-D-M2: Layered cast ARC (telegraph rune -> release trail -> tuned impact) +
// the deterministic `spell-cast` capture state that makes the spell LOOK
// gate-verifiable and eyeball-able for the first time.
//
// Static gates (source-text, GPU-free). The pixel content of the cast frame is
// covered by the puppeteer visual gate + a human eyeball of current/spell-cast.png.
describe('S1-D-M2 cast-arc + deterministic spell-cast capture state', () => {
  // (A1) The GPU spark burst is capture-DETERMINISTIC + VISIBLE. In capture the M1
  //      burst pushed sparks to the clip void (aStartTime = live wall-clock while
  //      uTime=0 => t<0 => dead-spark branch) AND used raw Math.random velocities.
  //      M2 must, under isCaptureMode(): (a) seed the burst RNG by a stable key, and
  //      (b) start sparks at a fixed NON-NEGATIVE phase at uTime=0 so they render
  //      in-frame mid-life rather than clipping out.
  it('spark burst is capture-deterministic (seeds RNG under capture)', () => {
    const src = sparks();
    expect(src, 'GPUSparkSystem must branch on isCaptureMode for determinism').toMatch(/isCaptureMode\s*\(/);
    expect(src, 'capture burst must use a seeded RNG (makeSeededRandom/captureRandom), not raw Math.random')
      .toMatch(/makeSeededRandom|captureRandom/);
  });

  it('spark burst renders visibly at uTime=0 in capture (fixed non-negative phase, not clip-void)', () => {
    const src = sparks();
    // The fix anchors aStartTime to a fixed negative phase under capture so that with
    // uTime=0, t = uTime - aStartTime > 0 (alive, mid-life), not the dead-spark branch.
    expect(src, 'a fixed capture spark phase constant must exist').toMatch(/CAPTURE_SPARK_PHASE/);
  });

  // (A2) The deterministic cast driver is wired as a test hook + into the capture
  //      script + the visual diff STATES list, so `spell-cast` is a first-class state.
  it('spawnSpellCast test hook is registered (deterministic cast driver)', () => {
    expect(app(), 'App must register a spawnSpellCast test hook').toMatch(/registerTestHook\(\s*['"`]spawnSpellCast['"`]/);
  });

  it('spell-cast is a wired visual-regression state (capture script + diff STATES)', () => {
    const cap = readFileSync(resolve(SRC, '..', 'scripts', 'visual', 'capture.mjs'), 'utf8');
    expect(cap, 'capture.mjs must drive spawnSpellCast').toMatch(/spawnSpellCast/);
    expect(cap, "capture.mjs must screenshot spell-cast.png").toMatch(/spell-cast\.png/);
    const diff = readFileSync(resolve(SRC, '..', 'tests', 'visual', 'diff.test.js'), 'utf8');
    expect(diff, "spell-cast must be in the visual diff STATES list").toMatch(/['"`]spell-cast['"`]/);
  });

  // (B) The TELEGRAPH rune-circle (the spec's shared shape vocabulary) exists, is
  //     additive geometry (no texture atlas), and is capture-gated so the cast frame
  //     is deterministic.
  it('cast telegraph rune-circle component exists (additive geometry, zero-texture)', () => {
    const src = magic();
    expect(src, 'a CastTelegraph rune component must exist').toMatch(/const\s+CastTelegraph\b/);
    expect(src, 'telegraph must use additive blending (animated-shapes doctrine, no texture atlas)')
      .toMatch(/AdditiveBlending/);
    // The shared shape vocabulary: a ring/rune-circle quad at the muzzle.
    expect(src, 'telegraph must render a ring/rune-circle geometry').toMatch(/ringGeometry|circleGeometry/);
  });

  it('cast telegraph is capture-deterministic (gated on isCaptureMode)', () => {
    expect(magic(), 'telegraph animation/RNG must gate on isCaptureMode for a stable capture frame')
      .toMatch(/isCaptureMode\s*\(/);
  });

  // The release trail (M1 stretch-billboard) is preserved by M2 (not regressed away).
  it('release stretch-billboard trail preserved', () => {
    expect(magic(), 'velocity stretch-billboard trail math must remain').toMatch(/_trailDir|stretch-billboard/i);
  });

  // GAMEPLAY PRESERVATION re-asserted after the arc edits: the cast still costs mana,
  // grants XP, and the projectile lifecycle (damage/targeting) is untouched.
  it('cast-arc preserves spell gameplay (mana cost + XP grant + cast entry)', () => {
    const src = magic();
    expect(src, 'castSpell must remain the public cast entry').toMatch(/castSpell\s*:/);
    expect(src, 'mana cost gate must remain on cast').toMatch(/useMana/);
    expect(src, 'XP grant on cast must remain').toMatch(/grantXP/);
  });
});
