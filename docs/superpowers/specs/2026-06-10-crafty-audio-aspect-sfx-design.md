# Audio interleave unit — Aspect SFX + the #74 motif policy (design of record)

> **Status (2026-06-10): DESIGN COMMITTED (loop self-gate; grounded in the LIVE SoundManager).**
> The charter §2.5 interleave debt (6 milestones) + §4's "audio shipped most-neglected" mandate.
> Owns: the loop-decided #74 policy, the WILDHEART roar SFX backfill (owed since B1), the VOIDHAND
> verb SFX set, and the per-Aspect motif mechanism.

## 1. Ground truth (read before designing — SoundManager.jsx, 811 LOC)

ALL audio is **WebAudio-synthesized in-engine, zero samples**: (a) SFX = pre-generated buffers in a
named registry (`sounds.current.<name> = generate*Sound()`, played via `playSound(name, rate)` and
spatially via the store-registered `playSpatialSound`); (b) MUSIC = a mood-chord pad (4 voice
oscillators + LFO, mood-reactive chord ramps) + an arpeggiator (tri-oscillator pluck, scheduled).
Adding a sound = one `generate*` builder + one registry line + one `play*` wrapper + the call site.

## 2. THE #74 POLICY (loop-decided per the charter transfer list): ALL-SYNTH, IN-ENGINE

Procedural synthesis IS Crafty's sound identity — consistent with the shipped pad/arp, zero
assets/licensing, iPad-light, deterministic, and cohesive (premium = coherent timbre, not sample
fidelity). External generation (ElevenLabs etc.) REJECTED for v1: asset pipeline + timbre-coherence
risk + spend = a Kevin item. **Reversal path:** revisit at the S4 polish pass with a side-by-side.

## 3. Per-Aspect motif mechanism (the master-plan commitment, mechanically cheap)

The arpeggiator already plays scheduled scale notes; the pad already ramps mood chords. The motif =
**an Aspect-keyed accent, not a new music system**: (a) a one-shot STINGER builder (a 3-5 note
arpeggio burst in the Aspect's scale color) fired at Aspect-signature moments; (b) optionally later,
an arp scale-bias while an Aspect state is active (deferred until (a) proves the feel).
- **WILDHEART** = feral minor-pentatonic, low register (the roar stinger doubles as it).
- **VOIDHAND** = whole-tone shimmer, mid-high register (weightless violet) — fired on grab-commit.

## 4. The SFX set (the build list — one loop iteration)

| name | builder sketch | call site (exact) |
|---|---|---|
| `roar` (OWED since B1) | layered low saw sweep 80→45Hz ~0.7s + noise burst + sub thump | the beastTransform 'commit' apply-site in Components (the roar SM action) |
| `grab` | rising triangle chirp 220→520Hz ~0.25s (+ the voidhand stinger) | Components voidhand apply 'grab' branch |
| `hurl` | filtered-noise whoosh, sweep down ~0.3s | apply 'hurl' branch (launch moment) |
| `slam` | low sine thump 90Hz + fast decay + click transient | apply 'slam' branch (pairs w/ the camera kick) |
| `anvilHit` | bright metallic FM ping ~1.2kHz, short | HurlSystem anvil branch (next to spawnAnvilText), SPATIAL at the impact |

All capture-safe by construction (verbs never fire in capture). Gate note: Components is
voxel-gated, sound calls are clean; HurlSystem likewise.

## 5. Verification

Unit: builders return non-null buffers (length>0) given a context — testable via an OfflineAudioContext
in jsdom? (vitest env lacks WebAudio: the builders guard on `!audioContext.current` → unit-test the
REGISTRY WIRING shape instead via a static gate: every name in §4 appears in generateSounds + a play
wrapper exists). In-world judge: headless can't hear — the envelope method doesn't apply; verification
= call-site smoke (the play* fn is invoked on the verb — spy via the registry) + Kevin's playtest ear
(KRB cue). Suite/build/visual must hold (no render changes).
