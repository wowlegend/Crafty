# Overnight — 2026-09-22 → 23

The first thing to read in the morning. Newest at the top of each section. Every "shipped" row names its
commit and the CI conclusion observed for it (`in_progress` / `cancelled` = no signal yet, not a pass).

## Shipped

| Commit | What | CI |
|---|---|---|
| `1eba517f` + `6e7591cb` | **C3 — the Shadow Dragon returns.** After the first kill (still THE win), it wakes again at the lair once you have survived 3 more nights AND gained 4 more levels — announced once, a tier stronger (health ×1.5, damage ×1.2, capped speed, double XP, more scales; the crown only the first time). Survives save/load; old won saves become "one kill, return in 3 nights". Driven through the real hook | committed, pushing next |
| `ba8c3ebf` | **The far horizon.** Land and sea now continue past the loaded chunks to 420 m, from the same surface formula, coloured like the near terrain and hazed by the same lines — distant ridgelines and headlands instead of fog over sky. Sunk under real terrain wherever a chunk can be, so it never pokes through (proven over every player position). Side-effect measured, not hidden: on med/high tiers the ground just under the horizon is up to ~8 levels darker because bright sky no longer blooms over it | CI running |
| `813428ac` + `0de44886` | **Clouds, and their shadows on the ground, from one field.** Bright by day, a dim shape at night, dark in the boss sky; shadows dim only the SUN's light (valleys stay readable), fade with a low sun, and vanish where the sky has no cloud | ✅ `927b2191`-era CI green up to `813428ac`'s predecessor; rest in `ba8c3ebf`'s run |
| `91dcabc6` `7482cfdc` `3ef77fa5` | Review fixes: brute's charge dropped on cover-seek; e2e-freshness treats a running base as unknown and a timeout as red; the sweep sees through `npm`/`sh -c` wrappers | CI running |
| `20d51bdd` | **The test-process sweep kills leaks, not live runs.** It decided "leaked" by AGE (>3 min) and killed one of my own captures 15 minutes in. Now it decides by OWNERSHIP (is the process tree still rooted in a live runner?) and names the runner it left alone. Chrome's crashpad handlers sit at PPID 1 while alive, which I found by reading a live capture's process table after the tests were green; they are held while any browser is owned | local green; not pushed yet |
| `6a33a101` | **Distant-terrain mipmaps, built and proven, NOT turned on** — see *Blocked on you*. What ships: the terrain sampler reads raw `vUv` (identical without mips, required with them) | local green; not pushed yet |
| `68900749` | **EXTERNAL-BASELINE #3 — hitstop holds the WORLD.** A heavy hit now freezes the mob you hit, the AI clock and the mob animation, not just you; a burst of hits is capped (180 ms) so it never reads as lag; the knockback shove waits for the freeze and lands after it. Proven in the running game by a new e2e (`tests/e2e/world-hitstop.spec.js`) | local green; not pushed yet |
| `c06b4ee1` | Docs: operator pages current (republished), R1 closed, this log, the baseline-tranche plan | ✅ CI success (run 35796538484) |
| `f4515dd9` | **R1.5 + R1.6** — the biome tint stops colouring stone, wood and ores (a green cast on every plaza and cliff in forest/jungle columns); the shader's tint array is sized from the biome table. Same-renderer A/B: stone and trunks moved, grass/leaves untouched, UI 0.00%. **See `evidence/tint-mask-ab-hearth.png`** (left old, right new) and `tint-mask-heat-hearth.png` (where it changed) | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `1be94a5c` | **R1.1 + EXTERNAL-BASELINE #1** — voxel AO no longer smears across merged faces; biome tint no longer read outside the quad. Same-renderer A/B: UI frames 0.000% (noise floor zero), terrain frames changed exactly where the smears were. **See `evidence/mesher-ao-ab-biome-snow.png` and `-hearth.png`** (left old, right new) | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `fa368b3c` | **R1.10** — ground and grass read one biome tint table | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `09f38107` | **R1.7 + R1.9** — gate-census resolves imports instead of text-matching them | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `ae96ff92` | **R1.4 + R1.8** — respec now ENDS what refunded talents granted (beast form, held grab, armed imbue; the squad cap is an every-tick invariant, so a Pack-Bond third ally departs); respec takes two presses | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `7bbe737e` | **pre-push hole** — a receipt-matched push skipped queue-ledger / artifact-currency / e2e-freshness entirely while the hook's comment said they ran. Now `pipeline.sh --tier=push --range-only` | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `57c4cd93` | **R1.2** — the brute's shoulder charge is a latched state machine (brace → charge → winded recovery = the punish window). One round-trip list for worker state, which also closed a dropped `wanderRoll`. Gate drives the REAL worker across ticks | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `94c63b8c` | **G1** — gate-shape now reads all four assertion forms and a path shape it used to skip silently: 387 → 547 assertions checked, 0 comment-satisfied | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `dbec53d7` | **R1.3** — the green-tree receipt is refused unless the tested working tree IS the index | ✅ CI success (run 35796538484, `c06b4ee1`) |
| `27d42f95` | External SOTA baseline — `EXTERNAL-BASELINE.md`; four in-tree claims re-verified | ✅ CI success (run 35796538484, `c06b4ee1`) |

**Why nothing was pushed earlier:** the first push attempt was refused by `artifact-currency` — the three
operator pages (era-review, sota-audit, LOOP-PROGRESS) were 74 commits stale, unnoticed because of the
pre-push hole above. All three are refreshed (every new claim adversarially verified) and the two published
ones republished to their same URLs: sota-audit v11, era-review v21.

## In flight

- Nothing uncommitted of note. C3 waits only on CI to push.

## Corrections to things I told you

- `EXTERNAL-BASELINE.md` said Crafty has "no dodge, parry or i-frames". **False** — a dodge with a 0.2 s
  i-frame window exists and gates damage. I had re-verified four of the report's claims and not that one;
  it would have sent me building a duplicate verb. Corrected in the doc; recommendation #3 narrowed to world
  hitstop.

## Visual changes waiting on YOUR re-baseline

The 31-image oracle is still the Chromium-147 set (re-baseline is yours). Every intended look change since
then will diff against it: the AO merge fix (shipped), the tint mask, mipmaps and clouds (in flight). Each
has its own same-renderer A/B so you can judge them one at a time.

## Blocked on you

| Item | Why it is yours |
|---|---|
| 147→151 visual re-baseline | rewrites the 31-image oracle |
| three 0.172 → 0.186 + `SunLight` CSM | dependency bump (EXTERNAL-BASELINE #4); will be prepared, not merged |
| dprCap 2 → 1.75 · FPV glove value | your standing calls |
| **Distant-terrain mipmaps (one constant)** | "no mipmaps" is part of the bold-flat LOCK, recorded as your taste call. Built and proven; flip `const TERRAIN_MIPMAPS = false` in `world/proceduralTextures.js` to `true` (and update the lock test). Same-renderer A/B is in KEVIN-REVIEW-BATCH (evidence `mipmaps-ab-*.png`): far faces go from crawling speckle to flat colour, crisp up close, no seams. My read: it looks MORE bold-flat, not less |

## Next, in order

1. Commit clouds after the capture; push onto a completed CI run.
2. `/code-review high` over the whole overnight range.
3. The baseline's runners-up, ranked: SMAA after tone-mapping (cheap), the far-horizon heightfield impostor
   (the highest LOOKS ceiling), Gerstner waves into the vertex shader (also removes a per-frame CPU loop).
4. C3 (the dragon returns, tiered) with its own spec + plan, then OPEN-ITEMS and I1.
