// _srcWalk.js — the one src/ enumerator the property gates share.
//
// Several gates were asserting "nothing ANYWHERE does X" while checking three or four files someone had
// hand-named. That is a scope-qualified claim: correct about the files listed, false as written, and the
// defect it is looking for lands in the file nobody listed. They now quantify over the real population,
// and a shared walker means they cannot drift apart in what "src/" means.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

export const SRC = resolve(process.cwd(), 'src');
export const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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
