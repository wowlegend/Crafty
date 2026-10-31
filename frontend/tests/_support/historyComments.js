import { parse } from '@babel/parser';

/**
 * The detector behind tests/scripts/history-comments-ratchet.test.js, apart from it so a script can write the ledger from
 * the same markers. Comments come from the syntax tree, so a string holding the words is not a comment.
 */
const PARSE = { sourceType: 'module', plugins: ['jsx'] };

const HISTORY = Object.freeze([
  // "<anything> used to <verb>": any word, name, code span or closing bracket before it, unless that word is a form of be
  // or get ("is used to carry", "gets used to") or the phrase is set off by a comma ("heights (...), used to bound"), the
  // two shapes in which "used to" states a purpose. Every other "used to" in src read as history when this was written.
  /(?<!\b(?:am|is|are|was|were|be|been|being|get|gets|got|gotten|getting|become|becomes|became)\s+)(?<=[\w`'")\]]\s+)used\s+to\b/i,
  /\bused\s+to\s+be\b/i,
  /\bwhat\s+was\s+there\b/i,
  /\b(deleted|removed|retired|fixed|reverted|replaced|added)\s+(on\s+)?20\d\d-\d\d-\d\d/i,
  /\(was\s+[#0-9]/,
  /\bhas\s+always\b(?!-)|\bon\s+today's\b|\btoday's\s+(model|impulse)\b/i,
]);

/** The comments of `text` as strings, adjacent line comments joined, whitespace and comment stars collapsed. */
export function commentsOf(text) {
  const list = parse(text, PARSE).comments;
  const out = [];
  let prev = null;
  for (const c of list) {
    const body = c.value.replace(/\s*\n\s*\*?\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (c.type === 'CommentLine' && prev && prev.type === 'CommentLine' && c.loc.start.line === prev.loc.end.line + 1) {
      out[out.length - 1].text += ` ${body}`;
    } else {
      out.push({ text: body, line: c.loc.start.line });
    }
    prev = c;
  }
  return out;
}

/** The history comments of `text`: [{ line, text }]. */
export function historyComments(text) {
  return commentsOf(text).filter((c) => HISTORY.some((re) => re.test(c.text)));
}
