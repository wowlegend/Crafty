# Loot-drop ground-glow halo (visual polish) — ✅ SUPERSEDED (iter 163 shipped a better design)

> **✅ SUPERSEDED 2026-06-14 (loop iter 163):** shipped the rarity glow as a **camera-facing-equivalent
> sphere glow-SHELL around the gem** (commit `9e18242`), NOT the ground-disc below. Why the redesign: the
> only fixture that renders loot (`loot-showcase`) has a near-horizontal camera, so a flat ground decal is
> seen edge-on (a thin ellipse — poorly judged AND barely changes the baseline); a sphere shell is visible
> from ANY angle in-game (suits floating loot) + judged cleanly front-on. It uses the established spellVfx
> outer-glow-shell + Bloom technique (coherent, texture-free). See `src/render/pickupVfx.jsx` LootDropRender
> + `src/game/lootJuice.js` rarityBeam (auraRadius/auraOpacity). The original ground-disc plan below is
> retained for history only. **(Known follow-up: a deterministic grey-cube fixture-leak at the loot-showcase
> bottom-edge — not aura-related — blocks a clean loot-showcase re-baseline; the aura passes at <6% meanwhile.)**

> **⏸ PARKED (loop iter 158) — design complete + unit-green, but REVERTED because the visual needs a
> `loot-showcase` re-baseline and the capture harness was flaking its 45s settle-wait on EVERY run under
> machine load (3 consecutive aborts, even on early states). Shipping an UNSEEN visual violates charter §4
> (judge-in-world / self-eyeball). Re-apply the exact edits below + re-baseline `loot-showcase` when the
> capture harness is reliable again (it captured fine @146-150, so this is a transient load spike).**

**Goal:** A premium rarity-coloured **ground-glow halo** under each loot drop (the Diablo-style "come get it"
tell) — the current drop reads as a floating gem + thin beam with no ground presence. Tier-scaled (legendary
glows widest/brightest), additive, static (capture-deterministic).

**Why it needs capture:** the halo renders in the `loot-showcase` baseline (the deliberate loot-VFX fixture)
→ a DELIBERATE re-baseline (HD self-eyeball + this is its own KEVIN-REVIEW entry). The other 17 baselines are
untouched (the disc only renders in `LootDropRender`, only present in loot-showcase).

---

### Re-apply (exact edits — all were written + unit-green @158 before the revert)

- [ ] **`src/game/lootJuice.js`** — extend `BEAM_LOOK` with a `glow` radius per tier + return glow params:
  - `common: {..., glow: 0.55}`, `rare: {..., glow: 0.80}`, `epic: {..., glow: 1.05}`, `legendary: {..., glow: 1.35}`.
  - `rarityBeam` returns additionally `glowRadius: BEAM_LOOK[tier].glow` + `glowOpacity: Math.min(0.6, BEAM_LOOK[tier].intensity + 0.12)`.
- [ ] **`src/game/lootJuice.test.js`** — add: glowRadius strictly climbs common→legendary, glowOpacity climbs (>=) + is capped at 0.6.
- [ ] **`src/render/pickupVfx.jsx`** `LootDropRender` — add `const glowRef = useRef();`; in `useFrame` after the beamRef block: `if (glowRef.current) { glowRef.current.position.copy(entity.position); glowRef.current.position.y -= 0.28; }`; in the JSX (after the beam mesh):
```jsx
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[beam.glowRadius, 24]} />
        <meshBasicMaterial color={color} transparent opacity={beam.glowOpacity}
          depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
```
- [ ] **Re-baseline** `loot-showcase`: `npm run visual:capture` → eyeball `current/loot-showcase.png` at HD (4 drops, each with a soft tier-scaled ground halo; legendary widest) → confirm the OTHER 17 stay byte-identical → `cp current/loot-showcase.png baseline/loot-showcase.png` → 18/18. KEVIN-REVIEW before/after entry.

## Capture-flake note (the actual blocker — for the harness, not this feature)
`npm run visual:capture` aborted with `TimeoutError: Waiting failed: 45000ms` on 3 consecutive runs @158 — even before reaching mid-sequence states — i.e. an early settle-wait (`waitForStableTerrain` / a flushFrames+delay) exceeded 45s under load. This is environmental (the harness captured fine @146-150). If it recurs persistently, consider: (a) bumping the settle timeouts, (b) a `--only=<state>` single-state capture flag to make re-baselines cheap + load-resilient (a real harness improvement — a separate quality-debt unit).
