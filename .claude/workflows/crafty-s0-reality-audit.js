export const meta = {
  name: 'crafty-s0-reality-audit',
  description: 'Read-only reality audit of Crafty: live runtime capture + 12-dimension claim-vs-reality finders + 2-lens adversarial refutation, synthesized into REALITY-AUDIT-2026-05-30.md',
  phases: [
    { title: 'Live capture', detail: 'build + vite preview + puppeteer: screenshots, FPS, heap, console errors' },
    { title: 'Find', detail: '12 dimension finders return structured claim/reality/evidence/severity/fix verdicts' },
    { title: 'Refute', detail: '2 distinct-lens skeptics (code-trace + severity-calibration) per high-severity finding' },
    { title: 'Synthesize', detail: 'merge into severity-ranked real-vs-claimed baseline' },
  ],
}

const ROOT = '/Users/kz/Code/Crafty'
const SRC = ROOT + '/frontend/src'
const ASSETS = ROOT + '/memory/REALITY-AUDIT-2026-05-30-assets'
const DATE = '2026-05-30'

const CALIBRATION = `
CONTEXT YOU MUST INTERNALIZE (this is an adversarial reality audit, not a feature tour):
- Crafty is a feature-dense R3F voxel action-RPG largely built by Gemini 3.5 Flash, fast but with a real slop/bug trail.
- The repo's docs (memory/ARCHITECTURE.md, ROADMAP.md, CHANGELOG.md) label dozens of systems "SOTA / COMPLETED / verified / 100% green". These are the AUTHOR'S OPTIMISTIC SELF-DESCRIPTIONS, NOT ground truth.
- PROVEN FACT (already verified by the lead): the repo's only automated test, frontend/test_swarm.js, is a BLIND rubber-stamp. It only (a) flips a store boolean to open/close the crafting menu, (b) calls damagePlayer(25) and checks health<75, (c) calls addToInventory('dirt',1) and checks a count. It NEVER inspects a rendered frame, terrain, shaders, physics, AI, mobs, magic, FPS, or any visual. So "100% green Puppeteer playtest swarm" means ONLY "the bundle compiled" — it is blind to ~95% of the codebase. Do NOT treat any "verified/green" claim as evidence the feature works.
- The same systems were "fixed" repeatedly across phases (pointer-lock ~4x, see-through terrain ~4x, voxel winding ~3x). Recurrence impeaches the "fixed/verified" claims.

YOUR JOB: independently determine what is REAL. For each notable doc/code claim in your dimension, classify reality as one of:
  works | partial | broken | over-claimed | unverifiable
Back EVERY verdict with concrete evidence as "relative/path.jsx:LINE" (or :LINE-LINE). Read the actual code; trace whether the cited code path is reachable and correct. Cite real line numbers you saw. If you cannot verify a runtime behavior from static reading, say "unverifiable" — do NOT guess "works".

STRICT RULES:
- READ-ONLY. Do NOT edit, write, or modify ANY source file. Use Read / Grep / Bash(read-only: grep, sed -n, wc, find, node --check).
- No fabrication. "I could not determine X" is a valid, valued answer. Inventing a green verdict is the exact failure mode we are auditing.
- Prefer precise file:line evidence over prose. fixSketch = 1-2 sentence concrete remediation direction (not an essay).
- Severity = impact on the SOTA goal (web/iPad/mobile + touch, premium taste, stability): critical (crashes/unplayable/data-loss/security) > high (major broken feature or perf cliff) > medium (degraded/partial) > low (cosmetic/minor) > info (observation).
`

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    dimension: { type: 'string' },
    summary: { type: 'string', description: '2-4 sentence honest bottom-line for this dimension' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string', description: 'the doc/code claim or behavior under test' },
          reality: { type: 'string', enum: ['works', 'partial', 'broken', 'over-claimed', 'unverifiable'] },
          evidence: { type: 'string', description: 'file:line proof, e.g. world/Terrain.jsx:212-240' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
          fixSketch: { type: 'string' },
        },
        required: ['claim', 'reality', 'evidence', 'severity', 'fixSketch'],
      },
    },
  },
  required: ['dimension', 'summary', 'findings'],
}

const RUNTIME_SCHEMA = {
  type: 'object',
  properties: {
    buildStatus: { type: 'string', enum: ['success', 'fail', 'not-run'] },
    buildTimeSec: { type: 'number' },
    bundleSummary: { type: 'string', description: 'largest chunks + total build size' },
    serverStarted: { type: 'boolean' },
    renderedOk: { type: 'boolean', description: 'did terrain/scene visibly render in the screenshots (not blank sky)?' },
    fpsAvg: { type: 'number' },
    fpsMin: { type: 'number' },
    drawCalls: { type: 'number' },
    heapStartMB: { type: 'number' },
    heapEndMB: { type: 'number' },
    consoleErrors: { type: 'array', items: { type: 'string' } },
    consoleWarnings: { type: 'array', items: { type: 'string' } },
    webglErrors: { type: 'array', items: { type: 'string' } },
    screenshots: {
      type: 'array',
      items: {
        type: 'object',
        properties: { state: { type: 'string' }, path: { type: 'string' }, note: { type: 'string' } },
        required: ['state', 'path'],
      },
    },
    honestNotes: { type: 'string', description: 'what you could and could NOT capture, and why' },
  },
  required: ['buildStatus', 'serverStarted', 'renderedOk', 'screenshots', 'honestNotes'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    verdict: { type: 'string', enum: ['upheld', 'downgrade', 'refuted'] },
    correctedSeverity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
    reasoning: { type: 'string' },
  },
  required: ['lens', 'verdict', 'correctedSeverity', 'reasoning'],
}

// ---------- PHASE 1: LIVE CAPTURE ----------
phase('Live capture')
const LIVE_PROMPT = `You are the LIVE-RUNTIME capture agent for an honest reality audit of the Crafty browser game. ${CALIBRATION}

GOAL: produce REAL runtime artifacts (no fabrication) so the team can judge perf, leaks, and visual taste against actual pixels.

Work in ${ROOT}/frontend (node_modules is already installed; puppeteer 24.x is in devDependencies).

STEPS (best-effort; report honestly what works and what fails):
1. Production build truth: run \`npm run build\` (timeout ~180s). Record buildStatus, buildTimeSec, and the bundle summary (largest chunks + total size of the build/ output; use \`du -sh build\` and \`ls -la build/assets | sort -k5 -n\`). Note: vite.config drops console.* in production.
2. Create the assets dir: \`mkdir -p ${ASSETS}\`.
3. Write a SELF-CONTAINED capture script to ${ROOT}/frontend/_s0_capture.mjs that:
   - spawns \`npx vite preview --port 4173 --strictPort\` as a child process (serves the build/ you just made),
   - waits for the port to respond,
   - launches puppeteer headless ("new") with args ['--no-sandbox','--disable-setuid-sandbox','--use-gl=egl'], viewport 1280x800,
   - collects page console messages, page errors, and any WebGL warnings (filter strings containing 'GL_' or 'WebGL'),
   - navigates to http://localhost:4173, waitForFunction('typeof window.useGameStore === "function"', {timeout:20000}), then delay 2500ms,
   - capture screenshot 'menu' BEFORE bypassing the menu -> ${ASSETS}/01-menu.png,
   - bypass: window.useGameStore.getState().setGameMode('creative'); delay 3500ms for terrain to stream in; screenshot 'spawn-day' -> ${ASSETS}/02-spawn-day.png,
   - introspect available store setters (Object.keys(window.useGameStore.getState())) and try to force NIGHT if a setter exists (e.g. setTimeOfDay / set day length); if found, screenshot 'night' -> ${ASSETS}/03-night.png; else record that night could not be forced,
   - try to spawn/observe combat or mobs if a store method allows; screenshot 'combat-or-mobs' -> ${ASSETS}/04-action.png (best-effort),
   - FPS: inject a requestAnimationFrame counter sampling ~4 seconds of free idle; return avg + min fps,
   - heap: read performance.memory.usedJSHeapSize at spawn (heapStartMB) and again after ~20s of idle (heapEndMB) to estimate leak slope,
   - draw calls: best-effort — try to reach the three.js renderer (window.__r3f?.store or scan canvas) and read renderer.info.render.calls; if unreachable, set drawCalls to -1 and note it,
   - write a JSON blob of all metrics to ${ASSETS}/runtime-metrics.json,
   - kill the vite child process, close the browser, process.exit(0).
   Make it ROBUST: wrap in try/finally so the server is always killed; never hang forever (hard cap ~90s of browser work).
4. Run \`node _s0_capture.mjs\` (timeout ~240s). If it errors, capture the error, try once more with \`npm run dev\`/port 3000 as fallback, then report honestly.
5. Verify the screenshots actually exist on disk (\`ls -la ${ASSETS}\`) and are non-trivial in size (a blank/near-empty PNG is itself a finding -> renderedOk:false).
6. Leave _s0_capture.mjs in place (it is audit tooling, not game source). Do NOT touch anything under src/.

Return the structured runtime metrics. In honestNotes, state precisely what rendered, what you could not force (e.g. night/combat), whether the scene was visibly populated terrain vs blank sky, and any crash/error you saw. Anti-fabrication is the prime directive.`

const runtime = await agent(LIVE_PROMPT, { label: 'live-capture', phase: 'Live capture', schema: RUNTIME_SCHEMA })
log(`Live capture: build=${runtime?.buildStatus} rendered=${runtime?.renderedOk} fpsAvg=${runtime?.fpsAvg ?? 'n/a'} shots=${(runtime?.screenshots || []).length} errs=${(runtime?.consoleErrors || []).length}`)

// ---------- PHASE 2: 12-DIMENSION FINDERS ----------
phase('Find')
const DIMENSIONS = [
  { key: 'render-terrain', focus: 'world/Terrain.jsx, world/terrain.worker.js, world/proceduralTextures.js, GameScene.jsx (post-processing/fog/EffectComposer)',
    claims: 'see-through terrain "completely resolved" via CCW winding + flat varying vBlockType + FrontSide culling + opaque/transparent geometry split; N8AO removed for depth-stencil conflict; bioluminescent water shader.' },
  { key: 'voxel-mesher-texturing', focus: 'world/terrain.worker.js (greedy mesher), world/proceduralTextures.js, world/Terrain.jsx (UV + DataArrayTexture binding)',
    claims: '3D slice-and-sweep greedy mesher with 80-90% vertex reduction; pre-allocated Uint16Array(4096) mask; WebGL2 DataArrayTexture 9-layer voxel texturing with blockType packed in color.r; tiled UV repeat across merged quads; water translucency alpha 0.75.' },
  { key: 'perf-reality', focus: 'store/useGameStore.jsx (704 LOC), GameScene.jsx, Components.jsx + all useFrame loops + zustand subscriptions; plus the live runtime FPS/draw-call data',
    claims: '"60+ FPS", "0ms CPU" GPU particles, transient playerPosition decoupling prevents re-render fan-out, useShallow selectors. Verify the single big store does not cause subscriber re-render storms; verify per-frame allocations / getState() churn.' },
  { key: 'gpu-leaks', focus: 'world/Terrain.jsx (ChunkMesh useMemo geometry + dispose useEffect), and grep all src for geometry/material/texture .dispose() vs creation; chunk unmount lifecycle',
    claims: 'GPU VRAM geometry leak "completely resolved" via dispose() on unmount; chunk keys deleted from chunksRef Set. Verify materials/textures/RT also disposed, not just geometry; verify heapEnd vs heapStart from runtime data.' },
  { key: 'physics-kcc', focus: 'Components.jsx (Player: Rapier KCC, computeColliderMovement, autostep, ground raycast, jump velocityY, knockback impulse override, ledge parkour)',
    claims: 'kinematicPosition KCC with WASM computeColliderMovement, autostep 1.05m / snap 0.5m, manual gravity, applyImpulse override for knockback, ledge vault. Verify it actually uses the KCC controller (not velocity overrides), and check for tunneling/double-jump/wall-stick.' },
  { key: 'ai-workers', focus: 'workers/ai.worker.js (353 LOC), SimplifiedNPCSystem.jsx (worker comms + AIWorkerSystem), ecs/world.js',
    claims: '3D voxel-height A* over 9x9 grid, cover-seeking behavior trees at <25% HP with line-of-sight raycasts + cyan shield aura, pack-aggro linking within 12 units. Verify the A* is real (not linear chase), worker messaging is correct, and the cover/pack logic actually fires.' },
  { key: 'combat-magic-boss', focus: 'EnhancedMagicSystem.jsx (944), SimplifiedNPCSystem.jsx (1532, visceral combat), AdvancedGameFeatures.jsx (1344, Shadow Dragon boss), Components.jsx (melee/ribbon/weapon), world/GPUSparkSystem.jsx',
    claims: '3-phase Shadow Dragon w/ voxel destruction + direct mesh-ref mutation; visceral squash/tilt + pooled shockwaves + gradient damage numbers; GPU spark system "1200 embers @ 0ms"; procedural ribbon trails + procedural weapons; spell combos. Verify these render correctly and the boss state machine + voxel destruction are wired (not dead code).' },
  { key: 'audio', focus: 'SoundManager.jsx (811), GameScene.jsx (SpatialAudioController / occlusion)',
    claims: '4-voice procedural FM synth pad (Lydian/Dorian/augmented), acoustic occlusion via Rapier world.castRay reducing lowpass per intervening block, cavern delay-feedback reverb at y<10, combat arpeggiator scaling tempo with hostile count. Verify the audio graph is correct and actually connected (note: a prior AudioContext mismatch crash was patched).' },
  { key: 'architecture-debt', focus: 'whole src tree: the 10 god-files >700 LOC, ecs/world.js (vestigial miniplex), GameMethods.js (empty runtime-patched object), coupling, dead code, circular deps, duplicate logic',
    claims: 'ARCHITECTURE.md "AI Structural Laws" claim decomposition into GameScene/HUD/InputManager and no UI state in GameScene; "circular dependency resolved" via combat.js; ECS is "the real architecture". Verify miniplex is vestigial, GameMethods race risk, store size, god-file responsibilities, and any remaining circular/duplicate code.' },
  { key: 'mobile-touch', focus: 'InputManager.jsx, Components.jsx (input), App.jsx, App.css + index.css (media queries/viewport), any touch/pointer handlers',
    claims: 'Platform envelope requires web + iPad + mobile + touch. Determine EXACTLY what input exists: enumerate keyboard/mouse bindings and confirm whether ANY touch joystick / on-screen controls / pointer-touch handling / responsive layout exists. Quantify the gap precisely (file:line of what is keyboard-locked).' },
  { key: 'visual-quality', focus: 'the runtime screenshots in ' + ASSETS + ' (READ them as images), plus Terrain shaders, post-processing in GameScene.jsx, App.css glassmorphic UI, color/material/palette choices',
    claims: 'Judge HONESTLY whether the current look is premium/tasteful/distinctive vs generic-voxel/AI-sloppy. This feeds the art-direction stream (highest bar). Read the actual screenshots if they exist. Assess: palette, lighting, materials, UI design system, overall cohesion. Be specific and opinionated. If screenshots are missing/blank, say so and rate from shader/CSS code only (mark unverifiable for pixel claims).' },
  { key: 'build-bundle-load', focus: 'vite.config.js, frontend/build output (from runtime data), vercel.json, index.html, package.json',
    claims: 'chunkSizeWarningLimit 4000 suppresses warnings; "loaded upfront" no code-splitting; drop:[console,debugger] in prod. Assess bundle size, code-splitting/lazy-loading, load-time implications for the mobile envelope, and deploy config correctness. Use the runtime bundleSummary.' },
]

const RUNTIME_DIGEST = JSON.stringify({
  buildStatus: runtime?.buildStatus, renderedOk: runtime?.renderedOk, fpsAvg: runtime?.fpsAvg, fpsMin: runtime?.fpsMin,
  drawCalls: runtime?.drawCalls, heapStartMB: runtime?.heapStartMB, heapEndMB: runtime?.heapEndMB,
  bundleSummary: runtime?.bundleSummary, consoleErrors: runtime?.consoleErrors, webglErrors: runtime?.webglErrors,
  screenshots: runtime?.screenshots, honestNotes: runtime?.honestNotes,
})

const finderPrompt = (d) => `You are the "${d.key}" dimension finder in a read-only adversarial reality audit of Crafty.
${CALIBRATION}

YOUR DIMENSION: ${d.key}
FOCUS FILES (under ${SRC}, read them directly with absolute paths): ${d.focus}
CLAIMS TO TEST: ${d.claims}

You also have the LIVE RUNTIME CAPTURE results (use them as evidence where relevant, esp. for perf/leak/visual dimensions):
${RUNTIME_DIGEST}

PROCEDURE:
1. Read the focus files (use absolute paths like ${SRC}/world/Terrain.jsx). For the visual dimension, ALSO Read the screenshot PNGs in ${ASSETS} as images.
2. Cross-reference the claims against what the code actually does. Trace reachability. Note dead code, no-op effects, silent fallbacks, and over-claims.
3. Return 3-10 of the most important findings for this dimension (quality over quantity; include the genuinely-works items too, not only bugs — we need a true real-vs-claimed picture).
Every finding needs file:line evidence. Be precise, be honest, be specific.`

const finderResults = await parallel(
  DIMENSIONS.map((d) => () => agent(finderPrompt(d), { label: `find:${d.key}`, phase: 'Find', schema: FINDINGS_SCHEMA }))
)

const sevRank = { critical: 5, high: 4, medium: 3, low: 2, info: 1 }
const allFindings = finderResults.filter(Boolean).flatMap((r) =>
  (r.findings || []).map((f, i) => ({ ...f, id: `${r.dimension}#${i + 1}`, dimension: r.dimension }))
)
const dimSummaries = finderResults.filter(Boolean).map((r) => ({ dimension: r.dimension, summary: r.summary }))
log(`Finders returned ${allFindings.length} findings across ${finderResults.filter(Boolean).length}/${DIMENSIONS.length} dimensions.`)

// ---------- PHASE 3: 2-LENS ADVERSARIAL REFUTE ----------
phase('Refute')
const highSev = allFindings
  .filter((f) => f.severity === 'critical' || f.severity === 'high' || f.reality === 'broken' || f.reality === 'over-claimed')
  .sort((a, b) => sevRank[b.severity] - sevRank[a.severity])
const CAP = 24
const toRefute = highSev.slice(0, CAP)
if (highSev.length > CAP) log(`Refute cap: adversarially verifying top ${CAP} of ${highSev.length} high-severity findings; the remaining ${highSev.length - CAP} pass through marked unrefuted (noted in the audit).`)

const refutePrompt = (f, lens) => {
  const lensBrief = lens === 'code-trace'
    ? `LENS = CODE-TRACE SKEPTIC. Try hard to REFUTE this finding on technical correctness. Read the cited file:line and surrounding code. Is the code path actually reachable and the bug/claim real, or did the finder misread (wrong file, dead code, guarded path, already-handled)? If the finding says something is BROKEN/OVER-CLAIMED, attempt to prove it actually WORKS. If the finding says something WORKS, attempt to prove it does NOT. Default to 'upheld' only if you genuinely cannot refute after reading the code.`
    : `LENS = SEVERITY-CALIBRATION SKEPTIC. Assume the technical observation is roughly right. Challenge the SEVERITY and the fix. Given the SOTA goal (web/iPad/mobile + touch, premium taste, stability, commercial product), is this really the stated severity, or over/under-rated? Is the fixSketch adequate or naive (hidden blast radius)? Set correctedSeverity accordingly.`
  return `You are an adversarial verifier in a read-only audit of Crafty (${SRC}). READ-ONLY: never edit files.
${lensBrief}

FINDING UNDER REVIEW (id ${f.id}, dimension ${f.dimension}):
- claim: ${f.claim}
- finder's reality verdict: ${f.reality}
- evidence cited: ${f.evidence}
- finder's severity: ${f.severity}
- finder's fixSketch: ${f.fixSketch}

Read the cited code (absolute paths under ${SRC}). Return verdict (upheld = finding stands; downgrade = real but milder/mis-stated; refuted = finding is wrong), a correctedSeverity, and concise reasoning citing what you actually read.`
}

const refuteResults = await parallel(
  toRefute.flatMap((f) => [
    () => agent(refutePrompt(f, 'code-trace'), { label: `refute:trace:${f.id}`, phase: 'Refute', schema: VERDICT_SCHEMA }).then((v) => ({ id: f.id, ...v })).catch(() => null),
    () => agent(refutePrompt(f, 'severity'), { label: `refute:sev:${f.id}`, phase: 'Refute', schema: VERDICT_SCHEMA }).then((v) => ({ id: f.id, ...v })).catch(() => null),
  ])
)

const byId = {}
refuteResults.filter(Boolean).forEach((v) => { (byId[v.id] = byId[v.id] || []).push(v) })
const verifiedFindings = allFindings.map((f) => {
  const vs = byId[f.id] || []
  if (!vs.length) return { ...f, refuteStatus: 'unrefuted', verifiedSeverity: f.severity }
  const trace = vs.find((v) => v.lens === 'code-trace')
  const sev = vs.find((v) => v.lens === 'severity-calibration') || vs.find((v) => v.verdict === 'downgrade')
  let status = 'upheld'
  if (trace && trace.verdict === 'refuted') status = 'refuted'
  else if (vs.some((v) => v.verdict === 'downgrade')) status = 'downgraded'
  const verifiedSeverity = status === 'refuted' ? 'info' : (sev?.correctedSeverity || f.severity)
  return { ...f, refuteStatus: status, verifiedSeverity, refutations: vs.map((v) => ({ lens: v.lens, verdict: v.verdict, sev: v.correctedSeverity, why: v.reasoning })) }
})

const upheld = verifiedFindings.filter((f) => f.refuteStatus !== 'refuted')
log(`Refutation done: ${verifiedFindings.length - upheld.length} findings refuted/dropped; ${upheld.length} stand.`)

// ---------- PHASE 4: SYNTHESIZE ----------
phase('Synthesize')
const orderedForReport = verifiedFindings.slice().sort((a, b) => sevRank[b.verifiedSeverity] - sevRank[a.verifiedSeverity])
const SYNTH_PROMPT = `You are the synthesis lead for Crafty's S0 reality audit. Write the honest "real vs Gemini-claimed" baseline document.

INPUTS:
- Dimension summaries: ${JSON.stringify(dimSummaries)}
- Live runtime capture: ${JSON.stringify(runtime)}
- All findings (already adversarially verified; each has verifiedSeverity + refuteStatus + refutations): ${JSON.stringify(orderedForReport)}
- Refute cap note: ${highSev.length > CAP ? `${highSev.length - CAP} high-severity findings were NOT independently refuted due to the ${CAP}-cap; flag them as 'unrefuted'.` : 'all high-severity findings were refuted-checked.'}

WRITE the file ${ROOT}/memory/REALITY-AUDIT-${DATE}.md (use the Write tool, absolute path) with these sections:
1. "## Executive Summary" — the honest bottom line in ~6-10 sentences. Lead with the blind-test-harness root cause (why every 'verified/100% green' claim is untrustworthy). State whether the game currently renders/runs at all (from runtime data) and the headline perf number.
2. "## Real-vs-Claimed Scorecard" — a markdown table: Dimension | Headline Claim | Reality (works/partial/broken/over-claimed) | Confidence | Note. One row per dimension (use the dimension summaries + findings).
3. "## Live Runtime Truth" — build status + time, bundle size, renderedOk, FPS avg/min, draw calls, heap start/end (leak signal), console/WebGL errors, and which screenshots exist (link the asset paths). If capture failed or was partial, say so plainly.
4. "## Prioritized Slop / Bug List" — findings grouped by verifiedSeverity (Critical, High, Medium, Low). For each: a one-line title, reality tag, evidence file:line, 1-line fixSketch, and refuteStatus (mark 'refuted' ones in a separate small 'Refuted / false-alarm' subsection so we don't chase them). Mark any 'unrefuted' high-severity items.
5. "## Design-Against Baseline (inputs to S1-S4)" — the 5-8 highest-leverage truths the redesign must build on: stabilization must-fixes, the architecture realities (god-files, vestigial ECS, store), the perf envelope reality, the touch/mobile gap, and the honest visual-quality read (this one feeds the art-direction stream — be specific about what looks generic vs what has potential).
6. "## Method & Caveats" — note this was static + live capture, read-only, adversarially verified (2-lens), and the refute cap if any.

Keep it dense, evidence-anchored, skimmable (tables + tight bullets). No hedging, no filler. This is the source-of-truth baseline the whole SOTA initiative designs against.

After writing the file, return a ~12-line executive summary (plain text) for the lead: the single most important truth, the count of Critical/High findings that stand, whether it renders + headline FPS, the worst over-claims, and the top 5 must-fix items by id.`

const summary = await agent(SYNTH_PROMPT, { label: 'synthesize', phase: 'Synthesize' })

const counts = upheld.reduce((acc, f) => { acc[f.verifiedSeverity] = (acc[f.verifiedSeverity] || 0) + 1; return acc }, {})
log(`S0 complete. Standing findings by severity: ${JSON.stringify(counts)}. Audit -> memory/REALITY-AUDIT-${DATE}.md`)

return {
  auditFile: `${ROOT}/memory/REALITY-AUDIT-${DATE}.md`,
  renders: runtime?.renderedOk,
  fpsAvg: runtime?.fpsAvg,
  buildStatus: runtime?.buildStatus,
  standingBySeverity: counts,
  totalFindings: allFindings.length,
  refuted: verifiedFindings.length - upheld.length,
  execSummary: summary,
}
