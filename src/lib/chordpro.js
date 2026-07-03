// FreeChords — ChordSheetJS integration.
// Songs are stored as ChordPro source. We parse with ChordSheetJS, transpose
// with its Chord model, and adapt the result into the simple
// { label, lines: [[{chord, text}]] } shape the song view renders.
import {
  ChordProParser,
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

// --- Paste cleanup: chords-over-lyrics text -> ChordPro ----------------------
// We don't use ChordSheetJS's ChordsOverWordsParser here: it rejects a whole
// "chord line" if any token isn't a chord it recognizes (e.g. G6sus, A7sus),
// silently dropping those lines. This permissive pass keeps them.

// A chord token: a root note, optional accidental, a suffix built only from
// real chord atoms (so lyric words like "Cage"/"Add"/"Be" are rejected), plus
// an optional slash bass. The atom list is intentionally loose about quality
// symbols so non-standard ones like 6sus survive.
const CHORD_ATOM = '(?:maj|min|sus|add|dim|aug|m|M|°|ø|Δ|\\+|-|b|#|\\d|\\(|\\))';
const CHORD_RE = new RegExp('^[A-G][#b♯♭]?' + CHORD_ATOM + '*(?:/[A-G][#b♯♭]?)?$');

const isChordToken = (t) => CHORD_RE.test(t);
const isBlankLine = (s) => s.trim() === '';
const isSectionHeader = (s) => /^\s*\[[^\]]+\]/.test(s); // [Intro], [Verse 1], [Hook] …
const isChordLine = (s) => {
  const toks = s.trim().split(/\s+/).filter(Boolean);
  return toks.length > 0 && toks.every(isChordToken);
};
// A chord line carries real column positions if it's indented or has a multi-space
// gap between chords. Without either (chords flush-left, single-spaced) the columns
// are meaningless — the hallmark of a PDF/print copy that flattened the 2-D layout.
const isPositioned = (s) => /^\s/.test(s) || /\S {2,}\S/.test(s);

// Place each chord into the lyric line at the column where it sat. Insert
// right-to-left so earlier offsets stay valid; a chord past the line's end
// lands at the end.
function mergeChordsIntoLyric(chordLine, lyricLine) {
  const chords = [];
  const re = /\S+/g; let m;
  while ((m = re.exec(chordLine)) !== null) chords.push([m.index, m[0]]);
  let out = lyricLine;
  for (let i = chords.length - 1; i >= 0; i--) {
    const [col, ch] = chords[i];
    const pos = Math.min(col, out.length);
    out = out.slice(0, pos) + '[' + ch + ']' + out.slice(pos);
  }
  return out;
}

const chordsOnlyLine = (chordLine) =>
  chordLine.trim().split(/\s+/).filter(Boolean).map((c) => `[${c}]`).join(' ');

const sectionComment = (s) =>
  `{c: ${s.trim().replace(/^\[/, '').replace(/]/, ' ').replace(/\s+/g, ' ').trim()}}`;

// Parse pasted chords-over-lyrics text into clean ChordPro source.
export function cleanToChordPro(rawText) {
  const lines = String(rawText || '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));
  const body = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isBlankLine(line)) { body.push(''); continue; }
    if (isSectionHeader(line)) { body.push(sectionComment(line)); continue; }
    if (isChordLine(line)) {
      // Gather the maximal run of consecutive chord lines.
      let j = i;
      while (j < lines.length && isChordLine(lines[j])) j++;
      const run = lines.slice(i, j);
      const after = lines[j];
      const afterIsLyric = after != null && !isBlankLine(after) && !isSectionHeader(after);

      // Position-less chord lines (flush-left, single-spaced) carry no real
      // column info — the hallmark of an OCR/PDF copy that flattened the layout,
      // or one chord row split across several lines. Their column numbers are
      // meaningless, so we must NOT thread the chords into the lyric (that splits
      // words mid-syllable, e.g. "I d[D]on't"). Put them on one row above it —
      // except a lone chord, which reads fine sitting over the first word.
      if (run.every((l) => !isPositioned(l))) {
        const tokens = run.join(' ').trim().split(/\s+/).filter(Boolean);
        if (afterIsLyric && tokens.length === 1) {
          body.push(mergeChordsIntoLyric(run[0], after)); // lone chord over the first word
          i = j;
        } else if (afterIsLyric) {
          body.push(chordsOnlyLine(run.join(' '))); // several chords → one row above…
          body.push(after);                          // …the lyric, left plain
          i = j;
        } else {
          for (const l of run) body.push(chordsOnlyLine(l)); // intro / turnaround rows, kept per line
          i = j - 1;
        }
        continue;
      }

      // A positioned chord line keeps its exact column placement.
      const next = lines[i + 1];
      if (next != null && !isBlankLine(next) && !isChordLine(next) && !isSectionHeader(next)) {
        body.push(mergeChordsIntoLyric(line, next)); // aligned: place each by column
        i++; // the lyric line is now consumed
      } else {
        body.push(chordsOnlyLine(line)); // chords with nothing to sit on
      }
      continue;
    }
    body.push(line); // a lyric / annotation line
  }

  // Strip the clutter of blank separator lines, then give each section a single
  // breathing line above it.
  const out = [];
  for (const l of body) {
    if (l === '') continue;
    if (l.startsWith('{c:') && out.length) out.push('');
    out.push(l);
  }
  return out.join('\n').trim();
}

// Does this paste look like a PDF/print copy that flattened the 2-D chord layout
// (each chord dropped onto its own line, blank separators gone, positions lost)?
// We count the runs of 2+ position-less chord lines sitting directly on a lyric —
// the exact pattern cleanToChordPro has to regroup. A well-aligned webpage paste
// has none; a flattened one has several (or one long run). Used to nudge the user
// toward the screenshot importer, which reads positions from the image instead.
export function looksFlattened(rawText) {
  const lines = String(rawText || '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));
  let events = 0;
  let bigRun = false;
  for (let i = 0; i < lines.length; i++) {
    if (!isChordLine(lines[i])) continue;
    let j = i;
    while (j < lines.length && isChordLine(lines[j])) j++;
    const after = lines[j];
    const afterIsLyric = after != null && !isBlankLine(after) && !isSectionHeader(after);
    if (afterIsLyric && j - i >= 2 && lines.slice(i, j).every((l) => !isPositioned(l))) {
      events++;
      if (j - i >= 3) bigRun = true; // 3+ stacked chord lines on one lyric is unmistakable
    }
    i = j - 1; // skip past this run of chord lines
  }
  return events >= 2 || bigRun;
}
