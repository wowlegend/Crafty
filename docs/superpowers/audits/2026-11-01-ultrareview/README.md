# Ultrareview chunks 4-6, 2026-11-01: the delivered findings and the review tabs' re-checks

The three cloud reviews of the parts of the game no whole-game review had read (the ui, render and audio-and-scene
areas), kept here because the scratch copies they were read from get reaped. The decision record is
`docs/superpowers/DECISIONS.md`, 2026-11-01 (ultrareview chunks 4-6) items 460 to 468 for the runs and the rows filed,
and 2026-11-01 (ultrareview tab re-checks) item 469 for what the tabs added afterwards. The rows are
`AUDIT:ultra-1101:*` in `memory/registry.jsonl`.

## The files

| file | what it is |
|---|---|
| `<chunk>.findings.json` | The 10 findings the cloud delivered for the chunk, byte for byte as the run printed them: a JSON list of `{file_path, severity, pr_comment, reasoning, start_line, end_line}`. The list order is the cloud's, and a finding's 1-based place in it is the `<n>` of its row `AUDIT:ultra-1101:<chunk>-<n>` (so `6-audio-scene-rest-6`, index 5, is the place-sound occlusion finding). `severity` is the cloud's own field (`normal` or `nit`). |
| `<chunk>.tab-recheck.md` | The interactive review tab's own re-check of those 10 findings after delivery, written by that tab's Opus at xhigh against the code at `dae1afb4`: each finding re-derived, with what it measured and what it only read. Its tables number the findings in the tab's own order, which is not the cloud's for 5-render (the tab's 3, 4 and 5 are the cloud's 5, 3 and 4) and 6-audio-scene-rest (re-ranked by the tab); match by file and line, not by number. |

`<chunk>` is `4-ui`, `5-render` and `6-audio-scene-rest`. The findings files are unedited. The re-checks are the tabs'
text except two machine paths, one in `5-render.tab-recheck.md` (the tab's saved raw output) and one in
`6-audio-scene-rest.tab-recheck.md` (the cloud output file), which are rewritten to `<crafty-root>` and `<tmp>/<review-repo>`
so the public repo carries no home path.

## The cloud sessions

| chunk | cloud session | found / verified / refuted at the last progress line |
|---|---|---|
| 4-ui | `session_01PyjBK9f7PTDauQgdTpaFc3` | 36 / 28 / 25 |
| 5-render | `session_01PyjBK9NcSj1Nf3w8t5mNDq` | 30 / 25 / 19 |
| 6-audio-scene-rest | `session_01PyjBK9n5bKqvTbjkWkGuFY` | 29 / 30 / 13 |

The session page does not open a review session (DECISIONS 2026-11-01 item 465), so the ids are a record, not links.

## What is not here

The scratch originals (the runs' raw output files and the review repositories under `.claude/worktrees/ur3-<chunk>`)
are outside the tracked tree and get reaped; the findings and the re-checks above are the record. The verifiers'
throwaway copies and probes, and the local replica's votes on chunk 4-ui, are summarised in DECISIONS items 462 to 464,
not stored.
