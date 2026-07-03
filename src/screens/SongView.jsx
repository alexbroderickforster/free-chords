// SongView — the play-along song view. Teleprompter reading with edge-fade,
// smooth auto-scroll + speed, transpose / capo, and hover chord diagrams.
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Stepper, prettyKey, Icon } from '../components/index.js';
import { STATUS, keyToPing } from '../lib/music.js';
import { chordSVG, preloadChords } from '../lib/chords.js';
import { toSections, transposeChordName } from '../lib/chordpro.js';
import { dbToMag, analyzeTuning } from '../lib/tuning.js';

// One lyric line: chord-over-syllable columns (chords already transposed).
function ChordLine({ segments }) {
  return (
    <div className="sv-line">
      {segments.map((seg, i) => (
        <span className="sv-seg" key={i}>
          <span className="sv-chord">{seg.chord ||' '}</span>
          <span className="sv-lyric">{seg.text || ' '}</span>
        </span>
      ))}
    </div>
  );
}

const COUNTDOWN_SECS = 5; // pause between songs in a playlist run

// Background tuning-health monitor (opt-in mic). While a song plays we sample the
// spectrum and measure how tightly it snaps to the note grid (see lib/tuning.js);
// the median "spread" over the song decides whether to nudge "tune up" at the end.
const TUNE_FFT = 32768;
const TUNE_OPTS = { minHz: 70, maxHz: 1400, maxPeaks: 24, relFloor: 0.06 };
const TUNE_ENERGY_FLOOR = 0.02; // below this, treat the frame as "not playing"
const TUNE_MIN_SAMPLES = 12;    // ~2s of real playing before we're willing to judge
const TUNE_NUDGE_SPREAD = 18;   // median cents-spread that counts as out of tune

export function SongView({ song, onBack, onArtist, dark, onToggleTheme, focusMode, onToggleFocus, onToggleStar, onCycleStatus, onUpdateTags, onEdit, prefs = {}, onSavePref, onCapo, onAddToPlaylist, playlist = null, onPlaylistNext, onPlaylistPrev, onPlaylistExit, keyPing = false, onToggleKeyPing, onExport, tuningMonitor = false, onSetTuningMonitor, onOpenTuner }) {
  const [transpose, setTranspose] = useState(prefs.transpose ?? 0);
  const [capo, setCapo] = useState(song.capo || 0);
  const [fontSize, setFontSize] = useState(prefs.fontSize ?? 28);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(prefs.speed ?? 4);
  const [bpm, setBpm] = useState(prefs.bpm ?? 90);
  const [useBpm, setUseBpm] = useState(prefs.useBpm ?? false);
  const [tune, setTune] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [hideChords, setHideChords] = useState(prefs.hideChords ?? false);
  const [tagDraft, setTagDraft] = useState('');
  const [tagEditing, setTagEditing] = useState(false);
  const [countdown, setCountdown] = useState(null); // null | seconds remaining | 'done'
  const [leaving, setLeaving] = useState(false); // fading the current song out before a playlist advance
  const cdRef = useRef(null), endedRef = useRef(false), fadeRef = useRef(null); // endedRef: fire the end-of-song advance once
  // Metronome — Web Audio clicks scheduled at the song's BPM (accent every 4th).
  const [metronome, setMetronome] = useState(false);
  const actx = useRef(null), schedRef = useRef(null), nextNoteRef = useRef(0), beatRef = useRef(0), metroBpmRef = useRef(90);
  // Background tuning monitor: mic stream/analyser + per-song spread accumulator.
  const [tuningNudge, setTuningNudge] = useState(false); // "sounds out of tune" flagged for this song
  const [micDenied, setMicDenied] = useState(false);
  const micStream = useRef(null), micAn = useRef(null), micDb = useRef(null), micMag = useRef(null), micTimer = useRef(null), micGen = useRef(0);
  const spreads = useRef([]); // per-frame cents-spread readings while playing
  // Scratch-track recorder: capture the mic while the sheet scrolls, then save/share it.
  const [recording, setRecording] = useState(false);
  const [recTime, setRecTime] = useState(0);          // elapsed seconds while recording
  const [recTake, setRecTake] = useState(null);       // { url, blob, ext, seconds } finished take
  const [recError, setRecError] = useState('');
  const recRef = useRef(null), recStream = useRef(null), recChunks = useRef([]), recTimer = useRef(null), recStart = useRef(0);
  // The scroll RAF loop must call the CURRENT playlist callbacks without being
  // in its deps (that would restart the loop and stutter). Read them via a ref.
  const latest = useRef({});
  latest.current = { playlist, onPlaylistNext };
  metroBpmRef.current = Math.max(30, Math.min(300, parseInt(bpm, 10) || 90));
  const latestKeyPing = useRef(keyPing); latestKeyPing.current = keyPing;
  const clearCountdown = () => { if (cdRef.current) { clearInterval(cdRef.current); cdRef.current = null; } setCountdown(null); };
  const startCountdownTick = () => {
    if (cdRef.current) return;
    cdRef.current = setInterval(() => {
      setCountdown((c) => (typeof c !== 'number' ? c : c <= 1 ? 0 : c - 1));
    }, 1000);
  };
  // Verdict from the tuning samples gathered while this song played: out of tune
  // only when we have enough samples of real playing AND their median spread is
  // clearly high (median resists the odd bend/vibrato frame).
  const evalTuning = () => {
    const arr = spreads.current;
    if (arr.length < TUNE_MIN_SAMPLES) return false;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] >= TUNE_NUDGE_SPREAD;
  };

  // Auto-scroll hit the end of a song. In a playlist, roll into the next one
  // after a short countdown (or finish on the last song).
  const reachedBottom = () => {
    if (endedRef.current) return; // fire once per pass
    endedRef.current = true;
    setPlaying(false);
    if (evalTuning()) setTuningNudge(true); // flag before the countdown / end shows
    const pl = latest.current.playlist;
    if (!pl) return;
    if (!pl.isLast) { setCountdown(COUNTDOWN_SECS); startCountdownTick(); maybeKeyPing(); }
    else setCountdown('done');
  };

  // One shared AudioContext for the metronome + the ear-training key ping.
  const ensureAudio = () => {
    if (!actx.current) actx.current = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.current.resume) actx.current.resume();
    return actx.current;
  };

  // ---- Background tuning monitor (opt-in mic) ----
  const sampleTuning = () => {
    const an = micAn.current, ctx = actx.current; if (!an || !ctx) return;
    an.getFloatFrequencyData(micDb.current);
    dbToMag(micDb.current, micMag.current);
    const a = analyzeTuning(micMag.current, ctx.sampleRate, TUNE_FFT, TUNE_OPTS);
    if (a.energy > TUNE_ENERGY_FLOOR && a.nPeaks >= 5) spreads.current.push(a.spreadCents);
  };
  const startTuningMic = async () => {
    if (micStream.current) return; // already listening
    const g = ++micGen.current;
    try {
      const ctx = ensureAudio();
      const ms = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (g !== micGen.current) { ms.getTracks().forEach((t) => t.stop()); return; }
      micStream.current = ms;
      const src = ctx.createMediaStreamSource(ms);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 55; hp.Q.value = 0.707;
      const an = ctx.createAnalyser(); an.fftSize = TUNE_FFT; an.smoothingTimeConstant = 0.5;
      src.connect(hp); hp.connect(an);
      micAn.current = an;
      micDb.current = new Float32Array(an.frequencyBinCount);
      micMag.current = new Float32Array(an.frequencyBinCount);
      setMicDenied(false);
      if (micTimer.current) clearInterval(micTimer.current);
      micTimer.current = setInterval(sampleTuning, 180);
    } catch {
      if (g !== micGen.current) return;
      setMicDenied(true);
      if (onSetTuningMonitor) onSetTuningMonitor(false); // couldn't get the mic — turn the opt-in back off
    }
  };
  const stopTuningMic = () => {
    micGen.current++;
    if (micTimer.current) { clearInterval(micTimer.current); micTimer.current = null; }
    if (micStream.current) { micStream.current.getTracks().forEach((t) => t.stop()); micStream.current = null; }
    micAn.current = null;
  };

  // ---- Scratch-track recorder (mic → downloadable audio file) ----
  const fmtSec = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const recMime = () => {
    if (typeof MediaRecorder === 'undefined') return null;
    for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg']) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  };
  const startRecording = async () => {
    if (recording) return;
    setRecError('');
    if (recTake) { URL.revokeObjectURL(recTake.url); setRecTake(null); } // drop a prior take
    const mime = recMime();
    if (mime == null) { setRecError('Recording isn’t supported in this browser.'); return; }
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      recStream.current = ms;
      const ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
      const rec = new MediaRecorder(ms, mime ? { mimeType: mime } : undefined);
      recChunks.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(recChunks.current, { type: mime || 'audio/webm' });
        const seconds = Math.round((performance.now() - recStart.current) / 1000);
        setRecTake({ url: URL.createObjectURL(blob), blob, ext, seconds });
        if (recStream.current) { recStream.current.getTracks().forEach((t) => t.stop()); recStream.current = null; }
      };
      recRef.current = rec;
      rec.start();
      recStart.current = performance.now();
      setRecTime(0); setRecording(true);
      recTimer.current = setInterval(() => setRecTime(Math.floor((performance.now() - recStart.current) / 1000)), 250);
      // Play-along: scroll from the top while recording.
      const sc = scRef.current; if (sc) { sc.scrollTop = 0; endedRef.current = false; }
      setPlaying(true);
    } catch {
      setRecError('Mic access is blocked — allow it to record a scratch take.');
      if (recStream.current) { recStream.current.getTracks().forEach((t) => t.stop()); recStream.current = null; }
    }
  };
  const stopRecording = () => {
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
    setRecording(false); setPlaying(false);
    try { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop(); } catch { /* ignore */ }
    recRef.current = null;
  };
  const recFileName = () => {
    const k = transposeChordName(song.key, transpose);
    const key = k ? ` ${k}` : '';
    const capoTxt = capo > 0 ? ` capo ${capo}` : '';
    return `${(song.title || 'song').replace(/[\\/:*?"<>|]+/g, '').trim()}${key}${capoTxt} — scratch.${recTake ? recTake.ext : 'webm'}`;
  };
  const downloadTake = () => {
    if (!recTake) return;
    const a = document.createElement('a');
    a.href = recTake.url; a.download = recFileName();
    document.body.appendChild(a); a.click(); a.remove();
  };
  const shareTake = async () => {
    if (!recTake) return;
    try {
      const file = new File([recTake.blob], recFileName(), { type: recTake.blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: song.title }); return; }
    } catch { /* fall through to download */ }
    downloadTake();
  };
  const discardTake = () => { if (recTake) URL.revokeObjectURL(recTake.url); setRecTake(null); setRecError(''); };
  const canShareTake = typeof navigator !== 'undefined' && !!navigator.canShare;
  // Tear down an in-progress recording WITHOUT producing a take (song change / unmount).
  const abortRecording = () => {
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
    if (recRef.current) { recRef.current.onstop = null; try { if (recRef.current.state !== 'inactive') recRef.current.stop(); } catch { /* ignore */ } recRef.current = null; }
    if (recStream.current) { recStream.current.getTracks().forEach((t) => t.stop()); recStream.current = null; }
  };

  // Ear-training ping: a soft tonic triad so the player can pitch themselves.
  const pingChord = (freqs) => {
    const ctx = ensureAudio();
    const t = ctx.currentTime + 0.02;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = f;
      const peak = 0.16 - i * 0.02; // root loudest, harmonies softer
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.04);
      g.gain.setValueAtTime(peak, t + 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      osc.connect(g).connect(ctx.destination); osc.start(t); osc.stop(t + 0.8);
    });
  };
  // Sound the upcoming song's key at the start of a between-song countdown.
  const maybeKeyPing = () => {
    const pl = latest.current.playlist;
    if (!latestKeyPing.current || !pl || pl.isLast || !pl.nextKey) return;
    const p = keyToPing(pl.nextKey);
    if (p) pingChord(p.freqs);
  };
  // Sound THIS song's key when you start it from the top (single-song practice).
  const pingCurrentKey = () => {
    if (!latestKeyPing.current) return;
    const p = keyToPing(song.key);
    if (p) pingChord(p.freqs);
  };

  // Metronome: a lookahead scheduler (setInterval polls, Web Audio times the
  // clicks precisely) ticking at the current BPM, with an accent on each downbeat.
  const metroClick = (time, accent) => {
    const ctx = actx.current; if (!ctx) return;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.frequency.value = accent ? 1600 : 1050;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    osc.connect(g).connect(ctx.destination);
    osc.start(time); osc.stop(time + 0.05);
  };
  const metroSchedule = () => {
    const ctx = actx.current; if (!ctx) return;
    const spb = 60 / metroBpmRef.current;
    while (nextNoteRef.current < ctx.currentTime + 0.1) {
      metroClick(nextNoteRef.current, beatRef.current % 4 === 0);
      nextNoteRef.current += spb;
      beatRef.current += 1;
    }
  };
  const startMetronome = () => {
    const ctx = ensureAudio();
    beatRef.current = 0; nextNoteRef.current = ctx.currentTime + 0.08;
    if (!schedRef.current) schedRef.current = setInterval(metroSchedule, 25);
  };
  const stopMetronome = () => { if (schedRef.current) { clearInterval(schedRef.current); schedRef.current = null; } };
  const toggleMetronome = () => { const on = !metronome; setMetronome(on); on ? startMetronome() : stopMetronome(); };
  // Re-sync playback state from the song's saved prefs when the song changes.
  useEffect(() => {
    clearCountdown();
    endedRef.current = false;
    if (fadeRef.current) { clearTimeout(fadeRef.current); fadeRef.current = null; }
    setLeaving(false); // the new song fades in fresh
    spreads.current = []; setTuningNudge(false); // fresh tuning read per song
    abortRecording(); setRecording(false); setRecError(''); setRecTime(0);
    setRecTake((prev) => { if (prev) URL.revokeObjectURL(prev.url); return null; }); // fresh recorder per song
    setTagEditing(false); setTagDraft('');
    setCapo(song.capo || 0);
    setTranspose(prefs.transpose ?? 0);
    setFontSize(prefs.fontSize ?? 28);
    setHideChords(prefs.hideChords ?? false);
    setSpeed(prefs.speed ?? 4);
    setBpm(prefs.bpm ?? 90);
    setUseBpm(prefs.useBpm ?? false);
    setPlaying(false); setTune(false);
    // In a playlist run, autoplay this song from the top at its own tempo. Wait a
    // frame for layout; a song too short to scroll goes straight to the countdown.
    if (playlist) requestAnimationFrame(() => {
      const sc = scRef.current; if (!sc) return;
      sc.scrollTop = 0;
      if (sc.scrollHeight <= sc.clientHeight + 1) { setCountdown(playlist.isLast ? 'done' : COUNTDOWN_SECS); startCountdownTick(); if (!playlist.isLast) maybeKeyPing(); }
      else setPlaying(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  // When the between-song countdown reaches zero, fade the current song out and
  // then advance. Done here (not inside the setCountdown updater) so we never
  // call App's setState while rendering SongView. The fade timer lives in a ref,
  // not this effect's cleanup, so the advance survives the re-render that
  // hiding the countdown / starting the fade triggers.
  useEffect(() => {
    if (countdown !== 0) return;
    if (cdRef.current) { clearInterval(cdRef.current); cdRef.current = null; }
    setLeaving(true);
    fadeRef.current = setTimeout(() => {
      fadeRef.current = null;
      if (latest.current.onPlaylistNext) latest.current.onPlaylistNext();
    }, 240);
  }, [countdown]);

  // Listen only while opted-in AND actually playing (so the mic isn't hot while
  // you're just reading the sheet). Accumulation persists across pause/resume;
  // it's reset per song above.
  useEffect(() => {
    if (tuningMonitor && playing) startTuningMic();
    else stopTuningMic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tuningMonitor, playing, song.id]);

  // Cancel any running countdown / metronome / mic when the view unmounts.
  useEffect(() => () => {
    if (cdRef.current) clearInterval(cdRef.current);
    if (fadeRef.current) clearTimeout(fadeRef.current);
    if (schedRef.current) clearInterval(schedRef.current);
    stopTuningMic();
    abortRecording();
    if (actx.current) { try { actx.current.close(); } catch (e) { /* already closed */ } }
  }, []);
  // Free a finished take's object URL when it's replaced or on unmount.
  useEffect(() => () => { if (recTake) URL.revokeObjectURL(recTake.url); }, [recTake]);

  // Persisting setters: update local state and save the per-song pref.
  const persist = (patch) => onSavePref && onSavePref(patch);
  const changeTranspose = (v) => { setTranspose(v); persist({ transpose: v }); };
  const changeCapo = (v) => { setCapo(v); onCapo && onCapo(v); };
  const changeFont = (delta) => { const n = Math.max(20, Math.min(46, fontSize + delta)); setFontSize(n); persist({ fontSize: n }); };
  const toggleHideChords = () => { const v = !hideChords; setHideChords(v); persist({ hideChords: v }); };
  const changeSpeed = (delta) => { const n = Math.max(1, Math.min(12, speed + delta)); setSpeed(n); persist({ speed: n }); };
  // Auto-scroll tempo (advanced): a typeable BPM with tap-tempo, mapped to a
  // scroll rate of roughly one bar per lyric line (see the scroll effect).
  const changeBpm = (delta) => { const n = Math.max(30, Math.min(300, (parseInt(bpm, 10) || 90) + delta)); setBpm(n); persist({ bpm: n }); };
  const commitBpm = () => { const n = Math.max(30, Math.min(300, parseInt(bpm, 10) || 90)); setBpm(n); persist({ bpm: n }); };
  const toggleUseBpm = () => { const v = !useBpm; setUseBpm(v); persist({ useBpm: v }); };
  const tapRef = useRef([]), tapBtnRef = useRef(null);
  const tapTempo = () => {
    // Flash the button so a space-bar tap gives the same feedback as a click.
    const btn = tapBtnRef.current;
    if (btn) { btn.classList.remove('is-tap'); void btn.offsetWidth; btn.classList.add('is-tap'); }
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const t = tapRef.current;
    if (t.length && now - t[t.length - 1] > 2000) t.length = 0; // stale run — restart
    t.push(now); if (t.length > 5) t.shift();
    if (t.length >= 2) {
      let sum = 0; for (let i = 1; i < t.length; i++) sum += t[i] - t[i - 1];
      const n = Math.max(30, Math.min(300, Math.round(60000 / (sum / (t.length - 1)))));
      setBpm(n); persist({ bpm: n });
      if (!useBpm) { setUseBpm(true); persist({ useBpm: true }); }
    }
  };

  // Tags live on the song (persisted via the app's songbook state).
  const tags = song.tags || [];
  const addTag = (t) => {
    const v = (t || '').trim().replace(/,$/, '');
    if (v && !tags.some((x) => x.toLowerCase() === v.toLowerCase())) onUpdateTags && onUpdateTags(song.id, [...tags, v]);
    setTagDraft('');
  };
  const removeTag = (t) => onUpdateTags && onUpdateTags(song.id, tags.filter((x) => x !== t));
  const scRef = useRef(null), rafRef = useRef(0), accRef = useRef(0), lastRef = useRef(0), popRef = useRef(null);

  const updateFocus = () => {
    const sc = scRef.current; if (!sc) return;
    const rect = sc.getBoundingClientRect();
    const fade = Math.max(60, rect.height * 0.12);
    sc.querySelectorAll('.sv-line').forEach((ln) => {
      const r = ln.getBoundingClientRect();
      const cy = r.top + r.height / 2 - rect.top;
      let op = 1;
      if (cy < fade) op = cy / fade;
      else if (cy > rect.height - fade) op = (rect.height - cy) / fade;
      ln.style.opacity = Math.max(0, Math.min(1, op)).toFixed(3);
    });
    const max = sc.scrollHeight - sc.clientHeight;
    const fill = sc.parentNode.querySelector('.sv-progress-fill');
    if (fill) fill.style.width = (max > 0 ? (sc.scrollTop / max) * 100 : 0) + '%';
  };

  // smooth auto-scroll
  useEffect(() => {
    if (!playing) { cancelAnimationFrame(rafRef.current); return; }
    endedRef.current = false;
    lastRef.current = 0;
    // For BPM mode, measure one text row's height (a .sv-seg is a chord stacked
    // over its syllable) so tempo maps to ~one bar per row, independent of how
    // lines wrap: pxPerSec = (bpm / 4 beats-per-bar) × rowHeight / 60.
    const sc0 = scRef.current;
    let rowPx = fontSize * 2.3; // fallback for tab songs (no chord/lyric segments)
    if (sc0) {
      const segs = [...sc0.querySelectorAll('.sv-seg')].slice(0, 40);
      const hs = segs.map((s) => s.getBoundingClientRect().height).filter((h) => h > 0).sort((a, b) => a - b);
      if (hs.length) rowPx = hs[Math.floor(hs.length / 2)];
    }
    const tick = (now) => {
      if (!lastRef.current) lastRef.current = now;
      const dt = now - lastRef.current; lastRef.current = now;
      const sc = scRef.current;
      if (sc) {
        // BPM mode: ~one bar (4 beats) per text row at the given tempo.
        // Simple mode: quadratic curve — speed 1 ≈ 4px/s crawl up to 12 ≈ 104px/s.
        const b = Math.max(30, Math.min(300, parseInt(bpm, 10) || 90));
        const pxPerSec = useBpm ? (b / 4) * rowPx / 60 : speed * speed * 0.7 + 3;
        accRef.current += pxPerSec * dt / 1000;
        if (accRef.current >= 1) {
          const whole = Math.floor(accRef.current); accRef.current -= whole;
          sc.scrollTop += whole;
          // The song is done once it can't scroll any further. The tail padding
          // leaves the last line comfortably in view at that point. (The earlier
          // "end marker past 66% of the view" test never fired — that same tail
          // padding stops the marker at ~72-80% of the view, so the playlist
          // never rolled into the next song on its own.)
          if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) reachedBottom();
        }
      }
      updateFocus();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed, useBpm, bpm, fontSize, transpose, hideChords]);

  // Keep the screen awake while auto-scrolling, so a set plays through untouched
  // (phones sleep otherwise, which pauses the scroll). Wake locks auto-release
  // when the tab is hidden, so re-acquire when it comes back.
  useEffect(() => {
    if (!playing || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock = null, cancelled = false;
    const acquire = async () => {
      try { const l = await navigator.wakeLock.request('screen'); if (cancelled) l.release(); else lock = l; }
      catch { /* denied / not visible — harmless */ }
    };
    acquire();
    const onVis = () => { if (document.visibilityState === 'visible' && !lock) acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      if (lock) { try { lock.release(); } catch { /* ignore */ } lock = null; }
    };
  }, [playing]);

  // Space bar taps the tempo too (only in BPM mode, and never while typing).
  useEffect(() => {
    if (!useBpm) return;
    const onKey = (e) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.repeat) return; // holding the key shouldn't spam taps
      e.preventDefault();
      tapTempo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useBpm]);

  // chord-diagram popover (hover / tap) + focus init
  useEffect(() => {
    if (song.format === 'tab') { const sc = scRef.current; if (sc) sc.addEventListener('scroll', updateFocus, { passive: true }); return () => sc && sc.removeEventListener('scroll', updateFocus); }
    preloadChords(); // warm the chord-fingering database before the user hovers
    const sc = scRef.current, pop = popRef.current; if (!sc || !pop) return;
    const show = (c) => {
      const svg = chordSVG(c.textContent.trim());
      if (!svg) { pop.dataset.show = 'false'; return; }
      pop.innerHTML = '<div class="sv-cp-name">' + c.textContent.trim() + '</div>' + svg;
      pop.style.visibility = 'hidden'; pop.dataset.show = 'true';
      const r = c.getBoundingClientRect(), pr = pop.getBoundingClientRect();
      let left = r.left + r.width / 2 - pr.width / 2;
      left = Math.max(8, Math.min(window.innerWidth - pr.width - 8, left));
      let top = r.top - pr.height - 10; if (top < 8) top = r.bottom + 10;
      pop.style.left = left + 'px'; pop.style.top = top + 'px'; pop.style.visibility = 'visible';
    };
    const hide = () => { pop.dataset.show = 'false'; };
    const over = (e) => { const c = e.target.closest('.sv-chord'); if (c) show(c); };
    const out = (e) => { const c = e.target.closest('.sv-chord'); if (c) hide(); };
    const click = (e) => { const c = e.target.closest('.sv-chord'); if (c) { show(c); } };
    sc.addEventListener('mouseover', over); sc.addEventListener('mouseout', out);
    sc.addEventListener('click', click); sc.addEventListener('scroll', hide, { passive: true });
    sc.addEventListener('scroll', updateFocus, { passive: true });
    updateFocus();
    return () => {
      sc.removeEventListener('mouseover', over); sc.removeEventListener('mouseout', out);
      sc.removeEventListener('click', click); sc.removeEventListener('scroll', hide);
      sc.removeEventListener('scroll', updateFocus);
    };
  }, []);

  useEffect(() => { updateFocus(); }, [fontSize, transpose]);

  const isTab = song.format === 'tab';
  const dispKey = transposeChordName(song.key, transpose);
  const status = song.status || 'learn';
  const sections = useMemo(() => (isTab ? [] : toSections(song.source, transpose)), [song.source, transpose, isTab]);

  return (
    <div className={'sv' + (hideChords ? ' sv--no-chords' : '')} data-playing={playing ? 'true' : 'false'}>
      <div className="sv-progress"><div className="sv-progress-fill"></div></div>

      <div className="sv-topwrap">
      <header className="sv-top">
        <button className="sv-ic" aria-label="Back to library" onClick={onBack}><Icon n="arrow-left" s={22} /></button>
        <div className="sv-title">
          <div className="sv-namerow">
            <div className="sv-name">{song.title}</div>
            <button className={'sv-star' + (song.starred ? ' is-on' : '')}
              aria-label={song.starred ? 'Unfavorite' : 'Favorite'} aria-pressed={song.starred ? 'true' : 'false'}
              onClick={() => onToggleStar && onToggleStar(song.id)}><Icon n="star" s={18} /></button>
          </div>
          <div className="sv-sub">
            {onArtist
              ? <button className="sv-artist" onClick={() => onArtist(song.artist)}>{song.artist}</button>
              : <span>{song.artist}</span>}
            {song.album && <span className="sv-album">{song.album}</span>}
            {!isTab && <span className="sv-key">{prettyKey(dispKey)}</span>}
            {!isTab && (
              <span className={'sv-pill' + (capo > 0 ? ' sv-pill--capo' : ' sv-pill--muted')}>
                {capo > 0 ? `Capo ${capo}` : 'No capo'}
              </span>
            )}
            {isTab && <span className="sv-pill sv-pill--muted">Tab</span>}
            <button className={'sv-status sv-status--' + status}
              aria-label={`Status: ${STATUS[status].label}. Tap to change.`}
              onClick={() => onCycleStatus && onCycleStatus(song.id)}>
              <span className="sv-status-dot" aria-hidden="true"></span>{STATUS[status].label}
            </button>
            <span className="sv-subdiv" aria-hidden="true"></span>
            {tags.map((t) => (
              <span className="sv-tagchip" key={t}>
                {t}
                <button aria-label={`Remove tag ${t}`} onClick={() => removeTag(t)}><Icon n="x" s={11} /></button>
              </span>
            ))}
            {tagEditing
              ? <input
                  className="sv-taginput"
                  autoFocus
                  placeholder="Add tag…"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onBlur={() => { addTag(tagDraft); setTagEditing(false); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagDraft); }
                    else if (e.key === 'Escape') { setTagDraft(''); setTagEditing(false); }
                    else if (e.key === 'Backspace' && !tagDraft && tags.length) removeTag(tags[tags.length - 1]);
                  }} />
              : <button className="sv-tagadd" aria-label="Add tag" onClick={() => setTagEditing(true)}><Icon n="plus" s={13} />{tags.length ? '' : 'Tag'}</button>}
          </div>
        </div>
        <div className="sv-actions">
          {!isTab && <button className={'sv-ic' + (hideChords ? ' is-on' : '')} aria-label={hideChords ? 'Show chords' : 'Hide chords'} onClick={toggleHideChords}><Icon n="music" s={20} /></button>}
          <button className="sv-ic" aria-label="Smaller text" onClick={() => changeFont(-2)}><Icon n="a-arrow-down" s={21} /></button>
          <button className="sv-ic" aria-label="Larger text" onClick={() => changeFont(2)}><Icon n="a-arrow-up" s={21} /></button>
          {!isTab && <button className={'sv-ic' + (tune ? ' is-on' : '')} aria-label="Transpose & capo" onClick={() => { setTune((s) => !s); setExportOpen(false); }}><Icon n="sliders-horizontal" s={20} /></button>}
          {onAddToPlaylist && (
            <button className="sv-ic" aria-label="Add to playlist" onClick={() => onAddToPlaylist(song)}><Icon n="list-music" s={20} /></button>
          )}
          {onEdit && (
            <button className="sv-ic" aria-label="Edit song" onClick={onEdit}><Icon n="pencil" s={19} /></button>
          )}
          {onExport && (
            <button className={'sv-ic' + (exportOpen ? ' is-on' : '')} aria-label="Export song" onClick={() => { setExportOpen((o) => !o); setTune(false); }}><Icon n="file-down" s={20} /></button>
          )}
          {onToggleFocus && (
            <button className="sv-ic sv-ic--focus" aria-label={focusMode ? 'Exit full screen (Esc)' : 'Full-screen play mode'} title={focusMode ? 'Exit full screen (Esc)' : 'Full-screen play mode'} onClick={onToggleFocus}><Icon n={focusMode ? 'minimize-2' : 'maximize-2'} s={20} /></button>
          )}
          <button className="sv-ic" aria-label="Light or dark" onClick={onToggleTheme}><Icon n={dark ? 'sun' : 'moon'} s={20} /></button>
        </div>
        {tune && !isTab && (
          <div className="sv-tune">
            <Stepper label="Transpose" value={transpose} min={-6} max={6} format={(v) => (v > 0 ? `+${v}` : String(v))} onChange={changeTranspose} />
            <Stepper label="Capo" value={capo} min={0} max={9} format={(v) => (v === 0 ? '—' : String(v))} onChange={changeCapo} />
          </div>
        )}
        {exportOpen && onExport && (
          <div className="sv-export">
            <div className="sv-export-lbl fc-eyebrow">Take it offline</div>
            <button className="sv-export-btn" onClick={() => { setExportOpen(false); onExport(song, 'html'); }}><Icon n="file-down" s={16} />Offline page</button>
            <button className="sv-export-btn" onClick={() => { setExportOpen(false); onExport(song, 'pdf'); }}><Icon n="printer" s={16} />Print / PDF</button>
          </div>
        )}
      </header>
      </div>

      <div className="sv-scroller" ref={scRef}>
        <div className={'sv-sheet' + (playlist ? ' sv-sheet--anim' : '') + (leaving ? ' sv-leaving' : '')}
          key={song.id} style={{ ['--lyric']: Math.round(fontSize * (focusMode ? 1.25 : 1)) + 'px' }}>
          {isTab ? (
            <pre className="sv-tab">{song.source}</pre>
          ) : sections.map((sec, si) => (
            <section className="sv-section" key={si}>
              {sec.label && <div className="sv-seclabel">{sec.label}</div>}
              {sec.lines.map((line, li) => <ChordLine key={li} segments={line} />)}
            </section>
          ))}
          <div className="sv-end">— end —</div>
        </div>
      </div>
      <div className="sv-fade sv-fade-top"></div>
      <div className="sv-fade sv-fade-bottom"></div>

      {playlist && (
        <div className="sv-plbar">
          <button className="sv-plnav" aria-label="Previous song" onClick={() => { clearCountdown(); onPlaylistPrev && onPlaylistPrev(); }}><Icon n="skip-back" s={16} /></button>
          <span className="sv-plbadge">{playlist.pos} / {playlist.total}</span>
          <button className="sv-plnav" aria-label="Next song" onClick={() => { clearCountdown(); onPlaylistNext && onPlaylistNext(); }}><Icon n="skip-forward" s={16} /></button>
          <span className="sv-pldiv" aria-hidden="true">·</span>
          <button className="sv-plexit" onClick={() => { clearCountdown(); onPlaylistExit && onPlaylistExit(); }}>Exit</button>
        </div>
      )}

      {playlist && countdown != null && !leaving && (
        <div className="sv-cd">
          {tuningNudge && (
            <button className="sv-cd-tune" onClick={() => onOpenTuner && onOpenTuner()}>
              <Icon n="mic" s={14} />Sounds a touch out of tune — tune up
            </button>
          )}
          {countdown === 'done' ? (
            <>
              <span className="sv-cd-text">Playlist finished</span>
              <div className="sv-cd-row"><button className="sv-cd-btn" onClick={() => { clearCountdown(); onPlaylistExit && onPlaylistExit(); }}>Done</button></div>
            </>
          ) : (
            <>
              <span className="sv-cd-text">Up next: <b>{playlist.nextTitle}</b></span>
              {(playlist.nextKey || playlist.nextCapo > 0) && (
                <span className="sv-cd-meta">
                  {playlist.nextKey ? `Key ${playlist.nextKey}` : ''}
                  {playlist.nextKey && playlist.nextCapo > 0 ? ' · ' : ''}
                  {playlist.nextCapo > 0 ? `Capo ${playlist.nextCapo}` : ''}
                </span>
              )}
              <div className="sv-cd-row">
                <span className="sv-cd-num">{countdown}</span>
                <button className="sv-cd-btn" onClick={() => { clearCountdown(); onPlaylistNext && onPlaylistNext(); }}>Skip</button>
                <button className="sv-cd-btn sv-cd-btn--ghost" onClick={clearCountdown}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      {!playlist && tuningNudge && (
        <div className="sv-tunebar">
          <Icon n="mic" s={16} />
          <span className="sv-tunebar-txt">Sounds a touch out of tune.</span>
          <button className="sv-tunebar-go" onClick={() => onOpenTuner && onOpenTuner()}>Tune up</button>
          <button className="sv-tunebar-x" aria-label="Dismiss" onClick={() => setTuningNudge(false)}><Icon n="x" s={14} /></button>
        </div>
      )}
      {micDenied && (
        <div className="sv-tunebar sv-tunebar--muted">
          <Icon n="circle-alert" s={16} />
          <span className="sv-tunebar-txt">Mic access is blocked — tuning check is off.</span>
          <button className="sv-tunebar-x" aria-label="Dismiss" onClick={() => setMicDenied(false)}><Icon n="x" s={14} /></button>
        </div>
      )}
      {recording && (
        <div className="sv-recbar sv-recbar--live">
          <span className="sv-rec-dot" aria-hidden="true"></span>
          <span className="sv-recbar-txt">Recording · {fmtSec(recTime)}</span>
          <button className="sv-recbar-stop" onClick={stopRecording}><Icon n="square" s={13} />Stop</button>
        </div>
      )}
      {recError && !recording && (
        <div className="sv-tunebar sv-tunebar--muted">
          <Icon n="circle-alert" s={16} />
          <span className="sv-tunebar-txt">{recError}</span>
          <button className="sv-tunebar-x" aria-label="Dismiss" onClick={() => setRecError('')}><Icon n="x" s={14} /></button>
        </div>
      )}
      {recTake && !recording && (
        <div className="sv-recbar">
          <span className="sv-recbar-txt"><Icon n="mic" s={15} />Scratch take · {fmtSec(recTake.seconds)}</span>
          <audio className="sv-rec-audio" src={recTake.url} controls preload="metadata" />
          {canShareTake && <button className="sv-recbar-go" onClick={shareTake}><Icon n="share-2" s={14} />Share</button>}
          <button className="sv-recbar-go" onClick={downloadTake}><Icon n="download" s={14} />Save</button>
          <button className="sv-tunebar-x" aria-label="Discard take" onClick={discardTake}><Icon n="x" s={14} /></button>
        </div>
      )}

      <div className="sv-dock">
        <button className="sv-ghost" aria-label="Back to start" onClick={() => scRef.current && scRef.current.scrollTo({ top: 0, behavior: 'smooth' })}><Icon n="rotate-ccw" s={20} /></button>
        <button className="sv-round" aria-label="Play or pause auto-scroll" onClick={() => {
          // Single-song: sound the key when starting from the top (playlist songs
          // get their key ping via the between-song countdown instead).
          if (!playing && !playlist) { const sc = scRef.current; if (!sc || sc.scrollTop <= 4) pingCurrentKey(); }
          setPlaying((p) => !p);
        }}><Icon n={playing ? 'pause' : 'play'} s={26} /></button>
        <div className={'sv-speed' + (useBpm ? ' sv-speed--bpm' : '')}>
          <button className="sv-sbtn" aria-label={useBpm ? 'Slower (−1 BPM)' : 'Slower'} onClick={() => (useBpm ? changeBpm(-1) : changeSpeed(-1))}>−</button>
          <div className="sv-sval">
            {useBpm
              ? <input className="sv-snum sv-bpm-input" type="number" min="30" max="300" inputMode="numeric" aria-label="Beats per minute" value={bpm}
                  onChange={(e) => { const raw = e.target.value; if (raw === '') { setBpm(''); return; } const n = parseInt(raw, 10); if (!isNaN(n)) setBpm(Math.min(300, n)); }}
                  onBlur={commitBpm} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
              : <div className="sv-snum">{speed}</div>}
            <button className="sv-slbl sv-modelbl" onClick={toggleUseBpm} aria-label={useBpm ? 'Switch to simple speed' : 'Switch to BPM tempo'} title={useBpm ? 'Switch to simple speed' : 'Switch to BPM tempo'}>
              {useBpm ? 'BPM' : 'Speed'}<span className="sv-modeswap" aria-hidden="true">⇄</span>
            </button>
          </div>
          <button className="sv-sbtn" aria-label={useBpm ? 'Faster (+1 BPM)' : 'Faster'} onClick={() => (useBpm ? changeBpm(1) : changeSpeed(1))}>+</button>
          {useBpm && <button ref={tapBtnRef} className="sv-tap" onClick={tapTempo} aria-label="Tap tempo (or press the space bar)" title="Tap to set tempo — or press the space bar">Tap</button>}
        </div>
        {onToggleKeyPing && (
          <button className={'sv-metro' + (keyPing ? ' is-on' : '')} aria-label={keyPing ? 'Turn key ping off' : 'Turn key ping on'} aria-pressed={keyPing} title="Ear-training key ping — hear the key before you play" onClick={onToggleKeyPing}><Icon n="ear" s={20} /></button>
        )}
        <button className={'sv-metro' + (metronome ? ' is-on' : '')} aria-label={metronome ? 'Turn metronome off' : 'Turn metronome on'} aria-pressed={metronome} title={`Metronome (${metroBpmRef.current} BPM)`} onClick={toggleMetronome}><Icon n="metronome" s={20} /></button>
        {onSetTuningMonitor && (
          <button className={'sv-metro sv-mic' + (tuningMonitor ? ' is-on' : '') + (tuningMonitor && playing ? ' sv-mic--live' : '')}
            aria-label={tuningMonitor ? 'Turn tuning check off' : 'Turn tuning check on'} aria-pressed={tuningMonitor}
            title="Tuning check — listens while you play and flags if the guitar drifts out of tune"
            onClick={() => onSetTuningMonitor(!tuningMonitor)}><Icon n="mic" s={20} /></button>
        )}
        <button className={'sv-metro sv-rec' + (recording ? ' is-rec' : '')} aria-label={recording ? 'Stop recording' : 'Record a scratch take'} aria-pressed={recording}
          title={recording ? 'Stop recording' : 'Record yourself playing along — saves an audio file'}
          onClick={() => (recording ? stopRecording() : startRecording())}><Icon n={recording ? 'square' : 'circle'} s={recording ? 15 : 18} /></button>
      </div>

      <div className="sv-chordpop" ref={popRef}></div>
    </div>
  );
}
