// Chord-detection POC DSP — a 12-bin pitch-class chromagram from an FFT
// spectrum, matched against major/minor chord templates (Fujishima method).
// Deliberately rough: this feeds a lab readout to gauge whether auto-detected
// chords are useful, not an authoritative chart.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Fold an analyser dB spectrum into a 12-bin chroma vector + a total-energy scalar.
// db: Float32Array from AnalyserNode.getFloatFrequencyData (length = fftSize/2).
export function chromaFromSpectrum(db, sampleRate, fftSize, fMin = 65, fMax = 2000) {
  const binHz = sampleRate / fftSize;
  const c = new Float32Array(12);
  let energy = 0;
  const iLo = Math.max(1, Math.floor(fMin / binHz));
  const iHi = Math.min(db.length - 1, Math.ceil(fMax / binHz));
  for (let i = iLo; i <= iHi; i++) {
    const d = db[i];
    if (!(d > -100) || !isFinite(d)) continue; // skip the noise floor / -Infinity
    const mag = Math.pow(10, d / 20);          // dB → linear magnitude
    const f = i * binHz;
    const pc = ((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12;
    c[pc] += mag;
    energy += mag;
  }
  return { chroma: c, energy };
}

// Major + minor triad templates for all 12 roots.
const SHAPES = [{ suffix: '', intervals: [0, 4, 7] }, { suffix: 'm', intervals: [0, 3, 7] }];
export const TEMPLATES = [];
for (let root = 0; root < 12; root++) {
  for (const s of SHAPES) {
    const t = new Float32Array(12);
    for (const iv of s.intervals) t[(root + iv) % 12] = 1;
    TEMPLATES.push({ name: NOTE_NAMES[root] + s.suffix, root, minor: s.suffix === 'm', tmpl: t });
  }
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < 12; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

// Best-matching chord (cosine similarity) for a chroma vector → { name, score, root, minor }.
export function detectChord(chroma) {
  let best = TEMPLATES[0], bestScore = -1;
  for (const t of TEMPLATES) { const s = cosine(chroma, t.tmpl); if (s > bestScore) { bestScore = s; best = t; } }
  return { name: best.name, score: bestScore, root: best.root, minor: best.minor };
}

// Pitch classes a named chord (e.g. "Am", "F#") sounds — for highlighting the chroma bars.
export function chordPitchClasses(name) {
  if (!name || name === '—') return [];
  const minor = name.endsWith('m');
  const root = NOTE_NAMES.indexOf(minor ? name.slice(0, -1) : name);
  if (root < 0) return [];
  return (minor ? [0, 3, 7] : [0, 4, 7]).map((iv) => (root + iv) % 12);
}
