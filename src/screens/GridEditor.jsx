// GridEditor — Clinton's "grid" authoring style. Write lyrics on monospace lines;
// above each line a clickable lane lets you drop a chord over any character via a
// type-to-filter picker (chords already used in the song come first), and drag a
// placed chord along the lane to nudge it. It owns a line model and emits ChordPro
// through onChange, so it's just another way to edit the same song. See
// lib/gridedit.js for the model ⇄ ChordPro round-trip.
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Icon } from '../components/index.js';
import { gridFromChordPro, gridToChordPro, shiftChords, usedChords, newId, rowToLine, CHORD_GROUPS } from '../lib/gridedit.js';

const CHIP_PAD = 5;  // .ge-chip left padding — subtract it so the label sits over the character
const MAX_COL = 120; // furthest column a chord can be placed at (chords past the text pad with spaces)

export function GridEditor({ initialValue = '', onChange }) {
  const [lines, setLines] = useState(() => gridFromChordPro(initialValue));
  const [picker, setPicker] = useState(null); // { li, ci }
  const [pfilter, setPfilter] = useState('');
  const [chW, setChW] = useState(10);          // measured width of one lyric character, px
  const [drag, setDrag] = useState(null);      // { li, fromCi, curCi } — live drag position
  const rootRef = useRef(null), rulerRef = useRef(null);
  const inputs = useRef({});                   // li -> input element
  const pending = useRef(null);                // { li, caret } — focus to restore after a structural edit
  const linesRef = useRef(lines); linesRef.current = lines;   // latest, for window drag listeners
  const chwRef = useRef(chW); chwRef.current = chW;
  const dragRef = useRef(null);
  const dragCleanup = useRef(null);            // teardown for the in-flight drag's window listeners
  const suppressClick = useRef(false);         // eat the click that trails a drag
  const lastEmitted = useRef(initialValue);    // exact ChordPro we last emitted — skip re-seeding on our own echo

  const emit = (next) => { const cp = gridToChordPro(next); lastEmitted.current = cp; setLines(next); onChange && onChange(cp); };
  const used = usedChords(lines);

  // Measure the real lyric character width (the ruler shares the lyric font). Both
  // chip placement and click→index use this same number, so they always agree.
  useLayoutEffect(() => {
    const el = rulerRef.current; if (!el) return;
    const w = el.getBoundingClientRect().width / 10;
    if (w > 0 && Math.abs(w - chW) > 0.05) setChW(w);
  });
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
  // Re-measure once the monospace web font swaps in — the first paint can use the
  // fallback font, which would place every chip against the wrong character width.
  useEffect(() => {
    if (!document.fonts || !document.fonts.ready) return;
    document.fonts.ready.then(() => {
      const el = rulerRef.current; if (!el) return;
      const w = el.getBoundingClientRect().width / 10;
      if (w > 0 && Math.abs(w - chwRef.current) > 0.05) setChW(w);
    });
  }, []);
  // Re-seed from the parent when initialValue changes externally (e.g. Discard),
  // but not when it's merely echoing the ChordPro this editor itself emitted.
  useEffect(() => {
    if (initialValue !== lastEmitted.current) { lastEmitted.current = initialValue; setPicker(null); setDrag(null); setLines(gridFromChordPro(initialValue)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue]);
  // Tear down any in-flight drag's window listeners if we unmount mid-drag.
  useEffect(() => () => { if (dragCleanup.current) dragCleanup.current(); }, []);

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
  // Paste a whole block of lyrics (or ChordPro) into a line: split it into lines
  // instead of jamming it onto one. First/last pasted rows merge at the cursor.
  const onPaste = (li) => (e) => {
    const data = e.clipboardData || window.clipboardData;
    const text = data ? data.getData('text') : '';
    if (!text || !/[\r\n]/.test(text)) return; // single line → let the default paste happen
    e.preventDefault();
    const el = e.target, pos = el.selectionStart, ln = lines[li];
    const before = ln.text.slice(0, pos), after = ln.text.slice(pos);
    const beforeChords = {}, afterChords = {};
    Object.keys(ln.chords).forEach((k) => { const n = +k; if (n < pos) beforeChords[n] = ln.chords[k]; else afterChords[n - pos] = ln.chords[k]; });
    const rows = text.replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let caret = 0;
    // First row: merge onto `before` when it's a plain lyric; a section/directive
    // row is classified instead (flushing any leftover `before` as its own line).
    const first = rowToLine(rows[0]);
    if (first.type === 'lyric') {
      const fc = { ...beforeChords };
      Object.keys(first.chords).forEach((k) => { fc[+k + before.length] = first.chords[k]; });
      out.push({ id: newId(), type: 'lyric', text: before + first.text, chords: fc });
    } else {
      if (before || Object.keys(beforeChords).length) out.push({ id: newId(), type: 'lyric', text: before, chords: beforeChords });
      out.push(first);
    }
    for (let i = 1; i < rows.length - 1; i++) out.push(rowToLine(rows[i])); // middle rows classified
    if (rows.length > 1) {
      const last = rowToLine(rows[rows.length - 1]);
      if (last.type === 'lyric') {
        const lc = { ...last.chords };
        Object.keys(afterChords).forEach((k) => { lc[+k + last.text.length] = afterChords[k]; });
        out.push({ id: newId(), type: 'lyric', text: last.text + after, chords: lc });
        caret = last.text.length;
      } else {
        out.push(last);
        if (after || Object.keys(afterChords).length) out.push({ id: newId(), type: 'lyric', text: after, chords: afterChords });
      }
    }
    emit([...lines.slice(0, li), ...out, ...lines.slice(li + 1)]);
    pending.current = { li: li + out.length - 1, caret };
  };

  // ---- chord edits ----
  const openPicker = (li, ci) => { setPfilter(''); setPicker({ li, ci }); };
  const laneClick = (li) => (e) => {
    if (suppressClick.current) { suppressClick.current = false; return; } // a drag just ended
    if (e.target.closest('.ge-chip') || e.target.closest('.ge-pop')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    openPicker(li, Math.max(0, Math.min(MAX_COL, Math.round((e.clientX - rect.left) / chwRef.current))));
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
  const moveChord = (li, fromCi, toCi) => {
    if (fromCi === toCi) return;
    const cur = linesRef.current, ln = cur[li], name = ln.chords[fromCi];
    if (name == null) return;
    if (ln.chords[toCi] != null) return; // target slot is taken — don't clobber the chord there
    const chords = { ...ln.chords }; delete chords[fromCi]; chords[toCi] = name;
    emit(cur.map((l, i) => (i === li ? { ...l, chords } : l)));
  };

  // Grab a placed chord and slide it. A tap that doesn't move opens the picker.
  const startChipDrag = (li, ci) => (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    setPicker(null);
    const laneRect = e.currentTarget.closest('.ge-lane').getBoundingClientRect();
    const info = { li, ci, startX: e.clientX, laneRect, moved: false, curCi: ci };
    dragRef.current = info;
    const move = (ev) => {
      if (!info.moved && Math.abs(ev.clientX - info.startX) < 4) return;
      info.moved = true;
      const nc = Math.max(0, Math.min(MAX_COL, Math.round((ev.clientX - laneRect.left) / chwRef.current)));
      info.curCi = nc;
      setDrag({ li, fromCi: ci, curCi: nc });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      dragRef.current = null; dragCleanup.current = null;
    };
    const up = () => {
      cleanup();
      if (info.moved) { moveChord(li, ci, info.curCi); suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 80); }
      else openPicker(li, ci);
      setDrag(null);
    };
    const cancel = () => { cleanup(); setDrag(null); }; // gesture aborted (multi-touch / interruption) — don't commit a move
    dragCleanup.current = cleanup;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  const renderPicker = (li, ci) => {
    const existing = lines[li].chords[ci];
    const q = pfilter.trim().toLowerCase();
    const rec = used.filter((c) => c.toLowerCase().startsWith(q));
    const rw = rootRef.current ? rootRef.current.clientWidth : 320;
    const left = Math.max(0, Math.min(ci * chW, rw - 284));
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
        <div className="ge-pop-chords">
          {CHORD_GROUPS.map((g) => {
            const items = g.chords.filter((c) => c.toLowerCase().startsWith(q));
            if (!items.length) return null;
            return (
              <div className="ge-pop-crow" key={g.root}>
                <span className="ge-pop-croot">{g.root}</span>
                {items.map((c) => <button key={c} type="button" className="ge-pop-chord" onClick={() => setChord(c)}>{c}</button>)}
              </div>
            );
          })}
        </div>
        {existing && <button type="button" className="ge-pop-remove" onClick={removeChord}><Icon n="trash-2" s={13} />Remove {existing}</button>}
      </div>
    );
  };

  const chipLeft = (ci) => Math.round(ci * chW - CHIP_PAD) + 'px';

  return (
    <div className="ge" ref={rootRef}>
      <span ref={rulerRef} className="ge-mono ge-ruler" aria-hidden="true">0000000000</span>
      {lines.map((ln, li) => (
        <div className={'ge-line ge-line--' + ln.type} key={ln.id}>
          {ln.type === 'lyric' ? (
            <div className="ge-body">
              <div className="ge-lane" onClick={laneClick(li)} title="Click to place a chord">
                {Object.keys(ln.chords).map((k) => {
                  const dragging = drag && drag.li === li && drag.fromCi === +k;
                  return (
                    <button key={k} type="button" className={'ge-chip' + (dragging ? ' ge-chip--drag' : '')} style={{ left: chipLeft(dragging ? drag.curCi : +k) }}
                      title="Drag to move · click to change" aria-label={'Chord ' + ln.chords[k] + ', drag to move or click to edit'}
                      onPointerDown={startChipDrag(li, +k)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(li, +k); } }}>{ln.chords[k]}</button>
                  );
                })}
                {picker && picker.li === li && renderPicker(li, picker.ci)}
              </div>
              <input ref={(el) => { inputs.current[li] = el; }} className="ge-mono ge-lyric" value={ln.text} spellCheck={false}
                placeholder={li === 0 ? 'Type or paste lyrics…' : ''}
                onChange={(e) => setLineText(li, e.target.value)} onKeyDown={onKeyDown(li)} onPaste={onPaste(li)} />
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
