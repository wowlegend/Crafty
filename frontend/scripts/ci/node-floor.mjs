// node-floor.mjs — refuse a Node older than 24.2.0 before any gate runs.
//
// Every script under scripts/ guards its CLI with `if (import.meta.main)`, which Node defines from 24.2.0 on. On an
// older Node the flag is undefined, so each gate would print nothing and exit 0: a pass that never ran, the publish
// guard included. The pipeline and the hooks that call a gate directly run this first. It exports nothing and runs
// unconditionally, so it works on the Node it judges.
//
//   node scripts/ci/node-floor.mjs              exit 1 below the floor
//   node scripts/ci/node-floor.mjs --as 24.1.9  judge that version instead of the running one
const FLOOR = [24, 2, 0];
const at = process.argv.indexOf('--as');
const version = at > -1 ? String(process.argv[at + 1]) : process.versions.node;
const parts = version.split('.').map(Number);

let cmp = Number.isFinite(parts[0]) ? 0 : -1;
for (let k = 0; cmp === 0 && k < FLOOR.length; k++) {
  const v = Number.isFinite(parts[k]) ? parts[k] : 0;
  if (v !== FLOOR[k]) cmp = v < FLOOR[k] ? -1 : 1;
}

if (cmp < 0) {
  console.error(`✖ node-floor: Node ${version} is below ${FLOOR.join('.')}: the gates' import.meta.main guard would skip every check. Use Node 24.2 or later (package.json engines).`);
  process.exit(1);
}
