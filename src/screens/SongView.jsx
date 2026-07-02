// SongView — the play-along song view. Teleprompter reading with edge-fade,
// smooth auto-scroll + speed, transpose / capo, and hover chord diagrams.
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Stepper, prettyKey, Icon } from '../components/index.js';
import { STATUS } from '../lib/music.js';
import { chordSVG, preloadChords } from '../lib/chords.js';
import { toSections, transposeChordName } from '../lib/chordpro.js';

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

export function SongView({ song, onBack, onArtist, dark, onToggleTheme, focusMode, onToggleFocus, onToggleStar, onCycleStatus, onUpdateTags, onEdit, prefs = {}, onSavePref, onCapo, onAddToPlaylist, playlist = null, onPlaylistNext, onPlaylistPrev, onPlaylistExit }) {
  const [transpose, setTranspose] = useState(prefs.transpose ?? 0);
  const [capo, setCapo] = useState(song.capo || 0);
  const [fontSize, setFontSize] = useState(prefs.fontSize ?? 28);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(prefs.speed ?? 4);
  const [bpm, setBpm] = useState(prefs.bpm ?? 90);
  const [useBpm, setUseBpm] = useState(prefs.useBpm ?? false);
  const [tune, setTune] = useState(false);
  const [hideChords, setHideChords] = useState(prefs.hideChords ?? false);
  const [tagDraft, setTagDraft] = useState('');
  const [tagEditing, setTagEditing] = useState(false);
  const [countdown, setCountdown] = useState(null); // null | seconds remaining | 'done'
  const cdRef = useRef(null);
  // Metronome — Web Audio clicks scheduled at the song's BPM (accent every 4th).
  const [metronome, setMetronome] = useState(false);
  const actx = useRef(null), schedRef = useRef(null), nextNoteRef = useRef(0), beatRef = useRef(0), metroBpmRef = useRef(90);
  // The scroll RAF loop must call the CURRENT playlist callbacks without being
  // in its deps (that would restart the loop and stutter). Read them via a ref.
  const latest = useRef({});
  latest.current = { playlist, onPlaylistNext };
  metroBpmRef.current = Math.max(30, Math.min(300, parseInt(bpm, 10) || 90));
  const clearCountdown = () => { if (cdRef.current) { clearInterval(cdRef.current); cdRef.current = null; } setCountdown(null); };
  const startCountdownTick = () => {
    if (cdRef.current) return;
    cdRef.current = setInterval(() => {
      setCountdown((c) => {
        if (typeof c !== 'number') return c;
        if (c <= 1) {
          clearInterval(cdRef.current); cdRef.current = null;
          if (latest.current.onPlaylistNext) latest.current.onPlaylistNext();
          return null;
        }
        return c - 1;
      });
    }, 1000);
  };
  // Auto-scroll hit the end of a song. In a playlist, roll into the next one
  // after a short countdown (or finish on the last song).
  const reachedBottom = () => {
    setPlaying(false);
    const pl = latest.current.playlist;
    if (!pl) return;
    if (!pl.isLast) { setCountdown(COUNTDOWN_SECS); startCountdownTick(); }
    else setCountdown('done');
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
    if (!actx.current) actx.current = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = actx.current; if (ctx.resume) ctx.resume();
    beatRef.current = 0; nextNoteRef.current = ctx.currentTime + 0.08;
    if (!schedRef.current) schedRef.current = setInterval(metroSchedule, 25);
  };
  const stopMetronome = () => { if (schedRef.current) { clearInterval(schedRef.current); schedRef.current = null; } };
  const toggleMetronome = () => { const on = !metronome; setMetronome(on); on ? startMetronome() : stopMetronome(); };
  // Re-sync playback state from the song's saved prefs when the song changes.
  useEffect(() => {
    clearCountdown();
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
      if (sc.scrollHeight <= sc.clientHeight + 1) { setCountdown(playlist.isLast ? 'done' : COUNTDOWN_SECS); startCountdownTick(); }
      else setPlaying(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  // Cancel any running countdown / metronome when the view unmounts.
  useEffect(() => () => {
    if (cdRef.current) clearInterval(cdRef.current);
    if (schedRef.current) clearInterval(schedRef.current);
    if (actx.current) { try { actx.current.close(); } catch (e) { /* already closed */ } }
  }, []);

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
          if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1) reachedBottom();
        }
      }
      updateFocus();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed, useBpm, bpm, fontSize, transpose, hideChords]);

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
          {!isTab && <button className={'sv-ic' + (tune ? ' is-on' : '')} aria-label="Transpose & capo" onClick={() => setTune((s) => !s)}><Icon n="sliders-horizontal" s={20} /></button>}
          {onAddToPlaylist && (
            <button className="sv-ic" aria-label="Add to playlist" onClick={() => onAddToPlaylist(song)}><Icon n="list-music" s={20} /></button>
          )}
          {onEdit && (
            <button className="sv-ic" aria-label="Edit song" onClick={onEdit}><Icon n="pencil" s={19} /></button>
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
      </header>

      <div className="sv-scroller" ref={scRef}>
        <div className="sv-sheet" style={{ ['--lyric']: Math.round(fontSize * (focusMode ? 1.25 : 1)) + 'px' }}>
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

      {playlist && countdown != null && (
        <div className="sv-cd">
          {countdown === 'done' ? (
            <>
              <span className="sv-cd-text">Playlist finished</span>
              <div className="sv-cd-row"><button className="sv-cd-btn" onClick={() => { clearCountdown(); onPlaylistExit && onPlaylistExit(); }}>Done</button></div>
            </>
          ) : (
            <>
              <span className="sv-cd-text">Up next: <b>{playlist.nextTitle}</b></span>
              <div className="sv-cd-row">
                <span className="sv-cd-num">{countdown}</span>
                <button className="sv-cd-btn" onClick={() => { clearCountdown(); onPlaylistNext && onPlaylistNext(); }}>Skip</button>
                <button className="sv-cd-btn sv-cd-btn--ghost" onClick={clearCountdown}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="sv-dock">
        <button className="sv-ghost" aria-label="Back to start" onClick={() => scRef.current && scRef.current.scrollTo({ top: 0, behavior: 'smooth' })}><Icon n="rotate-ccw" s={20} /></button>
        <button className="sv-round" aria-label="Play or pause auto-scroll" onClick={() => setPlaying((p) => !p)}><Icon n={playing ? 'pause' : 'play'} s={26} /></button>
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
        <button className={'sv-metro' + (metronome ? ' is-on' : '')} aria-label={metronome ? 'Turn metronome off' : 'Turn metronome on'} aria-pressed={metronome} title={`Metronome (${metroBpmRef.current} BPM)`} onClick={toggleMetronome}><Icon n="metronome" s={20} /></button>
      </div>

      <div className="sv-chordpop" ref={popRef}></div>
    </div>
  );
}
