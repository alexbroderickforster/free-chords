// Score — renders a notation Score with VexFlow (lazy-loaded on mount) and turns
// clicks into edit actions via hitTest. Keeps the ~KB VexFlow bundle out of the
// main app: it's a dynamic import, so Vite splits it into its own chunk that
// loads only when the Notation page opens (and caches offline).
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { renderScore, hitTest } from '../lib/scoreRender.js';

let _vf = null;
const loadVexFlow = () => (_vf ||= import('vexflow'));

export function Score({ score, selected, playhead, onPick }) {
  const hostRef = useRef(null);
  const [VF, setVF] = useState(null);
  const [width, setWidth] = useState(680);
  const layout = useRef({ notes: [], staves: [] });

  useEffect(() => { let live = true; loadVexFlow().then((m) => { if (live) setVF(m); }); return () => { live = false; }; }, []);

  // Track the host's width so the staff lays out (and wraps) to fit.
  useEffect(() => {
    const el = hostRef.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { const w = el.clientWidth; if (w) setWidth(w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!VF || !hostRef.current) return;
    try { layout.current = renderScore(VF, hostRef.current, score, { width, selected, playhead }); }
    catch (e) { console.error('[notation] render failed', e); }
  }, [VF, score, selected, playhead, width]);

  const onClick = useCallback((e) => {
    if (!onPick || !hostRef.current) return;
    const svg = hostRef.current.querySelector('svg'); if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const aw = svg.width && svg.width.baseVal ? svg.width.baseVal.value : rect.width;
    const ah = svg.height && svg.height.baseVal ? svg.height.baseVal.value : rect.height;
    const x = (e.clientX - rect.left) * (aw / (rect.width || 1));
    const y = (e.clientY - rect.top) * (ah / (rect.height || 1));
    onPick(hitTest(layout.current, x, y));
  }, [onPick]);

  return (
    <div className="sc-host" ref={hostRef} onClick={onClick}>
      {!VF && <div className="sc-loading">Loading notation…</div>}
    </div>
  );
}
