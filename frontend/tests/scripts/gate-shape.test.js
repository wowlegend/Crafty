import { describe, it, expect } from 'vitest';
import { collectAssertions, commentOnlyHits, blankComments, parseJs, resolveTarget } from '../../scripts/ci/gate-shape.mjs';

/**
 * gate-shape's collector must see every FORM a presence assertion takes, and honour polarity (QUEUE G1).
 *
 * The detector parsed one form — `expect(x).toMatch(/re/)` — while the corpus uses four. The second,
 * `expect(/re/.test(src)).toBe(true)`, is exactly how `siege-gates` asserted a call into a file where it
 * appeared only in the comment documenting its removal, while gate-shape reported the corpus clean.
 *
 * Planting that shape against a real comment-only token then exposed a SECOND blind spot in the original
 * detector: a gate reading `resolve(__dirname, '../../src/...')` resolved to no target and was skipped
 * silently, so every form — `toMatch` included — reported zero findings. Both are pinned here.
 *
 * Sited in tests/scripts/: the subject is a CI script, driven through its exported seam.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh against scripts/ci/gate-shape.mjs, each observed RED:
 *   M1 drop the re.test form (`method === 'test' && recv?.type === 'RegExpLiteral'` -> false)
 *   M2 drop the includes form; M3 drop the toContain form
 *   M4 plausible-wrong: treat toBe(false) as positive (drop the `arg0.value === true` check)
 *   M5 plausible-wrong: ignore `.not.` (drop the isNegated early return)
 *   M6 drop the gates-dir-relative resolver candidate
 *   M7 plausible-wrong: commentOnly when ANY target is comment-only instead of NONE matches in code
 *
 * BLIND SPOT: a regex held in a variable is counted as unchecked, not verified; a gate reading a non-JS
 * file (index.html, CSS) resolves no target and is counted as NOT CHECKED.
 */
const TARGET_RAW = [
  '// incrementNight() was removed in the siege rework; the night counter now lives in the store.',
  'export function tick(state) {',
  '  return state.day + 1;',
  '}',
].join('\n');
const TARGET = { rel: 'fixture.js', raw: TARGET_RAW, blanked: blankComments(TARGET_RAW) };

const collect = (body) => collectAssertions(parseJs(`it('x', () => { ${body} });`));

describe('collectAssertions — every positive presence form', () => {
  const cases = [
    ['toMatch', "expect(src).toMatch(/incrementNight\\(/);"],
    ['re.test', 'expect(/incrementNight\\(/.test(src)).toBe(true);'],
    ['re.test', 'expect(/incrementNight\\(/.test(src)).toBeTruthy();'],
    ['includes', "expect(src.includes('incrementNight(')).toBe(true);"],
    ['toContain', "expect(src).toContain('incrementNight(');"],
  ];
  for (const [form, body] of cases) {
    it(`${form}: ${body} is collected AND convicted as comment-only`, () => {
      const { patterns } = collect(body);
      expect(patterns.map((p) => p.form)).toEqual([form]);
      expect(commentOnlyHits(patterns[0], [TARGET]).commentOnly).toBe(true);
    });
  }

  it('a token present in CODE is collected and NOT convicted (the negative control)', () => {
    const { patterns } = collect('expect(/state\\.day \\+ 1/.test(src)).toBe(true);');
    expect(patterns).toHaveLength(1);
    expect(commentOnlyHits(patterns[0], [TARGET]).commentOnly).toBe(false);
  });
});

describe('collectAssertions — absence assertions are never read as presence', () => {
  for (const body of [
    'expect(src).not.toMatch(/incrementNight\\(/);',
    'expect(/incrementNight\\(/.test(src)).toBe(false);',
    'expect(/incrementNight\\(/.test(src)).toBeFalsy();',
    'expect(/incrementNight\\(/.test(src)).not.toBe(true);',
    "expect(src).not.toContain('incrementNight(');",
    "expect(src.includes('incrementNight(')).toBe(false);",
  ]) {
    it(body, () => expect(collect(body).patterns).toEqual([]));
  }

  it('a regex in a variable is COUNTED as unchecked, not dropped', () => {
    const r = collect('const RE = /incrementNight/; expect(RE.test(src)).toBe(true);');
    expect(r.patterns).toEqual([]);
    expect(r.unchecked).toBe(1);
  });
});

describe('commentOnlyHits — a multi-target verdict needs NO code hit anywhere', () => {
  it('comment-only in one file but in code in another: not convicted', () => {
    const other = { rel: 'b.js', raw: 'incrementNight();', blanked: 'incrementNight();' };
    const [p] = collect('expect(/incrementNight\\(/.test(src)).toBe(true);').patterns;
    expect(commentOnlyHits(p, [TARGET, other]).commentOnly).toBe(false);
  });
});

describe('resolveTarget — the path shapes gates actually write', () => {
  it('resolves src-relative, app-relative and gates-dir-relative spellings of the same real file', () => {
    expect(resolveTarget('world/mesher.js')).toBe('src/world/mesher.js');
    expect(resolveTarget('src/world/mesher.js')).toBe('src/world/mesher.js');
    expect(resolveTarget('../../src/world/mesher.js')).toBe('src/world/mesher.js');
  });

  it('refuses what does not exist and what is not JS — existence decides, never shape', () => {
    expect(resolveTarget('world/no-such-file.js')).toBe(null);
    expect(resolveTarget('../../index.html')).toBe(null);
  });
});
