#!/usr/bin/env node
/**
 * PROD SMOKE — load the artifact that actually ships.
 *
 * THE GAP THIS CLOSES. Every harness in this repo drives `vite` (the DEV server). `npm run build` runs in
 * CI and bundle-budget asserts the output's BYTES, but nothing has ever LOADED it. Vercel auto-deploys
 * that bundle on every push to main. So the coverage was: 100% of visual/e2e testing against a build that
 * never ships, and 0% against the one that does.
 *
 * Not hypothetical. Dev-only components behind `import.meta.env.DEV` cannot exist in production, so a
 * harness on the dev server can test surfaces that ship to nobody. And the failure class this repo keeps
 * shipping is precisely "compiles, gates green, never RUNS": four in one day on 2026-08-05. A production
 * bundle can be byte-perfect and still fail to boot — a DEV-only import tree-shaken to nothing, a
 * `import.meta.env` branch that only existed in dev, a minifier mangling a name something reflects on.
 *
 * DELIBERATELY A SMOKE TEST, NOT A VISUAL GATE. It asks questions the build cannot answer:
 * does it boot, does it render, does it log an error, is the GL context alive, does the block texture's
 * mip chain reach the GPU (mipVerdict), and does every shader program link (programVerdict). No baselines, so it cannot
 * rot and never needs re-approval. How the build looks is read by a person on the eye-level lookbook
 * (scripts/visual/lookbook.mjs), not here.
 *
 *   node scripts/ci/prod-smoke.mjs        (expects `npm run build` to have run first)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { serveVite } from '../visual/_serve.mjs';
import { LOOKBOOK_PLACES } from '../visual/_lookbook.mjs';
import { createProceduralVoxelTextures } from '../../src/world/proceduralTextures.js';
import { TERRAIN_SURFACE } from '../../src/world/terrainSurface.js';
import { OCEAN_SURFACE } from '../../src/render/oceanLook.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// A dedicated port outside _serve.mjs's probe table: e2e=4179, this=4180. Never an ad-hoc port: the one time a probe
// picked its own, it minted the worst crop of orphan cmux preview surfaces.
const PORT = 4180;

/**
 * THE GL ERROR LEDGER — the error class this gate exists to watch and structurally could not see.
 *
 * `.claude/rules/gates-and-probes.md` records that the production console carries
 * `GL_INVALID_OPERATION: glBlitFramebuffer` in two alternating forms, PER FRAME, until Chrome emits
 * "too many errors, no more errors will be reported to the context" and stops. Two consequences, and the
 * second is why a console scrape is the wrong instrument:
 *
 *   1. any console-message count is a FLOOR, not a count — the browser stops reporting;
 *   2. once muted, a genuine GL error later in that context is silenced too, so the noise disables the
 *      very channel this file's `page.on('console')` handler watches.
 *
 * `gl.getError()` is immune to both: it drains a queue on the context itself, with no console involved and
 * no muting. One call per frame, because reading DRAINS — a single poll at the end reports at most ONE
 * error for the whole run, which is how a count like this reads as clean.
 *
 * RATCHETED, NOT THRESHOLDED. Nobody knows the post-fix number, so the first run RECORDS and later runs
 * may FALL and never RISE — the same shape as the opsec and source-grep ledgers here. That
 * makes the number falsifiable without pretending to know it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THIS LEDGER CANNOT SETTLE, AND IT IS THE QUESTION IT WAS BUILT FOR
 *
 * CI's first seeded reading was `GL errors: 0 over 8 frames`. That is NOT evidence that the
 * `glBlitFramebuffer` storm is gone, and it must not be quoted as if it were.
 *
 * This probe launches with `--use-angle=swiftshader` — in CI exactly as locally. SwiftShader is a CPU
 * rasteriser: it reports MAX_SAMPLES 4, it does not implement the driver-side validation that emits
 * `GL_INVALID_OPERATION: glBlitFramebuffer: Read and write depth stencil attachments cannot be the same
 * image`, and the storm was only ever OBSERVED in a real Chrome on a real GPU. So a 0 here means "this
 * rasteriser raised nothing", which is the reading a driver that cannot raise it would always give.
 *
 * The ledger is therefore a REGRESSION GUARD FOR THE SWIFTSHADER PATH and nothing more. It will catch a
 * new GL error class that even SwiftShader validates; it cannot confirm the real-driver storm is fixed.
 * A real reading has to come from a real GPU — the operator's own Chrome, which is where the original
 * ~256-per-load observation came from (.claude/rules/gates-and-probes.md).
 *
 * This limit is stated here rather than discovered later because a ledger seeded at 0 reads like an
 * all-clear, and an all-clear from an instrument that cannot see the thing is the DEGRADED shape — the
 * most dangerous of the three, because it looks like success.
 */
export const GL_LEDGER_PATH = resolve(ROOT, 'tests/gates/.gl-error-ledger.json');

/** PURE: the verdict on a GL error count against the ledger, separated from I/O so a test can drive it. */
export function glVerdict(count, frames, ledger) {
  // R3a — zero frames means the poll never ran, and "0 errors over 0 frames" is the reading a dead
  // instrument gives. That is a control failure, not good news.
  if (!frames) {
    return { ok: false, control: true, line: 'GL errors: COULD NOT CHECK — polled over 0 frames; the instrument did not run.' };
  }
  const cap = ledger?.count;
  if (cap === undefined || cap === null) {
    return { ok: true, seed: true, line: `GL errors: ${count} over ${frames} frames — NO LEDGER YET, recording this as the ceiling. Re-freeze with --write-gl.` };
  }
  if (count > cap) {
    return {
      ok: false,
      line:
        `GL errors ROSE: ${count} over ${frames} frames, ceiling is ${cap}.\n` +
        '  A per-frame GL error is a real cost and it MUTES the console channel this gate watches for\n' +
        '  everything else. Find it before raising the ceiling; the ratchet may fall, never rise.',
    };
  }
  return { ok: true, line: `GL errors: ${count} over ${frames} frames (ceiling ${cap}${count < cap ? ' — FELL, re-freeze with --write-gl' : ''})` };
}

/** The seam methods the probes call (scripts/visual/lookbook.mjs, media.mjs and first-night.mjs). */
export const LOOKBOOK_SEAM_METHODS = Object.freeze(['clear', 'clearHostiles', 'dragon', 'form', 'frame', 'groundAt', 'handPose', 'info', 'look', 'mobs', 'night', 'passTimes', 'passesOff', 'play', 'pose', 'setCycle', 'stage', 'stand', 'unstage']);

/**
 * PURE: the verdict on the lookbook seam in the production bundle. The lookbook judges looks on this bundle, through
 * `window.__craftyLookbook` (src/render/lookbookSeam.js), and every unit test of the install imports the SOURCE, so
 * moving index.jsx's install behind `import.meta.env.DEV`, or deleting it, keeps them green while the build Vercel
 * ships loses the door. Each page reading says whether the entry module ran (window.useGameStore), so a page that
 * never booted cannot read as "absent". `opened.timer` is what one passTimes() call returned: the pass timer is a
 * chunk of its own loaded on that first call, so only calling it shows the production build can load it. It must
 * install; it need not time anything (SwiftShader may expose no timer extension).
 * @param {{plain: {entryRan: boolean, seam: string},
 *          opened: {entryRan: boolean, methods: string[]|null, timer: {installed: boolean, reason?: string}|null}}} r
 */
export function seamVerdict({ plain, opened }) {
  if (!plain?.entryRan || !opened?.entryRan) {
    return { ok: false, line: `lookbook seam: COULD NOT CHECK — the entry module never ran (${!plain?.entryRan ? 'plain page' : '?lookbook=1 page'})` };
  }
  if (plain.seam !== 'undefined') return { ok: false, line: `lookbook seam: installed WITHOUT ?lookbook=1 (typeof ${plain.seam}): every player carries it` };
  if (!Array.isArray(opened.methods)) return { ok: false, line: 'lookbook seam: MISSING from the production bundle with ?lookbook=1: the lookbook has no door into the shipped build' };
  const missing = LOOKBOOK_SEAM_METHODS.filter((m) => !opened.methods.includes(m));
  if (missing.length) return { ok: false, line: `lookbook seam: the production seam lacks ${missing.join(', ')}` };
  if (opened.timer?.installed !== true) {
    return { ok: false, line: `lookbook seam: passTimes() did not install the pass timer in the production bundle (${opened.timer?.reason || 'no report'}): the lookbook gets no GPU times` };
  }
  return { ok: true, line: `lookbook seam: installed with ?lookbook=1 (${opened.methods.length} methods, the pass timer loads), absent without it` };
}

/**
 * THE BLOCK TEXTURE'S MIP CHAIN, READ BACK FROM THE GPU (DECISIONS 2026-10-28 item 20).
 *
 * Every unit gate on the chain (tests/world/proceduralTextures.test.js, tests/gates/texture-mipmap-gates.test.js)
 * reads the JS object. Whether three uploads levels 1..5 is a property of three's upload path: r172 allocates
 * `texture.mipmaps.length` levels and fills each with one texSubImage3D only on the CompressedArrayTexture +
 * RGBAFormat branch (WebGLTextures.js getMipLevels and uploadTexture). A three upgrade that allocates the levels and
 * leaves them unfilled draws distant terrain from zeros with every unit gate green, so this reads the GPU.
 *
 * installArrayTextureRecorder runs before the page's own scripts and remembers each TEXTURE_2D_ARRAY that
 * texStorage3D allocates, with the texture bound at that moment; readBlockTextureArray finds the one with the block
 * stack's dimensions and reads back every layer of every level through a framebuffer, restoring the bindings it
 * touched, because three caches them. Both are serialized into the page (Playwright's addInitScript and evaluate), so
 * neither may reference anything outside its own body.
 */
export function installArrayTextureRecorder(proto = globalThis.WebGL2RenderingContext?.prototype, sink = globalThis) {
  if (!proto || typeof proto.texStorage3D !== 'function') return;
  const seen = (sink.__craftySmokeArrays = sink.__craftySmokeArrays || []);
  const texStorage3D = proto.texStorage3D;
  proto.texStorage3D = function recordTexStorage3D(target, levels, internalformat, width, height, depth) {
    if (target === this.TEXTURE_2D_ARRAY) {
      seen.push({ gl: this, texture: this.getParameter(this.TEXTURE_BINDING_2D_ARRAY), levels, width, height, depth });
    }
    return texStorage3D.call(this, target, levels, internalformat, width, height, depth);
  };
}

export function readBlockTextureArray({ size, layers }, seen = globalThis.__craftySmokeArrays || []) {
  const allocations = seen.map((r) => `${r.width}x${r.height}x${r.depth} (${r.levels} levels)`);
  const hits = seen.filter((r) => r.width === size && r.height === size && r.depth === layers);
  if (hits.length !== 1) return { found: hits.length, allocations };
  const { gl, texture } = hits[0];
  const boundTexture = gl.getParameter(gl.TEXTURE_BINDING_2D_ARRAY);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
  const immutableLevels = gl.getTexParameter(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_IMMUTABLE_LEVELS);
  const minFilter = gl.getTexParameter(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, boundTexture);
  const boundRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
  const levels = [];
  const unreadable = [];
  for (let level = 0; level < immutableLevels; level++) {
    const n = Math.max(1, size >> level);
    const bytes = new Uint8Array(n * n * 4 * layers);
    for (let layer = 0; layer < layers; layer++) {
      gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, texture, level, layer);
      const status = gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) { unreadable.push(`level ${level} layer ${layer}: status 0x${status.toString(16)}`); continue; }
      gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, bytes, layer * n * n * 4);
    }
    levels.push(Array.from(bytes));
  }
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, boundRead);
  gl.deleteFramebuffer(fb);
  return { found: 1, allocations, immutableLevels, minFilter, levels, unreadable };
}

/** GL minify filters that sample a mip chain (WebGL 2 enums); any other filter reads level 0 alone. */
const MIPMAP_MIN_FILTERS = new Map([
  [0x2700, 'NEAREST_MIPMAP_NEAREST'], [0x2701, 'LINEAR_MIPMAP_NEAREST'],
  [0x2702, 'NEAREST_MIPMAP_LINEAR'], [0x2703, 'LINEAR_MIPMAP_LINEAR'],
]);

/**
 * PURE: the verdict on a readBlockTextureArray reading. Fails unless the GPU holds a full chain (6 levels for 32 px
 * tiles, derived from the tile size so a chain cut short in the source fails too), samples it through a mipmap
 * minify filter, has every level filled in every layer whose level 0 is drawn, and holds exactly the bytes the
 * source builds. `expected` is { size, layers, chain }, the chain being createProceduralVoxelTextures().mipmaps.
 */
export function mipVerdict(reading, { size, layers, chain }) {
  const full = Math.log2(size) + 1;
  const dims = `${size}x${size}x${layers}`;
  const fail = (why, control = false) => ({ ok: false, control, line: `block texture mips: ${why}` });
  if (!reading || reading.found === 0) {
    const seen = reading?.allocations?.length ? reading.allocations.join(', ') : 'none';
    return fail(
      `COULD NOT CHECK — no ${dims} TEXTURE_2D_ARRAY was allocated by texStorage3D (arrays seen: ${seen}; spawn chunk loaded: ${reading?.worldBuilt ?? 'unknown'})`,
      true,
    );
  }
  if (reading.found > 1) return fail(`${reading.found} ${dims} arrays were allocated; cannot tell which is the block texture`, true);
  if (reading.immutableLevels !== full) return fail(`${reading.immutableLevels} level(s) on the GPU; a full chain for ${size} px tiles is ${full}`);
  if (!MIPMAP_MIN_FILTERS.has(reading.minFilter)) return fail(`the minify filter is 0x${Number(reading.minFilter).toString(16)}, which samples level 0 alone`);
  if (reading.unreadable?.length) return fail(`COULD NOT CHECK — ${reading.unreadable.length} level/layer images were unreadable (${reading.unreadable[0]})`, true);

  const layerOf = (bytes, n, layer) => bytes.slice(layer * n * n * 4, (layer + 1) * n * n * 4);
  const drawn = [];
  for (let layer = 0; layer < layers; layer++) if (layerOf(reading.levels[0], size, layer).some((b) => b !== 0)) drawn.push(layer);
  if (drawn.length === 0) return fail('COULD NOT CHECK — level 0 read back all zero, so an empty level would read the same', true);

  let bytes = 0;
  for (let level = 0; level < full; level++) {
    const n = Math.max(1, size >> level);
    const got = reading.levels[level];
    const want = chain[level]?.data;
    if (!got || got.length !== n * n * 4 * layers) return fail(`level ${level} read back ${got?.length ?? 0} bytes, expected ${n * n * 4 * layers}`);
    const empty = drawn.filter((layer) => !layerOf(got, n, layer).some((b) => b !== 0));
    if (empty.length) return fail(`level ${level} is EMPTY on the GPU in ${empty.length} of the ${drawn.length} drawn layers (${empty.join(', ')})`);
    let differ = 0;
    for (let i = 0; i < got.length; i++) if (!want || got[i] !== want[i]) differ++;
    if (differ) {
      return fail(`level ${level}: ${differ} of ${got.length} bytes on the GPU differ from the chain the source builds (a build/ older than the source reads this way: run npm run build)`);
    }
    bytes += got.length;
  }
  const filter = MIPMAP_MIN_FILTERS.get(reading.minFilter);
  return { ok: true, line: `block texture mips: ${full} levels on the GPU (${filter}), every level filled in all ${drawn.length} drawn layers, all ${bytes.toLocaleString('en-US')} bytes equal the chain the source builds` };
}

/**
 * EVERY SHADER PROGRAM LINKS. three reports a failed link with console.error, and the production build drops every
 * console call (vite.config.js `drop`), so the bundle Vercel ships can lose its sea with this file's console channel
 * silent. The context is asked instead: installProgramRecorder remembers every program linkProgram sees, and
 * readProgramLinks asks each one for LINK_STATUS. A program three deletes before the read is asked as it is deleted,
 * because a deleted program has no status. Both are serialized into the page, so neither may reference anything
 * outside its own body.
 *
 * A CANVAS THE PAGE DISCARDS. R3F unmounts a Canvas by calling forceContextLoss() 500 ms after the commit and only then
 * disposing the scene (@react-three/fiber 9.5 unmountComponentAtNode), so every status read on the title diorama's
 * programs after the title leaves returns null, and three's deleteProgram runs on the lost context. Whether the title
 * has gone by the read depends on how fast SwiftShader draws, which made "5 of 89 gave no LINK_STATUS" a flake. So the
 * recorder reads each program's status at its first useProgram (three has read it by then, so nothing new stalls) and
 * remembers each context the page loses through WEBGL_lose_context. A program on such a context keeps its first-use
 * status; one on a context lost any other way still reads as unread, and the verdict says so. A program that kept its
 * first-use status is never counted as drawn and its uniforms are not read: its context is gone, or was restored with
 * new programs (game/contextRecovery.js), and either way the old program answers nothing.
 *
 * The programs this repo patches are named by a line its patch adds (`mark`) and must be linked AND drawn, with the
 * uniforms their materials upload. The ocean draws only where water is within reach of the camera (render/Ocean.jsx,
 * world/oceanVisibility.js), and the spawn is inland, so the camera is posed at the lookbook's coast before the read.
 */
export const WATCHED_PROGRAMS = Object.freeze([
  // uKeyLight starts at zero (oceanLookUniforms); only the frame loop's writeOceanLight makes it non-zero.
  { name: 'ocean', mark: 'uniform vec3 uFoamColor;', uniforms: { uKeyLight: 'nonzero', roughness: OCEAN_SURFACE.roughness } },
  { name: 'terrain', mark: 'uniform sampler2DArray uOreGlowTex;', uniforms: { metalness: TERRAIN_SURFACE.metalness, roughness: TERRAIN_SURFACE.roughness } },
  { name: 'far ring', mark: 'texture(uLoadedMask,', uniforms: { metalness: TERRAIN_SURFACE.metalness } },
]);

/** Where the ocean is posed into view: the lookbook's coast hero shot. */
export const OCEAN_STAGE = LOOKBOOK_PLACES.find((p) => p.id === 'coast');

export function installProgramRecorder(watched = [], proto = globalThis.WebGL2RenderingContext?.prototype, sink = globalThis) {
  if (!proto || typeof proto.linkProgram !== 'function') return;
  const programs = (sink.__craftySmokePrograms = sink.__craftySmokePrograms || []);
  const shaderLogs = (sink.__craftySmokeShaderLogs = sink.__craftySmokeShaderLogs || new WeakMap());
  const discarded = (sink.__craftySmokeDiscarded = sink.__craftySmokeDiscarded || []);
  const sourceOf = new WeakMap();
  const shadersOf = new WeakMap();
  const entryOf = new WeakMap();
  const { shaderSource, attachShader, linkProgram, useProgram, deleteShader, deleteProgram, getExtension } = proto;
  if (typeof getExtension === 'function') {
    proto.getExtension = function recordGetExtension(name) {
      const ext = getExtension.call(this, name);
      if (ext && String(name).toLowerCase() === 'webgl_lose_context' && !ext.__craftySmokeWrapped) {
        const gl = this;
        const loseContext = ext.loseContext;
        ext.loseContext = function recordLoseContext() {
          if (!discarded.includes(gl)) discarded.push(gl);
          return loseContext.call(this);
        };
        ext.__craftySmokeWrapped = true;
      }
      return ext;
    };
  }
  proto.shaderSource = function recordShaderSource(shader, source) {
    sourceOf.set(shader, String(source));
    return shaderSource.call(this, shader, source);
  };
  proto.attachShader = function recordAttachShader(program, shader) {
    shadersOf.set(program, [...(shadersOf.get(program) || []), shader]);
    return attachShader.call(this, program, shader);
  };
  proto.linkProgram = function recordLinkProgram(program) {
    const shaders = shadersOf.get(program) || [];
    const texts = shaders.map((s) => sourceOf.get(s) || '');
    const hits = watched.filter((w) => texts.some((t) => t.includes(w.mark))).map((w) => w.name);
    const entry = { gl: this, program, shaders, hits, used: false, deleted: null };
    programs.push(entry);
    entryOf.set(program, entry);
    return linkProgram.call(this, program);
  };
  proto.useProgram = function recordUseProgram(program) {
    const entry = program && entryOf.get(program);
    if (entry && !entry.used) {
      entry.used = true;
      entry.atUse = this.getProgramParameter(program, this.LINK_STATUS);
    }
    return useProgram.call(this, program);
  };
  // three deletes both shaders on a program's first use (WebGLProgram.js onFirstUse), and a deleted shader has no log.
  proto.deleteShader = function recordDeleteShader(shader) {
    if (shader && !shaderLogs.has(shader)) shaderLogs.set(shader, String(this.getShaderInfoLog(shader) || ''));
    return deleteShader.call(this, shader);
  };
  proto.deleteProgram = function recordDeleteProgram(program) {
    const entry = program && entryOf.get(program);
    if (entry && !entry.deleted) {
      entry.deleted = { linked: this.getProgramParameter(program, this.LINK_STATUS), log: String(this.getProgramInfoLog(program) || '') };
    }
    return deleteProgram.call(this, program);
  };
}

export function readProgramLinks(watched = [], sink = globalThis) {
  const logs = sink.__craftySmokeShaderLogs;
  const discarded = sink.__craftySmokeDiscarded || [];
  const known = (s) => s === true || s === false;
  return (sink.__craftySmokePrograms || []).map((e) => {
    const { gl } = e;
    const live = e.deleted ? e.deleted.linked : gl.getProgramParameter(e.program, gl.LINK_STATUS);
    const retired = !known(live) && discarded.includes(gl);
    const status = known(live) ? live : retired && known(e.atUse) ? e.atUse : null;
    const out = { hits: e.hits, used: e.used, deleted: !!e.deleted, retired, linked: status };
    if (out.linked === false) {
      const shaderLog = e.shaders.map((s) => (logs && logs.has(s) ? logs.get(s) : gl.isShader(s) ? String(gl.getShaderInfoLog(s) || '') : ''));
      const programLog = e.deleted ? e.deleted.log : String(gl.getProgramInfoLog(e.program) || '');
      out.log = [...shaderLog, programLog].filter(Boolean).join(' | ').replace(/\s+/g, ' ').trim().slice(0, 400);
    }
    if (out.linked === true && out.used && !out.deleted && !retired) {
      out.uniforms = {};
      for (const w of watched) {
        if (!e.hits.includes(w.name)) continue;
        for (const name of Object.keys(w.uniforms || {})) {
          const at = gl.getUniformLocation(e.program, name);
          const v = at === null ? null : gl.getUniform(e.program, at);
          out.uniforms[name] = v === null || v === undefined ? null : typeof v === 'number' ? [v] : Array.from(v);
        }
      }
    }
    return out;
  });
}

const UNIFORM_TOLERANCE = 1e-4; // float32 holds 0.85 as 0.8500000238

/** PURE: the verdict on a readProgramLinks reading. */
export function programVerdict(readings, watched = WATCHED_PROGRAMS) {
  const fail = (why, control = false) => ({ ok: false, control, line: `shader programs: ${why}` });
  if (!Array.isArray(readings) || readings.length === 0) return fail('COULD NOT CHECK — the recorder saw no program linked', true);
  const n = readings.length;
  const failed = readings.filter((r) => r.linked === false);
  if (failed.length) {
    const names = failed.map((r) => (r.hits.length ? r.hits.join('+') : 'unwatched')).join(', ');
    return fail(`${failed.length} of ${n} FAILED to link (${names}): ${failed[0].log || 'no info log'}`);
  }
  const unread = readings.filter((r) => r.linked !== true && !r.retired).length;
  if (unread) return fail(`COULD NOT CHECK — ${unread} of ${n} gave no LINK_STATUS (a context lost without the page asking reads this way)`, true);
  const drawnCounts = [];
  for (const w of watched) {
    const mine = readings.filter((r) => r.hits.includes(w.name));
    if (!mine.length) return fail(`COULD NOT CHECK the ${w.name} — no program carrying \`${w.mark}\` was linked`, true);
    const drawn = mine.filter((r) => r.used && !r.deleted && !r.retired);
    if (!drawn.length) return fail(`COULD NOT CHECK the ${w.name} — ${mine.length} program(s) linked, none drawn in a live context`, true);
    for (const r of drawn) {
      for (const [name, want] of Object.entries(w.uniforms || {})) {
        const got = r.uniforms?.[name];
        if (!Array.isArray(got) || got.length === 0) return fail(`the ${w.name} program has no readable uniform ${name}`);
        const ok = want === 'nonzero' ? got.some((x) => x !== 0) : got.every((x) => Math.abs(x - want) <= UNIFORM_TOLERANCE);
        if (!ok) return fail(`the ${w.name} program's ${name} is [${got.map((x) => +x.toFixed(4)).join(', ')}], expected ${want === 'nonzero' ? 'non-zero' : want}`);
      }
    }
    drawnCounts.push(`${w.name} x${drawn.length}`);
  }
  const deleted = readings.filter((r) => r.deleted).length;
  const retiredLinked = readings.filter((r) => r.retired && r.linked === true).length;
  const retiredUnread = readings.filter((r) => r.retired && r.linked !== true).length;
  const linked = retiredUnread ? `${n - retiredUnread} of ${n} linked, ${retiredUnread} never drawn before the page discarded its canvas` : `all ${n} linked`;
  const notes = [`${deleted} deleted before the read`, ...(retiredLinked ? [`${retiredLinked} read at first use on a canvas the page discarded`] : [])];
  return { ok: true, line: `shader programs: ${linked} (${notes.join('; ')}); drawn with their uniforms: ${drawnCounts.join(', ')}` };
}

/**
 * THE POST CHAIN THE SHIPPED BUNDLE RENDERS (DECISIONS 2026-10-28 item 29). The pass timer lists the chain of the
 * composer that last rendered, with or without a timer extension (src/render/passTimer.js `chain`), so this reads the
 * composer the production build actually built, on the game canvas, after play began: postprocessing's own effect
 * names, which survive the minifier. `present` is the presence half: a chain the reader cannot see (no composer, a
 * renamed effect) fails as COULD NOT CHECK instead of passing the absence half on nothing. `tier` is the quality tier
 * the chain was read at: a pass can be mounted at some tiers only, and `high` mounts every tier-gated one, so the
 * absence half is checked at `high` or not at all.
 */
export const CHAIN_PRESENT = Object.freeze(['RenderPass', 'BloomEffect', 'SMAAEffect', 'ToneMappingEffect']);
// N8AO was deleted on its measured GPU cost; render/passTimer.js labels a pass of its shape `N8AO` whatever
// imports it, so its return to the chain is named here.
export const CHAIN_ABSENT = Object.freeze(['N8AO']);

/** PURE: the verdict on the largest canvas's chain out of a passTimes() report. */
export function chainVerdict(report, { present = CHAIN_PRESENT, absent = CHAIN_ABSENT, tier } = {}) {
  const fail = (why, control = false) => ({ ok: false, control, line: `post chain: ${why}` });
  if (tier !== 'high') return fail(`COULD NOT CHECK — read at tier ${tier}, not high: a pass mounted at higher tiers only is not in it`, true);
  const area = (c) => (Array.isArray(c) ? c[0] * c[1] : 0);
  const ctx = [...(report?.contexts || [])].filter((c) => Array.isArray(c.chain)).sort((a, b) => area(b.canvas) - area(a.canvas))[0];
  if (!ctx) return fail('COULD NOT CHECK — no composer reported a chain', true);
  const labels = ctx.chain.map((p) => p.label);
  const has = (name) => labels.some((l) => new RegExp(`(^\\d+:|[(+])${name}([)+]|$)`).test(l));
  const missing = present.filter((n) => !has(n));
  if (missing.length) return fail(`COULD NOT CHECK — the chain [${labels.join(', ')}] lacks ${missing.join(', ')}`, true);
  const back = absent.filter(has);
  if (back.length) return fail(`${back.join(', ')} is back in the chain the shipped bundle renders: [${labels.join(', ')}]`);
  return { ok: true, line: `post chain at tier high: [${labels.join(', ')}]${absent.length ? `; none of ${absent.join(', ')}` : ''}` };
}

/** PURE: is this console/page message worth failing over? */
export function isFatalMessage(text) {
  if (!text) return false;
  // React dev warnings cannot appear in a production build, so anything here is real. The two exclusions
  // are environment noise with no bearing on whether the app runs.
  // NARROW on purpose. `favicon` alone once excluded "TypeError: cannot read favicon of undefined in
  // renderer boot" — a real error swallowed by a loose pattern, caught by this file's own gate. Each
  // exclusion now matches the full noise string, not a word that can appear inside a real failure.
  if (/favicon\.ico|ERR_CONNECTION_REFUSED|Download the React DevTools/i.test(text)) return false;
  // Pointer Lock without a user gesture. MEASURED, not assumed: the title screen auto-advances into
  // gameplay, and gameplay requests pointer lock. A real visitor gets there by clicking START ADVENTURE,
  // which IS a gesture; a headless page has no way to produce one, so this fires in the harness and
  // cannot fire for a user arriving the normal way. Excluded because it is an artifact of the probe, not
  // of the bundle. (That the app leaves it UNCAUGHT is a real if minor robustness gap — tracked
  // separately; it is not something this smoke test can distinguish.)
  if (/user gesture is required to request Pointer Lock/i.test(text)) return false;
  return true;
}

if (import.meta.main) {
  const dist = resolve(ROOT, 'build');
  if (!existsSync(dist)) {
    console.error('✖ prod-smoke: build/ does not exist — run `npm run build` first');
    process.exit(1);
  }

  const { url, waitReady, shutdown } = serveVite(PORT, { cwd: ROOT, preview: true });
  let browser = null;
  const errors = [];
  let code = 0;

  try {
    await waitReady();
    // `channel: 'chromium'` is Chromium's new headless mode, the full browser; plain `headless: true` would run the
    // separate chromium-headless-shell build (playwright-core 1.64.1 getExecutableName). Playwright adds --no-sandbox
    // and --enable-unsafe-swiftshader itself; SwiftShader is asked for so the reading is the same CPU rasteriser on a
    // laptop and on a runner with no GPU.
    browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--use-angle=swiftshader'] });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e && e.message ? e.message : e}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && isFatalMessage(m.text())) errors.push(`console.error: ${m.text()}`);
    });
    await page.addInitScript(installArrayTextureRecorder);
    await page.addInitScript(installProgramRecorder, WATCHED_PROGRAMS);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 1. DID IT BOOT? The dev test-bridge is stripped in production, so this deliberately asks for a
    //    user-visible surface instead — exactly what a real visitor gets. `attached`: mounted in the DOM is the boot
    //    question; Playwright's default state would add a visibility test the render check below already answers.
    await page.waitForSelector('canvas, [data-testid="title-diorama"]', { state: 'attached', timeout: 45000 });

    // 2. DOES IT RENDER? A mounted canvas that never presents is the blank-frame failure the capture
    //    preflight exists for; a production bundle that boots and draws nothing looks identical to
    //    "loaded fine" from the outside.
    // FOUR seconds, and the bar is ONE frame. Measured on this machine: the bundle renders at 1-3 rAF
    // per second under the SwiftShader CPU rasteriser, so a 1.5s window legitimately catches zero and the
    // first version of this check reported a false failure against a bundle that was rendering the whole
    // game correctly. The bar stays at one frame deliberately — the same bar assertBrowserProducesFrames
    // uses — because the question is "does it render at all", not "how fast". A performance budget is a
    // different instrument with a different failure mode.
    const frames = await page.evaluate(
      () => new Promise((res) => {
        let n = 0;
        const stop = Date.now() + 4000;
        const tick = () => { n++; if (Date.now() < stop) requestAnimationFrame(tick); else res(n); };
        requestAnimationFrame(tick);
        setTimeout(() => res(n), 5000); // always resolves, even if rAF never fires
      })
    );
    if (frames === 0) errors.push('the production bundle rendered ZERO frames in 4s — it boots but does not draw');

    // 3. IS THE GL CONTEXT ALIVE? A lost context draws nothing while the DOM looks perfectly healthy.
    const lost = await page.evaluate(() =>
      [...document.querySelectorAll('canvas')].filter((c) => {
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        return gl && gl.isContextLost();
      }).length
    );
    if (lost > 0) errors.push(`${lost} canvas/canvases have a LOST WebGL context`);

    console.log(`prod-smoke: booted, ${frames} frames in 4s, ${lost} lost context(s)`);

    // GL ERROR POLL — see the GL_LEDGER docblock above for why this, and not the console handler.
    const gl = await page.evaluate(
      () => new Promise((res) => {
        const c = document.querySelector('canvas');
        const ctx = c && (c.getContext('webgl2') || c.getContext('webgl'));
        if (!ctx) return res({ count: 0, frames: 0, codes: [] });
        let count = 0, n = 0;
        const codes = new Set();
        const stop = Date.now() + 3000;
        const tick = () => {
          n++;
          let e;
          // Drain EVERY error this frame: getError pops one per call, so a single read per frame would
          // undercount a storm by exactly the factor that makes a storm a storm.
          while ((e = ctx.getError()) !== ctx.NO_ERROR) { count++; codes.add(e); }
          if (Date.now() < stop) requestAnimationFrame(tick);
          else res({ count, frames: n, codes: [...codes] });
        };
        requestAnimationFrame(tick);
        setTimeout(() => res({ count, frames: n, codes: [...codes] }), 4000); // always resolves
      })
    );
    let glLedger = null;
    try { glLedger = JSON.parse(readFileSync(GL_LEDGER_PATH, 'utf8')); } catch { /* absent -> seed */ }
    const gv = glVerdict(gl.count, gl.frames, glLedger);
    console.log(`prod-smoke: ${gv.line}${gl.codes.length ? `  codes=[${gl.codes.join(',')}]` : ''}`);
    if (!gv.ok) errors.push(gv.line.split('\n')[0]);
    if (process.argv.includes('--write-gl')) {
      writeFileSync(GL_LEDGER_PATH, `${JSON.stringify({ count: gl.count, frames: gl.frames, at: new Date().toISOString() }, null, 2)}\n`);
      console.log(`prod-smoke: froze the GL ceiling at ${gl.count}`);
    }

    // THE BLOCK TEXTURE'S MIP CHAIN — see mipVerdict. After the GL poll, so the readback cannot add to its count. The
    // texture is uploaded when the first terrain chunk draws, which waits on the world build; the wait's timeout is
    // not a verdict, the reading below is, and it names whether the spawn chunk ever loaded.
    const blockTexture = createProceduralVoxelTextures();
    const expectedMips = { size: blockTexture.image.width, layers: blockTexture.image.depth, chain: blockTexture.mipmaps };
    const dims = { size: expectedMips.size, layers: expectedMips.layers };
    await page.waitForFunction(
      ({ size, layers }) => (globalThis.__craftySmokeArrays || []).some((r) => r.width === size && r.height === size && r.depth === layers),
      dims,
      { polling: 500, timeout: 90000 },
    ).catch(() => {});
    const mipReading = await page.evaluate(readBlockTextureArray, dims);
    mipReading.worldBuilt = await page.evaluate(() => window.useGameStore?.getState?.().isSpawnChunkLoaded === true);
    const mv = mipVerdict(mipReading, expectedMips);
    console.log(`prod-smoke: ${mv.line}`);
    if (!mv.ok) errors.push(mv.line);

    // SETTINGS PERSISTENCE — a PRODUCTION-ONLY defect, which is why it belongs here and nowhere else.
    // `initSettingsPersistence` used to be the last statement of the DEV-only test-bridge effect, behind
    // `if (!import.meta.env.DEV) return;`. So in the build Vercel ships, settings never hydrated and never
    // persisted — while the dev server, the capture harness and the e2e suite all run with DEV true and
    // saw it working. No unit test can see this: the difference IS the build.
    const persistence = await page.evaluate(async () => {
      const KEY = 'crafty_settings';
      if (typeof window.useGameStore !== 'function') return { ok: false, why: 'no window.useGameStore in the prod bundle' };
      try { localStorage.removeItem(KEY); } catch { return { ok: false, why: 'localStorage unavailable' }; }
      const before = localStorage.getItem(KEY);
      // Drive a real, player-editable setting through the real store, as the Settings panel does.
      const start = window.useGameStore.getState().sfxVolume;
      const next = start === 0.42 ? 0.24 : 0.42;
      window.useGameStore.getState().setSfxVolume?.(next);
      await new Promise((r) => setTimeout(r, 400)); // the subscriber writes on change
      const after = localStorage.getItem(KEY);
      return { ok: true, before, after, next, wrote: after !== null };
    });

    if (!persistence.ok) {
      errors.push(`settings persistence unverifiable: ${persistence.why}`);
    } else if (persistence.before !== null) {
      // Instrument check: the key must start absent or the "it appeared" reading is meaningless.
      errors.push('settings key was already present before the write — the round-trip proves nothing');
    } else if (!persistence.wrote) {
      errors.push(
        'changing a setting wrote NOTHING to localStorage in the production bundle — ' +
          'settings do not persist for real players'
      );
    } else {
      console.log(`prod-smoke: settings persisted in prod (sfxVolume -> ${persistence.next})`);
    }

    // THE LOOKBOOK SEAM — see seamVerdict. Absent on this page (opened without the parameter), present on a fresh
    // load with it.
    const plain = await page.evaluate(() => ({ entryRan: typeof window.useGameStore === 'function', seam: typeof window.__craftyLookbook }));
    await page.goto(`${url}/?lookbook=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof window.useGameStore === 'function', null, { timeout: 45000 }).catch(() => {});
    const opened = await page.evaluate(async () => {
      const s = window.__craftyLookbook;
      let timer = null;
      if (s && typeof s.passTimes === 'function') {
        try {
          const r = await s.passTimes();
          timer = { installed: r?.installed === true, reason: r?.reason ?? null };
        } catch (e) {
          timer = { installed: false, reason: `passTimes threw: ${String((e && e.message) || e).split('\n')[0]}` };
        }
      }
      return {
        entryRan: typeof window.useGameStore === 'function',
        methods: s ? Object.keys(s).filter((k) => typeof s[k] === 'function').sort() : null,
        timer,
      };
    });
    const sv = seamVerdict({ plain, opened });
    console.log(`prod-smoke: ${sv.line}`);
    if (!sv.ok) errors.push(sv.line);

    // EVERY SHADER PROGRAM LINKS — see programVerdict. Noon, so the key light the ocean's glint reads is the sun.
    const worldBuilt = await page.waitForFunction(() => window.__craftyLookbook?.info?.().worldBuilt === true, null, { polling: 1000, timeout: 90000 })
      .then(() => true, () => false);
    const staged = await page.evaluate((at) => {
      const s = window.__craftyLookbook;
      if (!s) return 'no lookbook seam';
      try { s.play(); s.pose(at); s.setCycle(0.25); return 'posed at the coast'; } catch (e) { return `pose threw: ${String((e && e.message) || e)}`; }
    }, { position: OCEAN_STAGE.position, lookAt: OCEAN_STAGE.lookAt });
    await page.waitForFunction(
      (name) => (globalThis.__craftySmokePrograms || []).some((r) => r.used && r.hits.includes(name)),
      WATCHED_PROGRAMS[0].name,
      { polling: 500, timeout: 60000 },
    ).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000)); // a few SwiftShader frames at ~1 fps, so the uniforms are this hour's
    const links = await page.evaluate(readProgramLinks, WATCHED_PROGRAMS);
    const eye = await page.evaluate(() => window.__craftyLookbook?.info?.().eye ?? null);
    const pv = programVerdict(links, WATCHED_PROGRAMS);
    console.log(`prod-smoke: ${pv.line}`);
    if (!pv.ok) errors.push(pv.control ? `${pv.line} (world built: ${worldBuilt}; ${staged}; eye ${JSON.stringify(eye)})` : pv.line);

    // THE POST CHAIN — see chainVerdict. The tier goes to high first, which mounts every tier-gated pass, and a few
    // frames render in it (SwiftShader draws about one a second). A tier step mounts a fresh performance monitor whose
    // first decision window (at least 2.5 s) the governor ignores (render/tierGovernor.js rule 4), so the read lands
    // before it can step down; the read records the tier it saw either way.
    await page.evaluate(() => window.useGameStore.getState().setQualityTier('high'));
    await new Promise((r) => setTimeout(r, 3000));
    const chainRead = await page.evaluate(async () => {
      const tier = window.__craftyLookbook?.info?.().tier ?? null;
      try { return { tier, report: await window.__craftyLookbook.passTimes() }; } catch (e) { return { tier, report: { contexts: [], error: String((e && e.message) || e) } }; }
    });
    const cv = chainVerdict(chainRead.report, { tier: chainRead.tier });
    console.log(`prod-smoke: ${cv.line}`);
    if (!cv.ok) errors.push(cv.control ? `${cv.line} (world built: ${worldBuilt}; ${staged})` : cv.line);
  } catch (e) {
    errors.push(`threw: ${e && e.message ? e.message : e}`);
  } finally {
    await shutdown(browser);
  }

  if (errors.length) {
    console.error(`\n✖ prod-smoke: the PRODUCTION bundle failed to run cleanly (${errors.length} problem(s))\n`);
    for (const e of errors) console.error(`  • ${e}`);
    console.error(
      '\n  This is the artifact Vercel deploys on every push. `npm run build` passing means it COMPILED;\n' +
        '  this is the only check that it RUNS. Reproduce locally with:\n' +
        '    npm run build && npx vite preview --port 4180 --strictPort\n'
    );
    code = 1;
  } else {
    console.log('✓ prod-smoke: the production bundle boots, renders, and logs no errors');
  }
  process.exit(code);
}
