# Crafty → SOTA Initiative — Master Brief (read this FIRST in a fresh session)

> **You (a fresh Crafty session) are continuing a brainstorming exercise** started in a sister thread on 2026-05-30. Do **not** jump to code. This is a `superpowers:brainstorming` flow: explore → lock the vision (esp. visual direction) → present a design → get Kevin's approval → only THEN plan/implement. Read this whole file + the pointers in §8 before acting.

---

## 0. TL;DR
Crafty is **not** a "simple kid game" (that was a stale memory). It's a **Phase-34, feature-dense 3D voxel action-RPG** (React 19 / Three 0.172 / R3F 9.5 / Rapier 2.2 / zustand), largely **built by Gemini 3.5 Flash — fast, but with a real slop/bug trail**. Kevin's goal now: make it **ACTUALLY SOTA in every aspect**, with a **very high visual/aesthetic-taste bar**, within a **web / iPad / mobile envelope** (NOT GPU-heavy AAA), and eventually **multiplayer + monetization**. Everything is open to **complete redesign**, and **beyond-SOTA / never-before-seen** mechanics & architectures are explicitly welcome.

## 1. The goal (current — supersedes any older "Marcus-first / simple" framing)
- **SOTA in every aspect**: graphics/aesthetics, gameplay, architecture, performance, audio, UX.
- **Visual/aesthetic taste is the HIGHEST bar.** Kevin (ex-IB, very high design taste) wants "super tasteful graphic design" — distinctive, premium, *not* generic-voxel. This axis anchors everything.
- **Platform envelope**: must run great on **web + iPad + mobile** (touch). NOT targeting RDR2 / Skyrim / Black Myth GPU budgets. SOTA *within* a web/mobile envelope (clever > brute-force).
- **Leverage SOTA LLM capability** (Opus 4.8, ultracode, multi-agent workflows) to do this at a quality the Gemini pass didn't reach.
- **Multiplayer + monetization are IN scope** (later): charge kids / teens / young adults / Marcus' friends. (Phase 25 WebSocket multiplayer is already roadmapped.)
- **Beyond-SOTA welcome**: novel mechanics, never-before-seen features, novel architectures — encouraged once the base is solid.
- **Marcus** (8, Chinese-speaking) is still a key user → joy + age-appropriateness + Chinese-language support stay first-class, but this is now a **commercial-grade product** ambition.

## 2. Critical caveats (do NOT skip)
1. **Doc-vs-reality gap.** `memory/ARCHITECTURE.md` + `ROADMAP.md` label dozens of systems "SOTA / COMPLETED / verified." Those are **Gemini's optimistic self-descriptions, not ground truth.** Independently verify what actually works, is bug-free, and is genuinely SOTA-quality. (Kevin's standing rule: verify code-reality before trusting a doc claim.)
2. **The real gaps are NOT feature-poverty.** Crafty is feature-*rich*. "Make it SOTA" ≈ **(a) stabilize** (the `fix(terrain)` shader/WebGL2/winding/VRAM-leak storm shows fragility), **(b) elevate taste** (feature-rich ≠ tasteful), **(c) re-architecture** (5 god-files >900 LOC + vestigial ECS + slop fight every change), **(d) cohere** (separate real-from-claimed) — *then* novelty + multiplayer.
3. **Don't add more slop.** Lock the vision/spec before building. Use ultracode/workflows for breadth + **adversarial verification** so we don't repeat the fast-but-buggy pattern.

## 3. Current state (honest summary)
- **Path**: `~/Code/Crafty/frontend`. ~**14.4k LOC / 31 JS(X) files**, **monolithic** (god-files: `SimplifiedNPCSystem` 1532, `AdvancedGameFeatures` 1344, `Components` 1174, `EnhancedMagicSystem` 944, `SoundManager` 811; plus `GamePanels` 957, `QuestSystem` 740, `GameScene` 728, `useGameStore` 704).
- **Stack**: React 19 · Vite 6 · Three 0.172 · @react-three/fiber 9.5 · drei 10.7 · postprocessing · @react-three/rapier 2.2 (WASM KCC) · **miniplex (narrow — mob queries only, NOT the real architecture)** · zustand 5 · simplex-noise.
- **Attempted-SOTA systems** (verify each!): 3D greedy voxel mesher, WebGL2 DataArrayTexture voxel texturing, Rapier kinematic character controller, GPU particle systems (claimed 1200 embers @ 0ms CPU), procedural weapon/ribbon trails, bioluminescent water + volumetric weather + GPU grass displacement shaders, 3-phase Shadow Dragon boss w/ voxel destruction, A* pathfinding + cover-seeking behavior trees in web workers, cellular-automata dungeons, 4-voice procedural FM synth + acoustic occlusion.
- **Known fragility**: recent git log is dominated by `fix(terrain)` — see-through terrain, GLSL redefinition crashes, voxel winding, WebGL2 attribute issues, VRAM leaks. Treat the render/shader/terrain layer as **unstable until proven otherwise.**
- **Mobile/touch**: controls are keyboard/mouse only (WASD/F/1-4/E/M/C/B…). **Touch/iPad input almost certainly does not exist yet** — a hard requirement gap for the platform envelope.

## 4. Decomposition into workstreams (too big for one spec)
| | Stream | Scope | Sequence |
|---|---|---|---|
| **S0** | **Reality audit + stabilization** | real-vs-doc-claimed; catalog Gemini slop/bugs; perf+leak truth; known-good baseline | **FIRST** (input to everything) |
| **S1** | **Art direction & visual identity** 🎯 | theme/mood, lighting/post/shader language, palette, material design, UI/UX design system; the *tasteful, premium, distinctive* look | early + parallel (design, not code; anchors all) |
| **S2** | **Game design & core loop** | is it *fun + cohesive + SOTA as a game*? progression, the novel/beyond-SOTA mechanic appetite | after S0/S1 |
| **S3** | **Engine architecture + perf envelope** | de-monolith god-files, resolve partial-ECS, render/update pipeline, **web/iPad/mobile + touch** budget & input | with S2 |
| **S4** | **Multiplayer + backend + monetization** | netcode (Phase 25), accounts, persistence, payments, business model | **last** (needs solid single-player core) |

Audio is already strong → folds into S1 polish.

## 5. The process to run (in this fresh session)
1. **Set effort**: `/effort ultracode` (deep reasoning + auto multi-agent workflows). Drop to `/effort high` for routine edits. (Ultracode subagents are **script-coordinated, not peer-messaging** — deterministic fan-out + cross-check; great for audits/reviews.)
2. **S0 — run the reality-audit workflow** (§6) to get the true baseline. Read-only; safe to run before vision-lock.
3. **S1 — brainstorm the visual/art direction** (§7). This is the highest-bar axis. Offer Kevin the **visual companion** (browser mockups/refs/comparisons) as its OWN message before visual questions. Explore his taste with references & options; one question at a time.
4. **Lock the vision → write a spec** (`docs/superpowers/specs/…`) → Kevin approves → **then** `superpowers:writing-plans` → implement. **HARD GATE: no implementation before an approved design.**
5. Work stream-by-stream; each gets its own spec → plan → build → verify cycle. Use **adversarial verification** (independent agents refute findings/changes) to avoid re-introducing slop.

## 6. S0 — Reality-Audit workflow (author + run this; read-only)
Goal: an **honest "real vs Gemini-claimed" baseline** + a prioritized slop/bug list. Fan out one finder agent per dimension, then adversarially verify, then synthesize. Suggested dimensions (each returns `{claim, reality(works/partial/broken/over-claimed), evidence file:line, severity, fix-sketch}`):
1. **Render/terrain stability** — the `fix(terrain)` hot zone: shader compile robustness, see-through bugs, winding, WebGL2 attribute correctness.
2. **Voxel mesher + texturing** — does the greedy mesher + DataArrayTexture pipeline actually work & match the claims?
3. **Perf reality** — measure FPS/frame-budget (don't trust the doc's "0ms / 60fps"); draw calls; the single 704-LOC zustand store re-render fan-out.
4. **GPU memory / leaks** — geometry/material disposal on chunk unmount (recent fix area); long-session VRAM growth.
5. **Physics (Rapier KCC)** — tunneling/jitter/fall-through; stability.
6. **AI/workers** — A* pathfinding + behavior trees + worker comms: real or partial?
7. **Combat/magic/boss** — do the visceral-combat + boss systems actually fire correctly & feel good?
8. **Audio** — procedural synth + occlusion: works? tasteful?
9. **Architecture debt** — god-files, vestigial miniplex, coupling, dead code.
10. **Mobile/iPad/touch readiness** — does it run + is it playable on touch at all? (likely a big gap)
11. **Visual quality (honest)** — does it look *tasteful/premium/SOTA* or generic/sloppy? (feeds S1)
12. **Build/bundle/load** — Vite, bundle size, load time, Vercel.
Output → `~/Code/Crafty/memory/REALITY-AUDIT-<date>.md` (the true baseline we design against).

## 7. S1 — Visual / Art-Direction brainstorm (highest bar)
The load-bearing axis. Explore with Kevin (visual companion ON): **art-direction references** (what premium/tasteful voxel & stylized 3D web games look like in 2026), **a chosen visual identity/theme** (Crafty shouldn't read as generic Minecraft), **lighting + post-processing language**, **material/palette/texture direction**, **a UI/UX design system** (the current "glassmorphic panels" — keep/evolve/replace?), and **the "wow" signature look**. Output → a visual-direction spec + a moodboard the rest of the build serves. Kevin's taste bar is very high — propose strong, opinionated directions, not safe defaults.

## 8. Pointers
- `~/Code/Crafty/memory/ARCHITECTURE.md` · `ROADMAP.md` · `CHANGELOG.md` (Crafty's 4-piece memory — **read, but verify claims**).
- `~/Code/Crafty/frontend/package.json` (live stack/versions), `frontend/README.md`, `frontend/src/` (the god-files in §3).
- Global memory `project_crafty.md` (this initiative, condensed).

## 9. Guardrails
- **No Claude/AI footer** in commits (Kevin's global rule).
- **Verify doc claims against code** before asserting anything "works / is SOTA."
- **Perf envelope**: web + iPad + mobile + touch. Clever/efficient > brute-force GPU.
- **Taste**: every visual decision meets a premium, distinctive, *tasteful* bar — not generic, not AI-slop.
- **Marcus** remains a key user (joy, age-8 UX, Chinese language).
- **Don't redesign blind** — S0 baseline first; lock vision before build; adversarially verify to avoid new slop.
- This is `~/Code/Crafty` (its own git repo) — separate from moneymaker.
