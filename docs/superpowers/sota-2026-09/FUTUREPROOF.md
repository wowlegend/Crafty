# Crafty — Future-Proofing & Dependency/Security Assessment

**Measured:** 2026-09-22 · **Root:** the repo root (`$REPO`) · **App:** `$REPO/frontend` — this doc deliberately names no absolute path; the repo is PUBLIC and `opsec-scan` blocks one at commit time.
**Drift window:** last maintenance 2026-08-13 → today = **40 days**.
**Mode:** measurement only. Nothing installed, upgraded or modified. Visual capture and Playwright e2e deliberately not run.

> **The headline is not a version number.** An open Dependabot PR (#18) is sitting green on every gate while
> bumping `postprocessing` to the one version this project has already measured as breaking the sun. Details in
> §7 R1. The dependency arithmetic below is real but secondary to that.

**Method and denominator.** 36 manifest entries — 16 `dependencies` + 20 `devDependencies` — each resolved three
ways: the declared range from `frontend/package.json`; the installed version read from
`node_modules/<pkg>/package.json` with `fs.readFileSync` (a bare `require` fails on `three`, which does not
export `./package.json`); and the latest published version from `npm view <pkg> version` against the live
registry. Peer constraints were read from the registry rather than from `node_modules`, so candidate versions are
covered too, not only installed ones. Advisories from `npm audit --json`. CI history, PR state and check rollups
from the GitHub API via `gh`. Node lifecycle dates from `nodejs.org/dist/index.json` and the nodejs/Release
schedule. Upstream issue state from the GitHub API. **Nothing in this report is from parametric memory.**

---

## 1. Dependency inventory

### 1.1 Runtime dependencies (16 of 16)

| Package                     | Range    | Installed | Latest  | Gap                 | 0.x minor crossed | Note                                                                              |
| --------------------------- | -------- | --------- | ------- | ------------------- | ----------------- | --------------------------------------------------------------------------------- |
| @react-three/drei           | ^10.7.8  | 10.7.8    | 10.7.8  | current             | —                 | peer three >=0.159                                                                |
| @react-three/fiber          | ^9.5.0   | 9.5.0     | 9.7.0   | 2 minor             | —                 | peer react >=19 <19.3 — this is what caps React                                   |
| @react-three/postprocessing | ^3.0.4   | 3.0.4     | 3.1.1   | 1 minor + 1 patch   | —                 | 3.0.5 imposes three >=0.182 FLOOR; 3.1.1 relaxes it but needs fiber >=9.7.0       |
| @react-three/rapier         | ^2.2.0   | 2.2.0     | 2.2.0   | current             | —                 | pins @dimforge/rapier3d-compat EXACTLY at 0.19.2                                  |
| class-variance-authority    | ^0.7.1   | 0.7.1     | 0.7.1   | current             | no                | 0.x, but at head                                                                  |
| clsx                        | ^2.1.1   | 2.1.1     | 2.1.1   | current             | —                 |                                                                                   |
| framer-motion               | ^12.43.0 | 12.43.0   | 13.4.0  | 1 MAJOR             | —                 | 12.43.0 pub 2026-07-28; 13.x peers react ^18 || ^19                               |
| lucide-react                | ^0.439.0 | 0.439.0   | 1.47.0  | 0.x->1.x + 47 minor | YES (many)        | 0.439.0 pub 2024-09-06 — 24 months stale; 1.0.0 landed 2026-03-23                 |
| miniplex                    | ^2.0.0   | 2.0.0     | 2.0.0   | current             | —                 |                                                                                   |
| postprocessing              | ^6.39.1  | 6.39.1    | 6.39.5  | 4 patch             | —                 | HELD BY THE LOCKFILE ONLY — the manifest range already ADMITS 6.39.5. See Risk 1. |
| react                       | ^19.2.8  | 19.2.8    | 19.3.0  | 1 minor             | —                 | BLOCKED: fiber 9.7.0 peers react <19.3. 19.3.0 pub 2026-09-09.                    |
| react-dom                   | ^19.2.8  | 19.2.8    | 19.3.0  | 1 minor             | —                 | same block                                                                        |
| simplex-noise               | ^4.0.3   | 4.0.3     | 4.0.3   | current             | —                 |                                                                                   |
| tailwind-merge              | ^3.6.0   | 3.6.0     | 3.7.0   | 1 minor             | —                 |                                                                                   |
| three                       | ^0.172.0 | 0.172.0   | 0.186.0 | 14 MINOR / 20 rel.  | YES (14x)         | 0.172.0 pub 2024-12-31 — 21 months old                                            |
| zustand                     | ^5.0.14  | 5.0.15    | 5.0.15  | current             | —                 | installed floats above the declared floor                                         |

### 1.2 Development dependencies (20 of 20)

| Package                   | Range   | Installed | Latest  | Gap     | 0.x minor crossed | Note                                                                               |
| ------------------------- | ------- | --------- | ------- | ------- | ----------------- | ---------------------------------------------------------------------------------- |
| @babel/parser             | ^7.29.8 | 7.29.8    | 7.29.9  | 1 patch | —                 |                                                                                    |
| @dimforge/rapier3d-compat | 0.19.2  | 0.19.2    | 0.20.0  | 1 MINOR | YES               | EXACT pin, deliberate: moves only with @react-three/rapier. 0.20.0 pub 2026-08-08. |
| @playwright/test          | ^1.62.1 | 1.62.1    | 1.63.0  | 1 minor | —                 | browser binaries drift with it                                                     |
| @testing-library/jest-dom | ^6.9.1  | 6.9.1     | 7.0.1   | 1 MAJOR | —                 |                                                                                    |
| @testing-library/react    | ^16.3.2 | 16.3.2    | 16.3.3  | 1 patch | —                 | sitting in open PR #17                                                             |
| @vitejs/plugin-react      | ^4.3.0  | 4.7.0     | 6.1.1   | 2 MAJOR | —                 | 6.1.1 peers vite ^8.0.0 — moves only with vite                                     |
| @vitest/coverage-v8       | ^3.2.7  | 3.2.7     | 5.0.1   | 2 MAJOR | —                 | lockstep with vitest                                                               |
| autoprefixer              | ^10.5.4 | 10.5.4    | 10.6.1  | 1 minor | —                 |                                                                                    |
| eslint                    | ^9.39.5 | 9.39.5    | 10.11.0 | 1 MAJOR | —                 | BLOCKED by eslint-plugin-react (peer ^9.7). PR #7 proved it: closed, unmergeable.  |
| eslint-plugin-react       | ^7.37.5 | 7.37.5    | 7.37.5  | current | —                 | LAST PUBLISH 2025-04-03 — 17.6 months. No eslint-10-capable release exists.        |
| globals                   | ^17.9.0 | 17.9.0    | 17.12.0 | 3 minor | —                 | sitting in open PR #17 (to 17.11.0)                                                |
| jsdom                     | ^29.1.1 | 29.1.1    | 30.1.1  | 1 MAJOR | —                 | test DOM; 29.1.1 pub 2026-04-30. PR #8 (to 30.0.1) was closed.                     |
| knip                      | ^6.32.1 | 6.32.1    | 6.37.0  | 5 minor | —                 | dead-code ratchet gates CI. In open PR #17 (to 6.33.0).                            |
| pixelmatch                | ^6.0.0  | 6.0.0     | 7.2.0   | 1 MAJOR | —                 | visual-diff core — a major here moves the gate instrument itself                   |
| pngjs                     | ^7.0.0  | 7.0.0     | 7.0.0   | current | —                 |                                                                                    |
| postcss                   | ^8.5.26 | 8.5.26    | 8.5.28  | 2 patch | —                 |                                                                                    |
| puppeteer                 | ^25.6.0 | 25.6.0    | 25.11.0 | 5 minor | —                 | drives the visual capture. In open PR #17 (to 25.9.0).                             |
| tailwindcss               | ^3.2.7  | 3.4.19    | 4.3.3   | 1 MAJOR | —                 | 3.4.19 carries the terminal `v3-lts` tag (pub 2025-12-10). 3.x is a dead branch.   |
| vite                      | ^6.0.0  | 6.4.3     | 8.3.0   | 2 MAJOR | —                 | v8 pub 2026-03-12; installed 6.4.3 pub 2026-06-01                                  |
| vitest                    | ^3.2.4  | 3.2.7     | 5.0.1   | 2 MAJOR | —                 | advisory fix needs >=4.1.11 (pub 2026-08-18) — already a major away                |

### 1.3 Worst rows, by distance

| # | Package              | Installed | Latest  | Distance                                           |
|--: | -------------------- | --------- | ------- | -------------------------------------------------- |
| 1 | three                | 0.172.0   | 0.186.0 | 14 breaking 0.x minors across 21 months            |
| 2 | lucide-react         | 0.439.0   | 1.47.0  | 0.x -> 1.x major + 47 minors, 24 months            |
| 3 | vite                 | 6.4.3     | 8.3.0   | 2 majors                                           |
| 4 | vitest / coverage-v8 | 3.2.7     | 5.0.1   | 2 majors — and the advisory fix sits above the gap |
| 5 | @vitejs/plugin-react | 4.7.0     | 6.1.1   | 2 majors, gated on vite 8                          |
| 6 | tailwindcss          | 3.4.19    | 4.3.3   | 1 major, and 3.x is terminal                       |
| 7 | eslint               | 9.39.5    | 10.11.0 | 1 major, hard-blocked by an unmaintained plugin    |

Two rows where installed ≠ what the range implies, worth noting because they are silent: `zustand` is installed at
5.0.15 above a `^5.0.14` floor, `@vitejs/plugin-react` at 4.7.0 above `^4.3.0`, and `tailwindcss` at 3.4.19 above
`^3.2.7`. None is a problem; all three mean the manifest understates what is actually running.

---

## 2. Security audit

`cd $REPO/frontend && npm audit` → **6 vulnerabilities: 1 high, 4 moderate, 1 low, 0 critical.**
Tree: 681 dependencies (81 prod / 594 dev / 102 optional / 22 peer).

| Package                 | Severity | Installed      | Advisory            | CVSS | Title                                                        | Non-breaking fix?             | Reached via                                      |
| ----------------------- | -------- | -------------- | ------------------- | ---- | ------------------------------------------------------------ | ----------------------------- | ------------------------------------------------ |
| js-yaml                 | HIGH     | 4.3.1          | GHSA-2883-xcg3-v3hh | 7.5  | maxTotalMergeKeys does not limit CPU for empty merge sources | YES — 4.3.2, plain patch      | eslint > @eslint/eslintrc                        |
| vitest                  | moderate | 3.2.7          | GHSA-82fw-gwwq-j7x9 | 5.9  | Path traversal / arbitrary file read via Redirect Mock       | NO — needs >=4.1.11 (MAJOR)   | direct devDep                                    |
| @vitest/mocker          | moderate | 3.2.7          | GHSA-82fw-gwwq-j7x9 | 5.9  | same advisory, the actual carrier                            | NO — via vitest MAJOR         | vitest                                           |
| @vitest/coverage-v8     | moderate | 3.2.7          | (via vitest)        | —    | inherits the vitest advisory                                 | NO — npm offers 5.0.1 (MAJOR) | direct devDep                                    |
| fflate                  | moderate | 0.8.2 / 0.6.10 | GHSA-px8p-9vwx-vf98 | 7.5  | unzipSync infinite loop on malformed ZIP64 archives          | YES — npm audit fix           | drei > maath > @types/three; drei > three-stdlib |
| postcss-selector-parser | low      | 6.1.2          | GHSA-w9m9-85wc-3x92 | 4.3  | DoS via uncontrolled AST recursion                           | YES — npm audit fix           | tailwindcss 3.4.19                               |

**Three of the six close with one command.** `npm audit fix` resolves js-yaml (4.3.1 → 4.3.2), fflate and
postcss-selector-parser without touching a major. The remaining three are one advisory wearing three names — the
vitest cluster — and it cannot be closed below a major (Risk 9).

**Every one of the six is dev-only or build-time.** None ships in the browser bundle: js-yaml comes through
eslint, postcss-selector-parser through tailwind's PostCSS pass, and the vitest trio is the test runner. `fflate`
arrives via drei's dependency graph but through `@types/three` and `three-stdlib` loaders, not the game's runtime
path. That lowers the exploitability, not the CI consequence.

**CI consequence.** `ci.yml` runs `npm audit --audit-level=high` as a *blocking* step. Reproduced today it
**exits 1** on js-yaml alone. The workflow's inline comment records "MEASURED 2026-08-12 before arming this:
0 vulnerabilities at every severity" — true then, 40 days stale now. See Risk 3 for why nothing has gone red yet.

---

## 3. Engine stack — the joint `three` ceiling

### 3.1 Every peer constraint on `three`

| Package                     | Installed | peer three           | Upper bound | Floor | Binding?                                                                 |
| --------------------------- | --------- | -------------------- | ----------- | ----- | ------------------------------------------------------------------------ |
| three                       | 0.172.0   | (the subject)        | —           | —     | —                                                                        |
| @react-three/fiber          | 9.5.0     | >=0.156              | none        | 0.156 | no                                                                       |
| @react-three/drei           | 10.7.8    | >=0.159              | none        | 0.159 | no                                                                       |
| @react-three/rapier         | 2.2.0     | >=0.159.0            | none        | 0.159 | no                                                                       |
| @react-three/postprocessing | 3.0.4     | >= 0.156.0           | none        | 0.156 | no  (3.0.5 would raise the FLOOR to 0.182; 3.1.1 drops it back to 0.156) |
| postprocessing              | 6.39.1    | >= 0.168.0 < 0.185.0 | 0.184.0     | 0.168 | **YES — the only upper bound anywhere in the stack**                     |
| @dimforge/rapier3d-compat   | 0.19.2    | (no three peer)      | none        | —     | no                                                                       |

### 3.2 The computed ceiling

| Scenario                          | Binding constraint                      | Largest three | Note                                                |
| --------------------------------- | --------------------------------------- | ------------- | --------------------------------------------------- |
| As installed today                | postprocessing 6.39.1 → three < 0.185.0 | **0.184.0**   | pub 2026-04-16 · 12 minors above the pinned 0.172.0 |
| If postprocessing moves to 6.39.5 | peer widens to three < 0.187.0          | **0.186.0**   | pub 2026-09-08 · the current head of three          |
| If postprocessing were removed    | no upper bound remains in the stack     | unbounded     | every other peer is a floor, not a ceiling          |

**`postprocessing` is the entire ceiling.** Every other package in the stack declares a floor (`>=0.156`,
`>=0.159`) and no roof. Remove or bump that one package and the constraint disappears.

**So the r174 upgrade is feasible on peer grounds, and always was.** three 0.174.0 sits *ten minors below* even
today's 0.184.0 ceiling. The blocker recorded in `docs/superpowers/DECISIONS.md` (2026-08-13) was never a
resolution problem — it is that r174 moved 19 of 31 visual baselines over gate, which is a judgement about how the
game should look, not a correctness fix. That decision is still open and still Kevin's.

**And the upstream half has changed since, unnoticed.** `pmndrs/postprocessing#750` — the issue this project
filed — was **CLOSED 2026-09-09**, with the maintainer stating *"Should be fixed in v6.39.5"*; 6.39.5 shipped the
same day. `memory/ACTIVE_PLAN.md:317` still reads "postprocessing is PINNED at 6.39.1 and cannot move."

---

## 4. Node

| Subject                | Value                   | LTS since      | EOL        | Note                                                          |
| ---------------------- | ----------------------- | -------------- | ---------- | ------------------------------------------------------------- |
| `package.json` engines | `>=24.0.0 <25`          | —              | —          | excludes Node 25 (correct) and Node 26 (soon wrong)           |
| Installed locally      | v24.13.0                | —              | —          | 8 patch lines behind v24.21.0 (2026-09-07)                    |
| CI `setup-node`        | `node-version: 24`      | —              | —          | floats to v24.21.0 — local and CI are NOT on the same runtime |
| Node 24 "Krypton"      | active LTS              | LTS 2025-10-28 | 2028-04-30 | **enters MAINTENANCE 2026-10-20 — 28 days away**              |
| Node 26                | Current → next LTS      | LTS 2026-10-28 | 2029-04-30 | v26.10.0 shipped 2026-09-21; becomes active LTS in 36 days    |
| Node 25                | EOL                     | —              | 2026-06-01 | already dead — engines correctly excludes it                  |
| vitest 5 engines       | `^22.12 || ^24 || >=26` | —              | —          | Node 24 fine, and a later Node 26 move is covered             |
| knip engines           | `^20.19 || >=22.12`     | —              | —          | no constraint pressure                                        |

**Verdict: `>=24.0.0 <25` is still correct today, and stops being the right range in about a month.** Node 24 is
the active LTS and is supported to 2028-04-30, so nothing breaks. But it drops to maintenance on **2026-10-20
(28 days)** and Node 26 becomes the active LTS on **2026-10-28 (36 days)**. From late October, a range excluding
everything above 24 pins this project to a maintenance-only runtime while `node:lts` images move to 26.

Secondary: local `v24.13.0` vs CI's floating `24` (→ v24.21.0) means **local and CI are not running the same
Node**, so "green locally" and "green in CI" are statements about different runtimes.

---

## 5. CI and Dependabot

### 5.1 What `ROOT/.github/workflows/ci.yml` gates

Three jobs — `gates`, `e2e` (3 shards), `docs` — with `permissions: contents: read`, concurrency
cancel-in-progress, and `working-directory: frontend` everywhere except `docs`.

| Job    | Step                                                | Enforcement                            |
| ------ | --------------------------------------------------- | -------------------------------------- |
| gates  | ESLint (crash-class: no-undef / react/jsx-no-undef) | blocking                               |
| gates  | Gate shape (no assertion satisfied by a comment)    | blocking                               |
| gates  | Unit + static gates (vitest)                        | blocking                               |
| gates  | Dead-code ratchet (knip)                            | blocking                               |
| gates  | `npm audit --audit-level=high`                      | blocking — **will go RED on next run** |
| gates  | Build                                               | blocking                               |
| gates  | Bundle byte budget (asserts on built BYTES)         | blocking                               |
| gates  | Production bundle smoke                             | blocking                               |
| e2e    | Playwright, 3 shards, `--grep-invert @local-only`   | blocking                               |
| e2e    | Flaky-spec report                                   | report-only (exit 0)                   |
| e2e    | Runtime reachability report                         | report-only (exit 0)                   |
| e2e    | upload-artifact `test-results/` on failure          | diagnostic                             |
| docs   | `doc-currency.mjs`                                  | blocking                               |
| CodeQL | default setup — NO FILE in .github/workflows        | reports NEUTRAL on PRs                 |
| —      | 24-state VISUAL gate (31 frames)                    | **NOT IN CI** — local pre-merge only   |
| —      | perf probes                                         | **NOT IN CI** — machine-dependent      |

**A fourth workflow exists that reading the repo cannot find.** `gh workflow list` shows **CodeQL** active
(id 260087341) with no file in `.github/workflows/` — it is configured through GitHub's default setup. It runs
weekly on a schedule and reports **NEUTRAL** on PRs, so it is not a merge gate. Anyone auditing CI from the
filesystem alone would miss it, in both directions: they would not know it exists, and would not know it is not
blocking.

### 5.2 Action versions

| Job   | Action                  | Pinned | Latest              | Behind   |
| ----- | ----------------------- | ------ | ------------------- | -------- |
| gates | actions/checkout        | v4     | v7.0.1 (2026-07-20) | 3 majors |
| gates | actions/setup-node      | v4     | v7.0.0 (2026-07-14) | 3 majors |
| e2e   | actions/checkout        | v4     | v7.0.1              | 3 majors |
| e2e   | actions/setup-node      | v4     | v7.0.0              | 3 majors |
| e2e   | actions/upload-artifact | v4     | v7.0.1 (2026-04-10) | 3 majors |
| docs  | actions/checkout        | v4     | v7.0.1              | 3 majors |

All six references are `@v4`; every current line is `v7`. The Node 20 deprecation warnings in the logs are the
runtime notice for exactly these.

### 5.3 What `ROOT/.github/dependabot.yml` does

| Ecosystem          | Schedule         | Ignored                                               | Note                                         |
| ------------------ | ---------------- | ----------------------------------------------------- | -------------------------------------------- |
| npm (/frontend)    | monthly, limit 5 | ALL majors (`*`)                                      | grouped: dev minor/patch + prod minor/patch  |
| npm (/frontend)    |                  | three — minor                                         | 0.x minor is the breaking position           |
| npm (/frontend)    |                  | @react-three/* — minor                                | the render trio moves together or not at all |
| npm (/frontend)    |                  | @dimforge/rapier3d-compat — minor AND patch           | exact-pinned by @react-three/rapier          |
| npm (/frontend)    |                  | postprocessing — **minor ONLY**                       | **patch is NOT ignored** — this is Risk 1    |
| npm (/frontend)    |                  | @react-three/postprocessing — patch (+ minor by glob) | a patch of it demanded three >=0.182         |
| npm (/frontend)    |                  | lucide-react — minor                                  |                                              |
| github-actions (/) | monthly, limit 3 | ALL majors (`*`)                                      | so the v4 actions can never auto-bump        |

The file is unusually well-reasoned: the 0.x-minor rule, the exact-pin logic for rapier, and the
`@react-three/postprocessing` patch block are each backed by a measured incident recorded inline, including one
correction made an hour after the file first landed. **Two gaps remain, and both are the exact class the file
already knows about** — a version position that escapes an ignore rule written for its neighbour:

| Gap                         | Why it escapes                                              | Consequence                                      |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| `postprocessing` PATCH      | ignore covers `semver-minor` only; 6.39.1→6.39.4 is a patch | **PR #18, open and green right now** — Risk 1    |
| `react` / `react-dom` MINOR | not in the ignore list at all; 19.2.8→19.3.0 is a minor     | the 2026-10-01 grouped PR will ERESOLVE — Risk 4 |

### 5.4 Open Dependabot PRs and recent CI history

| PR  | State  | Opened     | What                                                                     | Checks                     | Assessment                                        |
| --- | ------ | ---------- | ------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------- |
| #18 | OPEN   | 2026-09-01 | bump **postprocessing 6.39.1 → 6.39.4** (production-minor-patch group)   | 8/8 green (CodeQL neutral) | **Ships the GodRays regression. See Risk 1.**     |
| #17 | OPEN   | 2026-09-01 | dev-dependencies group: @testing-library/react, globals, knip, puppeteer | 8/8 green (CodeQL neutral) | Benign. Green ticks predate the js-yaml advisory. |
| #16 | MERGED | 2026-08-13 | knip 6.32.0 → 6.32.1                                                     | —                          |                                                   |
| #15 | MERGED | 2026-08-13 | production-minor-patch group, 6 updates                                  | —                          | the split PR referenced in CHANGELOG              |
| #14 | CLOSED | —          | production-minor-patch group, 7 updates                                  | —                          |                                                   |
| #13 | MERGED | 2026-08-13 | dev-dependencies group, 10 updates                                       | —                          |                                                   |
| #9  | CLOSED | —          | lucide-react 0.439.0 → 1.31.0                                            | —                          | pre-dates the majors-ignore rule                  |
| #8  | CLOSED | —          | jsdom 29.1.1 → 30.0.1                                                    | —                          | pre-dates the majors-ignore rule                  |
| #7  | CLOSED | —          | eslint 9.39.4 → 10.8.1                                                   | —                          | was never mergeable — plugin peer caps at ^9.7    |

| Date       | Workflow           | Result  | Trigger      | Subject                                  |
| ---------- | ------------------ | ------- | ------------ | ---------------------------------------- |
| 2026-09-20 | CodeQL             | success | schedule     | 46a36015 (the 2026-08-13 head)           |
| 2026-09-13 | CodeQL             | success | schedule     | 46a36015                                 |
| 2026-09-06 | CodeQL             | success | schedule     | 46a36015                                 |
| 2026-09-01 | **CI**             | success | pull_request | PR #18 — postprocessing 6.39.4           |
| 2026-09-01 | **CI**             | success | pull_request | PR #17 — dev-dependencies group          |
| 2026-09-01 | Dependabot Updates | success | schedule     | npm + github_actions scans               |
| 2026-08-13 | **CI**             | success | push         | last push-triggered CI run — 40 days ago |

**The CI workflow has not run since 2026-09-01, and has not run on a push since 2026-08-13.** The three September
CodeQL runs are scheduled and all sit on `46a36015` — the 2026-08-13 head — which independently confirms nothing
newer has been pushed.

---

## 6. Git state since 2026-08-13

| Metric                                    | Value                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| Commits in `git log --since=2026-08-13`   | 27                                                                                     |
| Of those, actually dated after 2026-08-13 | 2  — f5df6ccc, ceef70a4 (2026-09-19 / 2026-09-20)                                      |
| HEAD                                      | ceef70a4 · 2026-09-20 03:05 -0700 · branch `main`                                      |
| origin/main                               | 46a36015 · 2026-08-13                                                                  |
| **Unpushed**                              | **2 commits** — CI has never seen them                                                 |
| Commits touching `frontend/src/`          | 2  — 36566f1d and baa0d61d, both `src/render/Sun.jsx`                                  |
| Net change to `frontend/src/`             | **ZERO** — baa0d61d explicitly reverts 36566f1d ("the sun-depth hypothesis was WRONG") |
| Commits touching `frontend/package.json`  | 4  — 4a6bcdc2, 36566f1d, baa0d61d, 70117975, all 2026-08-13                            |
| What the 2 recent commits touch           | `.claude/workflows/crafty-s0-reality-audit*` only — tooling, not the game              |
| Working tree                              | DIRTY — 5 modified, 1 deleted, 7 untracked                                             |

**The game source has not changed in 40 days.** The only two `frontend/src/` commits in the window are a
hypothesis and its own revert, netting zero. Meanwhile the dependency tree moved underneath it: three shipped
0.185.0, 0.185.1 and 0.186.0; postprocessing shipped 6.39.5 with the fix for this project's own upstream bug;
react shipped 19.3.0; and a HIGH advisory landed in eslint's tree. **All of the drift in this report is external.**
That is the argument for treating this lane as maintenance rather than development.

---

## 7. Future-proofing risks, in priority order

| #   | Risk                                                                                      | Evidence                                                                                                                                                                                                                                                                                                                                        | What breaks                                                                                                                                                                                                                                                                        | Horizon         | Cheapest close                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **An open, fully-green PR ships a known rendering regression**                            | PR #18, opened 2026-09-01, bumps `postprocessing` 6.39.1 → **6.39.4**. All 8 checks SUCCESS (gates, 3 e2e shards, doc currency, Vercel x2; CodeQL neutral). 6.39.4 is the exact version this project measured on 2026-08-13 as killing GodRays compositing — `ACTIVE_PLAN.md:325-327`, sun absent, filed upstream as pmndrs/postprocessing#750. | Merging it deploys a sky with no sun to the live Vercel demo. Every gate says yes because CI structurally cannot see rendering — the 31-frame visual gate is deliberately not in CI.                                                                                               | NOW — one click | Close #18. If the bump is wanted, target **6.39.5** (the fixed release), verified against the GodRays frames locally first.                                  |
| R2  | The guard rule that should have stopped R1 is scoped one notch too narrow                 | `dependabot.yml` ignores `postprocessing` at `version-update:semver-minor` only. 6.39.1 → 6.39.4 is a PATCH, so it escaped. Compounding it, `package.json` declares `^6.39.1` — the documented "PIN" is held by the lockfile alone, not by the manifest.                                                                                        | The rule regenerates #18 every month. The file already documents this exact failure shape for `@react-three/postprocessing` ("Without this line Dependabot regenerates that unmergeable PR every month") — the reasoning was written down and not applied to its neighbour.        | NOW             | Add `version-update:semver-patch` to the `postprocessing` ignore list, and pin the manifest to `"6.39.1"` exactly. Two lines.                                |
| R3  | The CI audit gate will go red on the next run, and nothing has run since it could         | `npm audit --audit-level=high` reproduced locally 2026-09-22: **exit 1**, js-yaml 4.3.1 / GHSA-2883-xcg3-v3hh (7.5 HIGH), via eslint > @eslint/eslintrc. The advisory was published **2026-09-08**. The last CI run of any kind was **2026-09-01**. The last push-triggered run was 2026-08-13.                                                 | Not "red and unread" — **untriggered**. The next push or PR is the first run that will see it, and it will fail the `gates` job. The green ticks on #17 and #18 predate the advisory by a week and are stale, so they are not evidence those PRs pass today.                       | NOW             | `npm audit fix` — js-yaml 4.3.2 is a plain transitive patch, and it closes fflate and postcss-selector-parser at the same time.                              |
| R4  | React 19.3.0 will break the next monthly Dependabot PR                                    | `@react-three/fiber` 9.7.0 (the latest) still peers `react >=19 <19.3`. react/react-dom 19.3.0 published 2026-09-09 — after the 2026-09-01 Dependabot scan. React is in the `production-minor-patch` group and is NOT in the ignore list.                                                                                                       | The 2026-10-01 grouped PR will contain react 19.3.0, ERESOLVE on `npm install`, and fail every check — then regenerate monthly. Identical shape to the @react-three/postprocessing case the config already documents.                                                              | ~9 days         | Add `react` and `react-dom` minor to the ignore list until fiber relaxes its peer.                                                                           |
| R5  | `three` is 14 breaking 0.x positions behind, and the gap only widens                      | 0.172.0 pub 2024-12-31; latest 0.186.0 pub 2026-09-08. 20 intervening releases, 14 minor positions — each one breaking under 0.x semver.                                                                                                                                                                                                        | Compounding, and the only risk here an agent cannot close. The 2026-08-13 measurement put r174 alone at 19/31 frames over gate, so landing it means rewriting all 31 baselines — a judgement about how the game should look. Every month adds to that bill and nothing reduces it. | 6–12 months     | Kevin's decision, still open in `DECISIONS.md`. Note the peer ceiling is NOT the obstacle (§3): r174 sits ten minors below even the current 0.184.0 ceiling. |
| R6  | The upstream blocker lifted two weeks ago and the plan file still records it as permanent | `pmndrs/postprocessing#750` — filed by this project — was **CLOSED 2026-09-09T19:07Z**, vanruesc: *"Should be fixed in v6.39.5"*. 6.39.5 published 27 minutes later. Its peer widens to `three >= 0.168.0 < 0.187.0`, lifting the joint ceiling from 0.184.0 to 0.186.0.                                                                        | Opportunity-rot, not breakage. `ACTIVE_PLAN.md:317` still asserts "postprocessing is PINNED at 6.39.1 and cannot move" — a stale doc is a LIVE TRAP that regenerates dead work, which is this repo's own stated failure mode (LOOP-CHARTER §0-B.6).                                | NOW             | Verify 6.39.5 against the GodRays frames locally, then correct ACTIVE_PLAN.md and the dependabot.yml comment block.                                          |
| R7  | `eslint-plugin-react` is unmaintained and hard-blocks eslint 10                           | Last publish 7.37.5 on **2025-04-03 — 17.6 months**. Peer is `^3 || … || ^9.7`; 7.37.5 is the terminal version on the registry. eslint 10.11.0 is current. PR #7 (eslint → 10.8.1) was closed as unmergeable, exactly as dependabot.yml predicted.                                                                                              | eslint 9 reaches end-of-support while the only React lint plugin in the config cannot follow. The crash-class gate — `no-undef` / `react/jsx-no-undef`, the one that catches shipped-but-broken JSX — rides on this plugin.                                                        | 6–12 months     | Watch the repo. Fallback is `@eslint-react/eslint-plugin`, which is a rule-name migration, not a drop-in.                                                    |
| R8  | tailwindcss 3.x is a terminal branch carrying a live advisory                             | 3.4.19 holds the `v3-lts` dist-tag, published 2025-12-10; latest is 4.3.3. It is also the sole path to the `postcss-selector-parser` advisory.                                                                                                                                                                                                  | No further 3.x releases means every future advisory in its subtree is unfixable in place. Tailwind 4 is a CSS-first config rewrite, not a version bump.                                                                                                                            | 6–12 months     | Scope the v4 migration as its own tranche — it touches the PostCSS pipeline, not the game.                                                                   |
| R9  | The vitest advisory needs a 2-major jump, and vitest is the CI unit gate                  | GHSA-82fw-gwwq-j7x9 range `>=2.1.0 <4.1.11`; installed 3.2.7. 4.1.11 pub 2026-08-18; npm offers 5.0.1. vitest 5 peers vite `^6.4 || ^7 || ^8`, so the installed vite 6.4.3 is just inside.                                                                                                                                                      | Only moderate today, so `--audit-level=high` ignores it. If it is ever re-scored high, the gate goes red and the only fix is a coordinated vitest + coverage-v8 double-major performed under a red build.                                                                          | 6–12 months     | Do the vitest 3 → 5 move deliberately while the gate is still green. vite 6.4.3 already satisfies vitest 5.                                                  |
| R10 | Every GitHub Action is 3 majors behind and already warning                                | All six references are `@v4`: checkout (latest v7.0.1), setup-node (v7.0.0), upload-artifact (v7.0.1). Node 20 runtime deprecation warnings are observed in the logs. dependabot ignores ALL action majors, so this never self-corrects.                                                                                                        | Deprecation becomes removal. When the Node 20 action runtime is retired, all three jobs fail at once with no code change — and the config that would have warned is the one suppressing it.                                                                                        | 6–12 months     | One PR bumping all three. Read upload-artifact v5 notes first — v4→v5 changed artifact semantics.                                                            |
| R11 | `npm ci` is structurally impossible, so CI installs are not reproducible                  | `ci.yml` runs `npm install --no-audit --no-fund` in both install steps, because the lockfile is generated on macOS/arm64 and never records the linux-only napi optionals (@emnapi/core, @emnapi/runtime).                                                                                                                                       | The lockfile-as-pin mechanism that R2 leans on is weaker than it looks, and there is no supply-chain determinism on the runner that holds GITHUB_TOKEN — the same runner that executes the full dependency tree's lifecycle scripts.                                               | 6–12 months     | Generate the lockfile in a linux container (or commit both platform sets) and switch to `npm ci`.                                                            |
| R12 | lucide-react is 24 months and a 0.x→1.x major behind                                      | 0.439.0 pub 2024-09-06; 1.0.0 landed 2026-03-23; latest 1.47.0. dependabot ignores its minors AND all majors, so it is fully frozen. PR #9 (to 1.31.0) was closed.                                                                                                                                                                              | Low severity, but the gap is now large enough that the eventual bump is a visual review of every icon rather than a version change.                                                                                                                                                | 6–12 months     | Batch it with the next visual-baseline session.                                                                                                              |
| R13 | The physics pin is correct today and becomes a trap the day rapier moves                  | `@dimforge/rapier3d-compat` 0.19.2 (pub 2025-10-17) vs 0.20.0 (pub 2026-08-08). Frozen by an exact pin plus `supply-chain.test.js`, because `@react-three/rapier` 2.2.0 depends on it exactly and a 0.19.3 patch once silently nested a second copy.                                                                                            | Not a defect — the freeze is deliberate and well-reasoned. It becomes one when @react-three/rapier moves: the two must change in the same commit, or the integration test silently exercises a different engine than the one the app ships.                                        | 6–12 months     | Watch @react-three/rapier releases. Move both together or neither.                                                                                           |

### The shape of it

Four of the top six are not upgrade decisions at all:

- **R1 / R2** — a guard rule scoped one semver position too narrow, and a green PR already through the gap.
- **R3** — a blocking gate that will fail on its next invocation, on a repo where the next invocation has not
  happened in three weeks.
- **R6** — a blocker that lifted upstream two weeks ago while the plan file still records it as permanent.

Each is a one-line or one-command close, today, with no version judgement required. **R4 has a deadline of about
nine days** — the 2026-10-01 Dependabot run.

**R5 is the only one that is different in kind.** It gets strictly more expensive every month, cannot be closed by
an agent, and the cost is not technical: it is a 31-frame visual re-baseline and a decision about how the game
should look.

**The uncomfortable pattern worth naming.** R1, R2, R3 and R6 share one mechanism: *a control that was correct
when it was written, and whose correctness was never re-measured.* The audit gate measured zero vulnerabilities
on 2026-08-12 and has not looked since. The postprocessing ignore rule was written against the hazard visible that
week. The plan file recorded a pin that upstream released two weeks ago. None of these failed — they were all
correct, once, and nothing re-asked.

---

*Every version number, advisory range, peer constraint, Node lifecycle date, upstream issue state, PR check
rollup and action release tag here was read from a live source on 2026-09-22: the npm registry,
`npm audit --json`, `nodejs.org/dist/index.json`, the nodejs/Release schedule, and the GitHub API via `gh`.*
