## CURSOR — 2026-10-28 (command session c54fc9b6)

The cursor only: the command session's live task table and the next step. Open work lives in `memory/registry.jsonl`;
live state (CI on main and HEAD, open PRs, unmerged worktrees, the deployed sha) is `cd frontend && npm run orient`.
This file's history is in git: `git log -p -- memory/ACTIVE_PLAN.md`; the last full version before the cut to a
cursor is `git show 2fef2f32:memory/ACTIVE_PLAN.md`. Every open item the harvest rules extract from it has a registry
row; a keyword read of the older cursors found two more, now rows too. A full read of that history was not done.

**Governing:** Kevin's standing principle (DECISIONS 2026-10-28 item 14; `CLAUDE.md`): nothing is locked, full
autonomy, Kevin reviews one page, the Command Record (`docs/superpowers/command-record.html`, published at
https://claude.ai/artifact/AdWhiwq9utxaUdUQBEcfCA).

**Programme:** `docs/superpowers/plans/2026-10-28-crafty-sota-reset.md` ("The First Night"): Wave 1 has landed;
Wave 2 lanes run as PRs (section 3 of the plan names each lane and its acceptance); Wave 3 follows.

**Landing:** every lane is a PR, merged as `CLAUDE.md` "Landing" states (main merged in, CI once on the exact sha,
`ci ok` green, then a fast-forward of main). Lanes land in readiness order (DECISIONS 2026-10-28 landing item 10).

### COMMAND SESSION c54fc9b6 — LIVE TASK LIST. The Verify Gate reads THIS list.

Lane task tables live in their PRs and plans. Done and closed rows left this table with the cut; their registry rows
carry `closedBy`.

| # | Task | State |
|---|---|---|
| T6 | CI-gates handoff §3 (Crafty's share), then rm the handoff file + MEMORY line if last owner | PARTIAL: pin and v7 actions `5177c203`; Vercel Deployment Checks overtaken by the required `ci ok` check (W1-A); pre-commit speed done by B7 `a56f6d50`; onFailure open (registry `ACTIVE_PLAN:T6`) |
| T7 | iPad: WebKit probe of the PROD build, frames opened | lookbook iPad frames DONE (`docs/superpowers/masterpiece-2026-10/evidence`); `ipad-probe.mjs` itself still unrun |
| T11 | The FPV glove value (the command session's call) | open; the dprCap half is overtaken by the per-tier pixel budget `309dad4f` (registry `ACTIVE_PLAN:T11`) |
| T14 | Per change range: fresh headless `/code-review xhigh` + one adversarial-reviewer-kz xhigh on runtime seams | open: every game-code PR range gets `/code-review xhigh` as its second look |
| T15 | OVERNIGHT.md, STATUS, CHANGELOG, DECISIONS current | In review, W2-J phase 3 (`chore/w2j-records`): OVERNIGHT.md left HEAD with the closed records, kept by the tag `records/2026-10-29`; the generated CHANGELOG is the same lane's next step (registry `ACTIVE_PLAN:T15`) |

**Next:** land the open Wave 2 PRs in readiness order (`npm run orient` lists them with their `ci ok`), then the
remaining Wave 2 lanes of the reset plan. W2-J phase 1 (this cut, the CLAUDE.md rewrite, `npm run orient`, the
cold-takeover eval): `docs/superpowers/plans/2026-10-28-crafty-w2j-phase1.md`.
