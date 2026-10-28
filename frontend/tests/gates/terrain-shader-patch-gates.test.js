import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { terrainMaterial } from '../../src/world/terrainMaterial.js';
import {
  BLOCK_LAYER_COUNT, TEXTURE_LAYER_COUNT, faceLayer, faceLayerTable, faceRoleOfNormal,
} from '../../src/world/materialGrammar.js';

/**
 * THE TERRAIN'S SHADER PATCH, RUN ON THREE'S OWN SOURCE. The terrain material's onBeforeCompile is handed what three
 * hands it for a MeshStandardMaterial (ShaderLib.physical: three 0.172 maps that type to 'physical',
 * WebGLPrograms.js:29), its output is expanded the way three's resolveIncludes expands it (WebGLProgram.js:259-290)
 * and stripped of comments, and the GLSL that results is read stage by stage.
 *
 * The face layer crosses three seams that the generator's own gates (material-grammar-gates) cannot see, and each one
 * left every unit test green when it broke:
 *   - both stages declare vTexLayer with one type and one interpolation qualifier (GLSL ES 3.00 refuses to link a
 *     mismatch, and every varying the patch adds is held to the same rule);
 *   - the vertex main() writes it, unconditionally, from the face table, which is executed here for every block and
 *     every axis normal;
 *   - the fragment's one texture-array sample reads a layer derived from vTexLayer alone, executed for every layer.
 *
 * NOT CHECKED HERE: that the GLSL compiles or links on a GPU (CI's prod-smoke links the shipped program), what colour
 * a face draws in the running world (the eye-level lookbook frames; registry REVIEW:w2k:no-running-world-check), or
 * WebKit (REVIEW:w2k:webkit-face-grammar).
 */

const INCLUDE = /^[ \t]*#include +<([\w\d./]+)>/gm; // three's own includePattern, WebGLProgram.js:259
const VARYING = /^[ \t]*((?:flat|smooth|noperspective)[ \t]+)?(?:centroid[ \t]+)?varying[ \t]+(?:(?:highp|mediump|lowp)[ \t]+)?(\w+)[ \t]+(\w+)[ \t]*;/gm;
const AXIS_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

function expand(src, count) {
  return src.replace(INCLUDE, (_, name) => {
    const chunk = THREE.ShaderChunk[name];
    if (chunk === undefined) throw new Error(`no shader chunk <${name}>`);
    count.n += 1;
    return expand(chunk, count);
  });
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** One stage: its comment-free code, the body of its main(), and everything outside main() (the global scope). */
function stage(src) {
  const count = { n: 0 };
  const code = stripComments(expand(src, count));
  const mains = [...code.matchAll(/\bvoid\s+main\s*\(\s*\)\s*\{/g)];
  if (mains.length !== 1) return { code, includes: count.n, mains: mains.length };
  const open = mains[0].index + mains[0][0].length - 1;
  let depth = 0;
  let close = -1;
  for (let i = open; i < code.length && close < 0; i++) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}' && --depth === 0) close = i;
  }
  return {
    code, includes: count.n, mains: 1,
    main: code.slice(open + 1, close),
    global: code.slice(0, mains[0].index) + code.slice(close + 1),
  };
}

function patchedStages(material) {
  const lib = THREE.ShaderLib.physical;
  const shader = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: THREE.UniformsUtils.clone(lib.uniforms) };
  material.onBeforeCompile(shader, null);
  return { vertex: stage(shader.vertexShader), fragment: stage(shader.fragmentShader) };
}

const varyings = (global) => [...global.matchAll(VARYING)].map((m) => ({ qualifier: (m[1] || 'smooth').trim(), type: m[2], name: m[3] }));

/** The arguments of the call whose '(' is at `open`, split at its own top-level commas. */
function callArgs(src, open) {
  const args = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth += 1;
    else if (c === ',' && depth === 1) { args.push(src.slice(start, i).trim()); start = i + 1; }
    else if (c === ')' && --depth === 0) { args.push(src.slice(start, i).trim()); return args; }
  }
  throw new Error('unbalanced call');
}

/** Identifiers an expression reads, leaving out member names (`.y`, `.r`). */
const identifiers = (expr) => [...new Set(expr.replace(/\.\s*[A-Za-z_]\w*/g, '').match(/[A-Za-z_]\w*/g) || [])];

/**
 * The statements main() runs before `at` to produce `expr`: each identifier the expression reads that is not in
 * `given` must be a local declared exactly once before `at`, never reassigned between its declaration and `at`, and
 * its own initialiser is resolved the same way. Returns the declarations in dependency order, or the identifier that
 * the check could not set (rule 12: a check sets every variable its assertion reads).
 */
function resolveLocals(body, expr, at, given) {
  const out = [];
  const visit = (e, before) => {
    for (const id of identifiers(e)) {
      if (given.has(id) || out.some((d) => d.name === id)) continue;
      const decl = [...body.slice(0, before).matchAll(new RegExp(`\\b(?:int|float)\\s+${id}\\s*=\\s*([^;]*);`, 'g'))];
      if (decl.length !== 1) return { unresolved: id, declarations: decl.length };
      const from = decl[0].index + decl[0][0].length;
      const writes = body.slice(from, at).match(new RegExp(`(?<![\\w.])${id}\\s*[-+*/]?=(?!=)`, 'g'));
      if (writes) return { unresolved: id, reassigned: writes.length };
      const inner = visit(decl[0][1], decl[0].index);
      if (inner) return inner;
      out.push({ name: id, init: decl[0][1] });
    }
    return null;
  };
  const failure = visit(expr, at);
  return failure || { declarations: out };
}

/** Runs resolved GLSL scalar statements as JS: int() truncates, float() is the identity, as GLSL defines them. */
function runGlsl(declarations, expr, inputs) {
  const names = Object.keys(inputs);
  const body = declarations.map((d) => `const ${d.name} = ${d.init};`).join('\n');
  const fn = new Function(...names, 'int', 'float', 'clamp', 'floor', `${body}\nreturn ${expr};`);
  return fn(...names.map((n) => inputs[n]), Math.trunc, (v) => v, (v, lo, hi) => Math.min(hi, Math.max(lo, v)), Math.floor);
}

/** Open preprocessor conditionals and braces at `at` within a main() body: both 0 means the statement always runs. */
function nesting(body, at) {
  const before = body.slice(0, at);
  const opens = (before.match(/^[ \t]*#if(?:def|ndef)?\b/gm) || []).length;
  const ends = (before.match(/^[ \t]*#endif\b/gm) || []).length;
  const braces = (before.match(/\{/g) || []).length - (before.match(/\}/g) || []).length;
  return { conditionals: opens - ends, braces };
}

const { vertex, fragment } = patchedStages(terrainMaterial);
const unpatched = { vertex: stage(THREE.ShaderLib.physical.vertexShader), fragment: stage(THREE.ShaderLib.physical.fragmentShader) };

describe('the terrain shader patch, run on three\'s standard-material source', () => {
  it('reads what three would compile: includes expanded, one main() per stage, and the patch is what adds the face layer', () => {
    expect(terrainMaterial).toBeInstanceOf(THREE.MeshStandardMaterial);
    // The face table reads color.r, which three declares only under USE_COLOR (WebGLProgram.js:715-717).
    expect(terrainMaterial.vertexColors, 'without vertexColors three declares no `color` attribute').toBe(true);
    for (const [name, s] of Object.entries({ vertex, fragment })) {
      expect(s.includes, `${name}: no #include was expanded`).toBeGreaterThan(10);
      expect(s.code, `${name}: an #include is left`).not.toMatch(/#include/);
      expect(s.mains, `${name}: main() count`).toBe(1);
    }
    expect(unpatched.vertex.code + unpatched.fragment.code, 'three\'s own source already names the face layer').not.toMatch(/vTexLayer|voxelTextures/);
    expect(vertex.code).toMatch(/\bvTexLayer\b/);
    expect(fragment.code).toMatch(/\bvTexLayer\b/);
    console.log(`[gate] terrain patch: ${vertex.includes} vertex and ${fragment.includes} fragment includes expanded`);
  });

  it('both stages declare vTexLayer once, at global scope, with the same type and interpolation qualifier', () => {
    const v = varyings(vertex.global).filter((d) => d.name === 'vTexLayer');
    const f = varyings(fragment.global).filter((d) => d.name === 'vTexLayer');
    expect(v.length, 'vertex declarations of vTexLayer').toBe(1);
    expect(f.length, 'fragment declarations of vTexLayer').toBe(1);
    expect(f[0].type).toBe(v[0].type);
    expect(f[0].qualifier, 'the stages declare vTexLayer with different interpolation: the program fails to link').toBe(v[0].qualifier);
  });

  it('every varying the patch adds is declared in the vertex stage alike wherever the fragment reads it', () => {
    const three = new Set([...varyings(unpatched.vertex.global), ...varyings(unpatched.fragment.global)].map((d) => d.name));
    const own = (s) => varyings(s.global).filter((d) => !three.has(d.name));
    const v = own(vertex);
    const f = own(fragment);
    let checked = 0;
    for (const d of f) {
      const match = v.filter((x) => x.name === d.name);
      expect(match.length, `${d.name}: the fragment declares it and the vertex stage declares it ${match.length} times`).toBe(1);
      expect(`${match[0].qualifier} ${match[0].type}`, `${d.name}: vertex and fragment disagree`).toBe(`${d.qualifier} ${d.type}`);
      checked++;
    }
    expect(f.map((d) => d.name)).toContain('vTexLayer');
    expect(checked, 'the patch\'s own varyings, checked in both stages').toBeGreaterThanOrEqual(6);
    console.log(`[gate] terrain patch: ${checked} varyings the patch adds, matched across the stages`);
  });

  it('the vertex main() writes vTexLayer once, unconditionally, and the write picks the face table\'s layer for every block and axis normal', () => {
    const table = vertex.global.match(/\bconst\s+float\s+FACE_LAYER\s*\[\s*(\d+)\s*\]\s*=\s*float\s*\[\s*\1\s*\]\s*\(([^)]*)\)\s*;/);
    expect(table, 'no FACE_LAYER table at the vertex stage\'s global scope').not.toBeNull();
    const FACE_LAYER = table[2].split(',').map(Number);
    expect(FACE_LAYER).toEqual([...faceLayerTable]);

    const writes = [...vertex.main.matchAll(/(?<![\w.])vTexLayer\s*=(?!=)/g)];
    expect(writes.length, 'writes of vTexLayer in the vertex main()').toBe(1);
    const at = writes[0].index;
    expect(nesting(vertex.main, at), 'the write sits inside a branch or a preprocessor conditional').toEqual({ conditionals: 0, braces: 0 });
    const end = vertex.main.indexOf(';', at);
    const rhs = vertex.main.slice(at, end).replace(/^vTexLayer\s*=/, '').trim();
    const given = new Set(['normal', 'color', 'FACE_LAYER', 'int', 'float', 'clamp']);
    const resolved = resolveLocals(vertex.main, rhs, at, given);
    expect(resolved.unresolved, `the write reads \`${resolved.unresolved}\`, which is neither a vertex input nor a local this check can run`).toBeUndefined();

    let checked = 0;
    for (let b = 0; b < BLOCK_LAYER_COUNT; b++) {
      for (const n of AXIS_NORMALS) {
        const got = runGlsl(resolved.declarations, rhs, { normal: { x: n[0], y: n[1], z: n[2] }, color: { r: b, g: 0, b: 0 }, FACE_LAYER });
        expect(got, `block ${b}, normal ${n}`).toBe(faceLayer(b, faceRoleOfNormal(n[1])));
        checked++;
      }
    }
    expect(checked).toBe(BLOCK_LAYER_COUNT * AXIS_NORMALS.length);
    console.log(`[gate] terrain patch: the vertex write run for ${checked} block and normal pairs`);
  });

  it('the fragment\'s one texture-array sample reads the layer vTexLayer carries, and nothing else', () => {
    const samples = [...fragment.main.matchAll(/\btexture\s*\(\s*voxelTextures\s*,/g)];
    expect(samples.length, 'samples of voxelTextures in the fragment main()').toBe(1);
    const at = samples[0].index;
    const args = callArgs(fragment.main, fragment.main.indexOf('(', at));
    expect(args.length).toBe(2);
    const coord = args[1].match(/^vec3\s*\(/);
    expect(coord, `the sample's coordinate is not a vec3(...): ${args[1]}`).not.toBeNull();
    const parts = callArgs(args[1], args[1].indexOf('('));
    expect(parts.length).toBe(3);
    const layer = parts[2];
    const resolved = resolveLocals(fragment.main, layer, at, new Set(['vTexLayer', 'floor', 'float', 'int']));
    expect(resolved.unresolved, `the sample's layer \`${layer}\` reads \`${resolved.unresolved}\`, not the face layer alone`).toBeUndefined();
    expect(identifiers([layer, ...resolved.declarations.map((d) => d.init)].join(' '))).toContain('vTexLayer');

    let checked = 0;
    for (let L = 0; L < TEXTURE_LAYER_COUNT; L++) {
      for (const drift of [0, 0.3, -0.3]) {
        expect(runGlsl(resolved.declarations, layer, { vTexLayer: L + drift }), `vTexLayer ${L + drift}`).toBe(L);
        checked++;
      }
    }
    expect(checked).toBe(TEXTURE_LAYER_COUNT * 3);
    console.log(`[gate] terrain patch: the sample's layer run for ${checked} values of vTexLayer`);
  });
});
