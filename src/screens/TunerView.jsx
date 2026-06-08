// TunerView — in-app guitar tuner: reference tones + live mic pitch detection.
import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../components/index.js';

const TN_STRINGS = [
  { label: 'E', freq: 82.41 }, { label: 'A', freq: 110.00 }, { label: 'D', freq: 146.83 },
  { label: 'G', freq: 196.00 }, { label: 'B', freq: 246.94 }, { label: 'E', freq: 329.63 },
];
const TN_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function autoCorrelate(b, sampleRate) {
  let SIZE = b.length, rms = 0;
  for (let i = 0; i < SIZE; i++) rms += b[i] * b[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;
  let r1 = 0, r2 = SIZE - 1; const thr = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(b[i]) < thr) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(b[SIZE - i]) < thr) { r2 = SIZE - i; break; }
  const buf2 = b.slice(r1, r2); SIZE = buf2.length;
  const c = new Array(SIZE).fill(0);
  for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE - i; j++) c[i] += buf2[j] * buf2[j + i];
  let d = 0; while (c[d] > c[d + 1]) d++;
  let maxv = -1, maxp = -1;
  for (let i = d; i < SIZE; i++) if (c[i] > maxv) { maxv = c[i]; maxp = i; }
  let T0 = maxp;
  const x1 = c[T0 - 1] || 0, x2 = c[T0] || 0, x3 = c[T0 + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2, bb = (x3 - x1) / 2;
  if (a) T0 = T0 - bb / (2 * a);
  return sampleRate / T0;
}

export function TunerView() {
  const [live, setLive] = useState(false);
  const root = useRef(null);
  const ac = useRef(null), stream = useRef(null), analyser = useRef(null), buf = useRef(null);
  const raf = useRef(0), last = useRef(0), liveRef = useRef(false);
  const hist = useRef([]), smooth = useRef(0), silence = useRef(0);

  const audio = () => { if (!ac.current) ac.current = new (window.AudioContext || window.webkitAudioContext)(); return ac.current; };
  const $ = (sel) => root.current && root.current.querySelector(sel);

  const playTone = (freq, btn) => {
    const ctx = audio(), t = ctx.currentTime;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.28, t + 0.03);
    g.gain.setValueAtTime(0.28, t + 1.0); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(g).connect(ctx.destination); osc.start(t); osc.stop(t + 1.65);
    root.current.querySelectorAll('.tn-str').forEach((s) => s.classList.remove('on'));
    if (btn) { btn.classList.add('on'); setTimeout(() => btn.classList.remove('on'), 1600); }
  };

  const setReadout = (freq) => {
    if (freq <= 0) return;
    const midi = Math.round(12 * Math.log2(freq / 440) + 69);
    const refFreq = 440 * Math.pow(2, (midi - 69) / 12);
    const cents = Math.round(1200 * Math.log2(freq / refFreq));
    const name = TN_NOTES[(midi % 12 + 12) % 12], octave = Math.floor(midi / 12) - 1, acc = name.includes('#');
    const noteEl = $('.tn-note'); noteEl.className = 'tn-note';
    noteEl.innerHTML = '<span class="n">' + name[0] + '</span>' + (acc ? '<span class="acc">♯</span>' : '') + '<span class="oct">' + octave + '</span>';
    const pos = Math.max(2, Math.min(98, 50 + (cents / 50) * 50));
    $('.tn-dot').style.left = pos + '%';
    const inTune = Math.abs(cents) <= 5;
    $('.tn-meter').classList.toggle('intune', inTune);
    $('.tn-cents').textContent = (cents > 0 ? '+' : '') + cents + ' cents';
    let near = 0, best = 1e9;
    TN_STRINGS.forEach((s, i) => { const dd = Math.abs(1200 * Math.log2(freq / s.freq)); if (dd < best) { best = dd; near = i; } });
    root.current.querySelectorAll('.tn-str').forEach((el, i) => el.classList.toggle('near', i === near));
    const st = $('.tn-status');
    if (inTune) { st.textContent = 'In tune'; st.className = 'tn-status intune'; }
    else { st.textContent = cents < 0 ? 'Tune up ▲' : 'Tune down ▼'; st.className = 'tn-status'; }
  };

  const loop = () => {
    if (!liveRef.current) return;
    const now = performance.now();
    if (now - last.current > 70) {
      last.current = now;
      analyser.current.getFloatTimeDomainData(buf.current);
      const f = autoCorrelate(buf.current, ac.current.sampleRate);
      if (f > 50 && f < 1200) {
        silence.current = 0;
        // Median of recent readings drops single-frame spikes / octave glitches.
        const h = hist.current; h.push(f); if (h.length > 6) h.shift();
        const sorted = [...h].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const prev = smooth.current;
        // Snap on a real note change (> ~¾ semitone); otherwise ease toward it.
        const jump = prev > 0 ? Math.abs(1200 * Math.log2(median / prev)) : Infinity;
        smooth.current = jump > 75 ? median : prev * 0.78 + median * 0.22;
        setReadout(smooth.current);
      } else if (++silence.current > 8) {
        // Sustained silence: forget history so the next note locks on cleanly.
        hist.current = []; smooth.current = 0;
      }
    }
    raf.current = requestAnimationFrame(loop);
  };

  const startMic = async () => {
    try {
      const ctx = audio();
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const src = ctx.createMediaStreamSource(stream.current);
      analyser.current = ctx.createAnalyser(); analyser.current.fftSize = 2048;
      buf.current = new Float32Array(analyser.current.fftSize);
      src.connect(analyser.current);
      hist.current = []; smooth.current = 0; silence.current = 0;
      liveRef.current = true; setLive(true);
      $('.tn-status').textContent = 'Listening…';
      $('.tn-hint').textContent = 'Play a single string and let it ring.';
      loop();
    } catch (e) {
      $('.tn-status').textContent = 'Microphone unavailable — use the reference tones.';
      $('.tn-hint').textContent = 'Allow mic access to tune by ear, or tap a string for its tone.';
    }
  };
  const stopMic = () => {
    liveRef.current = false; setLive(false); cancelAnimationFrame(raf.current);
    if (stream.current) stream.current.getTracks().forEach((t) => t.stop());
    const noteEl = $('.tn-note'); noteEl.className = 'tn-note idle'; noteEl.innerHTML = '<span class="n">—</span>';
    $('.tn-status').textContent = 'Tap a string for a reference tone'; $('.tn-status').className = 'tn-status';
    $('.tn-meter').classList.remove('intune'); $('.tn-dot').style.left = '50%'; $('.tn-cents').textContent = '—';
    root.current.querySelectorAll('.tn-str').forEach((el) => el.classList.remove('near'));
    $('.tn-hint').textContent = 'Or tune by ear with the reference tones above.';
  };

  useEffect(() => () => {
    liveRef.current = false; cancelAnimationFrame(raf.current);
    if (stream.current) stream.current.getTracks().forEach((t) => t.stop());
  }, []);

  return (
    <div className="screen tn" ref={root}>
      <div className="screen-head">
        <div className="screen-eyebrow fc-eyebrow">Tune up</div>
        <h1 className="screen-title">Tuner</h1>
        <p className="screen-lead">Standard tuning · E A D G B E</p>
      </div>

      <div className="tn-note idle"><span className="n">—</span></div>
      <div className="tn-status">Tap a string for a reference tone</div>

      <div className="tn-meter">
        <div className="tn-scale">
          <div className="tn-zone"></div>
          <div className="tn-mline"></div>
          <div className="tn-tick" style={{ left: '10%' }}></div>
          <div className="tn-tick" style={{ left: '30%' }}></div>
          <div className="tn-tick c" style={{ left: '50%' }}></div>
          <div className="tn-tick" style={{ left: '70%' }}></div>
          <div className="tn-tick" style={{ left: '90%' }}></div>
          <div className="tn-dot"></div>
        </div>
        <div className="tn-ends"><span>♭ flat</span><span>in tune</span><span>sharp ♯</span></div>
        <div className="tn-cents">—</div>
      </div>

      <div className="tn-strings">
        {TN_STRINGS.map((s, i) => (
          <button className="tn-str" key={i} onClick={(e) => playTone(s.freq, e.currentTarget)}>
            <span className="sn">{s.label}</span><span className="sf">{s.freq.toFixed(0)} Hz</span>
          </button>
        ))}
      </div>

      <div className="tn-listen-row">
        <button className={'tn-listen' + (live ? ' live' : '')} onClick={() => (liveRef.current ? stopMic() : startMic())}>
          <Icon n="mic" s={19} />{live ? 'Listening…' : 'Listen'}
        </button>
        <div className="tn-hint">Or tune by ear with the reference tones above.</div>
      </div>
    </div>
  );
}
