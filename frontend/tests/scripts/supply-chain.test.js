import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = resolve(APP, '..');

// THERE WAS NO DEPENDENCY SCANNING OF ANY KIND.
//
// `npm install --no-audit`, no audit step, no Dependabot config. A CVE in a transitive dep shipped to the
// live demo on the next push with nothing looking at it — and `npm install` also runs the whole tree's
// lifecycle scripts on a CI runner holding a GITHUB_TOKEN, which is the same supply chain.
//
// Measured 2026-08-12 while arming this: 0 vulnerabilities at every severity, so the threshold started
// with nothing to grandfather.
//
// WHAT THIS FILE DOES *NOT* DO: run `npm audit`. That is a live registry call, and a network assertion
// inside the offline unit suite goes red from weather rather than from a defect — a gate that decays into
// noise gets muted, which is the failure mode this repo's own CI header warns about. The scan belongs in
// CI where the network is expected and a failure is legible. What is checkable offline, and what actually
// rots, is whether the scanning is still WIRED.
const ciYml = resolve(ROOT, '.github/workflows/ci.yml');
const dependabot = resolve(ROOT, '.github/dependabot.yml');

describe('the supply chain is scanned at all', () => {
  it('CI runs an explicit dependency audit', () => {
    expect(existsSync(ciYml), 'ci.yml is missing — nothing here can be asserted').toBe(true);
    const yml = readFileSync(ciYml, 'utf8');
    expect(yml, 'no `npm audit` step — a CVE ships to the live demo unremarked').toMatch(/run:\s*npm audit\b/);
  });

  it('the audit has a THRESHOLD, so it can actually fail', () => {
    // `npm audit` without --audit-level prints findings and exits 0 in some configurations, which is a
    // step that reports rather than gates. The level is what makes it a gate.
    const yml = readFileSync(ciYml, 'utf8');
    expect(yml).toMatch(/npm audit --audit-level=(high|critical)/);
  });

  it('the audit is its OWN step, so a registry outage is legible as a registry outage', () => {
    // Folded into the install or the lint step, a network failure would present as "lint failed", which
    // is how a gate gets diagnosed as flaky and then ignored.
    const yml = readFileSync(ciYml, 'utf8');
    expect(yml, 'the audit has no name of its own').toMatch(/- name: [^\n]*[Aa]udit[^\n]*\n\s*run: npm audit/);
  });

  it('Dependabot exists and points at the app directory, not the repo root', () => {
    // THE TRAP IN A TWO-LEVEL REPO. package.json lives in frontend/. A `directory: "/"` npm entry finds
    // no manifest and silently does nothing — config that looks like coverage and provides none, which is
    // this project's signature defect wearing a YAML hat.
    expect(existsSync(dependabot), 'no .github/dependabot.yml — nothing opens the fix an audit demands').toBe(true);
    const yml = readFileSync(dependabot, 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    const npmBlock = yml.slice(yml.indexOf('package-ecosystem: npm'));
    expect(npmBlock, 'the npm ecosystem entry does not point at /frontend, where package.json actually is')
      .toMatch(/directory:\s*\/frontend/);
  });

  it('the directory Dependabot names really does contain a manifest', () => {
    // Asserting the string is not asserting the path. This is what catches a future repo reshuffle.
    //
    // COMMENTS STRIPPED FIRST, because the first version of this test did not and matched the phrase
    // `directory: "/"` out of the prose two blocks above explaining why that value would be wrong —
    // capturing `/\`` and failing on a config that was correct. A parser that reads its own documentation
    // as data is the exact defect gate-shape exists to catch, reproduced inside a gate I was writing.
    const yml = readFileSync(dependabot, 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    const dirs = [...yml.matchAll(/directory:\s*(\S+)/g)].map((m) => m[1].replace(/['"]/g, ''));
    expect(dirs.length, 'no directories parsed out of dependabot.yml').toBeGreaterThan(0);
    const npmDir = dirs.find((d) => d !== '/');
    expect(existsSync(resolve(ROOT, `.${npmDir}`, 'package.json')),
      `dependabot points npm at "${npmDir}", which has no package.json`).toBe(true);
  });

  it('NO ecosystem proposes majors — the fan-out that emailed the owner at 00:21', () => {
    // MEASURED 2026-08-12: the first version of this config grouped only [minor, patch], so every major
    // escaped grouping and got its own PR. Dependabot's first scan runs when the config LANDS, not on the
    // monthly schedule, so eight PRs opened in four minutes and Vercel built a preview for each. One
    // failed and emailed the owner. The header claimed to be avoiding exactly that.
    //
    // Every `updates:` entry must therefore carry a wildcard major-ignore. Checked per entry rather than
    // once for the file, because the github-actions block was added without one — a second ecosystem is
    // precisely where a rule stated once gets forgotten.
    const yml = readFileSync(dependabot, 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    const blocks = yml.split(/(?=\s*- package-ecosystem:)/).filter((b) => b.includes('package-ecosystem:'));
    expect(blocks.length, 'no ecosystem blocks parsed — this assertion is vacuous').toBeGreaterThan(1);
    for (const b of blocks) {
      const eco = (b.match(/package-ecosystem:\s*(\S+)/) || [])[1];
      expect(b, `the "${eco}" ecosystem can still propose majors — unrequested major PRs cost review attention nobody chose`)
        .toMatch(/dependency-name:\s*'\*'[\s\S]{0,80}version-update:semver-major/);
    }
  });

  it('the 0.x ENGINE STACK also blocks MINOR, where its breaking changes actually live', () => {
    // The majors rule was not enough. It let through a grouped PR carrying `three 0.172.0 -> 0.185.1`
    // — thirteen releases of the renderer — plus @react-three/fiber, drei and lucide-react 0.439 ->
    // 0.577, and that PR passed EVERY CI check. It passed because CI structurally cannot see rendering:
    // the visual gate runs in neither the pre-push hook nor the workflow. Under semver a 0.x MINOR is
    // the breaking position, so `version-update:semver-major` matches none of these bumps.
    //
    // Listed explicitly rather than by wildcard, because blocking minors everywhere would also block
    // ordinary safe minors on stable 1.x+ packages, which is the churn Dependabot is FOR.
    const yml = readFileSync(dependabot, 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    const npmBlock = yml.slice(yml.indexOf('package-ecosystem: npm'), yml.indexOf('package-ecosystem: github-actions'));
    const ZERO_X = ['three', '@react-three/*', '@dimforge/rapier3d-compat', 'postprocessing', 'lucide-react'];
    for (const dep of ZERO_X) {
      const esc = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(npmBlock, `${dep} can still take a MINOR bump — for a 0.x package that is a breaking change, and no gate in CI can see a render regression`)
        .toMatch(new RegExp(`dependency-name:\\s*'?${esc}'?[\\s\\S]{0,80}version-update:semver-minor`));
    }
  });

  it('but ordinary packages can still take minors — otherwise Dependabot does nothing useful', () => {
    // The counterweight. If minor were blocked wholesale, the config would be a very elaborate way of
    // turning the bot off, and the routine patch churn it exists to deliver would stop arriving.
    const yml = readFileSync(dependabot, 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    const npmBlock = yml.slice(yml.indexOf('package-ecosystem: npm'), yml.indexOf('package-ecosystem: github-actions'));
    expect(npmBlock, 'minors are blocked for EVERY package — the bot now delivers nothing')
      .not.toMatch(/dependency-name:\s*'\*'[\s\S]{0,80}version-update:semver-minor/);
    expect(npmBlock, 'the minor/patch groups are gone, so routine churn arrives one PR per package')
      .toMatch(/update-types:\s*\[minor, patch\]/);
  });

  it('and SECURITY updates are not blocked by that — they bypass `ignore` by design', () => {
    // The thing that would make the block above a mistake: if it also silenced advisories, the audit gate
    // in ci.yml would have nothing to open a fix with. Dependabot's security updates ignore `ignore`,
    // so what is asserted here is that nothing has ALSO disabled them.
    const yml = readFileSync(dependabot, 'utf8');
    expect(yml, 'security updates have been switched off, leaving the audit gate with no remediation path')
      .not.toMatch(/open-pull-requests-limit:\s*0/);
  });

  it('Vercel does not build a PREVIEW for dependabot branches', () => {
    // THE ROOT CAUSE OF THREE DEPLOY-FAILURE EMAILS TO THE OWNER. Vercel builds a preview per PR, so
    // every Dependabot PR produced a deployment — and a bump that legitimately cannot install (eslint 10
    // against eslint-plugin-react's <=9.7 peer; @react-three/postprocessing 3.0.5 against a pinned
    // three@0.172) fails that build and emails him. Three times, twice after midnight his time.
    //
    // Nothing about a dependency bump needs a hosted preview: CI already runs unit, lint, knip, build and
    // three e2e shards on the branch. The preview added an email and no signal. `ignoreCommand` exits 0
    // to SKIP a build, so matching dependabot/* and exiting 0 is the whole fix.
    const cfg = JSON.parse(readFileSync(resolve(APP, 'vercel.json'), 'utf8'));
    expect(cfg.ignoreCommand, 'vercel.json has no ignoreCommand — dependabot branches will deploy again').toBeTruthy();
    expect(cfg.ignoreCommand, 'the ignoreCommand does not match dependabot branches').toContain('dependabot/');
    expect(cfg.ignoreCommand, 'the ignoreCommand never exits 0, so it can never skip a build').toContain('exit 0');
    // And production must still deploy — an ignoreCommand that skips everything is a silent outage.
    expect(cfg.outputDirectory, 'the build output directory went missing alongside the ignore rule').toBe('build');
  });

  it('the workflow actions are covered too', () => {
    // A stale pinned action runs arbitrary code on a runner holding the GITHUB_TOKEN. Same supply chain,
    // different ecosystem, and easy to leave out.
    expect(readFileSync(dependabot, 'utf8')).toMatch(/package-ecosystem:\s*github-actions/);
  });
});

// A BUMP THAT BROKE A DEDUP AND MADE AN INTEGRATION TEST TEST THE WRONG ENGINE.
//
// `@dimforge/rapier3d-compat` is a DIRECT dependency here for one reason: it was a phantom import
// (32625c0 — "declare the phantom rapier dep, drop the knip ignore hiding it"), used by
// tests/integration/beast-collider-rapier.test.js and scripts/bench/bull-physics-bench.mjs. The app
// itself reaches physics only through `@react-three/rapier`, which pins rapier3d-compat EXACTLY —
// no range. So the two agree, dedupe to ONE copy, and the integration test's central claim holds:
// it drives "the same build the app ships".
//
// Dependabot bumped the direct pin 0.19.2 -> 0.19.3 on 2026-08-13 inside a group labelled
// "dev-dependencies", which is how it read as harmless. It split them: root 0.19.3, and a NESTED
// 0.19.2 under @react-three/rapier for the app. Nothing failed. The bundle did not move (+0.0KB —
// only the test and the bench import the root copy, and neither is bundled), the unit suite stayed
// green, and e2e was unaffected because the APP still got 0.19.2. The only casualty was the reason
// the integration test exists, and its comment went on asserting otherwise.
//
// That is this repo's signature defect arriving through the dependency graph: an instrument reporting
// over input it never examined — here, over a different physics engine than the one it names.
//
// Read from the LOCKFILE, which is committed, rather than from node_modules, which is a property of
// whoever ran install last.
describe('the physics engine under test is the one the app ships', () => {
  const lock = JSON.parse(readFileSync(resolve(APP, 'package-lock.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(resolve(APP, 'package.json'), 'utf8'));
  const RAPIER = '@dimforge/rapier3d-compat';

  it('the direct pin matches what @react-three/rapier demands', () => {
    const wrapper = lock.packages['node_modules/@react-three/rapier'];
    expect(wrapper, '@react-three/rapier is not in the lockfile — has the physics stack changed?').toBeTruthy();
    const wants = wrapper.dependencies?.[RAPIER];
    expect(wants, '@react-three/rapier no longer depends on rapier3d-compat directly').toBeTruthy();

    const declared = pkg.devDependencies?.[RAPIER] ?? pkg.dependencies?.[RAPIER];
    expect(declared, `${RAPIER} is not declared — it was a phantom dep once already (32625c0)`).toBeTruthy();
    expect(
      declared,
      `the direct pin is ${declared} but @react-three/rapier demands ${wants}. They will NOT dedupe, so ` +
      `tests/integration/beast-collider-rapier.test.js drives a DIFFERENT physics build from the one the ` +
      `app ships while claiming it is "the same build". Move BOTH together (an npm "overrides" entry) and ` +
      `re-validate the game, or hold the direct pin at what the wrapper demands.`,
    ).toBe(wants);
  });

  it('no NESTED copy under @react-three/rapier — the observable of the split', () => {
    // The assertion above compares declarations; this checks the RESULT, because npm could dedupe or not
    // for reasons neither version string shows.
    //
    // Measured across the bump rather than assumed. Before: TWO entries — the root one, and a 0.12.0
    // under `@types/three`. After: THREE, the new one nested under @react-three/rapier. So "exactly one
    // copy" would have been red before the defect existed, and is the wrong assertion. The @types/three
    // copy is a transitive of a TYPES package — never loaded, never bundled, and older than this gate —
    // so it is named here rather than filtered by a pattern that would also hide a real second copy.
    const copies = Object.keys(lock.packages).filter((p) => p.endsWith(`node_modules/${RAPIER}`));
    const nested = copies.filter((p) => p !== `node_modules/${RAPIER}` && !p.startsWith('node_modules/@types/'));
    expect(
      nested,
      `${RAPIER} is duplicated at ${nested.join(', ')}. A nested copy means the app and the integration ` +
      `test run different physics builds while the test claims otherwise.`,
    ).toEqual([]);
    expect(copies, 'the root copy vanished — rapier is a phantom dep again (see 32625c0)')
      .toContain(`node_modules/${RAPIER}`);
  });

  it('the integration test still makes the claim this gate protects', () => {
    // If someone deletes the "same build the app ships" claim, this gate is guarding nothing and should
    // be reconsidered rather than left as decoration.
    const t = readFileSync(resolve(APP, 'tests/integration/beast-collider-rapier.test.js'), 'utf8');
    expect(t, 'the integration test no longer claims to drive the shipped build — re-examine this gate')
      .toMatch(/the same build the app ships/);
  });
});
