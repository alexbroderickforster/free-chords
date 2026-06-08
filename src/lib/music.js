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
