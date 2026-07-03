// GridEditor — Clinton's "grid" authoring style. Write lyrics on monospace lines;
// above each line a clickable lane lets you drop a chord over any character via a
// type-to-filter picker (chords already used in the song come first). It owns a
// line model and emits ChordPro through onChange, so it's just another way to
// edit the same song. See lib/gridedit.js for the model ⇄ ChordPro round-trip.
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Icon } from '../components/index.js';
import { gridFromChordPro, gridToChordPro, shiftChords, usedChords, newId, DEFAULT_CHORDS } from '../lib/gridedit.js';

export function GridEditor({ initialValue = '', onChange }) {
  const [lines, setLines] = useState(() => gridFromChordPro(initialValue));
  const [picker, setPicker] = useState(null); // { li, ci }
  const [pfilter, setPfilter] = useState('');
  const rootRef = useRef(null), rulerRef = useRef(null), chW = useRef(10);
  const inputs = useRef({});      // li -> input element
  const pending = useRef(null);   // { li, caret } — focus to restore after a structural edit

  const emit = (next) => { setLines(next); onChange && onChange(gridToChordPro(next)); };
  const used = usedChords(lines);

  useLayoutEffect(() => { if (rulerRef.current) chW.current = rulerRef.current.getBoundingClientRect().width || 10; });
  useLayoutEffect(() => {
    if (!pending.current) return;
    const { li, caret } = pending.current; pending.current = null;
    const el = inputs.current[li];
    if (el) { el.focus(); const c = caret == null ? el.value.length : Math.max(0, Math.min(caret, el.value.length)); try { el.setSelectionRange(c, c); } catch { /* not a text input */ } }
  });
  useEffect(() => {
    if (!picker) return;
    const onDown = (e) => { if (!e.target.closest('.ge-pop') && !e.target.closest('.ge-lane')) setPicker(null); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [picker]);

  // ---- line edits ----
  const setLineText = (li, text) => {
    const ln = lines[li];
    const chords = ln.type === 'lyric' ? shiftChords(ln.text, text, ln.chords) : ln.chords;
    emit(lines.map((l, i) => (i === li ? { ...l, text, chords } : l)));
  };
  const addLine = (type) => {
    const ln = type === 'section' ? { id: newId(), type: 'section', text: '' } : { id: newId(), type: 'lyric', text: '', chords: {} };
    const next = [...lines, ln]; emit(next); pending.current = { li: next.length - 1, caret: 0 };
  };
  const removeLine = (li) => {
    if (lines.length <= 1) { setPicker(null); emit([{ id: newId(), type: 'lyric', text: '', chords: {} }]); return; }
    setPicker(null);
    const next = lines.filter((_, i) => i !== li); emit(next); pending.current = { li: Math.max(0, li - 1) };
  };
  const onKeyDown = (li) => (e) => {
    const el = e.target, ln = lines[li];
    if (e.key === 'Enter') {
      e.preventDefault();
      if (ln.type !== 'lyric') { const next = [...lines]; next.splice(li + 1, 0, { id: newId(), type: 'lyric', text: '', chords: {} }); emit(next); pending.current = { li: li + 1, caret: 0 }; return; }
      const pos = el.selectionStart;
      const lc = {}, rc = {};
      Object.keys(ln.chords).forEach((k) => { const n = +k; if (n < pos) lc[n] = ln.chords[k]; else rc[n - pos] = ln.chords[k]; });
      const next = [...lines];
      next[li] = { ...ln, text: ln.text.slice(0, pos), chords: lc };
      next.splice(li + 1, 0, { id: newId(), type: 'lyric', text: ln.text.slice(pos), chords: rc });
      emit(next); pending.current = { li: li + 1, caret: 0 };
    } else if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0 && li > 0) {
      const prev = lines[li - 1];
      if (prev.type === 'lyric' && ln.type === 'lyric') {
        e.preventDefault();
        const pos = prev.text.length, mc = { ...prev.chords };
        Object.keys(ln.chords).forEach((k) => { mc[+k + pos] = ln.chords[k]; });
        const next = [...lines];
        next[li - 1] = { ...prev, text: prev.text + ln.text, chords: mc };
        next.splice(li, 1); emit(next); pending.current = { li: li - 1, caret: pos };
      }
    } else if (e.key === 'ArrowUp' && li > 0) { e.preventDefault(); pending.current = { li: li - 1, caret: el.selectionStart }; setLines([...lines]); }
    else if (e.key === 'ArrowDown' && li < lines.length - 1) { e.preventDefault(); pending.current = { li: li + 1, caret: el.selectionStart }; setLines([...lines]); }
  };

  // ---- chord edits ----
  const openPicker = (li, ci) => { setPfilter(''); setPicker({ li, ci }); };
  const laneClick = (li) => (e) => {
    if (e.target.closest('.ge-chip') || e.target.closest('.ge-pop')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    openPicker(li, Math.max(0, Math.round((e.clientX - rect.left) / chW.current)));
  };
  const setChord = (name) => {
    const n = (name || '').trim(); if (!picker || !n) return;
    const { li, ci } = picker;
    emit(lines.map((l, i) => (i === li ? { ...l, chords: { ...l.chords, [ci]: n } } : l)));
    setPicker(null);
  };
  const removeChord = () => {
    if (!picker) return; const { li, ci } = picker;
    emit(lines.map((l, i) => { if (i !== li) return l; const c = { ...l.chords }; delete c[ci]; return { ...l, chords: c }; }));
    setPicker(null);
  };

  const renderPicker = (li, ci) => {
    const existing = lines[li].chords[ci];
    const q = pfilter.trim().toLowerCase();
    const rec = used.filter((c) => c.toLowerCase().startsWith(q));
    const pal = DEFAULT_CHORDS.filter((c) => c.toLowerCase().startsWith(q));
    const rw = rootRef.current ? rootRef.current.clientWidth : 320;
    const left = Math.max(0, Math.min(ci * chW.current, rw - 244));
    return (
      <div className="ge-pop" style={{ left: left + 'px' }} onMouseDown={(e) => e.stopPropagation()}>
        <input autoFocus className="ge-pop-filter ge-mono" placeholder="Type a chord" value={pfilter} spellCheck={false}
          onChange={(e) => setPfilter(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setChord(pfilter); } else if (e.key === 'Escape') setPicker(null); }} />
        {rec.length > 0 && (
          <>
            <div className="ge-pop-lbl">Used in this song</div>
            <div className="ge-pop-row">{rec.map((c) => <button key={c} type="button" className="ge-pop-chord" onClick={() => setChord(c)}>{c}</button>)}</div>
          </>
        )}
        <div className="ge-pop-lbl">Chords</div>
        <div className="ge-pop-grid">{pal.map((c) => <button key={c} type="button" className="ge-pop-chord" onClick={() => setChord(c)}>{c}</button>)}</div>
        {existing && <button type="button" className="ge-pop-remove" onClick={removeChord}><Icon n="trash-2" s={13} />Remove {existing}</button>}
      </div>
    );
  };

  return (
    <div className="ge" ref={rootRef}>
      <span ref={rulerRef} className="ge-mono ge-ruler" aria-hidden="true">0</span>
      {lines.map((ln, li) => (
        <div className={'ge-line ge-line--' + ln.type} key={ln.id}>
          {ln.type === 'lyric' ? (
            <div className="ge-body">
              <div className="ge-lane" onClick={laneClick(li)} title="Click to place a chord">
                {Object.keys(ln.chords).map((k) => (
                  <button key={k} type="button" className="ge-chip" style={{ left: (+k) + 'ch' }}
                    onClick={(e) => { e.stopPropagation(); openPicker(li, +k); }}>{ln.chords[k]}</button>
                ))}
                {picker && picker.li === li && renderPicker(li, picker.ci)}
              </div>
              <input ref={(el) => { inputs.current[li] = el; }} className="ge-mono ge-lyric" value={ln.text} spellCheck={false}
                placeholder={li === 0 ? 'Type a line of lyrics…' : ''}
                onChange={(e) => setLineText(li, e.target.value)} onKeyDown={onKeyDown(li)} />
            </div>
          ) : ln.type === 'section' ? (
            <div className="ge-body ge-sectionrow">
              <Icon n="bookmark" s={13} />
              <input ref={(el) => { inputs.current[li] = el; }} className="ge-section-input" value={ln.text}
                placeholder="Section name — e.g. Chorus" onChange={(e) => setLineText(li, e.target.value)} onKeyDown={onKeyDown(li)} />
            </div>
          ) : (
            <div className="ge-body">
              <input ref={(el) => { inputs.current[li] = el; }} className="ge-mono ge-raw" value={ln.text}
                onChange={(e) => setLineText(li, e.target.value)} onKeyDown={onKeyDown(li)} />
            </div>
          )}
          <button type="button" className="ge-del" aria-label="Delete line" onClick={() => removeLine(li)}><Icon n="x" s={14} /></button>
        </div>
      ))}
      <div className="ge-toolbar">
        <button type="button" className="ge-tbtn" onClick={() => addLine('lyric')}><Icon n="plus" s={15} />Line</button>
        <button type="button" className="ge-tbtn" onClick={() => addLine('section')}><Icon n="bookmark" s={14} />Section</button>
      </div>
    </div>
  );
}
