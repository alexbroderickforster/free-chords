// TunerView — in-app guitar/bass tuner: reference tones + live mic pitch detection.
//
// Detection uses a YIN-style estimator (lib/pitch.js) that resists the octave
// errors plain autocorrelation shows on bright strings. In the default "Tuning"
// mode the readout LOCKS onto the nearest string of the selected tuning and only
// ever shows how flat/sharp you are from THAT target — so it never hops to a
// neighbouring chromatic note while you tune one string. "Chromatic" mode keeps
// the old free-running behaviour for checking arbitrary notes.
import React, { useState, useRef, useEffect } from 'react';
import { SegmentedControl, Icon } from '../components/index.js';
import { detectPitch, foldToward, nearestString, cents, noteInfo } from '../lib/pitch.js';

const TN_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const TUNINGS = {
  guitar: { lead: 'Standard tuning · E A D G B E', strings: [82.41, 110.00, 146.83, 196.00, 246.94, 329.63] },
  bass: { lead: 'Standard tuning · E A D G', strings: [41.20, 55.00, 73.42, 98.00] },
};
// Precompute display info { freq, name, octave } per string.
for (const t of Object.values(TUNINGS)) t.info = t.strings.map((f) => ({ freq: f, ...noteInfo(f) }));

// Detection config per instrument + mode. Tighter bands + a band-pass keep
// rumble/hum/upper-harmonics out of the estimator so the fundamental dominates;
// chromatic mode widens the range at the cost of some octave robustness.
const DET = {
  guitar: {
    tuning: { band: [70, 460], fft: 2048, filters: [['highpass', 70, 0.707], ['notch', 60, 8], ['lowpass', 460, 0.707]] },
    chromatic: { band: [65, 1100], fft: 2048, filters: [['highpass', 60, 0.707], ['lowpass', 1200, 0.707]] },
  },
  bass: {
    tuning: { band: [30, 170], fft: 4096, filters: [['highpass', 30, 0.707], ['lowpass', 170, 0.707]] },
    chromatic: { band: [28, 420], fft: 4096, filters: [['highpass', 25, 0.707], ['lowpass', 480, 0.707]] },
  },
};

const OWN_BAND = 250;   // cents each string "owns" for auto-detect (strings are ~400–500¢ apart)
const CLARITY_MIN = 0.85;

export function TunerView() {
  const [live, setLive] = useState(false);
  const [instrument, setInstrument] = useState('guitar'); // 'guitar' | 'bass'
  const [mode, setMode] = useState('tuning');             // 'tuning' | 'chromatic'
  const [manualIdx, setManualIdx] = useState(-1);         // -1 = auto-detect which string
  const strings = TUNINGS[instrument].info;

  const root = useRef(null);
  const ac = useRef(null), stream = useRef(null), analyser = useRef(null), buf = useRef(null), chain = useRef([]);
  const raf = useRef(0), last = useRef(0), liveRef = useRef(false);
  const hist = useRef([]), sLog = useRef(0), silence = useRef(0);
  const lockIdx = useRef(-1), candIdx = useRef(-1), candN = useRef(0);
  const manualRef = useRef(-1);
  const inTuneSince = useRef(0), confirmed = useRef(false);
  const mounted = useRef(true), startGen = useRef(0);

  const audio = () => { if (!ac.current) ac.current = new (window.AudioContext || window.webkitAudioContext)(); return ac.current; };
  const $ = (sel) => root.current && root.current.querySelector(sel);

  const resetLock = () => {
    hist.current = []; sLog.current = 0; silence.current = 0;
    lockIdx.current = -1; candIdx.current = -1; candN.current = 0;
    inTuneSince.current = 0; confirmed.current = false;
  };

  const playTone = (freq) => {
    const ctx = audio(), t = ctx.currentTime;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.28, t + 0.03);
    g.gain.setValueAtTime(0.28, t + 1.0); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(g).connect(ctx.destination); osc.start(t); osc.stop(t + 1.65);
  };

  // Tapping a string always previews its tone. While listening it also pins the
  // target to that string (the escape hatch for a string that's so far out that
  // auto-detect would grab the wrong one); tap again or "Auto" to release.
  const onString = (idx, btn) => {
    playTone(idx < 0 ? 0 : strings[idx].freq);
    if (liveRef.current) {
      const next = manualIdx === idx ? -1 : idx;
      setManualIdx(next); manualRef.current = next; resetLock();
    } else {
      btn.classList.add('on'); setTimeout(() => btn.classList.remove('on'), 1600);
    }
  };

  // Median(≤5) + slew-limited EMA, all in the log-frequency domain so smoothing
  // is linear in cents. Returns the smoothed frequency.
  const smoothFreq = (freq) => {
    const h = hist.current; h.push(Math.log2(freq)); if (h.length > 5) h.shift();
    const med = [...h].sort((a, b) => a - b)[Math.floor(h.length / 2)];
    if (!sLog.current) { sLog.current = med; }
    else {
      let s = sLog.current * 0.6 + med * 0.4;
      const moved = (s - sLog.current) * 1200;               // cents this frame
      if (Math.abs(moved) > 60) s = sLog.current + Math.sign(moved) * (60 / 1200);
      sLog.current = s;
    }
    return Math.pow(2, sLog.current);
  };

  const setDot = (c, extraStatus) => {
    const pos = Math.max(2, Math.min(98, 50 + (c / 50) * 50));
    const dot = $('.tn-dot'); dot.style.left = pos + '%';
    const inTune = Math.abs(c) <= 5, close = Math.abs(c) <= 15;
    dot.className = 'tn-dot' + (inTune ? ' intune' : close ? ' close' : ' off');
    $('.tn-meter').classList.toggle('intune', inTune);
    $('.tn-cents').textContent = (c > 0 ? '+' : '') + Math.round(c) + ' cents';
    const st = $('.tn-status');
    if (inTune) { st.textContent = 'In tune ✓'; st.className = 'tn-status intune'; }
    else { st.textContent = (c < 0 ? 'Tune up ▲' : 'Tune down ▼') + extraStatus; st.className = 'tn-status'; }
    return inTune;
  };

  const setNote = (name, octave) => {
    const acc = name.includes('#');
    const el = $('.tn-note'); el.className = 'tn-note';
    el.innerHTML = '<span class="n">' + name[0] + '</span>' + (acc ? '<span class="acc">♯</span>' : '') + '<span class="oct">' + octave + '</span>';
  };

  const confirmInTune = (inTune) => {
    if (inTune) {
      if (!inTuneSince.current) inTuneSince.current = performance.now();
      if (!confirmed.current && performance.now() - inTuneSince.current > 350) {
        confirmed.current = true;
        if (navigator.vibrate) navigator.vibrate(35);
      }
    } else {
      inTuneSince.current = 0;
    }
  };

  // Tuning mode: choose the target string (manual, or auto with hysteresis),
  // octave-repair the reading toward it, and drive the readout from cents-to-string.
  const readTuning = (freq) => {
    const manual = manualRef.current;
    let target;
    if (manual >= 0) {
      target = manual;
    } else {
      const raw = nearestString(freq, TUNINGS[instrument].strings);
      if (lockIdx.current < 0) {
        if (raw.abs > OWN_BAND) return;                 // wait for a clean in-band pluck
        lockIdx.current = raw.idx; hist.current = []; sLog.current = 0;
      } else if (raw.idx !== lockIdx.current && raw.abs <= OWN_BAND) {
        // Only switch strings once a new one wins 3 frames running (kills flicker).
        if (candIdx.current === raw.idx) candN.current++; else { candIdx.current = raw.idx; candN.current = 1; }
        if (candN.current >= 3) { lockIdx.current = raw.idx; candIdx.current = -1; candN.current = 0; hist.current = []; sLog.current = 0; }
      } else { candIdx.current = -1; candN.current = 0; }
      target = lockIdx.current;
    }
    const ref = strings[target].freq;
    const folded = foldToward(freq, ref);
    const c0 = cents(folded, ref);
    if (Math.abs(c0) > (manual >= 0 ? 350 : OWN_BAND)) return;   // noise / uncorrectable octave

    const c = cents(smoothFreq(folded), ref);
    setNote(strings[target].name, strings[target].octave);
    const inTune = setDot(c, Math.abs(c) > 50 ? ' · keep going' : '');
    confirmInTune(inTune);
    root.current.querySelectorAll('.tn-str').forEach((el, i) => el.classList.toggle('near', i === target && manual < 0));
  };

  // Chromatic mode: free-running nearest-of-12 readout (the classic behaviour).
  const readChromatic = (freq) => {
    const f = smoothFreq(freq);
    const midi = Math.round(12 * Math.log2(f / 440) + 69);
    const ref = 440 * Math.pow(2, (midi - 69) / 12);
    const c = cents(f, ref);
    setNote(TN_NOTES[(midi % 12 + 12) % 12], Math.floor(midi / 12) - 1);
    confirmInTune(setDot(c, ''));
    const rn = nearestString(f, TUNINGS[instrument].strings);
    root.current.querySelectorAll('.tn-str').forEach((el, i) => el.classList.toggle('near', i === rn.idx && rn.abs <= 40));
  };

  const idle = () => {
    const el = $('.tn-note'); el.className = 'tn-note idle'; el.innerHTML = '<span class="n">—</span>';
    const dot = $('.tn-dot'); dot.className = 'tn-dot'; dot.style.left = '50%';
    $('.tn-meter').classList.remove('intune');
    $('.tn-cents').textContent = '—';
    root.current.querySelectorAll('.tn-str').forEach((el) => el.classList.remove('near'));
    const st = $('.tn-status'); st.className = 'tn-status';
    st.textContent = mode === 'chromatic' ? 'Play any note' : 'Play a string — it locks onto the nearest one';
  };

  const loop = () => {
    if (!liveRef.current) return;
    const now = performance.now();
    if (now - last.current > 60) {
      last.current = now;
      const det = DET[instrument][mode];
      analyser.current.getFloatTimeDomainData(buf.current);
      const { freq, clarity, rms } = detectPitch(buf.current, ac.current.sampleRate, det.band[0], det.band[1]);
      const fill = $('.tn-level-fill');
      if (fill) fill.style.width = (Math.max(0, Math.min(1, (rms - 0.008) / 0.11)) * 100).toFixed(0) + '%';
      if (freq > 0 && freq >= det.band[0] && freq <= det.band[1] && clarity >= CLARITY_MIN) {
        silence.current = 0;
        mode === 'chromatic' ? readChromatic(freq) : readTuning(freq);
      } else if (++silence.current > 8) {
        resetLock(); idle();
      }
    }
    raf.current = requestAnimationFrame(loop);
  };

  const startMic = async () => {
    const gen = ++startGen.current; // invalidates any earlier pending start
    try {
      const ctx = audio();
      const ms = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (!mounted.current || gen !== startGen.current) { ms.getTracks().forEach((t) => t.stop()); return; }
      stream.current = ms;
      const det = DET[instrument][mode];
      const src = ctx.createMediaStreamSource(ms);
      // Band-pass chain so rumble / mains hum / upper harmonics never reach the estimator.
      let node = src; chain.current = [];
      for (const [type, freq, q] of det.filters) {
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        node.connect(f); node = f; chain.current.push(f);
      }
      analyser.current = ctx.createAnalyser();
      analyser.current.fftSize = det.fft;
      buf.current = new Float32Array(analyser.current.fftSize);
      node.connect(analyser.current);
      resetLock();
      liveRef.current = true; setLive(true);
      idle();
      $('.tn-status').textContent = 'Listening…';
      $('.tn-hint').textContent = 'Play a single string and let it ring.';
      loop();
    } catch (e) {
      if (!mounted.current || gen !== startGen.current) return;
      $('.tn-status').textContent = 'Microphone unavailable — use the reference tones.';
      $('.tn-hint').textContent = 'Allow mic access to tune by ear, or tap a string for its tone.';
    }
  };

  const stopMic = () => {
    startGen.current++; // cancel any in-flight startMic
    liveRef.current = false; setLive(false); cancelAnimationFrame(raf.current);
    if (stream.current) { stream.current.getTracks().forEach((t) => t.stop()); stream.current = null; }
    setManualIdx(-1); manualRef.current = -1;
    resetLock();
    const el = $('.tn-note'); el.className = 'tn-note idle'; el.innerHTML = '<span class="n">—</span>';
    $('.tn-status').textContent = 'Tap a string for a reference tone'; $('.tn-status').className = 'tn-status';
    $('.tn-meter').classList.remove('intune'); $('.tn-dot').className = 'tn-dot'; $('.tn-dot').style.left = '50%'; $('.tn-cents').textContent = '—';
    root.current.querySelectorAll('.tn-str').forEach((el) => el.classList.remove('near'));
    const fill = $('.tn-level-fill'); if (fill) fill.style.width = '0%';
    $('.tn-hint').textContent = 'Or tune by ear with the reference tones above.';
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; startGen.current++;
      liveRef.current = false; cancelAnimationFrame(raf.current);
      if (stream.current) stream.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Restart the mic when instrument or mode changes mid-listen so the new
  // fftSize / band / filter chain / string set take effect.
  useEffect(() => {
    if (!liveRef.current) return;
    stopMic();
    startMic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument, mode]);

  return (
    <div className="screen tn" ref={root}>
      <div className="screen-head">
        <div className="screen-eyebrow fc-eyebrow">Tune up</div>
        <h1 className="screen-title">Tuner</h1>
        <p className="screen-lead">{TUNINGS[instrument].lead}</p>
        <div className="tn-instrument">
          <SegmentedControl
            options={[{ value: 'guitar', label: 'Guitar' }, { value: 'bass', label: 'Bass' }]}
            value={instrument} onChange={setInstrument} />
        </div>
        <div className="tn-mode">
          <SegmentedControl
            options={[{ value: 'tuning', label: 'Tuning' }, { value: 'chromatic', label: 'Chromatic' }]}
            value={mode} onChange={setMode} />
        </div>
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

      <div className="tn-strings" data-count={strings.length}>
        {strings.map((s, i) => (
          <button className={'tn-str' + (live && manualIdx === i ? ' locked' : '')} key={i} onClick={(e) => onString(i, e.currentTarget)}>
            <span className="sn">{s.name[0]}{s.name.includes('#') ? '♯' : ''}</span><span className="sf">{s.freq.toFixed(0)} Hz</span>
          </button>
        ))}
      </div>

      {live && (
        <div className="tn-lock-row">
          {manualIdx >= 0
            ? <button className="tn-auto" onClick={() => { setManualIdx(-1); manualRef.current = -1; resetLock(); }}><Icon n="rotate-ccw" s={14} />Auto-detect</button>
            : mode === 'tuning' ? <span className="tn-lock-hint">Auto-detecting the nearest string — tap one to lock onto it.</span> : null}
        </div>
      )}

      <div className="tn-listen-row">
        {live && <div className="tn-level"><div className="tn-level-fill"></div></div>}
        <button className={'tn-listen' + (live ? ' live' : '')} onClick={() => (liveRef.current ? stopMic() : startMic())}>
          <Icon n="mic" s={19} />{live ? 'Listening…' : 'Listen'}
        </button>
        <div className="tn-hint">Or tune by ear with the reference tones above.</div>
      </div>
    </div>
  );
}
