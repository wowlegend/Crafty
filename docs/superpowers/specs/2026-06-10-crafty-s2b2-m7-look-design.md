# VOIDHAND M7 — THE LOOK: reference lock + build scope (design of record)

> **Status (2026-06-10): REFERENCE LOCKED (loop self-gate per charter §4 — judged IN-WORLD).**
> Evidence frames: `.superpowers/s2b2-voidhand-m7-refs/held-*.png` (the current phantom held under
> night siege + day, captured live via `?perf=C`; `before-night.png`/`burst-*` = the day/SM context).
> Owning spec: `2026-06-09-crafty-s2b2-voidhand-design.md` §5 (rec: rim-glow +
> exact-color-with-faint-violet-tint; element impact-only in v1) — CONFIRMED by the in-world judge.

## 1. What the in-world BEFORE shows (held-1.png, night siege — the verb's home context)

The M1 "placeholder" architecture is already 80% of the locked look: an ink-dark block silhouette
with a **crisp violet additive rim** (BackSide shell — reads as an EDGE, never a blob: exactly the
shipped ③·5 discipline) + a soft violet pointLight pool on nearby terrain. At night this reads
striking and identity-strong (Hades-adjacent ink + the Aspect violet `#B36BFF`, the same color the
HUD bar and talent accent use).

**The verified gap:** the block FACE is light-driven, so at night the "WHAT am I holding" identity
(the grabbed block's tint — grass/stone/wood) is crushed to black. The proxy reads as "a void
block" always, not "MY grass block". Daytime is fine.

## 2. THE LOCK (architecture confirmed, two deltas + the impact kit)

- **KEEP (locked):** ink-silhouette block + violet additive rim shell (opacity ~0.28, BackSide) +
  violet pointLight (intensity 1.4, the M2 light-pool mount). No bloom-blob, no aura inflation —
  the rim IS the identity. The orbit tumble stays.
- **DELTA 1 — night-readable block identity:** a faint EMISSIVE lift on the block face from its own
  tint (`emissive = tint`, `emissiveIntensity ≈ 0.22`, Kevin-tunable) — the face self-reads at
  night WITHOUT becoming a glow-source (far below bloom threshold; judged in-world before commit).
- **DELTA 2 — the impact kit (the M4-deferred items):**
  - HURL/SLAM impact: a one-shot white-hot core flash at the impact point (the proven
    SpellProjectileCore recipe: small additive core, ~120ms decay) — the existing element sparks
    (damageMob) stay the element-teller.
  - **WALL HIT!**: a gold damage-number variant at the anvil bonus (the 3× moment must READ —
    player-experience closure). Plumbing: extend the damage-number object with an optional
    `label`/`gold` flag through the existing setDamageNumbers path (CombatSystem-internal; the
    HurlSystem signals via a new optional GameMethods.damageMob 4th arg or a registered
    `GameMethods.anvilHit(pos)` — pick the cheaper at build time, keep damageMob's signature
    stable for other callers).
- **Grab tint:** stays worldBlocks-known-only in v1 (the honest M3 partial). The pristine-terrain
  worker query is NOT worth the seam for v1 (recorded; revisit only if playtest flags it).
- **Element held-tint: NO** (spec §13 #1 rec confirmed — element shows at IMPACT only; the held
  rim stays Aspect-violet so the phantom never masquerades as a spell).

## 3. Visual-gate impact (deliberate, scoped)

The phantom self-nulls in capture → the 13 baselines DON'T change from the phantom deltas. The
impact flash + gold label are runtime-only (never fire in capture). **Expected re-baselines: NONE.**
A deterministic REVIEW state (not gate-tracked) via `?perf=C` + the burst method documented in
`.superpowers/s2b2-voidhand-m7-refs/HOW.md` replaces the spec's "re-baseline provisional frames"
(there were never voidhand frames IN the gate — spec drift, corrected).

## 4. Build tasks (each one loop iteration; TDD where logic exists)

1. **M7-T1:** emissive lift (PhantomBlockSystem one-liner + in-world judge at night vs `held-1.png`).
2. **M7-T2:** impact core flash (HurlSystem one-shot transient; capture-inert by construction).
3. **M7-T3:** WALL HIT! gold label (damage-number channel + the anvil call site; unit test the
   label plumbing if a pure seam emerges).
4. **M7-T4:** AFTER frames via the documented method + KRB before/after entry + close-out.
