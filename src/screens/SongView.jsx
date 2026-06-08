// SongView — the play-along song view. Teleprompter reading with edge-fade,
// smooth auto-scroll + speed, transpose / capo, and hover chord diagrams.
import React, { useState, useRef, useEffect } from 'react';
import { Stepper, prettyKey, Icon } from '../components/index.js';
import { transposeChord, transposeKey, chordSVG, STATUS } from '../lib/music.js';

// One lyric line: chord-over-syllable columns (ChordSheetJS model).
function ChordLine({ segments, transpose }) {
  return (
    <div className="sv-line">
      {segments.map((seg, i) => (
        <span className="sv-seg" key={i}>
          <span className="sv-chord">{seg.chord ? transposeChord(seg.chord, transpose) : ' '}</span>
          <span className="sv-lyric">{seg.text || ' '}</span>
        </span>
      ))}
    </div>
  );
}

export function SongView({ song, onBack, onArtist, dark, onToggleTheme, focusMode, onToggleFocus, onToggleStar, onCycleStatus, onUpdateTags }) {
  const [transpose, setTranspose] = useState(0);
  const [capo, setCapo] = useState(song.capo || 0);
  const [fontSize, setFontSize] = useState(28);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [tune, setTune] = useState(false);
  const [hideChords, setHideChords] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [tagEditing, setTagEditing] = useState(false);
  useEffect(() => { setTagEditing(false); setTagDraft(''); setCapo(song.capo || 0); setTranspose(0); }, [song.id]);

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
    const tick = (now) => {
      if (!lastRef.current) lastRef.current = now;
      const dt = now - lastRef.current; lastRef.current = now;
      const sc = scRef.current;
      if (sc) {
        accRef.current += (speed * 14) * dt / 1000;
        if (accRef.current >= 1) {
          const whole = Math.floor(accRef.current); accRef.current -= whole;
          sc.scrollTop += whole;
          if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1) setPlaying(false);
        }
      }
      updateFocus();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed]);

  // chord-diagram popover (hover / tap) + focus init
  useEffect(() => {
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

  const dispKey = transposeKey(song.key, transpose);
  const status = song.status || 'learn';

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
            <span className="sv-key">{prettyKey(dispKey)}</span>
            <span className={'sv-pill' + (capo > 0 ? ' sv-pill--capo' : ' sv-pill--muted')}>
              {capo > 0 ? `Capo ${capo}` : 'No capo'}
            </span>
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
          <button className={'sv-ic' + (hideChords ? ' is-on' : '')} aria-label={hideChords ? 'Show chords' : 'Hide chords'} onClick={() => setHideChords((s) => !s)}><Icon n="music" s={20} /></button>
          <button className="sv-ic" aria-label="Smaller text" onClick={() => setFontSize((v) => Math.max(20, v - 2))}><Icon n="a-arrow-down" s={21} /></button>
          <button className="sv-ic" aria-label="Larger text" onClick={() => setFontSize((v) => Math.min(46, v + 2))}><Icon n="a-arrow-up" s={21} /></button>
          <button className={'sv-ic' + (tune ? ' is-on' : '')} aria-label="Transpose & capo" onClick={() => setTune((s) => !s)}><Icon n="sliders-horizontal" s={20} /></button>
          {onToggleFocus && (
            <button className="sv-ic sv-ic--focus" aria-label={focusMode ? 'Exit full screen (Esc)' : 'Full-screen play mode'} title={focusMode ? 'Exit full screen (Esc)' : 'Full-screen play mode'} onClick={onToggleFocus}><Icon n={focusMode ? 'minimize-2' : 'maximize-2'} s={20} /></button>
          )}
          <button className="sv-ic" aria-label="Light or dark" onClick={onToggleTheme}><Icon n={dark ? 'sun' : 'moon'} s={20} /></button>
        </div>
        {tune && (
          <div className="sv-tune">
            <Stepper label="Transpose" value={transpose} min={-6} max={6} format={(v) => (v > 0 ? `+${v}` : String(v))} onChange={setTranspose} />
            <Stepper label="Capo" value={capo} min={0} max={9} format={(v) => (v === 0 ? '—' : String(v))} onChange={setCapo} />
          </div>
        )}
      </header>

      <div className="sv-scroller" ref={scRef}>
        <div className="sv-sheet" style={{ ['--lyric']: Math.round(fontSize * (focusMode ? 1.25 : 1)) + 'px' }}>
          {song.sections.map((sec, si) => (
            <section className="sv-section" key={si}>
              {sec.label && <div className="sv-seclabel">{sec.label}</div>}
              {sec.lines.map((line, li) => <ChordLine key={li} segments={line} transpose={transpose} />)}
            </section>
          ))}
          <div className="sv-end">— end —</div>
        </div>
      </div>
      <div className="sv-fade sv-fade-top"></div>
      <div className="sv-fade sv-fade-bottom"></div>

      <div className="sv-dock">
        <button className="sv-ghost" aria-label="Back to start" onClick={() => scRef.current && scRef.current.scrollTo({ top: 0, behavior: 'smooth' })}><Icon n="rotate-ccw" s={20} /></button>
        <button className="sv-round" aria-label="Play or pause auto-scroll" onClick={() => setPlaying((p) => !p)}><Icon n={playing ? 'pause' : 'play'} s={26} /></button>
        <div className="sv-speed">
          <button className="sv-sbtn" aria-label="Slower" onClick={() => setSpeed((v) => Math.max(1, v - 1))}>−</button>
          <div className="sv-sval"><div className="sv-snum">{speed}</div><div className="sv-slbl">Speed</div></div>
          <button className="sv-sbtn" aria-label="Faster" onClick={() => setSpeed((v) => Math.min(12, v + 1))}>+</button>
        </div>
      </div>

      <div className="sv-chordpop" ref={popRef}></div>
    </div>
  );
}
