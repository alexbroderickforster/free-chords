// Tuning-health detection (experimental).
//
// Goal: from a strummed/played guitar signal — WITHOUT knowing the chord — decide
// whether the instrument is in tune *with itself*. The idea: an in-tune guitar
// (any key/capo/alt-tuning) puts its energy on the 12-tone equal-tempered grid,
// so the strong spectral peaks snap to semitones; a detuned string sits BETWEEN
// grid lines. So we peak-pick the spectrum, measure each peak's cents deviation
// from the nearest semitone, and look at the spread of those deviations.
//
// A uniform offset (whole guitar flat to A=435) is fine — it's in tune with
// itself — so we separate the OFFSET (central tendency) from the SPREAD (internal
// disagreement). Only spread means "sounds out of tune." We can't say which
// string; only that something's off.
//
// All pure functions over a linear-magnitude spectrum, so they unit-test without
// a mic. Cents are treated circularly (period 100) since deviation wraps at ±50.

// Convert an AnalyserNode dB spectrum to linear magnitude in place-friendly form.
export function dbToMag(db, out) {
  const n = db.length;
  const m = out && out.length === n ? out : new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = Math.pow(10, db[i] / 20);
  return m;
}

// Cents deviation of a frequency from the nearest equal-tempered semitone (A440),
// in [-50, 50]. Also returns the MIDI note it snapped to.
export function centsFromGrid(freq) {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const nearest = Math.round(midi);
  return { cents: (midi - nearest) * 100, midi: nearest };
}

// Pick prominent spectral peaks from a linear-magnitude spectrum. Parabolic
// interpolation on the log magnitudes refines each peak to sub-bin frequency
// accuracy (essential for cents-level precision from a finite FFT).
export function pickPeaks(mag, sampleRate, fftSize, opts = {}) {
  const { minHz = 70, maxHz = 1400, maxPeaks = 24, relFloor = 0.06 } = opts;
  const binHz = sampleRate / fftSize;
  const lo = Math.max(1, Math.floor(minHz / binHz));
  const hi = Math.min(mag.length - 2, Math.ceil(maxHz / binHz));
  let peakMax = 0;
  for (let i = lo; i <= hi; i++) if (mag[i] > peakMax) peakMax = mag[i];
  if (peakMax <= 0) return [];
  const floor = peakMax * relFloor;
  const peaks = [];
  for (let i = lo; i <= hi; i++) {
    const m = mag[i];
    if (m < floor) continue;
    if (m <= mag[i - 1] || m < mag[i + 1]) continue; // strict local maximum
    const a = Math.log(Math.max(mag[i - 1], 1e-12));
    const b = Math.log(Math.max(m, 1e-12));
    const c = Math.log(Math.max(mag[i + 1], 1e-12));
    const denom = a - 2 * b + c;
    const delta = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
    const freq = (i + Math.max(-0.5, Math.min(0.5, delta))) * binHz;
    peaks.push({ freq, mag: m });
  }
  peaks.sort((x, y) => y.mag - x.mag);
  return peaks.slice(0, maxPeaks);
}

// Magnitude-weighted circular stats over cents values (period 100).
function circular(cents, weights) {
  const k = (2 * Math.PI) / 100;
  let sx = 0, sy = 0, sw = 0;
  for (let i = 0; i < cents.length; i++) {
    const w = weights[i];
    sx += w * Math.cos(cents[i] * k);
    sy += w * Math.sin(cents[i] * k);
    sw += w;
  }
  if (sw === 0) return { mean: 0, R: 1 };
  const R = Math.min(1, Math.sqrt(sx * sx + sy * sy) / sw); // resultant length 0..1
  return { mean: Math.atan2(sy / sw, sx / sw) / k, R };     // mean back in cents
}

const wrap50 = (c) => (((c + 50) % 100) + 100) % 100 - 50;

// Analyze a linear-magnitude spectrum. Returns:
//   offsetCents  — overall flat/sharp of the whole instrument (fine on its own)
//   spreadCents  — internal disagreement; the "out of tune" signal
//   energy       — summed peak magnitude (is anyone actually playing?)
//   nPeaks, peaks, histogram (21 bins of weighted residual cents over [-50,50])
export function analyzeTuning(mag, sampleRate, fftSize, opts = {}) {
  const peaks = pickPeaks(mag, sampleRate, fftSize, opts);
  const energy = peaks.reduce((s, p) => s + p.mag, 0);
  const empty = { peaks: [], nPeaks: peaks.length, energy, offsetCents: 0, spreadCents: 0, R: 1, histogram: new Array(21).fill(0) };
  if (peaks.length < 3) return empty;

  const cents = peaks.map((p) => centsFromGrid(p.freq).cents);
  const weights = peaks.map((p) => p.mag); // loud on-grid fundamentals dominate weak off-grid harmonics
  const { mean: offset } = circular(cents, weights);
  const residuals = cents.map((c) => wrap50(c - offset));
  const { R } = circular(residuals, weights);
  // Circular standard deviation (radians) → cents.
  const spreadCents = Math.min(50, Math.sqrt(Math.max(0, -2 * Math.log(Math.max(R, 1e-6)))) * (100 / (2 * Math.PI)));

  const histogram = new Array(21).fill(0);
  let wsum = 0;
  for (let i = 0; i < residuals.length; i++) {
    const bin = Math.max(0, Math.min(20, Math.round(((residuals[i] + 50) / 100) * 20)));
    histogram[bin] += weights[i];
    wsum += weights[i];
  }
  if (wsum > 0) for (let i = 0; i < 21; i++) histogram[i] /= wsum;

  return {
    peaks: peaks.map((p, i) => ({ freq: p.freq, mag: p.mag, cents: cents[i], residual: residuals[i] })),
    nPeaks: peaks.length, energy, offsetCents: offset, spreadCents, R, histogram,
  };
}

// Verdict from a (smoothed) spread. Thresholds are deliberately generous — this
// should only speak up when clearly off. Tunable once we see real-guitar numbers.
export function tuningVerdict(spreadCents) {
  if (spreadCents < 9) return { level: 'good', label: 'Sounds in tune' };
  if (spreadCents < 18) return { level: 'borderline', label: 'A little off' };
  return { level: 'bad', label: 'Sounds out of tune' };
}
