# Surface-Texture Fidelity (within the bold-flat lock) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.
> Steps use checkbox (`- [ ]`) syntax. This is the 2nd STRUCTURAL "stunning land" lever (after S1 vertex AO).

**Goal:** Make the voxel terrain surfaces read as RICHER and more premium WITHOUT leaving the locked
bold-flat / pixel-art / "anti-AI-slop" design language — by killing the repeated-identical-tile monotony
and improving the hand-crafted per-block patterns, NOT by adding photoreal PBR normal/height maps.

**Architecture:** `frontend/src/world/proceduralTextures.js` bakes a 10-layer `DataArrayTexture` (one albedo
tile per blockType, currently 32x32, `NearestFilter`, no mipmaps). `Terrain.jsx compileShader` samples it via
a custom `sampler2DArray` and already layers AO (vAO) + mood-grade + ocean foam/depth on top. We add a
world-position-hashed colour-variation pass in the shader (the #1 de-tiling lever) and enrich the baked
patterns; the material stays `MeshStandardMaterial` with FLAT normals (no normal map).

**Tech Stack:** procedural canvas->DataArrayTexture, Three custom sampler2DArray, MeshStandardMaterial onBeforeCompile.

---

## DESIGN-FORK RESOLUTION (read FIRST — this is why the plan looks different from the kernel's one-liner)

The kernel cursor said "32->128px + normal/roughness/AO/emissive PBR maps." Grounding that against the LIVE
code + the LOCKED design language surfaced a conflict:

- **Design language is LOCKED (CLAUDE.md "Design Language — LOCKED S1-C"):** "ONE bold-flat" look; the
  textures use `NearestFilter` + `generateMipmaps=false` with an explicit `// maintain pixel-perfect voxel
  look`; the master-plan repeatedly frames the target as "bold-flat anti-AI-slop," NOT photoreal.
- **PBR normal/height maps on flat stylized voxels = the AI-realistic look the lock forbids** — fake bumpy
  per-pixel lighting fights the crisp flat-shaded identity. Adding them CROSSES a locked invariant, which the
  charter ASK-GATE reserves for Kevin's taste.

**Therefore this plan does the ON-BRAND, autonomous-safe fidelity levers** (which are also the *correct*
SOTA levers for stylized voxel — Townscaper / Monument Valley / Bad North win on colour harmony + silhouette
+ de-tiling, not surface PBR):
1. **De-tile** — subtle world-position-hashed hue/value variation so a field of grass stops reading as 400
   identical stamped tiles (biggest single "premium stylized" lever; pure shader; capture-deterministic).
2. **Richer baked patterns** — better per-block hand-crafted detail (and a modest 32->64 res bump IF it stays
   crisp under NearestFilter), still flat colour, no mipmaps.
3. **Selective on-brand accents** — gentle emissive sparkle for snow / future ore glint (stays flat, no normal map).

**Kevin fork (surfaced to KEVIN-REVIEW, DEFAULT = REJECTED):** full PBR normal/height/roughness maps +
photoreal surface detail. Only build if Kevin explicitly wants to cross the bold-flat lock toward a richer-
realistic look. Until then, do NOT add normal maps.

---

## File Structure

- Modify: `frontend/src/world/proceduralTextures.js` — richer patterns; optional res bump; (NO normal map).
- Modify: `frontend/src/world/Terrain.jsx` (`compileShader`) — add `vWorldPos` varying + the de-tile hash pass.
- Create: `frontend/tests/world/proceduralTextures.test.js` — pin texture dims/layers + NearestFilter + no-mipmaps invariants (the bold-flat lock, as a gate).
- Create: `frontend/tests/world/detile.test.js` — pure unit test for the extracted hash/variation helper.
- Create: `frontend/src/world/detile.js` — pure `tileHue(worldX,worldY,worldZ)` -> small bounded offset (unit-testable; the shader mirrors the same formula).

---

## Slice 1 — De-tile: world-position colour variation (the #1 lever, pure shader + a pinned helper)

The win: break the "stamped identical tile" read. A position-hashed +/- small value/hue jitter per world
column makes natural ground look organic while staying flat-stylized. Capture-deterministic (depends only on
static world position, no time/camera). We pin the MATH in a JS helper + unit test, then mirror it in GLSL.

- [ ] **Step 1.1 — Write the failing test** `frontend/tests/world/detile.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { tileValueOffset } from '../../src/world/detile.js';
describe('tileValueOffset — bold-flat de-tile (bounded, deterministic, varies by cell)', () => {
  it('is deterministic for the same world cell', () => {
    expect(tileValueOffset(5, 30, 12)).toBe(tileValueOffset(5, 30, 12));
  });
  it('stays within +/- 0.08 (subtle — must not break the flat read)', () => {
    for (let i = 0; i < 200; i++) {
      const v = tileValueOffset(i * 3 - 100, (i % 40), i * 7 - 50);
      expect(v).toBeGreaterThanOrEqual(-0.08);
      expect(v).toBeLessThanOrEqual(0.08);
    }
  });
  it('differs across adjacent cells (actually de-tiles, not a constant)', () => {
    const a = tileValueOffset(5, 30, 12), b = tileValueOffset(6, 30, 12), c = tileValueOffset(5, 30, 13);
    expect(a === b && a === c).toBe(false);
  });
});
```
- [ ] **Step 1.2 — Run -> RED** (`detile.js` missing). `npx vitest run tests/world/detile.test.js`.
- [ ] **Step 1.3 — Implement** `frontend/src/world/detile.js`:
```js
// Bold-flat de-tile: a bounded, deterministic per-world-cell value offset that breaks the
// repeated-identical-tile monotony of the voxel terrain WITHOUT leaving the flat-shaded look.
// The GLSL terrain shader mirrors this exact formula on floor(worldPos) so JS + GPU agree.
// Pure (no state) -> unit-testable; depends only on static world position -> capture-deterministic.
export function tileValueOffset(wx, wy, wz) {
  const h = Math.sin(Math.floor(wx) * 12.989 + Math.floor(wy) * 78.233 + Math.floor(wz) * 37.719) * 43758.5453;
  const f = h - Math.floor(h);        // 0..1
  return (f - 0.5) * 0.16;            // +/- 0.08
}
```
- [ ] **Step 1.4 — Run -> GREEN.**
- [ ] **Step 1.5 — Mirror in GLSL** (`Terrain.jsx compileShader`): add `varying vec3 vWorldPos;` (vertex+fragment),
  set `vWorldPos = (modelMatrix * vec4(position,1.0)).xyz;` in the begin_vertex inject (reuse the existing
  modelMatrix calc that already feeds vWorldY). In the `<color_fragment>` inject, AFTER the texture sample +
  BEFORE the AO multiply, on NON-water only:
```glsl
// S(tex) de-tile: subtle per-world-cell value jitter (mirrors detile.js tileValueOffset) so a field of one
// block type stops reading as stamped identical tiles. Bounded +/-0.08, flat (no normal map). Static -> capture-stable.
float dh = sin(floor(vWorldPos.x)*12.989 + floor(vWorldPos.y)*78.233 + floor(vWorldPos.z)*37.719) * 43758.5453;
float dOff = (fract(dh) - 0.5) * 0.16;
if (abs(vBlockType - 9.0) >= 0.1) { diffuseColor.rgb *= (1.0 + dOff); }
```
- [ ] **Step 1.6 — Verify:** `npm run build` clean · `npx vitest run` grows (+detile, +dims test from slice 2 later) · `npm run visual:capture` then gate -> LOOK hearth/explore-day/biome-snow + `pov-probe`: ground reads organic/varied, NOT noisy/speckled. If too speckly -> the offset is per-CELL (column) already (floor), so it should read as block-to-block variation; if still busy, halve to +/-0.04. Re-baseline + commit (`detile.js` + test + Terrain.jsx + baselines) + CHANGELOG + ACTIVE_PLAN.

## Slice 2 — Richer baked patterns + the bold-flat invariant gate

- [ ] **Step 2.1 — Failing invariant test** `frontend/tests/world/proceduralTextures.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { createProceduralVoxelTextures } from '../../src/world/proceduralTextures.js';
import * as THREE from 'three';
describe('procedural voxel textures — bold-flat lock invariants', () => {
  const tex = createProceduralVoxelTextures();
  it('is a 10-layer DataArrayTexture', () => {
    expect(tex.image.depth).toBe(10);
    expect(tex.image.width).toBe(tex.image.height); // square tiles
  });
  it('keeps the pixel-art lock: NearestFilter + NO mipmaps (never drift to realistic filtering)', () => {
    expect(tex.minFilter).toBe(THREE.NearestFilter);
    expect(tex.magFilter).toBe(THREE.NearestFilter);
    expect(tex.generateMipmaps).toBe(false);
  });
});
```
- [ ] **Step 2.2 — Run -> GREEN immediately** (current code already satisfies it — this test is a REGRESSION LOCK so a future "let's add mipmaps/LinearFilter" can't silently break bold-flat). Commit it as the gate.
- [ ] **Step 2.3 — Enrich patterns** in `proceduralTextures.js`: improve the weakest-reading blocks (judge by LOOK first — grass/dirt/stone are the most-seen). Keep the same `setPixel` structure. OPTIONAL `size` 32->64 (more pattern room) — only if the LOOK shows 32px is the limiter; keep NearestFilter + `generateMipmaps=false` (the test enforces it). Update the dims test if size changes (square-tile assertion still holds).
- [ ] **Step 2.4 — Verify:** build · unit grows · capture+gate -> LOOK each block type at the diorama + pov: richer read, still crisp-flat, no shimmer (NearestFilter has no aniso so distant tiles can sparkle — if they do, that's the ONE place a mipmap/LinearMipmap is justified -> surface as a Kevin-taste micro-fork, don't auto-cross the lock). Re-baseline + commit + CHANGELOG.

## Slice 3 — Selective on-brand accents (OPTIONAL, only if slices 1-2 leave headroom)

- [ ] Gentle emissive sparkle on snow (n-thresholded bright specks -> small emissive) + reserve the same hook
  for S6 ore glints. Stays flat (no normal map). Capture-deterministic (position/noise based, no time).
- [ ] Verify as above. If it reads gimmicky -> drop (YAGNI).

## Notes / Self-Review
- **DRY:** the de-tile formula lives once in `detile.js` + is mirrored in GLSL with an inline comment pointing
  at it (GPU can't import JS); the test pins the JS, the visual gate pins the combined render.
- **No normal maps** anywhere in this plan — that is the Kevin fork, surfaced to KEVIN-REVIEW (default rejected).
- **Capture-determinism:** every effect depends only on static world position / seeded noise — never time/camera.
- **Re-baselines** batch into the ONE KEVIN-REVIEW taste review (item #39 world-visual batch).
- **STUCK protocol:** if a slice reads worse after 2 tuning attempts -> stop, 2 hypotheses, smaller step (one
  block type / one map at a time), or revert that slice and move to the next.
