// _srcWalk.js — the one src/ enumerator the property gates share.
//
// Several gates were asserting "nothing ANYWHERE does X" while checking three or four files someone had
// hand-named. That is a scope-qualified claim: correct about the files listed, false as written, and the
// defect it is looking for lands in the file nobody listed. They now quantify over the real population,
// and a shared walker means they cannot drift apart in what "src/" means.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

export const SRC = resolve(process.cwd(), 'src');
/**
 * Remove comments before asserting a file DOES something.
 *
 * TRAILING COMMENTS COUNT, and the first version of this missed them. It stripped block comments and
 * FULL-LINE `//` comments only, so `const speed = 1.0; // spilled like confetti` survived intact —
 * found 2026-09-22 when a repo-wide brand scan flagged `systems/CombatSystem.jsx` for the word
 * `confetti` appearing in two comments, one of them trailing. Every gate sharing this helper had the
 * same hole: a gate satisfied by the prose documenting the thing it forbids is this corpus's
 * most-repeated defect, and half of it was still open here.
 *
 * `://` is excluded so a URL in code is not truncated, and a leading-whitespace requirement keeps the
 * pattern off `//` inside a string like 'https://x'. This is a lexical approximation, not a parser: a
 * `//` inside a template literal or a regex literal can still be clipped. That is acceptable for gates
 * that ask "does this file DO X" and would not be for a transform that rewrites code.
 */
export const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Every non-test .js/.jsx under src/, absolute. */
export function sourceFiles(dir = SRC, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.jsx?$/.test(e) && !/\.test\.jsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Repo-relative paths whose CODE (comments stripped) matches `re`. */
export function carriersOf(re, files = sourceFiles()) {
  return files.filter((f) => re.test(strip(readFileSync(f, 'utf8')))).map((f) => f.slice(SRC.length + 1));
}
