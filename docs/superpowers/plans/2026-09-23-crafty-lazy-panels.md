# Lazy Panels Implementation Plan (boot weight, and room under the byte budget)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The on-demand panels (inventory, crafting, magic, building, settings, spell upgrades, quest log, chest,
trading, credits, world manager) leave the boot bundle for one lazy chunk, prefetched once the game is idle — a
smaller first download and parse, and room under the `index` byte budget, which the perfect dodge left at 0.7 KB.

**Architecture:** `MenuSystem.jsx` imports the panels eagerly today. A new `ui/panels/lazyPanels.js` holds ONE
`import()` of a barrel module (`ui/panels/panelBundle.js`) that re-exports every on-demand panel, so they share one
chunk and one request. `React.lazy` wrappers are built from that single promise; `MenuSystem` renders them inside
one `<Suspense fallback={null}>`. `prefetchPanels()` starts the import on the first idle callback after the world is
playable, so the first panel a player opens is already loaded. The capture hook `openModal` awaits the same promise
before it opens a panel, so the visual oracle never shoots a blank frame.

**Tech Stack:** React 19 `lazy`/`Suspense`, Vite 6 dynamic-import code splitting, the existing `bundle-budget.mjs`.

**Spec:** this document is the spec (a pure refactor: no behaviour change, no new UI). Source: the byte-budget
finding in `docs/superpowers/sota-2026-09/OVERNIGHT.md` (the `index` chunk at 741.5 of 742.2 KB).

## Global Constraints

- The `index` ceiling (760,000 bytes) is NOT raised — `bundle-budget.mjs` forbids raising a budget to fit a change.
- No new dependency. No behaviour change: every panel opens, closes and reads the same store state as before.
- The capture oracle stays byte-identical for every frame that shows a panel (`inventory-open` is one).
- Zero emoji in `src/`; AST-safe edits; commit with call-site counts.

## Review Focus

1. A panel opened in the first second, before the prefetch finished: it must open (Suspense), not throw.
2. The capture hook opening a panel: the frame must show the panel, not an empty Suspense fallback.
3. A panel that imports something the boot bundle ALSO needs (itemUi, gameIcons): it must stay shared, not be
   duplicated into both chunks.
4. The prefetch failing (offline, a CDN hiccup): the next open retries the import rather than caching the failure.
5. E2E specs that open panels (`equip-roundtrip`, `panel-overflow`, `hud-layout`): they must not race the load.

---

### Task 1: measure, then split

**Files:** Create `frontend/src/ui/panels/panelBundle.js`, `frontend/src/ui/panels/lazyPanels.js`; modify
`frontend/src/MenuSystem.jsx`; gate `frontend/tests/gates/lazy-panels-gates.test.js`.

- [ ] Step 1: `npm run build` and record the `index` size (the BEFORE number) from `bundle-budget.mjs`.
- [ ] Step 2: failing gate — the built `index` chunk contains none of the panel modules' marker strings (a string
  unique to each panel's source, e.g. its i18n key or a unique class name), and a separate chunk does (presence
  control: the split happened, not a deletion).
- [ ] Step 3: `panelBundle.js` re-exports the panels; `lazyPanels.js` exports `loadPanels()` (memoised promise that
  resets on rejection), `prefetchPanels()`, and one `lazy()` per panel reading `loadPanels()`.
- [ ] Step 4: `MenuSystem` renders the lazy panels in one `<Suspense fallback={null}>`.
- [ ] Step 5: build; the gate passes; record the AFTER number in the commit.

### Task 2: prefetch and the capture hook

**Files:** `frontend/src/App.jsx` (prefetch after `isSpawnChunkLoaded`; `openModal` awaits `loadPanels()`).

- [ ] Step 1: failing unit test — `loadPanels()` called twice returns one promise; a rejected import is retried on
  the next call (Review Focus 4).
- [ ] Step 2: implement; run the capture for `inventory-open` and compare against the baseline (0 changed pixels).

### Task 3: e2e and review

- [ ] Run the panel specs (`equip-roundtrip`, `panel-overflow`, `hud-layout`) locally; a new e2e case opens the
  inventory in the first frames after start (Review Focus 1).
- [ ] Mutation: the prefetch removed -> the first-open case still passes (Suspense) but the timing case shows a
  fallback frame; the barrel split into two imports -> the gate's one-chunk assertion reds.
- [ ] `/code-review high` over the range.
