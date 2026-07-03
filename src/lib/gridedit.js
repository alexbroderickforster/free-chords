// Grid editor ⇄ ChordPro. The visual grid editor models a song as a list of
// lines it can place chords on by character position; this round-trips that model
// to the ChordPro the rest of the app stores, so a grid-authored song is an
// ordinary song (plays, transposes, exports, syncs) and any existing song can be
// opened on the grid.

let _seq = 0;
export const newId = () => 'gl' + (++_seq);

// The palette shown in the picker; type-to-filter + freeform cover everything else.
export const DEFAULT_CHORDS = [
  'C', 'Cmaj7', 'C7', 'Cadd9', 'D', 'Dm', 'D7', 'Dsus4', 'E', 'Em', 'E7',
  'F', 'Fmaj7', 'G', 'G7', 'Gsus4', 'A', 'Am', 'A7', 'Asus4', 'B', 'Bm', 'B7',
];

const SECTION_RE = /^\{\s*(?:c|comment)\s*:\s*(.*?)\s*\}$/i;

// One ChordPro line → { text, chords } where chords maps a character index in the
// plain lyric to the chord that sits immediately before it. "wo[C]rd" → {2:'C'}.
export function parseChordProLine(s) {
  const chords = {};
  let text = '';
  for (let i = 0; i < s.length; ) {
    if (s[i] === '[') {
      const end = s.indexOf(']', i);
      if (end > i) { chords[text.length] = s.slice(i + 1, end); i = end + 1; continue; }
    }
    text += s[i]; i++;
  }
  // Drop trailing space padding (see lineToChordPro) so a chord placed past the
  // last character stays chord-anchored rather than baking phantom spaces into the
  // lyric — its index already exceeds text.length and lineToChordPro re-pads on save.
  return { text: text.replace(/ +$/, ''), chords };
}

// One raw ChordPro row → a grid line object (section header, unknown directive, or
// chords-over-lyric line). Exported so bulk paste can format a dump the same way.
export function rowToLine(row) {
  const t = row.trim();
  const m = t.match(SECTION_RE);
  if (m) return { id: newId(), type: 'section', text: m[1] };
  if (t.startsWith('{') && t.endsWith('}')) return { id: newId(), type: 'raw', text: row }; // preserve unknown directives verbatim
  const { text, chords } = parseChordProLine(row);
  return { id: newId(), type: 'lyric', text, chords };
}

export function gridFromChordPro(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n').map(rowToLine);
  if (!lines.length) lines.push({ id: newId(), type: 'lyric', text: '', chords: {} });
  return lines;
}

export function lineToChordPro(ln) {
  if (ln.type === 'section') return `{c: ${ln.text}}`;
  if (ln.type === 'raw') return ln.text;
  let out = ln.text || '';
  const keys = Object.keys(ln.chords || {}).map(Number);
  if (!keys.length) return out;
  // Pad with spaces so a chord past the last character (an intro/instrumental row,
  // or a chord ringing after the last word) has a column to sit on.
  const maxIdx = Math.max(...keys);
  if (maxIdx > out.length) out += ' '.repeat(maxIdx - out.length);
  const idxs = keys.sort((a, b) => b - a); // right-to-left keeps offsets valid
  for (const i of idxs) out = out.slice(0, i) + '[' + ln.chords[i] + ']' + out.slice(i);
  return out;
}

export function gridToChordPro(lines) {
  return lines.map(lineToChordPro).join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
}

// When a lyric line's text is edited, keep each chord over the same spot: anchors
// before the edit stay, anchors after shift by the length delta, anchors inside
// the edited span collapse to the edit point. Best-effort but never drops a chord.
export function shiftChords(oldText, newText, chords) {
  const oldLen = oldText.length, newLen = newText.length, cap = Math.min(oldLen, newLen);
  let p = 0;
  while (p < cap && oldText[p] === newText[p]) p++;
  let s = 0;
  while (s < cap - p && oldText[oldLen - 1 - s] === newText[newLen - 1 - s]) s++;
  const delta = newLen - oldLen;
  const out = {};
  for (const k0 of Object.keys(chords)) {
    const k = +k0;
    if (k < p) out[k] = chords[k0];               // before the edit → unchanged
    else if (k >= oldLen - s) out[k + delta] = chords[k0]; // in the unchanged tail → shift by delta
    else out[p] = chords[k0];                     // inside the edited span → clamp to the edit point
  }
  return out;
}

// Chords already used in the song, most-frequent first — surfaced in the picker
// so repeated chords are one tap away.
export function usedChords(lines) {
  const count = {};
  lines.forEach((ln) => { if (ln.type === 'lyric') Object.values(ln.chords || {}).forEach((c) => { count[c] = (count[c] || 0) + 1; }); });
  return Object.keys(count).sort((a, b) => count[b] - count[a]);
}
