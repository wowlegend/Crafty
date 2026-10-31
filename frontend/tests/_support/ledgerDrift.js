/**
 * How a per-file ledger and a fresh count of the same thing disagree, for the ratchets in tests/scripts/ whose ledger may
 * only fall (capture-guards-ratchet, history-comments-ratchet).
 *
 *  - `over`: a file past its number, or a file the ledger does not list (its number is 0). The rule the ledger holds is
 *    broken: a site was added.
 *  - `slack`: a file under its number, or a listed file with none left. The count fell and the ledger did not, so the next
 *    site added to that file would pass unseen. The fix is to write the lower number (or remove the entry at 0), which is
 *    how a ledger that may only fall is made to fall.
 *  - `malformed`: an entry that is not a whole number of 1 or more, which no count can equal.
 *
 * All three fail the ratchet, so the ledger is the count, exactly.
 * @param {Record<string, number>} perFile  the fresh count, files with none omitted
 * @param {Record<string, number>} ledger
 */
export function ledgerDrift(perFile, ledger) {
  const over = Object.entries(perFile)
    .filter(([file, n]) => n > (ledger[file] ?? 0))
    .map(([file, n]) => `${file}: ${n} > ${ledger[file] ?? 0}`);
  const slack = Object.entries(ledger)
    .filter(([file, n]) => Number.isInteger(n) && n >= 1 && (perFile[file] ?? 0) < n)
    .map(([file, n]) => `${file}: ${perFile[file] ?? 0} < ${n}`);
  const malformed = Object.entries(ledger)
    .filter(([, n]) => !Number.isInteger(n) || n < 1)
    .map(([file, n]) => `${file}: ${JSON.stringify(n)}`);
  return { over: over.sort(), slack: slack.sort(), malformed: malformed.sort() };
}
