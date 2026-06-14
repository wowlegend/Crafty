// @vitest-environment node
//
// Crash-class static gate — the durable guard for the bug-class that froze the game THREE times
// (iters 159/160/161: `lookSensitivity`, `MagicWand`, `_trailDir` — every one a symbol orphaned by a
// byte-exact god-file extraction, used-but-undefined). The rollup/vite build cannot catch free-var
// references to module-locals or undefined JSX components, and the visual gate only caught them at
// RUNTIME (after they shipped to main + hid behind the stale-diff hole). This runs ESLint's no-undef
// + react/jsx-no-undef across all of src/ at test time, so `npx vitest run` (the loop's verify
// command) fails the instant the class recurs — at commit time, not 6 iters later.
//
// Config lives in frontend/eslint.config.js (two rules only; permissive globals on purpose — see
// the comment there). Validated against an injected probe: it flags BOTH an undefined plain-JS ref
// AND an undefined JSX component.
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

describe('eslint crash-class gate (no-undef + react/jsx-no-undef across src/)', () => {
  it('src/ has zero undefined-identifier and zero undefined-JSX-component errors', async () => {
    // cwd is frontend/ under vitest → eslint.config.js auto-discovered (flat config).
    const eslint = new ESLint();
    const results = await eslint.lintFiles(['src']);
    const offenders = [];
    for (const r of results) {
      for (const m of r.messages) {
        if (m.ruleId === 'no-undef' || m.ruleId === 'react/jsx-no-undef') {
          offenders.push(`${r.filePath}:${m.line}:${m.column}  ${m.ruleId}  ${m.message}`);
        }
      }
    }
    // The message is the offender list so a failure points straight at the orphaned symbol + file.
    expect(offenders, `\nCrash-class orphan(s) found:\n${offenders.join('\n')}\n`).toEqual([]);
  });
});
