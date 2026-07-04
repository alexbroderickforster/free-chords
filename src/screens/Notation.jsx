// Notation — a browser sheet-music editor (v1). Write notes on a treble staff by
// clicking or with the on-screen piano / computer keyboard, hear it played back,
// and save/export. The score model lives in lib/score.js; VexFlow rendering in
// components/Score.jsx; playback in lib/scorePlayback.js; export in lib/scoreExport.js.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Icon, Stepper, Input } from '../components/index.js';
import { Score } from '../components/Score.jsx';
import { DURATIONS, emptyScore, noteBeats, insertNote, removeNote, patchNote } from '../lib/score.js';
import { playScore, playTone } from '../lib/scorePlayback.js';
import { exportScorePng, printScore } from '../lib/scoreExport.js';

// --- small note-duration glyph for the picker ---
function DurGlyph({ id, s = 20 }) {
  const filled = id === 'q' || id === '8' || id === '16';
  const stem = id !== 'w';
  const flags = id === '8' ? 1 : id === '16' ? 2 : 0;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true" className="sc-durglyph">
      <ellipse cx="8.5" cy="16.5" rx="5" ry="3.6" transform="rotate(-22 8.5 16.5)" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" />
      {stem && <line x1="13.1" y1="15.4" x2="13.1" y2="4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
      {flags >= 1 && <path d="M13.1 4.5 q5.4 2.2 4 7.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
      {flags >= 2 && <path d="M13.1 7.6 q5.4 2.2 4 7.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

// Quarter-rest glyph (the Unicode rest char isn't in the app fonts).
function RestGlyph({ s = 17 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4 L13.5 9.5 L9 12.5 L14 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 18 q-4 0 -2.5 -3.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

// --- on-screen piano (2 octaves C4–C6) ---
const WHITE_LETTERS = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
const BLACK_AFTER = { c: 'c#', d: 'd#', f: 'f#', g: 'g#', a: 'a#' };
function buildPiano() {
  const whites = [];
  for (const oct of [4, 5]) for (const L of WHITE_LETTERS) whites.push({ key: `${L}/${oct}`, letter: L, oct });
  whites.push({ key: 'c/6', letter: 'c', oct: 6 });
  const blacks = [];
  whites.forEach((w, i) => {
    if (i === whites.length - 1) return;
    const b = BLACK_AFTER[w.letter];
    if (b) blacks.push({ key: `${w.letter}/${w.oct}`, acc: '#', label: b.toUpperCase() + w.oct, afterIndex: i });
  });
  return { whites, blacks };
}
const PIANO = buildPiano();

// Computer-keyboard → pitch (classic tracker layout, one+ octave from C4).
const KEY_MAP = {
  a: ['c/4', null], w: ['c/4', '#'], s: ['d/4', null], e: ['d/4', '#'], d: ['e/4', null],
  f: ['f/4', null], t: ['f/4', '#'], g: ['g/4', null], y: ['g/4', '#'], h: ['a/4', null],
  u: ['a/4', '#'], j: ['b/4', null], k: ['c/5', null], o: ['c/5', '#'], l: ['d/5', null],
};

export function Notation({ scores = [], onUpsertScore, onDeleteScore, onToast }) {
  const [openId, setOpenId] = useState(null);
  const [score, setScore] = useState(null);        // working copy of the open score
  const [selected, setSelected] = useState(null);  // selected note index
  const [playhead, setPlayhead] = useState(null);
  const [dur, setDur] = useState('q');
  const [dotted, setDotted] = useState(false);
  const [playing, setPlaying] = useState(false);

  const past = useRef([]);   // undo stack (notes arrays)
  const future = useRef([]); // redo stack
  const stopRef = useRef(null);
  const scoreRef = useRef(null); scoreRef.current = score;
  const hostRef = useRef(null); // wraps <Score> for PNG export of the live SVG (not used; export re-renders)

  const stopPlayback = useCallback(() => { if (stopRef.current) { stopRef.current(); stopRef.current = null; } setPlaying(false); setPlayhead(null); }, []);

  // Persist the working copy up to the app (which stores + syncs) whenever it changes.
  useEffect(() => {
    if (score && onUpsertScore) onUpsertScore(score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  useEffect(() => () => { if (stopRef.current) stopRef.current(); }, []);

  const open = (s) => { setScore(JSON.parse(JSON.stringify(s))); setOpenId(s.id); setSelected(null); past.current = []; future.current = []; };
  const createNew = () => { const s = emptyScore(); open(s); };
  const closeEditor = () => { stopPlayback(); setScore(null); setOpenId(null); };

  // Commit a new notes array (with undo history). Editing stops playback so the
  // playhead can't run against a mutated note list.
  const commit = (nextNotes, sel) => {
    if (!scoreRef.current) return;
    stopPlayback();
    past.current = [...past.current.slice(-99), scoreRef.current.notes];
    future.current = [];
    setScore((s) => ({ ...s, notes: nextNotes, updatedAt: Date.now() }));
    if (sel !== undefined) setSelected(sel);
  };
  const undo = () => {
    if (!past.current.length || !scoreRef.current) return;
    stopPlayback();
    const prev = past.current[past.current.length - 1];
    past.current = past.current.slice(0, -1);
    future.current = [scoreRef.current.notes, ...future.current].slice(0, 100);
    setScore((s) => ({ ...s, notes: prev, updatedAt: Date.now() }));
    setSelected(null);
  };
  const redo = () => {
    if (!future.current.length || !scoreRef.current) return;
    stopPlayback();
    const next = future.current[0];
    future.current = future.current.slice(1);
    past.current = [...past.current, scoreRef.current.notes];
    setScore((s) => ({ ...s, notes: next, updatedAt: Date.now() }));
    setSelected(null);
  };

  // Place a pitched note (append). key is diatonic ('c/4'); acc carries ♯/♭.
  const placePitch = (key, acc) => {
    if (!scoreRef.current) return;
    stopPlayback();
    const note = { keys: [key], duration: dur, dots: dotted ? 1 : 0, rest: false, accidental: acc || null };
    const at = scoreRef.current.notes.length;
    commit(insertNote(scoreRef.current.notes, at, note), at);
    playTone(key, Math.max(0.25, noteBeats(note) * (60 / (scoreRef.current.tempo || 90))), acc);
  };
  const placeRest = () => {
    if (!scoreRef.current) return;
    stopPlayback();
    const note = { keys: [], duration: dur, dots: dotted ? 1 : 0, rest: true, accidental: null };
    const at = scoreRef.current.notes.length;
    commit(insertNote(scoreRef.current.notes, at, note), at);
  };

  // Click on the staff: select a note, or insert a pitched note at the clicked spot.
  const onPick = (hit) => {
    if (!hit) return;
    if (hit.type === 'note') { setSelected(hit.index); const n = scoreRef.current.notes[hit.index]; if (n && !n.rest && n.keys[0]) playTone(n.keys[0], 0.3, n.accidental); return; }
    if (hit.type === 'place') {
      stopPlayback();
      const at = hit.insertAt == null ? scoreRef.current.notes.length : hit.insertAt;
      const note = { keys: [hit.key], duration: dur, dots: dotted ? 1 : 0, rest: false, accidental: null };
      commit(insertNote(scoreRef.current.notes, at, note), at);
      playTone(hit.key, 0.3);
    }
  };

  const deleteSel = () => {
    if (!scoreRef.current) return;
    const idx = selected != null ? selected : scoreRef.current.notes.length - 1;
    if (idx < 0) return;
    commit(removeNote(scoreRef.current.notes, idx), null);
  };

  // Duration/dot/rest/accidental: if a note is selected, edit it; else set the pen.
  const applyDuration = (id) => { setDur(id); if (selected != null) commit(patchNote(scoreRef.current.notes, selected, { duration: id }), selected); };
  const toggleDot = () => { const v = !dotted; setDotted(v); if (selected != null) commit(patchNote(scoreRef.current.notes, selected, { dots: v ? 1 : 0 }), selected); };
  // Rest: toggle the selected note to/from a rest, or (nothing selected) add one.
  const restAction = () => {
    if (selected != null) { const cur = scoreRef.current.notes[selected]; if (cur) commit(patchNote(scoreRef.current.notes, selected, { rest: !cur.rest }), selected); }
    else placeRest();
  };
  const applyAccidental = (acc) => {
    if (selected == null) return;
    const cur = scoreRef.current.notes[selected];
    if (!cur || cur.rest) return;
    const next = cur.accidental === acc ? null : acc;
    commit(patchNote(scoreRef.current.notes, selected, { accidental: next }), selected);
    if (cur.keys[0]) playTone(cur.keys[0], 0.3, next);
  };

  const play = () => {
    if (playing) { stopPlayback(); return; }
    if (!scoreRef.current || !scoreRef.current.notes.length) return;
    setPlaying(true);
    stopRef.current = playScore(scoreRef.current, {
      onNote: (i) => setPlayhead(i),
      onDone: () => { setPlaying(false); setPlayhead(null); stopRef.current = null; },
    });
  };

  const setTempo = (t) => setScore((s) => ({ ...s, tempo: t, updatedAt: Date.now() }));
  const setTitle = (t) => setScore((s) => ({ ...s, title: t, updatedAt: Date.now() }));

  const doExportPng = async () => { try { await exportScorePng(scoreRef.current, (scoreRef.current.title || 'score') + '.png'); } catch (e) { onToast && onToast(e.message || 'Couldn’t export'); } };
  const doPrint = async () => { try { const ok = await printScore(scoreRef.current, scoreRef.current.title || 'Score'); if (!ok) onToast && onToast('Allow pop-ups to print'); } catch (e) { onToast && onToast(e.message || 'Couldn’t print'); } };

  // Keyboard: pitch entry, delete, undo/redo, play. Ignored while typing in a field.
  useEffect(() => {
    if (!score) return;
    const onKey = (e) => {
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.repeat) return; // ignore OS key auto-repeat (no note spam / context storm)
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.metaKey || e.ctrlKey) && k === 'y') { e.preventDefault(); redo(); return; }
      if (e.metaKey || e.ctrlKey) return;
      if (k === 'backspace' || k === 'delete') { e.preventDefault(); deleteSel(); return; }
      if (k === ' ') { e.preventDefault(); play(); return; }
      if (k === 'r') { e.preventDefault(); placeRest(); return; }
      if (KEY_MAP[k]) { e.preventDefault(); const [key, acc] = KEY_MAP[k]; placePitch(key, acc); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, dur, dotted, selected, playing]);

  // ---- Library view ----
  if (!score) {
    const sorted = [...scores].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return (
      <div className="screen notation">
        <div className="screen-head">
          <div className="screen-eyebrow fc-eyebrow">Write sheet music</div>
          <h1 className="screen-title">Notation</h1>
          <p className="screen-lead">Write notes on a staff — click the staff or play the piano — hear them back, and export. Everything saves on your device.</p>
        </div>
        <Button variant="primary" iconLeft={<Icon n="plus" s={18} />} onClick={createNew}>New score</Button>
        {sorted.length > 0 && (
          <div className="nt-list">
            {sorted.map((s) => (
              <div className="nt-item" key={s.id}>
                <button className="nt-item-main" onClick={() => open(s)}>
                  <span className="nt-item-title">{s.title || 'Untitled'}</span>
                  <span className="nt-item-sub">{(s.notes || []).length} {(s.notes || []).length === 1 ? 'note' : 'notes'} · {s.tempo || 90} BPM</span>
                </button>
                <button className="nt-item-del" aria-label="Delete score" onClick={() => { if (onDeleteScore) onDeleteScore(s.id); }}><Icon n="trash-2" s={16} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- Editor view ----
  return (
    <div className="screen notation nt-editor">
      <div className="nt-top">
        <button className="add-back" onClick={closeEditor}><Icon n="arrow-left" s={16} />Scores</button>
        <input className="nt-title" value={score.title} placeholder="Untitled" onChange={(e) => setTitle(e.target.value)} />
        <div className="nt-top-r">
          <span className="nt-tempo"><Stepper label="Tempo" value={score.tempo} min={40} max={240} step={5} onChange={setTempo} /></span>
        </div>
      </div>

      <div className="nt-actions">
        <Button variant={playing ? 'secondary' : 'primary'} size="sm" iconLeft={<Icon n={playing ? 'pause' : 'play'} s={16} />} onClick={play} disabled={!score.notes.length}>{playing ? 'Stop' : 'Play'}</Button>
        <div className="nt-spacer" />
        <button className="nt-ibtn" aria-label="Undo" title="Undo" onClick={undo} disabled={!past.current.length}><Icon n="rotate-ccw" s={17} /></button>
        <button className="nt-ibtn" aria-label="Redo" title="Redo" onClick={redo} disabled={!future.current.length}><Icon n="rotate-ccw" s={17} cls="nt-flip" /></button>
        <button className="nt-ibtn" aria-label="Export PNG" title="Export PNG" onClick={doExportPng}><Icon n="file-down" s={17} /></button>
        <button className="nt-ibtn" aria-label="Print" title="Print" onClick={doPrint}><Icon n="printer" s={17} /></button>
      </div>

      <div className="nt-canvas" ref={hostRef}>
        <Score score={score} selected={selected} playhead={playhead} onPick={onPick} />
      </div>

      <div className="nt-tools">
        <div className="nt-durs" role="group" aria-label="Note duration">
          {DURATIONS.map((d) => (
            <button key={d.id} className={'nt-dur' + (dur === d.id ? ' is-on' : '')} title={d.label} aria-pressed={dur === d.id} onClick={() => applyDuration(d.id)}><DurGlyph id={d.id} /></button>
          ))}
        </div>
        <div className="nt-toolgroup">
          <button className={'nt-tbtn' + (dotted ? ' is-on' : '')} title="Dotted" aria-pressed={dotted} onClick={toggleDot}>·</button>
          <button className="nt-tbtn" title="Rest (add, or convert the selected note)" onClick={restAction}><RestGlyph /></button>
          <button className="nt-tbtn" title="Sharp (selected note)" onClick={() => applyAccidental('#')}>♯</button>
          <button className="nt-tbtn" title="Flat (selected note)" onClick={() => applyAccidental('b')}>♭</button>
          <button className="nt-tbtn" title="Natural (selected note)" onClick={() => applyAccidental(null)}>♮</button>
          <button className="nt-tbtn nt-tbtn--del" title="Delete note" aria-label="Delete note" onClick={deleteSel}><Icon n="trash-2" s={16} /></button>
        </div>
      </div>

      <div className="sc-piano" role="group" aria-label="Piano">
        {PIANO.whites.map((w) => (
          <button key={w.key} className="sc-wkey" style={{ width: (100 / PIANO.whites.length) + '%' }}
            onClick={() => placePitch(w.key, null)}>
            {w.letter === 'c' && <span className="sc-wlabel">C{w.oct}</span>}
          </button>
        ))}
        {PIANO.blacks.map((b) => (
          <button key={b.key + b.afterIndex} className="sc-bkey" aria-label={b.label}
            style={{ left: `calc(${((b.afterIndex + 1) * 100) / PIANO.whites.length}% - ${100 / PIANO.whites.length / 3}%)`, width: `${100 / PIANO.whites.length / 1.5}%` }}
            onClick={() => placePitch(b.key, '#')} />
        ))}
      </div>

      <p className="nt-hint">Click the staff to place a note, or tap the piano / type <b>A S D F G H J K</b>. Click a note to select it, then change its duration or delete. <b>Space</b> plays.</p>
    </div>
  );
}
