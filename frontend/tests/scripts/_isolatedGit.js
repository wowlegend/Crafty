// A FIXTURE REPO'S GIT MUST NEVER SEE THE CALLER'S REPOSITORY.
//
// Git exports GIT_DIR, GIT_INDEX_FILE and friends to every hook it runs, and the pre-commit hook runs this suite. In
// the main checkout GIT_DIR is the relative `.git`, which a child running inside a throwaway repo happens to resolve
// to the throwaway's own `.git` — harmless by coincidence. In a LINKED WORKTREE it is ABSOLUTE
// (`<repo>/.git/worktrees/<name>`), so every `git init / config / add / commit` a fixture ran inside its tmp dir went
// to the REAL repository instead. Observed 2026-10-27, on the first commit ever made from a worktree here: the real
// repo was re-initialised `core.bare = true` (the main checkout stopped working), a `[user] fixture` identity was
// written into its config, and four fixture commits landed on the worktree's branch.
//
// So every git a fixture runs, and every hook or script a fixture drives, gets the caller's environment with EVERY
// GIT_* variable removed. Not a list of the dangerous ones: the set git exports grows, and a gate's exception list is
// where the next defect lives.

import { execFileSync } from 'node:child_process';

/** process.env with every GIT_* variable removed, plus `extra`. */
export function isolatedGitEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return { ...env, ...extra };
}

/** git, run in `cwd` against the repository found THERE, never the caller's. */
export const fixtureGit = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: isolatedGitEnv() }).trim();
