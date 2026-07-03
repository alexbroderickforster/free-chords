// Practice — an A/B loop player for drilling a passage. Paste a YouTube URL/ID,
// load a local audio file, or point to a remote audio URL; set A and B, and it
// repeats that slice at your chosen speed. Saved loops persist (and sync);
// loops can be shared as a link.
import React, { useEffect, useRef, useState } from 'react';
import { Input, Button, Card, Icon } from '../components/index.js';
import {
  detectSource, parseYouTubeId, fmtTime, clamp, shiftLoop, scaleLoop,
  loopToParams, snapRate,
} from '../lib/loop.js';

// Load the YouTube IFrame API once, resolve with window.YT.
let ytApiPromise = null;
function loadYT() {
  if (typeof window === 'undefined') return Promise.reject();
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) { try { prev(); } catch { /* ignore */ } } resolve(window.YT); };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    });
  }
  return ytApiPromise;
}

const DEFAULT_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function Practice({ loops = [], onSaveLoop, onDeleteLoop, initialLoop }) {
  const [input, setInput] = useState('');
  const [source, setSource] = useState(null); // {kind:'youtube',id,label} | {kind:'audio',audioSrc,isLocal,shareUrl,label}
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [cur, setCur] = useState(0);
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [speed, setSpeed] = useState(1);
  const [preRoll, setPreRoll] = useState(0);
  const [ytRates, setYtRates] = useState(DEFAULT_RATES);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [copied, setCopied] = useState(false);

  const ytWrap = useRef(null);   // React-owned wrapper; YT replaces a child of it
  const ytPlayer = useRef(null);
  const audioRef = useRef(null);
  const objUrl = useRef(null);   // object URL for a local file
  const pendingLocal = useRef(null); // A/B/speed carried over for a local-file saved loop
  const dragging = useRef(false);

  const trackRef = useRef(null);

  // Mirror live state for the rAF loop + key handlers (no stale closures).
  const latest = useRef({});
  latest.current = { source, a, b, speed, preRoll, ytRates, duration, playing };

  const round1 = (n) => Math.round(n * 10) / 10;
  // When a fresh source loads with no loop, default the pins to the whole clip
  // so they're immediately visible and draggable.
  const defaultAB = (d) => { if (d > 0 && latest.current.a == null && latest.current.b == null) { setA(0); setB(round1(d)); } };

  // ---- player accessors (whichever source is active) ----
  const getTime = () => {
    const s = latest.current.source; if (!s) return 0;
    if (s.kind === 'youtube') { try { return ytPlayer.current ? ytPlayer.current.getCurrentTime() : 0; } catch { return 0; } }
    return audioRef.current ? audioRef.current.currentTime : 0;
  };
  const seek = (t) => {
    const s = latest.current.source; if (!s) return;
    t = Math.max(0, t);
    if (s.kind === 'youtube') { try { ytPlayer.current && ytPlayer.current.seekTo(t, true); } catch { /* ignore */ } }
    else if (audioRef.current) audioRef.current.currentTime = t;
    setCur(t);
  };
  const play = () => {
    const s = latest.current.source; if (!s) return;
    if (s.kind === 'youtube') { try { ytPlayer.current && ytPlayer.current.playVideo(); } catch { /* ignore */ } }
    else if (audioRef.current) audioRef.current.play().catch(() => {});
  };
  const pause = () => {
    const s = latest.current.source; if (!s) return;
    if (s.kind === 'youtube') { try { ytPlayer.current && ytPlayer.current.pauseVideo(); } catch { /* ignore */ } }
    else if (audioRef.current) audioRef.current.pause();
  };
  const applyRate = (r) => {
    const s = latest.current.source; if (!s) return;
    if (s.kind === 'youtube') { try { ytPlayer.current && ytPlayer.current.setPlaybackRate(snapRate(r, latest.current.ytRates)); } catch { /* ignore */ } }
    else if (audioRef.current) audioRef.current.playbackRate = r;
  };
  // Where the loop (re)starts: A, minus any pre-roll lead-in. Play, the rAF
  // wrap, and manual restart all begin here so the A–B pins define where playback runs.
  const loopStart = () => { const { a: la, preRoll: pr } = latest.current; return Math.max(0, (la || 0) - (pr || 0)); };

  // ---- load a source ----
  const loadSource = (src, preset) => {
    setError('');
    setReady(false); setPlaying(false); setDuration(0); setCur(0);
    setYtRates(DEFAULT_RATES);
    setA(preset && preset.a != null ? preset.a : null);
    setB(preset && preset.b != null ? preset.b : null);
    setSpeed(preset && preset.speed ? preset.speed : 1);
    setPreRoll(preset && preset.preRoll ? preset.preRoll : 0);
    setSource(src);
  };

  const commitInput = (raw) => {
    const det = detectSource(raw);
    if (!det) { setError('Paste a YouTube link/ID, or a direct audio file URL (mp3, m4a, …).'); return; }
    if (det.kind === 'youtube') loadSource({ kind: 'youtube', id: det.id, label: det.id });
    else loadSource({ kind: 'audio', audioSrc: det.url, isLocal: false, shareUrl: det.url, label: det.url });
  };

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (objUrl.current) { URL.revokeObjectURL(objUrl.current); objUrl.current = null; }
    const url = URL.createObjectURL(f);
    objUrl.current = url;
    setInput('');
    const preset = pendingLocal.current; pendingLocal.current = null; // carry over saved A/B if any
    loadSource({ kind: 'audio', audioSrc: url, isLocal: true, shareUrl: null, label: f.name }, preset);
  };

  // Apply a saved / shared loop.
  const openLoop = (loop) => {
    if (!loop) return;
    if (loop.kind === 'youtube') {
      setInput(loop.id);
      loadSource({ kind: 'youtube', id: loop.id, label: loop.id }, loop);
    } else if (loop.kind === 'audioUrl') {
      setInput(loop.url);
      loadSource({ kind: 'audio', audioSrc: loop.url, isLocal: false, shareUrl: loop.url, label: loop.url }, loop);
    } else if (loop.kind === 'local') {
      // Can't restore the file itself — carry the points, ask for the file, and
      // re-apply them once the file is loaded.
      pendingLocal.current = { a: loop.a != null ? loop.a : null, b: loop.b != null ? loop.b : null, speed: loop.speed || 1, preRoll: loop.preRoll || 0 };
      setError(`“${loop.name}” is a local file — re-open it with “Audio file” and your A–B points will be kept.`);
      setInput('');
      setSource(null);
    }
  };

  // Apply an initial loop from a share link, once.
  const appliedInitial = useRef(false);
  useEffect(() => {
    if (initialLoop && !appliedInitial.current) { appliedInitial.current = true; openLoop(initialLoop); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLoop]);

  // ---- YouTube player lifecycle ----
  const ytId = source && source.kind === 'youtube' ? source.id : null;
  useEffect(() => {
    if (!ytId) return;
    let destroyed = false;
    loadYT().then((YT) => {
      if (destroyed || !ytWrap.current) return;
      ytWrap.current.innerHTML = '';            // fresh target so switching videos works
      const target = document.createElement('div');
      ytWrap.current.appendChild(target);
      ytPlayer.current = new YT.Player(target, {
        videoId: ytId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, controls: 0 },
        events: {
          onReady: (ev) => {
            setReady(true);
            const d = ev.target.getDuration() || 0;
            setDuration(d);
            try { const r = ev.target.getAvailablePlaybackRates(); if (r && r.length) setYtRates(r); } catch { /* ignore */ }
            applyRate(latest.current.speed);
            defaultAB(d);
          },
          onStateChange: (ev) => {
            if (ev.data === 1) { setPlaying(true); const d = ev.target.getDuration(); if (d) setDuration(d); }
            else if (ev.data === 2 || ev.data === 0) setPlaying(false);
          },
        },
      });
    });
    return () => {
      destroyed = true;
      try { ytPlayer.current && ytPlayer.current.destroy(); } catch { /* ignore */ }
      ytPlayer.current = null;
      if (ytWrap.current) ytWrap.current.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytId]);

  // ---- Audio element lifecycle ----
  const audioSrc = source && source.kind === 'audio' ? source.audioSrc : null;
  useEffect(() => {
    if (!audioSrc) return;
    const el = audioRef.current; if (!el) return;
    el.src = audioSrc;
    el.playbackRate = latest.current.speed;
    try { el.preservesPitch = el.mozPreservesPitch = el.webkitPreservesPitch = true; } catch { /* ignore */ }
    const onMeta = () => { const d = el.duration || 0; setDuration(d); setReady(true); defaultAB(d); };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      try { el.pause(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSrc]);

  // Revoke a local object URL when it's replaced / on unmount.
  useEffect(() => () => { if (objUrl.current) URL.revokeObjectURL(objUrl.current); }, []);

  // ---- loop + time rAF (runs while playing) ----
  useEffect(() => {
    if (!playing) return;
    let raf;
    const tick = () => {
      const t = getTime();
      if (!dragging.current) setCur(t);
      const { a: la, b: lb } = latest.current;
      if (la != null && lb != null && lb > la && t >= lb - 0.04) seek(loopStart());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Apply speed to the active player.
  useEffect(() => { if (ready) applyRate(speed); }, [speed, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const s = latest.current;
      const k = e.key;
      const hit = (fn) => { e.preventDefault(); fn(); };
      if (k === ' ') return hit(togglePlay);
      if (k === 's' || k === 'S') return hit(() => setA(round1(getTime())));
      if (k === 'e' || k === 'E') return hit(() => setB(round1(getTime())));
      if (k === 'c' || k === 'C') return hit(clearLoop);
      if (k === 'r' || k === 'R') return hit(() => { if (s.a != null) seek(loopStart()); });
      if (k === 'ArrowLeft') return hit(() => seek(getTime() - 5));
      if (k === 'ArrowRight') return hit(() => seek(getTime() + 5));
      if (k === 'o' || k === 'O') return hit(() => doShift(-1));
      if (k === 'p' || k === 'P') return hit(() => doShift(1));
      if (k === '[') return hit(() => doScale(0.5));
      if (k === ']') return hit(() => doScale(2));
      if (k === '-' || k === '_' || k === ',') return hit(() => stepSpeed(-1));
      if (k === '=' || k === '+' || k === '.') return hit(() => stepSpeed(1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- actions ----
  const togglePlay = () => {
    if (!source) return;
    const s = latest.current;
    if (s.playing) { pause(); return; }
    // Start the loop at A (honoring pre-roll) when the head sits outside [A, B),
    // so the pins define where play begins; continue in place if already inside.
    const { a: la, b: lb } = s;
    if (la != null && lb != null && lb > la) { const t = getTime(); if (t < la || t >= lb) seek(loopStart()); }
    play();
  };
  const clearLoop = () => { setA(null); setB(null); };
  const setStart = () => setA(round1(getTime()));
  const setEnd = () => setB(round1(getTime()));
  const nudgeA = (d) => setA((v) => (v == null ? v : clamp(round1(v + d), 0, duration || Infinity)));
  const nudgeB = (d) => setB((v) => (v == null ? v : clamp(round1(v + d), 0, duration || Infinity)));
  const doShift = (dir) => { const { a: la, b: lb } = latest.current; const r = shiftLoop(la, lb, duration, dir); setA(r.a); setB(r.b); if (latest.current.playing) seek(r.a); };
  const doScale = (f) => { const { a: la, b: lb } = latest.current; const r = scaleLoop(la, lb, duration, f); setA(r.a); setB(r.b); };
  // Speed from the slider: for YouTube snap to its allowed rates (so it never
  // feels "stuck" between them); for audio it's continuous, with a soft detent
  // at 1× so normal speed is easy to hit.
  const setSpeedFromSlider = (val) => {
    const s = latest.current;
    if (s.source && s.source.kind === 'youtube') setSpeed(snapRate(val, s.ytRates));
    else { let v = round1(val); if (Math.abs(v - 1) < 0.06) v = 1; setSpeed(clamp(v, 0.25, 2)); }
  };
  // Slower / faster by one step. YouTube steps through its allowed rates; audio
  // steps by 0.05.
  const stepSpeed = (dir) => {
    const s = latest.current;
    if (s.source && s.source.kind === 'youtube') {
      const rates = (s.ytRates && s.ytRates.length ? s.ytRates.slice() : DEFAULT_RATES.slice()).sort((x, y) => x - y);
      let i = rates.indexOf(snapRate(s.speed, rates));
      if (i === -1) i = 0;
      setSpeed(rates[clamp(i + dir, 0, rates.length - 1)]);
    } else {
      setSpeed(clamp(round1(s.speed + dir * 0.05), 0.25, 2));
    }
  };

  const seekFrac = (frac) => { if (duration) seek(clamp(frac, 0, 1) * duration); };
  // Drag an A or B pin along the track to reposition the loop point.
  const markDown = (which) => (e) => {
    e.stopPropagation(); e.preventDefault();
    const track = trackRef.current || (e.currentTarget.closest && e.currentTarget.closest('.pr-track'));
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const apply = (clientX) => {
      const frac = clamp((clientX - rect.left) / rect.width, 0, 1);
      let t = round1(frac * (latest.current.duration || 0));
      if (which === 'a') { const bb = latest.current.b; if (bb != null) t = Math.min(t, bb); setA(t); }
      else { const aa = latest.current.a; if (aa != null) t = Math.max(t, aa); setB(t); }
    };
    apply(e.clientX);
    dragging.current = true;
    const onMove = (ev) => apply(ev.clientX);
    const onUp = () => { dragging.current = false; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const trackDown = (e) => {
    if (!duration) return;
    dragging.current = true;
    const move = (clientX, rect) => { const frac = (clientX - rect.left) / rect.width; setCur(clamp(frac, 0, 1) * duration); };
    const rect = e.currentTarget.getBoundingClientRect();
    move(e.clientX, rect);
    const onMove = (ev) => move(ev.clientX, rect);
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const frac = (ev.clientX - rect.left) / rect.width;
      dragging.current = false;
      seekFrac(frac);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ---- save / share ----
  const asLoop = () => {
    if (!source) return null;
    const base = { a, b, speed, preRoll };
    if (source.kind === 'youtube') return { ...base, kind: 'youtube', id: source.id };
    if (source.kind === 'audio' && !source.isLocal) return { ...base, kind: 'audioUrl', url: source.shareUrl };
    return { ...base, kind: 'local', name: source.label };
  };
  const canShare = source && (source.kind === 'youtube' || (source.kind === 'audio' && !source.isLocal));
  const doSave = () => {
    const l = asLoop(); if (!l || !onSaveLoop) return;
    onSaveLoop({ ...l, name: saveName.trim() || defaultName() });
    setSaving(false); setSaveName('');
  };
  const defaultName = () => {
    const where = a != null && b != null ? `${fmtTime(a)}–${fmtTime(b)}` : 'loop';
    if (source.kind === 'youtube') return `YouTube ${where}`;
    return `${source.label.slice(0, 28)} ${where}`;
  };
  const doShare = async () => {
    const l = asLoop(); if (!l || !canShare) return;
    const url = location.origin + import.meta.env.BASE_URL + '?' + loopToParams(l).toString();
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { window.prompt('Copy this loop link:', url); }
  };

  const loopLen = a != null && b != null ? Math.max(0, b - a) : 0;
  const pct = (t) => (duration ? clamp(t / duration, 0, 1) * 100 : 0);
  const shownRate = source && source.kind === 'youtube' ? snapRate(speed, ytRates) : speed;

  return (
    <div className="screen practice">
      <div className="screen-head">
        <div className="screen-eyebrow fc-eyebrow">Loop & slow down any passage</div>
        <h1 className="screen-title">Practice</h1>
        <p className="screen-lead">Paste a YouTube link, load an audio file, or point to an audio URL. Set an A–B loop and drill it at your own tempo.</p>
      </div>

      {/* Source */}
      <div className="pr-source">
        <Input iconLeft={<Icon n="search" s={18} />} placeholder="YouTube URL / ID, or audio file URL"
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitInput(input); }} />
        <div className="pr-source-actions">
          <Button variant="primary" onClick={() => commitInput(input)} disabled={!input.trim()}>Load</Button>
          <label className="pr-upload">
            <Icon n="upload" s={16} /> Audio file
            <input type="file" accept="audio/*" hidden onChange={onFile} />
          </label>
        </div>
      </div>
      {error && <div className="pr-error"><Icon n="circle-alert" s={14} />{error}</div>}

      {!source ? (
        <Card flat className="pr-empty">
          <Icon n="repeat" s={22} />
          <div>Load something above to start looping.</div>
        </Card>
      ) : (
        <>
          {/* Player with an integrated full-width scrubber + draggable A/B pins */}
          <div className="pr-stage">
            {source.kind === 'youtube'
              ? <div className="pr-video" ref={ytWrap} />
              : <div className="pr-video pr-video--audio"><Icon n={playing ? 'audio-lines' : 'music'} s={26} /><span className="pr-audioname">{source.label}</span></div>}
            <div className="pr-scrub">
              <div className="pr-track" ref={trackRef} onPointerDown={trackDown}>
                {a != null && b != null && b > a && (
                  <div className="pr-loopband" style={{ left: pct(a) + '%', width: (pct(b) - pct(a)) + '%' }} />
                )}
                <div className="pr-played" style={{ width: pct(cur) + '%' }} />
                <div className="pr-head" style={{ left: pct(cur) + '%' }} />
                {a != null && (
                  <div className="pr-mark pr-mark--a" style={{ left: pct(a) + '%' }} onPointerDown={markDown('a')} role="slider" aria-label="Loop start" tabIndex={0}>
                    <span className="pr-mark-line" /><span className="pr-mark-pin">A</span>
                  </div>
                )}
                {b != null && (
                  <div className="pr-mark pr-mark--b" style={{ left: pct(b) + '%' }} onPointerDown={markDown('b')} role="slider" aria-label="Loop end" tabIndex={0}>
                    <span className="pr-mark-line" /><span className="pr-mark-pin">B</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Transport + speed */}
          <div className="pr-controls">
            <div className="pr-transport">
              <button className="pr-ic" aria-label="Back 5 seconds" onClick={() => seek(getTime() - 5)}><Icon n="skip-back" s={18} /></button>
              <button className="pr-play" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}><Icon n={playing ? 'pause' : 'play'} s={26} /></button>
              <button className="pr-ic" aria-label="Forward 5 seconds" onClick={() => seek(getTime() + 5)}><Icon n="skip-forward" s={18} /></button>
              <button className="pr-ic" aria-label="Restart loop" onClick={() => a != null && seek(loopStart())}><Icon n="rotate-ccw" s={18} /></button>
              <span className="pr-time">{fmtTime(cur)}<span className="pr-time-sep">/</span>{fmtTime(duration)}</span>
            </div>
            <div className="pr-speed">
              <button className="pr-spd-ic" aria-label="Slower" onClick={() => stepSpeed(-1)}><Icon n="turtle" s={20} /></button>
              <div className="pr-speed-track">
                <input type="range" min="0.25" max="2" step="0.05" value={speed} onChange={(e) => setSpeedFromSlider(Number(e.target.value))} aria-label="Playback speed" />
                <span className="pr-speed-center" aria-hidden="true" />
              </div>
              <button className="pr-spd-ic" aria-label="Faster" onClick={() => stepSpeed(1)}><Icon n="rabbit" s={20} /></button>
              <span className="pr-rate" title={source.kind === 'youtube' ? 'Snaps to YouTube’s speed steps' : ''}><Icon n="clock" s={14} />{shownRate.toFixed(2)}×</span>
            </div>
          </div>

          {/* Loop points */}
          <div className="pr-block">
            <div className="pr-block-h fc-eyebrow">Loop <span className="pr-loose">{a != null && b != null ? `${fmtTime(a, true)} – ${fmtTime(b, true)} · ${loopLen.toFixed(1)}s` : 'not set'}</span></div>
            <div className="pr-ab">
              <div className="pr-abcol">
                <button className="pr-btn" onClick={setStart}>Set A</button>
                <div className="pr-nudge"><button onClick={() => nudgeA(-0.1)} disabled={a == null}>−0.1</button><span>{a != null ? fmtTime(a, true) : '—'}</span><button onClick={() => nudgeA(0.1)} disabled={a == null}>+0.1</button></div>
              </div>
              <div className="pr-abcol">
                <button className="pr-btn" onClick={setEnd}>Set B</button>
                <div className="pr-nudge"><button onClick={() => nudgeB(-0.1)} disabled={b == null}>−0.1</button><span>{b != null ? fmtTime(b, true) : '—'}</span><button onClick={() => nudgeB(0.1)} disabled={b == null}>+0.1</button></div>
              </div>
              <button className="pr-btn pr-btn--quiet" onClick={clearLoop} disabled={a == null && b == null}>Clear</button>
            </div>
            <div className="pr-looprow">
              <div className="pr-mini"><span className="pr-mini-lbl">Shift</span><button onClick={() => doShift(-1)} disabled={a == null || b == null} aria-label="Shift loop back">◀</button><button onClick={() => doShift(1)} disabled={a == null || b == null} aria-label="Shift loop forward">▶</button></div>
              <div className="pr-mini"><span className="pr-mini-lbl">Length</span><button onClick={() => doScale(0.5)} disabled={a == null || b == null}>½</button><button onClick={() => doScale(2)} disabled={a == null || b == null}>2×</button></div>
              <div className="pr-mini"><span className="pr-mini-lbl">Pre-roll</span><button onClick={() => setPreRoll((v) => Math.max(0, round1(v - 0.5)))} disabled={preRoll <= 0}>−</button><span>{preRoll ? preRoll.toFixed(1) + 's' : 'off'}</span><button onClick={() => setPreRoll((v) => round1(v + 0.5))}>+</button></div>
            </div>
          </div>

          {/* Save / share */}
          <div className="pr-savebar">
            {saving ? (
              <div className="pr-saverow">
                <Input autoFocus placeholder={defaultName()} value={saveName} onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') doSave(); else if (e.key === 'Escape') setSaving(false); }} />
                <Button variant="primary" size="sm" onClick={doSave}>Save loop</Button>
                <button className="pr-link" onClick={() => setSaving(false)}>Cancel</button>
              </div>
            ) : (
              <>
                <Button variant="secondary" size="sm" iconLeft={<Icon n="bookmark" s={16} />} onClick={() => setSaving(true)} disabled={!onSaveLoop}>Save loop</Button>
                {canShare && <Button variant="ghost" size="sm" iconLeft={<Icon n="share-2" s={16} />} onClick={doShare}>{copied ? 'Copied!' : 'Share'}</Button>}
              </>
            )}
          </div>
        </>
      )}

      {/* Saved loops */}
      {loops.length > 0 && (
        <div className="pr-saved">
          <div className="pr-block-h fc-eyebrow">Saved loops</div>
          <div className="pr-savedlist">
            {loops.map((l) => (
              <div className="pr-savedrow" key={l.id}>
                <button className="pr-savedmain" onClick={() => openLoop(l)}>
                  <span className="pr-savedname">{l.name}</span>
                  <span className="pr-savedsub">
                    {l.kind === 'youtube' ? 'YouTube' : l.kind === 'local' ? 'Local file' : 'Audio URL'}
                    {l.a != null && l.b != null ? ` · ${fmtTime(l.a)}–${fmtTime(l.b)}` : ''}{l.speed && l.speed !== 1 ? ` · ${l.speed}×` : ''}
                  </span>
                </button>
                <button className="pr-savedx" aria-label="Delete loop" onClick={() => onDeleteLoop && onDeleteLoop(l.id)}><Icon n="x" s={16} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shortcuts */}
      <div className="pr-keys">
        <div className="pr-block-h fc-eyebrow">Keyboard</div>
        <div className="pr-keygrid">
          {[['Space', 'Play / pause'], ['S / E', 'Set A / B'], ['C', 'Clear loop'], ['R', 'Restart at A'],
            ['← / →', 'Seek ∓5s'], ['O / P', 'Shift loop'], ['[ / ]', 'Half / double length'], ['− / +', 'Slower / faster']].map(([k, d]) => (
            <div className="pr-key" key={k}><kbd>{k}</kbd><span>{d}</span></div>
          ))}
        </div>
      </div>

      {/* the audio element lives here for the whole screen's life */}
      <audio ref={audioRef} preload="metadata" style={{ display: 'none' }} />
    </div>
  );
}
