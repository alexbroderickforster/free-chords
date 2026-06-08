// FreeChords — ChordSheetJS integration.
// Songs are stored as ChordPro source. We parse with ChordSheetJS, transpose
// with its Chord model, and adapt the result into the simple
// { label, lines: [[{chord, text}]] } shape the song view renders.
import {
  ChordProParser,
  ChordsOverWordsParser,
  ChordProFormatter,
  Chord,
} from 'chordsheetjs';

export function parseChordPro(source) {
  return new ChordProParser().parse(source || '');
}

// Transpose a single chord symbol via ChordSheetJS's Chord model.
// Falls back to the original token if it isn't a parseable chord.
export function transposeChordName(chord, semitones) {
  if (!chord || !semitones) return chord || '';
  try {
    const parsed = Chord.parse(chord);
    return parsed ? parsed.transpose(semitones).toString() : chord;
  } catch {
    return chord;
  }
}

const isPair = (item) => item && typeof item.lyrics === 'string' && 'chords' in item;

function labelOf(items) {
  for (const it of items) {
    if (!it || it.name == null) continue;
    const n = String(it.name).toLowerCase();
    if (n === 'comment' || n === 'c') return it.value || '';
    if (n === 'start_of_chorus' || n === 'soc') return it.value || 'Chorus';
    if (n === 'start_of_verse' || n === 'sov') return it.value || 'Verse';
    if (n === 'start_of_bridge' || n === 'sob') return it.value || 'Bridge';
  }
  return null;
}

// Parse ChordPro source into render-ready sections, transposed by `semitones`.
export function toSections(source, semitones = 0) {
  const song = parseChordPro(source);
  const sections = [];
  let current = null;
  const ensure = () => {
    if (!current) { current = { label: '', lines: [] }; sections.push(current); }
    return current;
  };

  song.lines.forEach((line) => {
    const items = line.items || [];
    const label = labelOf(items);
    if (label != null) {
      current = { label, lines: [] };
      sections.push(current);
      return;
    }
    const segs = items
      .filter(isPair)
      .map((it) => ({ chord: transposeChordName(it.chords, semitones), text: it.lyrics }))
      .filter((s) => s.chord || s.text);
    if (segs.length) ensure().lines.push(segs);
  });

  return sections.filter((s) => s.lines.length || s.label);
}

// Unique chord symbols used in a ChordPro source (transposed).
export function uniqueChords(source, semitones = 0) {
  const song = parseChordPro(source);
  const set = [];
  song.lines.forEach((line) => (line.items || []).forEach((it) => {
    if (isPair(it) && it.chords) {
      const c = transposeChordName(it.chords, semitones);
      if (!set.includes(c)) set.push(c);
    }
  }));
  return set;
}

// Parse pasted chords-over-lyrics text into clean ChordPro source.
export function cleanToChordPro(rawText) {
  const song = new ChordsOverWordsParser().parse(rawText || '');
  return new ChordProFormatter().format(song).trim();
}
