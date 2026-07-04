// Notation score model + helpers. Plain JSON is the single source of truth —
// VexFlow (lib/scoreRender) draws it, Web Audio (lib/scorePlayback) sounds it,
// storage persists it. v1: a single treble staff, one voice, 4/4.
//
// Score { id, title, tempo, notes:[Note], createdAt, updatedAt }
// Note  { keys:['c/4'], duration:'q', dots:0, rest:false, accidental:null }

let _seq = 0;
export const newId = () => 'sc' + Date.now().toString(36) + (_seq++).toString(36);

export const DURATIONS = [
  { id: 'w', beats: 4, label: 'Whole' },
  { id: 'h', beats: 2, label: 'Half' },
  { id: 'q', beats: 1, label: 'Quarter' },
  { id: '8', beats: 0.5, label: 'Eighth' },
  { id: '16', beats: 0.25, label: '16th' },
];
const BEATS = Object.fromEntries(DURATIONS.map((d) => [d.id, d.beats]));
export const BEATS_PER_MEASURE = 4;

// Beats a note occupies (a single dot adds half).
export function noteBeats(n) {
  const b = BEATS[n.duration] != null ? BEATS[n.duration] : 1;
  return n.dots ? b * 1.5 : b;
}

// Greedily pack the flat note list into measures of <= 4 beats (no cross-bar
// splitting in v1). Returns [{ notes:[{ note, index }], beats }]. Always returns
// at least one (possibly empty) measure so there's a staff to draw and click.
export function packMeasures(notes, cap = BEATS_PER_MEASURE) {
  const measures = [];
  let cur = { notes: [], beats: 0 };
  notes.forEach((note, index) => {
    const b = noteBeats(note);
    if (cur.notes.length && cur.beats + b > cap + 1e-9) { measures.push(cur); cur = { notes: [], beats: 0 }; }
    cur.notes.push({ note, index });
    cur.beats += b;
  });
  if (cur.notes.length || !measures.length) measures.push(cur);
  return measures;
}

export function emptyScore(title = 'Untitled') {
  const now = Date.now();
  return { id: newId(), title, tempo: 90, notes: [], createdAt: now, updatedAt: now };
}

// VexFlow duration token, e.g. 'q', 'qr' (rest), '8', '16'.
export const vexDuration = (n) => n.duration + (n.rest ? 'r' : '');
export const REST_KEY = 'b/4'; // where a rest glyph sits on a treble staff

// --- immutable edits on the notes array ---
export const insertNote = (notes, index, note) => {
  const i = Math.max(0, Math.min(index, notes.length));
  return [...notes.slice(0, i), note, ...notes.slice(i)];
};
export const removeNote = (notes, index) => notes.filter((_, i) => i !== index);
export const patchNote = (notes, index, patch) => notes.map((n, i) => (i === index ? { ...n, ...patch } : n));

// --- pitch <-> midi <-> frequency (playback) ---
const LETTER_SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
export function keyToMidi(key) {
  const m = /^([a-gA-G])([#b]?)\/(-?\d+)$/.exec(key || '');
  if (!m) return 60;
  let s = LETTER_SEMITONE[m[1].toLowerCase()];
  if (m[2] === '#') s += 1; else if (m[2] === 'b') s -= 1;
  return (parseInt(m[3], 10) + 1) * 12 + s; // C4 = MIDI 60
}
export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
// A note's key stays diatonic ('c/4'); its `accidental` ('#','b',null) carries the
// ♯/♭ — both for the drawn glyph and the sounding pitch.
export const accSemitone = (a) => (a === '#' ? 1 : a === 'b' ? -1 : 0);

// --- diatonic ladder (C3..C7) for mapping a click's Y to a pitch ---
export const DIATONIC = (() => {
  const letters = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
  const out = [];
  for (let oct = 3; oct <= 6; oct++) for (const L of letters) out.push(`${L}/${oct}`);
  out.push('c/7');
  return out; // low → high
})();
export const F5_INDEX = DIATONIC.indexOf('f/5'); // the treble top line
