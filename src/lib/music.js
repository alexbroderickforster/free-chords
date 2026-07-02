// FreeChords — music utilities: the learning-status model.
// Chord transposition lives in lib/chordpro.js (ChordSheetJS's Chord model);
// chord-diagram lookup + rendering lives in lib/chords.js (chords-db).

// ---- Learning status: To learn → Learning → Mastered ----
export const STATUS = {
  learn: { label: 'To learn', tone: 'learn' },
  learning: { label: 'Learning', tone: 'learning' },
  mastered: { label: 'Mastered', tone: 'mastered' },
};
export const STATUS_ORDER = ['learn', 'learning', 'mastered'];
export function nextStatus(s) {
  const i = STATUS_ORDER.indexOf(s || 'learn');
  return STATUS_ORDER[(i + 1) % STATUS_ORDER.length];
}

// ---- Key → tonic triad, for the ear-training "key ping" ----
const NOTE_SEMITONE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const FLAT_TO_SHARP = { DB: 'C#', EB: 'D#', GB: 'F#', AB: 'G#', BB: 'A#', CB: 'B', FB: 'E' };

// Parse a key like 'F#m' / 'C' / 'Bb' / 'F♯m' into the tonic triad to sound as a
// pitch reference: { freqs: [root, third, fifth], root, minor }, or null when the
// key is empty/unparseable (e.g. tab songs). Extensions (sus/7/add) are ignored;
// only the root + major/minor tonality matter.
export function keyToPing(key) {
  if (!key) return null;
  const s = String(key).trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const m = s.match(/^([A-Ga-g])([#b]?)/);
  if (!m) return null;
  let note = m[1].toUpperCase() + (m[2] || '');
  if (m[2] === 'b') note = FLAT_TO_SHARP[note.toUpperCase()] || note; // fold flats to sharps
  const semis = NOTE_SEMITONE[note];
  if (semis == null) return null;
  const minor = /^m(?!aj)/.test(s.slice(m[0].length)); // 'Am'/'Cm7' minor; 'Cmaj7'/'F#' major
  let midi = 60 + semis; // octave 4 (C4 = 60)
  let tonic = 440 * Math.pow(2, (midi - 69) / 12);
  if (tonic > 415) { midi -= 12; tonic = 440 * Math.pow(2, (midi - 69) / 12); } // keep a comfy register
  return {
    freqs: [tonic, tonic * Math.pow(2, (minor ? 3 : 4) / 12), tonic * Math.pow(2, 7 / 12)],
    root: note, minor,
  };
}
