// FreeChords — detect pasted guitar/bass tablature, so it can be stored and
// rendered verbatim (monospace, no reflow) instead of being parsed as
// chords-over-lyrics. ASCII tab is a grid of string rows (e.g. "G|--3--5--")
// whose column alignment must be preserved exactly.

// Characters that can appear in a tab line: string labels (E A D G B C F + #/b),
// dashes/bars, fret digits, and technique marks (h p b r s x / \ ~ ( ) . *).
const TAB_ALPHABET = /^[\s\-|eEABCDFGb#0-9hpbrsx/\\~().*]+$/;

function isTabLine(line) {
  const t = line.trim();
  if (t.length < 4) return false;
  if (!/-{2,}/.test(t)) return false;          // a run of "string"
  if (!TAB_ALPHABET.test(t)) return false;     // tab characters only — prose fails
  const gridChars = (t.match(/[-|]/g) || []).length;
  const hasLabel = /^[eEABCDFGb#]{1,3}\s*\|/.test(t);
  return gridChars / t.length > 0.5 || hasLabel;
}

// Single pass: the longest run of consecutive tab lines (blank lines don't break
// a run — staves have gaps between systems) and the share of non-blank lines
// that are tab lines.
function scan(text) {
  let run = 0, maxRun = 0, tab = 0, nonBlank = 0;
  for (const line of (text || '').split('\n')) {
    if (line.trim() === '') continue;
    nonBlank += 1;
    if (isTabLine(line)) { tab += 1; run += 1; if (run > maxRun) maxRun = run; }
    else run = 0;
  }
  return { maxRun, tab, nonBlank };
}

// A label+pipe row immediately followed by dashes, e.g. "G|---3---".
const LABELLED_ROW = /^\s*[eEABCDFGb#]{1,3}\s*\|[-\d|hpbrsx/\\~().* ]*-{2,}/m;

// True if the text contains ANY tablature — a single labelled row or a staff.
export function looksLikeTab(text) {
  return LABELLED_ROW.test(text || '') || scan(text).maxRun >= 3;
}

// True if the text is PREDOMINANTLY tablature. Used to auto-switch the import
// format, so it deliberately needs a real multi-string staff (run >= 3) AND tab
// lines to be a meaningful share — a chord sheet with one intro riff stays
// "chords" and won't get hijacked into tab mode.
export function isMostlyTab(text) {
  const { maxRun, tab, nonBlank } = scan(text);
  return maxRun >= 3 && nonBlank > 0 && tab / nonBlank >= 0.4;
}
