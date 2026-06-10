# ELEMANCER M1 — The 'hazard' Source + The Comma-Key Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-10-crafty-s2b4-elemancer-design.md` §3 M1.
> **The honest finding at plan time:** B3-M1's EXACT-MATCH `source === 'player'` filters already make ANY
> new source value bank nothing — 'hazard' is exploit-safe BY CONSTRUCTION. M1's real work = TESTS that
> PIN that construction (so a future subscriber that forgets the filter fails loudly) + the comma-key
> worldBlocks bug (Components.jsx:808 — readers comma, writers underscore: an always-miss whose raycast
> fallback silently covers it on save-load).

**Goal:** Zone kills provably bank nothing anywhere; the latent worldBlocks key inconsistency is dead with a gate that keeps it dead.

### Task 1: the comma-key fix + the key-shape gate
- [ ] Fix Components.jsx:808 `\`0,${y},0\`` → `\`0_${y}_0\`` (the writers' underscore shape).
- [ ] Extend `tests/gates/kill-attribution-gates.test.js`'s sibling (or add to allegiance-gates): a key-shape gate — no `worldBlocks.has/get` call anywhere in src may use a comma-template key (regex over the god files; self-extending).
- [ ] Battery + commit `fix(elemancer-m1): the comma-key worldBlocks always-miss (+ a key-shape gate)`

### Task 2: pin the 'hazard' source construction
- [ ] mobKillBus.test: emit with 'hazard' → a 'player'-filtered handler (the ferocity shape) banks NOTHING; the docstring source enum gains 'hazard'.
- [ ] The kill-attribution gate already enforces filtered === subscribers (the per-subscriber invariant — auto-covers any new source); add one explicit test naming 'hazard' so the contract reads in the suite.
- [ ] Battery + commit `feat(elemancer-m1): the 'hazard' kill-bus source pinned — zone kills bank nothing by construction`

### Task 3: close-out — spec M1 row ✅ + this plan SHIPPED + ACTIVE_PLAN → M2 (the imbue SM + resonance meter).

## Self-review: the spec M1 row's two clauses both covered (T2, T1); no placeholders; the gate regex written at build vs real lines.
