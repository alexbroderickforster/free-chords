// ChordLab — experimental proof-of-concept for "listen to a song and get the
// chords." Two legitimate inputs the browser is allowed to read: the live mic
// (a song playing in the room, your guitar, anything) or an audio file you drop
// in (which plays through so you hear it). It folds the spectrum into a
// 12-bin chroma, matches major/minor triads, smooths, and prints the
// progression it hears. Rough on purpose — a draft to gauge whether auto
// detection is worth wrapping into a real feature. Reached from Settings →
// Experimental; nothing about it touches YouTube/Spotify streams (that audio is
// DRM-locked and unreadable — the mic sidesteps it by capturing sound in the air).
import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../components/index.js';
import { chromaFromSpectrum, detectChord, chordPitchClasses, NOTE_NAMES } from '../lib/chorddetect.js';

const FFT = 16384;         // ~2.9 Hz bins @ 48kHz — enough low-end for chord roots
const SAMPLE_MS = 80;      // how often we read the spectrum
const WINDOW_MS = 450;     // chord decision window (chords change slowly)
const SMOOTH_N = 3;        // majority vote over this many windows
const ENERGY_FLOOR = 6e-4; // absolute: below this a window is silence, not a chord
const SCORE_MIN = 0.7;     // triad-match confidence to accept a chord (rejects noise/percussion)
const METER_DECAY = 0.92;  // level-meter peak decay per sample (visual only)

export function ChordLab({ onBack }) {
  const [mode, setMode] = useState(null);     // 'mic' | 'file' | null
  const [starting, setStarting] = useState(false); // mic getUserMedia in flight
  const [current, setCurrent] = useState('—');
  const [chroma, setChroma] = useState(() => new Array(12).fill(0));
  const [level, setLevel] = useState(0);
  const [log, setLog] = useState([]);          // committed chords (deduped consecutive)
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const ac = useRef(null), stream = useRef(null), audioEl = useRef(null);
  const srcNode = useRef(null), analyser = useRef(null), dbBuf = useRef(null);
  const raf = useRef(0), liveRef = useRef(false), gen = useRef(0), mounted = useRef(true);
  const lastSample = useRef(0), winStart = useRef(0), startingRef = useRef(false);
  const acc = useRef(new Float32Array(12)), accCount = useRef(0), accEnergy = useRef(0);
  const meterPeak = useRef(0), hist = useRef([]), committed = useRef('—');
  const fileRef = useRef(null);

  const setStartingBoth = (v) => { startingRef.current = v; setStarting(v); };

  // Shared AudioContext, reused across runs (the per-context cap is small on iOS).
  // The iOS audio-session category is set per mode at start time, not here.
  const audio = () => {
    if (!ac.current) ac.current = new (window.AudioContext || window.webkitAudioContext)();
    return ac.current;
  };
  const setAudioSession = (type) => { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch { /* not iOS */ } };

  const loop = () => {
    if (!liveRef.current) return;
    const now = performance.now();
    if (now - lastSample.current >= SAMPLE_MS && analyser.current && ac.current) {
      lastSample.current = now;
      const an = analyser.current, ctx = ac.current;
      an.getFloatFrequencyData(dbBuf.current);
      const { chroma: c, energy } = chromaFromSpectrum(dbBuf.current, ctx.sampleRate, FFT);
      for (let i = 0; i < 12; i++) acc.current[i] += c[i];
      accCount.current++; accEnergy.current += energy;
      meterPeak.current = Math.max(energy, meterPeak.current * METER_DECAY);

      // live viz — normalized instantaneous chroma + input level
      let s = 0; for (let i = 0; i < 12; i++) s += c[i];
      const norm = new Array(12);
      for (let i = 0; i < 12; i++) norm[i] = s > 0 ? c[i] / s : 0;
      setChroma(norm);
      setLevel(meterPeak.current > 0 ? Math.min(1, energy / meterPeak.current) : 0);

      // once per window: average the chroma, pick a chord, smooth, commit
      if (now - winStart.current >= WINDOW_MS && accCount.current) {
        winStart.current = now;
        const avg = new Float32Array(12);
        for (let i = 0; i < 12; i++) avg[i] = acc.current[i] / accCount.current;
        const avgEnergy = accEnergy.current / accCount.current;
        acc.current = new Float32Array(12); accCount.current = 0; accEnergy.current = 0;

        // Gate on absolute level (silence) AND triad-match confidence (noise/percussion).
        let chord = '—';
        if (avgEnergy > ENERGY_FLOOR) {
          const d = detectChord(avg);
          if (d.score >= SCORE_MIN) chord = d.name;
        }

        const h = [...hist.current, chord].slice(-SMOOTH_N);
        hist.current = h;
        const counts = {};
        for (const x of h) counts[x] = (counts[x] || 0) + 1;
        // Highest count wins; on a tie the most-recent window wins (scan newest→oldest).
        let winner = '—', best = 0;
        for (let i = h.length - 1; i >= 0; i--) { const x = h[i]; if (counts[x] > best) { best = counts[x]; winner = x; } }
        setCurrent(winner);
        if (winner === '—') committed.current = '—';
        else if (winner !== committed.current) {
          committed.current = winner;
          setLog((prev) => [...prev, winner]);
        }
      }
    }
    raf.current = requestAnimationFrame(loop);
  };

  const resetRun = () => {
    setError(''); setCopied(false); setLog([]); setCurrent('—'); setChroma(new Array(12).fill(0)); setLevel(0);
    acc.current = new Float32Array(12); accCount.current = 0; accEnergy.current = 0;
    meterPeak.current = 0; hist.current = []; committed.current = '—';
  };

  const beginLoop = (m) => {
    liveRef.current = true; setStartingBoth(false); setMode(m);
    lastSample.current = 0; winStart.current = performance.now();
    raf.current = requestAnimationFrame(loop);
  };

  const startMic = async () => {
    if (startingRef.current) return;   // ignore double-taps while the permission prompt is up
    stopAll(true); resetRun(); setFileName('');
    setStartingBoth(true);
    const g = ++gen.current;   // capture AFTER stopAll (which bumps gen)
    try {
      const ctx = audio(); setAudioSession('play-and-record'); if (ctx.resume) ctx.resume();
      const ms = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (!mounted.current || g !== gen.current) { ms.getTracks().forEach((t) => t.stop()); return; }
      stream.current = ms;
      const src = ctx.createMediaStreamSource(ms);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 55; hp.Q.value = 0.707;
      const an = ctx.createAnalyser(); an.fftSize = FFT; an.smoothingTimeConstant = 0.6;
      dbBuf.current = new Float32Array(an.frequencyBinCount);
      src.connect(hp); hp.connect(an);          // no destination → no feedback
      srcNode.current = src; analyser.current = an;
      beginLoop('mic');
    } catch {
      if (!mounted.current || g !== gen.current) return;
      stopAll(true);
      setError('Microphone unavailable — allow mic access to try the detector.');
    }
  };

  const startFile = (file) => {
    if (!file) return;
    stopAll(true); resetRun();
    const g = ++gen.current;   // capture AFTER stopAll (which bumps gen)
    try {
      const ctx = audio(); setAudioSession('playback'); if (ctx.resume) ctx.resume();
      const el = new Audio();
      el.src = URL.createObjectURL(file);
      audioEl.current = el;
      const src = ctx.createMediaElementSource(el);
      const an = ctx.createAnalyser(); an.fftSize = FFT; an.smoothingTimeConstant = 0.6;
      dbBuf.current = new Float32Array(an.frequencyBinCount);
      src.connect(an); an.connect(ctx.destination);   // hear it while analyzing
      srcNode.current = src; analyser.current = an;
      el.onended = () => { if (g === gen.current) stopAll(); };
      el.onerror = () => { if (g === gen.current) { stopAll(true); setError('Couldn’t play that file.'); } };
      el.play().then(() => {
        if (!mounted.current || g !== gen.current) { stopAll(true); return; }
        setFileName(file.name); beginLoop('file');
      }).catch(() => { if (g === gen.current) { stopAll(true); setError('Couldn’t play that file.'); } });
    } catch {
      stopAll(true); setError('Couldn’t analyze that file.');
    }
  };

  // stopAll(quiet): tear down the current source but keep the AudioContext for reuse.
  // A user-initiated stop (quiet falsy) also suspends the context so iOS releases
  // the audio session; the next start resumes it.
  const stopAll = (quiet) => {
    gen.current++;
    liveRef.current = false; setStartingBoth(false); cancelAnimationFrame(raf.current); raf.current = 0;
    if (audioEl.current) {
      try { audioEl.current.pause(); } catch { /* already stopped */ }
      const u = audioEl.current.src;
      if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
      audioEl.current = null;
    }
    if (stream.current) { stream.current.getTracks().forEach((t) => t.stop()); stream.current = null; }
    try { if (srcNode.current) srcNode.current.disconnect(); } catch { /* */ }
    try { if (analyser.current) analyser.current.disconnect(); } catch { /* */ }
    srcNode.current = null; analyser.current = null;
    if (!quiet && ac.current && ac.current.state === 'running') { try { ac.current.suspend(); } catch { /* */ } }
    setMode(null); setCurrent('—'); setLevel(0); setChroma(new Array(12).fill(0));
    if (!quiet) setFileName('');
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; gen.current++; liveRef.current = false; cancelAnimationFrame(raf.current);
      if (audioEl.current) {
        try { audioEl.current.pause(); } catch { /* */ }
        const u = audioEl.current.src;
        if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);   // don't leak the file blob on navigate-away
      }
      if (stream.current) stream.current.getTracks().forEach((t) => t.stop());
      if (ac.current) { try { ac.current.close(); } catch { /* closed */ } }
    };
  }, []);

  const onPickFile = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) startFile(f);
  };

  const copyChords = () => {
    const text = log.join('  ');
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };
    try {
      const p = navigator.clipboard && navigator.clipboard.writeText(text);
      if (p && p.then) p.then(done).catch(() => { /* denied */ }); else done();
    } catch { /* clipboard unavailable */ }
  };

  const chordNotes = chordPitchClasses(current);
  const chromaMax = Math.max(0.001, ...chroma);
  const listenLabel = starting ? 'Starting…' : (mode === 'mic' ? 'Listening…' : 'Listen');

  return (
    <div className="screen cl">
      <button className="add-back" onClick={onBack}><Icon n="arrow-left" s={16} />Settings</button>
      <div className="screen-head">
        <div className="screen-eyebrow fc-eyebrow">Experimental · proof of concept</div>
        <h1 className="screen-title">Chord detector</h1>
        <p className="screen-lead">Play a song out loud and hit <b>Listen</b>, or drop in an audio file. It prints the chords it hears — major and minor triads only, and it <i>will</i> make mistakes. Think of it as a rough first draft you’d tidy up, not a finished chart.</p>
      </div>

      <div className="cl-readout">
        <div className={'cl-now' + (mode ? ' cl-now--live' : '')}>
          <div className="cl-chord">{current}</div>
          <div className="cl-nowlabel">{mode ? (mode === 'file' ? (fileName || 'Analyzing file…') : 'Listening…') : (starting ? 'Starting…' : 'Not listening')}</div>
        </div>

        <div className="cl-level" aria-hidden="true"><span className="cl-level-fill" style={{ width: Math.round(level * 100) + '%' }} /></div>

        <div className="cl-chroma" aria-hidden="true">
          {NOTE_NAMES.map((n, i) => (
            <div key={i} className="cl-cslot">
              <span className="cl-cbarwrap"><span className={'cl-cbar' + (chordNotes.includes(i) ? ' cl-cbar--on' : '')} style={{ height: (4 + (chroma[i] / chromaMax) * 96) + '%' }} /></span>
              <span className={'cl-cnote' + (chordNotes.includes(i) ? ' cl-cnote--on' : '')}>{n}</span>
            </div>
          ))}
        </div>

        {error && <div className="add-imgmsg add-imgmsg--err"><Icon n="circle-alert" s={14} />{error}</div>}

        <div className="cl-controls">
          <button className={'cl-listen' + (mode === 'mic' ? ' live' : '')} onClick={() => (mode === 'mic' ? stopAll() : startMic())} disabled={mode === 'file' || starting}>
            <Icon n="mic" s={19} />{listenLabel}
          </button>
          <button className="cl-file" onClick={() => (mode === 'file' ? stopAll() : (fileRef.current && fileRef.current.click()))} disabled={mode === 'mic' || starting}>
            <Icon n={mode === 'file' ? 'square' : 'upload'} s={17} />{mode === 'file' ? 'Stop' : 'Analyze a file'}
          </button>
          <input ref={fileRef} type="file" accept="audio/*" hidden onChange={onPickFile} />
        </div>

        <div className="cl-proghead">
          <span className="cl-proglabel">Chords heard</span>
          {log.length > 0 && (
            <span className="cl-proglinks">
              <button type="button" className="bk-link" onClick={copyChords}>{copied ? 'Copied' : 'Copy'}</button>
              <span className="bk-sep" aria-hidden="true">·</span>
              <button type="button" className="bk-link" onClick={() => setLog([])}>Clear</button>
            </span>
          )}
        </div>
        <div className="cl-prog">
          {log.length === 0
            ? <span className="cl-progempty">Chords will appear here as they’re detected.</span>
            : log.map((c, i) => <span key={i} className="cl-chip">{c}</span>)}
        </div>

        <p className="tl-hint">Best on clear, simple songs — a full mix with heavy drums or distortion will confuse it. If a file comes out muddy, try one with a strong guitar or piano part. Nothing is uploaded; the audio is analyzed on your device and not saved.</p>
      </div>
    </div>
  );
}
