// Web Audio playback for a Score — the same synth approach as the tuner/trainer.
// Schedules each note on the AudioContext clock (sample-accurate) and fires a
// callback per note so the UI can move a playhead. Returns a stop() function.
import { noteBeats, keyToMidi, midiToFreq, accSemitone } from './score.js';

const Ctx = () => (window.AudioContext || window.webkitAudioContext);

// A short plucked-ish tone with a soft attack/release, so runs don't click.
function scheduleTone(actx, out, freq, start, dur) {
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, start);
  const a = 0.006, r = Math.min(0.08, dur * 0.4), peak = 0.2;
  const hold = Math.max(start + a, start + dur - r);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + a);
  gain.gain.setValueAtTime(peak, hold);
  gain.gain.linearRampToValueAtTime(0, start + dur);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.03);
}

// Play the whole score. opts: { onNote(index), onDone() }. Returns stop().
export function playScore(score, opts = {}) {
  const AC = Ctx(); if (!AC) return () => {};
  const actx = new AC();
  const master = actx.createGain(); master.gain.value = 0.9; master.connect(actx.destination);
  const beatSec = 60 / (score.tempo || 90);
  const timers = [];
  let t = actx.currentTime + 0.12;
  (score.notes || []).forEach((note, i) => {
    const durSec = noteBeats(note) * beatSec;
    if (!note.rest && note.keys && note.keys.length) {
      note.keys.forEach((k, ki) => scheduleTone(actx, master, midiToFreq(keyToMidi(k) + (ki === 0 ? accSemitone(note.accidental) : 0)), t, durSec));
    }
    const atMs = Math.max(0, (t - actx.currentTime) * 1000);
    if (opts.onNote) timers.push(setTimeout(() => opts.onNote(i), atMs));
    t += durSec;
  });
  const endMs = Math.max(0, (t - actx.currentTime) * 1000) + 60;
  timers.push(setTimeout(() => { opts.onDone && opts.onDone(); try { actx.close(); } catch { /* already closed */ } }, endMs));

  return () => {
    timers.forEach(clearTimeout);
    try { actx.close(); } catch { /* already closed */ }
  };
}

// One transient note, for audition while placing/selecting. Reuses a single
// shared AudioContext (like the tuner/trainer) — a fresh context per keystroke
// would hit the browser's concurrent-context cap during fast entry and throw.
let _auditionCtx = null;
export function playTone(key, seconds = 0.4, acc = null) {
  const AC = Ctx(); if (!AC) return;
  try {
    if (!_auditionCtx || _auditionCtx.state === 'closed') _auditionCtx = new AC();
    if (_auditionCtx.state === 'suspended') _auditionCtx.resume();
    const now = _auditionCtx.currentTime + 0.01;
    scheduleTone(_auditionCtx, _auditionCtx.destination, midiToFreq(keyToMidi(key) + accSemitone(acc)), now, seconds);
  } catch { /* audio unavailable — silent */ }
}
