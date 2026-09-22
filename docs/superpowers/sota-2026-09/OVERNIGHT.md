# Overnight — 2026-09-22 → 23

The first thing to read in the morning. Newest at the top of each section. Every "shipped" row names its
commit and the CI conclusion observed for it (`in_progress` / `cancelled` = no signal yet, not a pass).

## Shipped

| Commit | What | CI |
|---|---|---|
| `f4515dd9` | **R1.5 + R1.6** — the biome tint stops colouring stone, wood and ores (a green cast on every plaza and cliff in forest/jungle columns); the shader's tint array is sized from the biome table. Same-renderer A/B: stone and trunks moved, grass/leaves untouched, UI 0.00%. **See `evidence/tint-mask-ab-hearth.png`** (left old, right new) and `tint-mask-heat-hearth.png` (where it changed) | local green; not pushed yet |
| `1be94a5c` | **R1.1 + EXTERNAL-BASELINE #1** — voxel AO no longer smears across merged faces; biome tint no longer read outside the quad. Same-renderer A/B: UI frames 0.000% (noise floor zero), terrain frames changed exactly where the smears were. **See `evidence/mesher-ao-ab-biome-snow.png` and `-hearth.png`** (left old, right new) | local green; not pushed yet |
| `fa368b3c` | **R1.10** — ground and grass read one biome tint table | local green; not pushed yet |
| `09f38107` | **R1.7 + R1.9** — gate-census resolves imports instead of text-matching them | local green; not pushed yet |
| `ae96ff92` | **R1.4 + R1.8** — respec now ENDS what refunded talents granted (beast form, held grab, armed imbue; the squad cap is an every-tick invariant, so a Pack-Bond third ally departs); respec takes two presses | local green; not pushed yet |
| `7bbe737e` | **pre-push hole** — a receipt-matched push skipped queue-ledger / artifact-currency / e2e-freshness entirely while the hook's comment said they ran. Now `pipeline.sh --tier=push --range-only` | local green; not pushed yet |
| `57c4cd93` | **R1.2** — the brute's shoulder charge is a latched state machine (brace → charge → winded recovery = the punish window). One round-trip list for worker state, which also closed a dropped `wanderRoll`. Gate drives the REAL worker across ticks | local green; not pushed yet |
| `94c63b8c` | **G1** — gate-shape now reads all four assertion forms and a path shape it used to skip silently: 387 → 547 assertions checked, 0 comment-satisfied | local green; not pushed yet |
| `dbec53d7` | **R1.3** — the green-tree receipt is refused unless the tested working tree IS the index | local green; not pushed yet |
| `27d42f95` | External SOTA baseline — `EXTERNAL-BASELINE.md`; four in-tree claims re-verified | local green; not pushed yet |

**Why nothing was pushed earlier:** the first push attempt was refused by `artifact-currency` — the three
operator pages (era-review, sota-audit, LOOP-PROGRESS) were 74 commits stale, unnoticed because of the
pre-push hole above. All three are refreshed (every new claim adversarially verified) and the two published
ones republished to their same URLs: sota-audit v11, era-review v21.

## In flight

- **Baseline tranche** (plan: `docs/superpowers/plans/2026-09-22-crafty-sota-baseline-tranche.md`) —
  mipmaps, world hitstop (capped), clouds + cloud shadows. Pure modules + red-first gates written.

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

## Next, in order

1. Push (R1 is complete: all ten fixed) once the page commit lands; read CI's conclusion.
2. EXTERNAL-BASELINE #2 (mipmaps), #3 (world hitstop, capped), #5 (clouds + cloud shadows) — the plan's four tasks.
3. `/code-review high` over the whole overnight range.
4. C3 (boss tier) with its own plan doc, then OPEN-ITEMS and I1.
