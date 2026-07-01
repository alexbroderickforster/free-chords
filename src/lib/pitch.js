// Monophonic pitch detection for the tuner — a YIN-style estimator plus the
// helpers that let the readout lock onto a string of the chosen tuning.
//
// Why YIN over plain autocorrelation: autocorrelation picks the *tallest*
// correlation peak, and a plucked string's 2nd harmonic is often louder than
// its fundamental (worst on the thin high-E), so it grabs the octave. YIN picks
// the *first* period whose normalised difference dips below a threshold, which
// is structurally resistant to those octave/harmonic errors.

const YIN_THRESHOLD = 0.15;

// Estimate the fundamental of `buf` (a Float32Array of time-domain samples),
// searching only within [minF, maxF] Hz so octave-wrong lags are never
// considered. Returns { freq, clarity, rms }; freq is -1 when the frame is
// below the noise floor. clarity ∈ [0,1] is how periodic the frame is.
export function detectPitch(buf, sampleRate, minF, maxF) {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.008) return { freq: -1, clarity: 0, rms };

  const maxTau = Math.min(Math.floor(sampleRate / minF), SIZE - 1);
  const minTau = Math.max(2, Math.floor(sampleRate / maxF));

  // Difference function d(τ) = Σ (buf[j] − buf[j+τ])².
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let j = 0; j + tau < SIZE; j++) { const x = buf[j] - buf[j + tau]; sum += x * x; }
    d[tau] = sum;
  }
  // Cumulative mean normalised difference d'(τ) = d(τ)·τ / Σ_{k≤τ} d(k).
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  // First dip below threshold within the band, walked down to its local min.
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t] < YIN_THRESHOLD) {
      while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) { // no confident dip — fall back to the deepest one in band
    let best = minTau;
    for (let t = minTau + 1; t <= maxTau; t++) if (cmnd[t] < cmnd[best]) best = t;
    tau = best;
  }
  // Parabolic interpolation around the dip for sub-sample (sub-cent) precision.
  const x0 = tau > minTau ? cmnd[tau - 1] : cmnd[tau];
  const x1 = cmnd[tau];
  const x2 = tau < maxTau ? cmnd[tau + 1] : cmnd[tau];
  const a = x0 + x2 - 2 * x1;
  const b = (x2 - x0) / 2;
  const tauI = a ? tau - b / a : tau;
  return { freq: sampleRate / tauI, clarity: Math.max(0, 1 - x1), rms };
}

// Cents from `ref` to `freq` (positive = sharp).
export function cents(freq, ref) {
  return 1200 * Math.log2(freq / ref);
}

// Fold `freq` by octaves until it sits within ~±700¢ of `ref`. This repairs the
// occasional octave error (e.g. a detected 2nd harmonic) by snapping it back
// toward the string being tuned, without touching in-range readings.
export function foldToward(freq, ref) {
  let f = freq;
  while (f / ref > 1.5) f /= 2;
  while (ref / f > 1.5) f *= 2;
  return f;
}

// Nearest string (by absolute cents, no folding) among `freqs`.
// Returns { idx, cents, abs }.
export function nearestString(freq, freqs) {
  let idx = 0, best = Infinity, signed = 0;
  for (let i = 0; i < freqs.length; i++) {
    const c = cents(freq, freqs[i]);
    if (Math.abs(c) < best) { best = Math.abs(c); signed = c; idx = i; }
  }
  return { idx, cents: signed, abs: best };
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Note name + octave for a frequency (equal temperament, A4=440).
export function noteInfo(freq) {
  const midi = Math.round(12 * Math.log2(freq / 440) + 69);
  return { name: NOTES[(midi % 12 + 12) % 12], octave: Math.floor(midi / 12) - 1 };
}
