// TuningLab — experimental proof-of-concept for "is the guitar in tune with
// itself?" detection. Listens to whatever you play (chords, not single notes),
// measures how tightly the spectral peaks snap to the equal-tempered grid, and
// shows the raw numbers so we can see whether in-tune vs. detuned cleanly
// separates before wrapping it into a between-songs nudge. Not wired into the
// normal flow — reached from Settings → Experimental.
import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../components/index.js';
import { dbToMag, analyzeTuning, tuningVerdict } from '../lib/tuning.js';

const FFT = 32768;               // ~1.5 Hz bins @ 48kHz; parabolic interp refines further
const ENERGY_FLOOR = 0.02;       // below this we treat it as "not playing"
const OPTS = { minHz: 70, maxHz: 1400, maxPeaks: 24, relFloor: 0.06 };

export function TuningLab({ onBack }) {
  const [live, setLive] = useState(false);
  const [r, setR] = useState(null); // latest reading

  const ac = useRef(null), stream = useRef(null), analyser = useRef(null);
  const dbBuf = useRef(null), magBuf = useRef(null), chain = useRef([]);
  const raf = useRef(0), last = useRef(0), liveRef = useRef(false);
  const emaSpread = useRef(null), emaOffset = useRef(null), quiet = useRef(0);
  const mounted = useRef(true), gen = useRef(0);

  const audio = () => { if (!ac.current) ac.current = new (window.AudioContext || window.webkitAudioContext)(); return ac.current; };

  const loop = () => {
    if (!liveRef.current) return;
    const now = performance.now();
    if (now - last.current > 90) {
      last.current = now;
      analyser.current.getFloatFrequencyData(dbBuf.current);
      dbToMag(dbBuf.current, magBuf.current);
      const a = analyzeTuning(magBuf.current, ac.current.sampleRate, FFT, OPTS);
      const playing = a.energy > ENERGY_FLOOR && a.nPeaks >= 4;
      if (playing) {
        emaSpread.current = emaSpread.current == null ? a.spreadCents : emaSpread.current * 0.8 + a.spreadCents * 0.2;
        emaOffset.current = emaOffset.current == null ? a.offsetCents : emaOffset.current * 0.8 + a.offsetCents * 0.2;
        quiet.current = 0;
      } else if (++quiet.current > 22) {
        emaSpread.current = null; emaOffset.current = null;
      }
      setR({ ...a, playing, emaSpread: emaSpread.current, emaOffset: emaOffset.current });
    }
    raf.current = requestAnimationFrame(loop);
  };

  const start = async () => {
    const g = ++gen.current;
    try {
      const ctx = audio(); if (ctx.resume) ctx.resume();
      const ms = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (!mounted.current || g !== gen.current) { ms.getTracks().forEach((t) => t.stop()); return; }
      stream.current = ms;
      const src = ctx.createMediaStreamSource(ms);
      // Gentle high-pass to drop rumble/DC; keep the rest of the spectrum intact.
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 55; hp.Q.value = 0.707;
      analyser.current = ctx.createAnalyser();
      analyser.current.fftSize = FFT;
      analyser.current.smoothingTimeConstant = 0.5;
      dbBuf.current = new Float32Array(analyser.current.frequencyBinCount);
      magBuf.current = new Float32Array(analyser.current.frequencyBinCount);
      src.connect(hp); hp.connect(analyser.current); chain.current = [hp];
      emaSpread.current = null; emaOffset.current = null; quiet.current = 0;
      liveRef.current = true; setLive(true);
      loop();
    } catch {
      if (!mounted.current || g !== gen.current) return;
      setLive(false);
      setR({ error: 'Microphone unavailable — allow mic access to try the detector.' });
    }
  };

  const stop = () => {
    gen.current++;
    liveRef.current = false; setLive(false); cancelAnimationFrame(raf.current);
    if (stream.current) { stream.current.getTracks().forEach((t) => t.stop()); stream.current = null; }
    emaSpread.current = null; emaOffset.current = null;
    setR(null);
  };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; gen.current++; liveRef.current = false; cancelAnimationFrame(raf.current); if (stream.current) stream.current.getTracks().forEach((t) => t.stop()); if (ac.current) { try { ac.current.close(); } catch { /* closed */ } } };
  }, []);

  const spread = r && r.emaSpread != null ? r.emaSpread : null;
  const offset = r && r.emaOffset != null ? r.emaOffset : null;
  const verdict = spread != null ? tuningVerdict(spread) : null;
  const hist = r && r.histogram ? r.histogram : new Array(21).fill(0);
  const histMax = Math.max(0.0001, ...hist);

  return (
    <div className="screen tl">
      <button className="add-back" onClick={onBack}><Icon n="arrow-left" s={16} />Settings</button>
      <div className="screen-head">
        <div className="screen-eyebrow fc-eyebrow">Experimental · proof of concept</div>
        <h1 className="screen-title">Tuning detector</h1>
        <p className="screen-lead">Turn on the mic and play — chords are fine. It measures how tightly what it hears snaps to the note grid. Low “spread” = in tune with itself; high spread = a string has drifted. It can’t tell which string, and a whole-guitar offset (all flat/sharp together) is ignored on purpose.</p>
      </div>

      <div className="tl-readout">
        <div className={'tl-verdict' + (verdict ? ' tl-verdict--' + verdict.level : ' tl-verdict--idle')}>
          <div className="tl-spread">{spread != null ? spread.toFixed(1) : '—'}<span className="tl-unit">cents spread</span></div>
          <div className="tl-vlabel">{verdict ? verdict.label : (live ? 'Play something…' : 'Not listening')}</div>
        </div>

        <div className="tl-hist" aria-hidden="true">
          {hist.map((h, i) => (
            <span key={i} className={'tl-bar' + (i === 10 ? ' tl-bar--center' : '')} style={{ height: (6 + (h / histMax) * 94) + '%' }} />
          ))}
        </div>
        <div className="tl-hist-axis"><span>−50c</span><span>on grid</span><span>+50c</span></div>

        <div className="tl-stats">
          <div className="tl-stat"><span className="tl-stat-k">Overall offset</span><span className="tl-stat-v">{offset != null ? (offset > 0 ? '+' : '') + offset.toFixed(0) + 'c ' + (Math.abs(offset) < 3 ? '' : offset < 0 ? 'flat' : 'sharp') : '—'}</span></div>
          <div className="tl-stat"><span className="tl-stat-k">Spread (live)</span><span className="tl-stat-v">{r && r.playing ? r.spreadCents.toFixed(1) + 'c' : '—'}</span></div>
          <div className="tl-stat"><span className="tl-stat-k">Peaks</span><span className="tl-stat-v">{r && r.playing ? r.nPeaks : '—'}</span></div>
          <div className="tl-stat"><span className="tl-stat-k">Energy</span><span className="tl-stat-v">{r && r.energy != null ? r.energy.toFixed(3) : '—'}</span></div>
        </div>

        {r && r.error && <div className="add-imgmsg add-imgmsg--err"><Icon n="circle-alert" s={14} />{r.error}</div>}

        <button className={'tl-listen' + (live ? ' live' : '')} onClick={() => (liveRef.current ? stop() : start())}>
          <Icon n="mic" s={19} />{live ? 'Listening…' : 'Listen'}
        </button>
        <p className="tl-hint">Try it: tune up properly and strum → spread should sit low. Then knock one string ~30 cents off and strum → the spread and the histogram should visibly widen.</p>
      </div>
    </div>
  );
}
