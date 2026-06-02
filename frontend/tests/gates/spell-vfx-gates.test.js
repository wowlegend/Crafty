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
