# Music-motif v2 — the per-Aspect stingers (design note; the §2.5 audio interleave)

> **Status (2026-06-11): DESIGN COMMITTED.** The #74 audio design's deferred half, now clean atop
> S3-M1's audio/ extraction. MOTIFS ≠ SFX: the verb foley (roar/grab/slam/bind/ignite) stays; a
> stinger is a short MELODIC phrase in the Aspect's identity, played at the SIGNATURE moment only,
> RARITY-GUARDED so it stays special (the "rare = premium" rule).

## The four (a shared arp grammar, per-Aspect intervals + timbre)
| Aspect | Motif | Timbre | The moment | Rarity |
|---|---|---|---|---|
| WILDHEART | a rising minor-pentatonic triplet A2→C3→E3 (primal, low) | sawtooth growl | the TRANSFORM (beast-enter, beside the roar) | naturally rare (a full Ferocity bank) + 10s guard |
| VOIDHAND | E3→B2→E2 falling-resolving (gravity, weight) | square + sub | the SLAM impact | 10s guard |
| SOULBIND | G3→B3→D4→G4 major arp (a soul joins — warmth) | triangle | the FUSE (the hybrid's birth) | naturally rare (50 Soul) |
| ELEMANCER | C4→E4→F#4→B4 lydian sparkle (chemistry, wonder) | sine + shimmer | the FIRST zone of each day | once per day cycle |

## Mechanics
- `audio/aspectMotifs.js`: a pure `makeArp(ctx, notes, noteDur, wave, opts)` + the four factories;
  they JOIN the VOICES registry (motifWildheart/motifVoidhand/motifSoulbind/motifElemancer) — one
  registry, one loop, auto-characterized by the existing all-VOICES shape tests (the set-lock grows
  26→30: in-contract additive growth, justified in the commit).
- Playback: the existing playSpatialSound paths at the four sites (Components: beast-enter + the slam
  action + the fuse action; ElementZoneSystem: the spawn site, gated by a once-per-day ref reset at
  the dawn edge). 10s module-ref guards where the moment isn't naturally rare.
- Capture-safe: all four moments are gameplay-only (capture suppresses them upstream).
