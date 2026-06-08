// FreeChords — chord-diagram lookup + rendering, backed by the open-source
// chords-db fingering database (@tombatossals/chords-db, MIT). The ~240 KB
// JSON is lazy-loaded as its own chunk so it doesn't bloat the main bundle.

let DB = null;
let loading = null;

// Kick off (or reuse) the background load of the chord database.
export function preloadChords() {
  if (DB) return Promise.resolve(DB);
  if (!loading) {
    loading = import('@tombatossals/chords-db/lib/guitar.json')
      .then((m) => { DB = m.default || m; return DB; })
      .catch(() => { loading = null; return null; });
  }
  return loading;
}

// Note name (with #/b) → chords-db key.
const KEY_MAP = {
  C: 'C', 'C#': 'Csharp', Db: 'Csharp', D: 'D', 'D#': 'Eb', Eb: 'Eb',
  E: 'E', Fb: 'E', 'E#': 'F', F: 'F', 'F#': 'Fsharp', Gb: 'Fsharp',
  G: 'G', 'G#': 'Ab', Ab: 'Ab', A: 'A', 'A#': 'Bb', Bb: 'Bb', B: 'B',
  Cb: 'B', 'B#': 'C',
};

// Common chord-symbol qualities → chords-db `suffix` values.
const Q_MAP = {
  '': 'major', maj: 'major', M: 'major',
  m: 'minor', min: 'minor', '-': 'minor',
  '7': '7', dom7: '7',
  m7: 'm7', min7: 'm7', '-7': 'm7',
  maj7: 'maj7', M7: 'maj7',
  '6': '6', m6: 'm6', '69': '69', '6/9': '69',
  '9': '9', m9: 'm9', maj9: 'maj9', mmaj9: 'mmaj9',
  '11': '11', m11: 'm11', maj11: 'maj11', mmaj11: 'mmaj11',
  '13': '13', maj13: 'maj13',
  sus: 'sus4', sus4: 'sus4', sus2: 'sus2', '7sus4': '7sus4', '7sus': '7sus4',
  add9: 'add9', madd9: 'madd9',
  dim: 'dim', o: 'dim', dim7: 'dim7', o7: 'dim7',
  aug: 'aug', '+': 'aug',
  m7b5: 'm7b5', ø: 'm7b5', mmaj7: 'mmaj7', mM7: 'mmaj7',
  '7b5': '7b5', '7b9': '7b9', '7#9': '7#9', '9b5': '9b5', '9#11': '9#11',
  maj7b5: 'maj7b5', 'maj7#5': 'maj7#5',
};

function splitRoot(name) {
  const m = (name || '').trim().match(/^([A-G][#b]?)(.*)$/);
  return m ? { root: m[1], rest: m[2] } : null;
}

// Find the best chords-db position for a chord symbol, or null.
function findPosition(name) {
  if (!DB) return null;
  const parsed = splitRoot(name);
  if (!parsed) return null;
  const key = KEY_MAP[parsed.root];
  const entries = key && DB.chords[key];
  if (!entries) return null;
  const rest = parsed.rest;
  const candidates = [];
  if (Q_MAP[rest] !== undefined) candidates.push(Q_MAP[rest]);
  candidates.push(rest); // covers slash chords (/E, m/B) and already-db suffixes
  candidates.push(/^m(?!aj)/i.test(rest) ? 'minor' : 'major'); // fallback to triad
  for (const suffix of candidates) {
    const entry = entries.find((e) => e.suffix === suffix);
    if (entry && entry.positions && entry.positions.length) return entry.positions[0];
  }
  return null;
}

// Render a chords-db position into an SVG string in the FreeChords diagram style.
function render(pos) {
  const cols = 6, rows = 4;
  const W = 124, H = 150, padX = 16, top = 28, bot = 16;
  const gw = (W - 2 * padX) / (cols - 1), gh = (H - top - bot) / rows;
  const x = (i) => padX + i * gw, y = (r) => top + r * gh;
  const r2 = Math.min(gw, gh) / 2.3;
  const frets = pos.frets, fingers = pos.fingers || [], barres = pos.barres || [];
  const baseFret = pos.baseFret || 1;
  const openNut = baseFret === 1;

  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  for (let i = 0; i < cols; i++) s += `<line x1="${x(i)}" y1="${top}" x2="${x(i)}" y2="${y(rows)}" stroke="var(--diagram-line)" stroke-width="1.4"/>`;
  for (let r = 0; r <= rows; r++) {
    const nut = r === 0 && openNut;
    s += `<line x1="${padX}" y1="${y(r)}" x2="${W - padX}" y2="${y(r)}" stroke="${nut ? 'var(--diagram-nut)' : 'var(--diagram-line)'}" stroke-width="${nut ? 4 : 1.4}" stroke-linecap="round"/>`;
  }
  // Base-fret indicator for up-the-neck shapes.
  if (!openNut) s += `<text x="${padX - 7}" y="${y(0) + gh / 2}" text-anchor="end" dominant-baseline="central" font-size="11" fill="var(--diagram-mark)" font-family="var(--font-mono)">${baseFret}fr</text>`;
  // Open / muted markers above the nut.
  for (let i = 0; i < cols; i++) {
    const fr = frets[i], xi = x(i);
    if (fr === -1) s += `<text x="${xi}" y="${top - 9}" text-anchor="middle" font-size="13" fill="var(--diagram-mark)" font-family="var(--font-mono)">×</text>`;
    else if (fr === 0) s += `<circle cx="${xi}" cy="${top - 12}" r="4.4" fill="none" stroke="var(--diagram-mark)" stroke-width="1.5"/>`;
  }
  // Barres (capsules spanning the barred strings).
  barres.forEach((b) => {
    const idx = [];
    for (let i = 0; i < cols; i++) if (frets[i] === b) idx.push(i);
    if (!idx.length) return;
    const a = Math.min(...idx), z = Math.max(...idx), cy = y(b - 1) + gh / 2;
    s += `<rect x="${x(a) - r2}" y="${cy - r2}" width="${x(z) - x(a) + 2 * r2}" height="${2 * r2}" rx="${r2}" fill="var(--accent)"/>`;
    const f = fingers[idx[0]];
    if (f) s += `<text x="${x(idx[Math.floor(idx.length / 2)])}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="700" fill="var(--ink-on-accent)" font-family="var(--font-sans)">${f}</text>`;
  });
  // Fretted notes (dots) that aren't part of a barre.
  for (let i = 0; i < cols; i++) {
    const fr = frets[i];
    if (fr > 0 && !barres.includes(fr)) {
      const xi = x(i), cy = y(fr - 1) + gh / 2;
      s += `<circle cx="${xi}" cy="${cy}" r="${r2}" fill="var(--accent)"/>`;
      if (fingers[i]) s += `<text x="${xi}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="12" font-weight="700" fill="var(--ink-on-accent)" font-family="var(--font-sans)">${fingers[i]}</text>`;
    }
  }
  return s + '</svg>';
}

// Public: SVG string for a chord symbol, or null if unknown / not loaded yet.
export function chordSVG(name) {
  if (!DB) { preloadChords(); return null; }
  const pos = findPosition(name);
  return pos ? render(pos) : null;
}
