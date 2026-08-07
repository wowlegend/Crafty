---
paths:
  - "frontend/tests/**"
  - "frontend/scripts/**"
  - "frontend/src/**/*.test.js"
  - "frontend/src/**/*.test.jsx"
---
# Writing a gate, test, or probe in Crafty

This fires because you are editing a thing whose whole job is to GO RED. It exists because the rule it
carries was already written in `.agent/AGENTS.md` (the DENOMINATOR paragraph, with three worked examples)
and was violated twice more on 2026-08-05 anyway. The problem was never that the rule was unknown — it is
read at orientation, and the mistake happens here, forty tool calls later. So it lives here now, where it
fires at the moment you can act on it.

## The one defect this project keeps shipping

**A thing that reports PASS/DONE over input it never examined.** Every instance:

| what reported success | what it never examined |
|---|---|
| `gate-shape` — 97 assertions | 42% of the gate corpus, skipped |
| `doc-currency` — "✓ PASSED" | every bare, non-backticked path |
| a test placed in `tests/visual/` | itself — vitest EXCLUDES that dir, so it never ran |
| `quest-rewards-gates` | the save-corrupting bug it stayed green through |
| `esc-pause-probe` | the second ESC press, where the bug lived |
| `tapTestId` | whether the tap landed on the element it named |
| the `setActive` structural gate | satisfiable by the COMMENT explaining the import |

Read the count, never the tick.

## The second defect: shipped, compiling, gated green, and never RUNNING

Distinct from the one above — there the instrument was blind; here the instrument was fine and the FEATURE
was never reached. Four in a single day (2026-08-05), caught by nothing:

| commit | what shipped green | what was actually true |
|---|---|---|
| `fddf7d4` | two achievements | nothing ever called `updateLevel` — dead on arrival |
| `34f11b0` | mob grass-bending | never worked; 81 chunks were driving it |
| `869f71e` | the grass mote layer | rendered at the world ORIGIN, not with its chunk |
| `8a5e008` | quest-log + claim keybinds | live, and advertised NOWHERE in the UI |

`knip` sees the export used. A source-grep gate sees the line exist. `npm run build` sees it compile. None of
them sees whether the thing RUNS in the game.

**So: prove the entry point is REACHED in the running app — a real-input E2E, a live probe, or a log line you
watched fire — not that the call site compiles.** If you cannot reach it, that IS the finding. Ask what would
still pass if the feature were simply deleted; if the answer is "everything", you have not tested the feature.

## Before you commit a gate or probe

1. **State the denominator, and assert it.** Print `N things checked` and fail when `N` is 0 or below the
   ratchet. A loop that silently enumerated nothing reports a clean pass. `expect(checked).toBe(<expected>)`
   is one line and it is the difference between a measurement and a decoration.

2. **Assert a PRESENCE before you assert an ABSENCE.** "The player did not move", "0 elements matched",
   "no error was thrown" mean nothing until the same instrument, in the same run, has shown it can see the
   positive case. Use `assertBaseline` from `scripts/visual/_probe.mjs`. A dead instrument and a real
   absence produce identical readings.

3. **MUTATION-PROVE IT.** Break the behaviour the gate guards; it must go RED. Restore from a `cp` backup —
   **never `git checkout <file>`**, which nukes untracked work and reverts tracked. A gate green on day one
   against unfixed code is a rubber stamp and the slice is void.

4. **Do not assert on a proxy.** Source text is not behaviour; an element existing is not an element being
   reachable; a dispatched event is not a received one. If the assertion can be satisfied by a comment, it
   is satisfied by a comment — anchor structural gates to the syntactic form, not a bare token.

5. **When a probe substitutes an API for a real gesture, say what that changes.** `esc-pause-probe` used
   `document.exitPointerLock()` in place of the native ESC. Per MDN those two paths differ in exactly the
   respect the bug depended on, so the probe was structurally incapable of seeing it — while reporting PASS.

6. **Open the image.** A green jsdom suite passed a PAUSED overlay rendering dark-brown-on-black. Rendered
   output is judged by looking at it.

## Where things go

- `tests/gates/**` and `scripts/ci/*.mjs` are GATES: adding one requires a `Mutation-Proof:` trailer
  (`scripts/ci/mutation-proof-trailer.mjs`). Do not site a gate outside those paths to dodge that.
- A new source-grep gate raises the `gate-shape` ratchet and reds the push. Write behavioural gates.
- Probes go in `scripts/visual/`, use `_serve.mjs` for the vite+browser lifecycle and `_probe.mjs` for
  honest taps and baselines. **Anything you launch, you kill** — close the browser in a `finally`, kill the
  vite process GROUP, then sweep `scripts/dev/kill-test-procs.sh`.
- One managed port per harness (capture 4178, e2e 4179). Never hand-start vite on an ad-hoc port.

## The meta-rule

When an error class recurs *despite being documented*, the next fix does not belong in a document. Put it in
the shared instrument, where it cannot be forgotten: `_serve.mjs` ended the process-leak class; `_probe.mjs`
ends the dishonest-tap class. A helper is used at the moment of the mistake. A paragraph is read before it.
