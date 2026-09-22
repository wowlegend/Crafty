import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIERS, selectTier } from '../../src/render/quality.js';

/**
 * RENDER COST — the three knobs whose defaults were burning a laptop, pinned.
 *
 * WHY. On 2026-09-22 the operator reported an M3 Max with the fans at full and asked why testing and
 * playing Crafty are both expensive. Nothing in this repo could answer "what does a frame cost": the
 * visual gate compares pixels, prod-smoke counts frames, perf-siege runs against dev. Three findings, all
 * invisible to every existing gate:
 *
 *   1. <EffectComposer> was mounted with NO `multisampling` prop. The package default is 8 and
 *      `frameBufferType` defaults to HalfFloatType (both read from the installed dist). That is an 8x
 *      multisampled RGBA16F target at full canvas resolution, blit-resolved every frame. First written
 *      here as ~471 MB at dpr2 from the REQUESTED sample count; measured later on a real ANGLE Metal /
 *      Apple M3 Max context, MAX_SAMPLES is 4, so the requested 8 was always clamped and the true figure
 *      is ~236 MB. Half as large, same verdict.
 *      `antialias: false // Post-processing handles AA` and <SMAA/> sits in the same chain. The author
 *      delegated AA to post; the 8x MSAA was cost nobody asked for and nobody could see.
 *
 *   2. `flipflops={3}` on PerformanceMonitor. drei's default is Infinity, and its sampler starts with
 *      `if (api.fallback) return;` — exceeding the budget stops SAMPLING for the session. A warm-up climb
 *      (2 inclines) plus one dip hits 3, so the adaptive governor froze almost immediately.
 *
 *   3. `godRaySamples: 100` at `high`, in a file whose own header says "GodRays cost scales ~linearly
 *      with samples". Never cost-budgeted: measured live, `navigator.deviceMemory` reports 32 on a secure
 *      context and cores 14, so `selectTier` returns `high` on that laptop.
 *
 * WHAT THIS GATE IS AND IS NOT. It pins DECISIONS, not performance. It cannot measure a frame — that is
 * `scripts/visual/gpu-cost-probe.mjs`, an instrument that prints and does not judge, because a frame rate
 * measured on a 34-session box is evidence about the box (the load average moved 232 -> 13 inside one
 * session here). Pinning the decisions is what stops a default silently re-arming; pinning a number would
 * make this gate go red from someone else's build.
 *
 * Mutation-Proof: 5 mutations, measured, denominator asserted (6/6 cases collected on every run):
 *   M1 remove `multisampling={0}`                    -> composer case RED
 *   M2 `multisampling={8}`                           -> composer case RED (the check is for 0, not for
 *      the prop's presence — an existence assertion would have passed the exact defect)
 *   M3 re-add `flipflops={3}`                        -> governor case RED
 *   M4 `godRaySamples: 100` at high                  -> budget case RED
 *   M5 `antialias: true` on the Canvas               -> AA-delegation case RED (that prop is WHY 0 is
 *      correct; if someone turns canvas AA back on, multisampling={0} needs re-deciding, not keeping)
 * Each restored from a cp backup and diffed byte-identical.
 *
 * BLIND SPOT, stated: every check here is a claim about SOURCE. Nothing proves the composer actually
 * allocates fewer bytes at runtime — the composer's own render target is not reachable from a page
 * context, which gpu-cost-probe says out loud rather than printing a reassuring 0. A real Chrome, not
 * SwiftShader, is required to confirm the per-frame `GL_INVALID_OPERATION: glBlitFramebuffer` is gone.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(resolve(HERE, '../../src', rel), 'utf8');

/**
 * Strip comments before asserting a file does NOT contain something. Caught in the act writing this file:
 * the flipflops absence check matched GameScene's own residue note, which documents the removed value as
 * `flipflops={3}` in prose — so the gate reported a violation by the code that had just complied. Same
 * shape as opsec-scan firing on the six files DOCUMENTING its ban, fixed the same morning. An absence
 * assertion over commented text is unfalsifiable in the wrong direction: it fails on the fix and passes
 * on nothing.
 */
const code = (rel) => src(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('render cost — the knobs that were burning a laptop', () => {
  const scene = src('GameScene.jsx');

  it('the EffectComposer disables its own MSAA (the package default is 8, on a HalfFloat target)', () => {
    expect(scene).toMatch(/<EffectComposer\s+multisampling=\{0\}/);
  });

  it('the Canvas still delegates AA to post-processing — which is WHY 0 is the right value', () => {
    // If this flips to true, multisampling={0} stops being free and needs re-deciding rather than keeping.
    expect(scene).toMatch(/antialias:\s*false/);
    expect(scene).toMatch(/<SMAA\s*\/>/); // the pass actually doing the antialiasing
  });

  it('PerformanceMonitor does not cap flipflops, which would freeze adaptation for the session', () => {
    expect(scene).toMatch(/<PerformanceMonitor/);
    // drei stops SAMPLING once the budget is exceeded; the bounds dead zone is what prevents oscillation.
    // Comment-stripped: the file's residue note names the removed value in prose (see `code` above).
    expect(code('GameScene.jsx')).not.toMatch(/flipflops=\{\d+\}/);
  });

  it('no tier asks for more god-ray samples than med, the value judged to hold the signature', () => {
    // The knob whose cost scales ~linearly, on the tier a 36GB/14-core laptop actually gets.
    expect(TIERS.high.godRaySamples).toBeLessThanOrEqual(TIERS.med.godRaySamples);
    expect(TIERS.high.godRaySamples).toBeGreaterThan(0); // and high must still HAVE god rays
  });

  it('the tier a high-end laptop gets is the one the budget above was written for', () => {
    // Measured, not assumed: navigator.deviceMemory === 32 and hardwareConcurrency === 14 on the operator's
    // machine, read from a real Chromium on a secure context. Pinned so a future selectTier change cannot
    // quietly move that machine to a tier nobody cost-budgeted.
    expect(selectTier({ coarsePointer: false, deviceMemory: 32, cores: 14 })).toBe('high');
  });

  it('every tier declares every cost knob (an undefined knob reads as "off" and is never noticed)', () => {
    const KNOBS = ['ao', 'godRays', 'godRaySamples', 'bloomMipmap', 'shadowMapSize', 'renderDistance', 'dprCap'];
    const tiers = Object.keys(TIERS);
    expect(tiers.length).toBeGreaterThan(0); // R3a — the zero-guard, or this loop is vacuous
    for (const t of tiers) {
      for (const k of KNOBS) {
        expect(TIERS[t][k], `TIERS.${t}.${k}`).toBeDefined();
      }
    }
  });
});
