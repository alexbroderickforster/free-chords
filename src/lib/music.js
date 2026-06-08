// FreeChords — music utilities: transposition, chord shapes, diagram SVG,
// and the learning-status model.

const SHARP_SCALE = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
const FLAT_SCALE = ['A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab'];

function normalizeRoot(r) {
  const map = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B', 'Fb': 'E', 'E#': 'F', 'B#': 'C' };
  return map[r] || r;
}

// Transpose a chord symbol (e.g. "F#m7", "C/E") by n semitones.
export function transposeChord(chord, n) {
  if (!chord || n === 0) return chord;
  const useFlats = /b/.test(chord) && !/#/.test(chord);
  return chord.replace(/([A-G][#b]?)/g, (root) => {
    const norm = normalizeRoot(root);
    let i = SHARP_SCALE.indexOf(norm);
    if (i === -1) return root;
    i = (i + n + 1200) % 12;
    return (useFlats ? FLAT_SCALE : SHARP_SCALE)[i];
  });
}

export function transposeKey(key, n) {
  if (!key) return key;
  const m = key.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return key;
  return transposeChord(m[1], n) + m[2];
}

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

// ---- Chord diagrams (frets low-E→high-E, -1 muted / 0 open) + finger numbers ----
export const CHORD_SHAPES = {
  'G': { f: [3, 2, 0, 0, 0, 3], fg: [2, 1, 0, 0, 0, 3] }, 'G7': { f: [3, 2, 0, 0, 0, 1], fg: [3, 2, 0, 0, 0, 1] },
  'C': { f: [-1, 3, 2, 0, 1, 0], fg: [0, 3, 2, 0, 1, 0] }, 'Cadd9': { f: [-1, 3, 2, 0, 3, 3], fg: [0, 2, 1, 0, 3, 4] },
  'Cmaj7': { f: [-1, 3, 2, 0, 0, 0], fg: [0, 3, 2, 0, 0, 0] }, 'C7': { f: [-1, 3, 2, 3, 1, 0], fg: [0, 3, 2, 4, 1, 0] },
  'D': { f: [-1, -1, 0, 2, 3, 2], fg: [0, 0, 0, 1, 3, 2] }, 'D7': { f: [-1, -1, 0, 2, 1, 2], fg: [0, 0, 0, 2, 1, 3] },
  'Dsus4': { f: [-1, -1, 0, 2, 3, 3], fg: [0, 0, 0, 1, 2, 3] }, 'Dm': { f: [-1, -1, 0, 2, 3, 1], fg: [0, 0, 0, 2, 3, 1] },
  'A': { f: [-1, 0, 2, 2, 2, 0], fg: [0, 0, 1, 2, 3, 0] }, 'A7': { f: [-1, 0, 2, 0, 2, 0], fg: [0, 0, 1, 0, 2, 0] },
  'A7sus4': { f: [-1, 0, 2, 0, 3, 0], fg: [0, 0, 2, 0, 3, 0] }, 'Am': { f: [-1, 0, 2, 2, 1, 0], fg: [0, 0, 2, 3, 1, 0] },
  'Am7': { f: [-1, 0, 2, 0, 1, 0], fg: [0, 0, 2, 0, 1, 0] },
  'E': { f: [0, 2, 2, 1, 0, 0], fg: [0, 2, 3, 1, 0, 0] }, 'E7': { f: [0, 2, 0, 1, 0, 0], fg: [0, 2, 0, 1, 0, 0] },
  'Em': { f: [0, 2, 2, 0, 0, 0], fg: [0, 2, 3, 0, 0, 0] }, 'Em7': { f: [0, 2, 2, 0, 3, 0], fg: [0, 1, 2, 0, 3, 0] },
  'F': { f: [1, 1, 3, 3, 2, 1], fg: [1, 1, 3, 4, 2, 1] }, 'Fmaj7': { f: [-1, -1, 3, 2, 1, 0], fg: [0, 0, 3, 2, 1, 0] },
  'Bm': { f: [-1, 2, 4, 4, 3, 2], fg: [0, 1, 3, 4, 2, 1] }, 'B7': { f: [-1, 2, 1, 2, 0, 2], fg: [0, 2, 1, 3, 0, 4] },
  'F#m': { f: [2, 4, 4, 2, 2, 2], fg: [1, 3, 4, 1, 1, 1] },
};

// Returns an SVG string for the chord's fretboard chart, or null if unknown.
export function chordSVG(name) {
  const s = CHORD_SHAPES[name];
  if (!s) return null;
  const W = 124, H = 146, padX = 16, top = 26, bot = 14, cols = 6, rows = 4;
  const gw = (W - 2 * padX) / (cols - 1), gh = (H - top - bot) / rows;
  const x = (i) => padX + i * gw, y = (r) => top + r * gh;
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  for (let i = 0; i < cols; i++) svg += `<line x1="${x(i)}" y1="${top}" x2="${x(i)}" y2="${y(rows)}" stroke="var(--diagram-line)" stroke-width="1.4"/>`;
  for (let r = 0; r <= rows; r++) { const nut = r === 0; svg += `<line x1="${padX}" y1="${y(r)}" x2="${W - padX}" y2="${y(r)}" stroke="${nut ? 'var(--diagram-nut)' : 'var(--diagram-line)'}" stroke-width="${nut ? 4 : 1.4}" stroke-linecap="round"/>`; }
  s.f.forEach((fr, i) => {
    const xi = x(i);
    if (fr === -1) svg += `<text x="${xi}" y="${top - 9}" text-anchor="middle" font-size="13" fill="var(--diagram-mark)" font-family="var(--font-mono)">×</text>`;
    else if (fr === 0) svg += `<circle cx="${xi}" cy="${top - 12}" r="4.4" fill="none" stroke="var(--diagram-mark)" stroke-width="1.5"/>`;
    else {
      const cy = y(fr - 1) + gh / 2; svg += `<circle cx="${xi}" cy="${cy}" r="${Math.min(gw, gh) / 2.3}" fill="var(--accent)"/>`;
      if (s.fg[i]) svg += `<text x="${xi}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="700" fill="var(--ink-on-accent)" font-family="var(--font-sans)">${s.fg[i]}</text>`;
    }
  });
  return svg + `</svg>`;
}
