// VexFlow drawing for a Score. Pure (no React): draws into a host element and
// returns hit-test layout. Used by components/Score.jsx (live) and
// lib/scoreExport.js (offscreen, black ink for a white PNG). VexFlow is passed
// in so the caller controls when the ~KB library is lazy-loaded.
import { packMeasures, vexDuration, REST_KEY, DIATONIC, F5_INDEX } from './score.js';

// Resolve a CSS custom property to a concrete rgb() string the SVG can use.
function cssColor(varName, fallback) {
  try {
    const p = document.createElement('span');
    p.style.cssText = `color:var(${varName});position:absolute;visibility:hidden`;
    document.body.appendChild(p);
    const c = getComputedStyle(p).color;
    document.body.removeChild(p);
    return c || fallback;
  } catch { return fallback; }
}

function makeStaveNote(VF, note, color) {
  const sn = new VF.StaveNote({
    keys: note.rest ? [REST_KEY] : (note.keys && note.keys.length ? note.keys : ['c/4']),
    duration: vexDuration(note),
    autoStem: true,
  });
  if (!note.rest && note.accidental) sn.addModifier(new VF.Accidental(note.accidental), 0);
  if (note.dots) VF.Dot.buildAndAttach([sn], { all: true });
  if (color) sn.setStyle({ fillStyle: color, strokeStyle: color });
  return sn;
}

// Draw `score` into `host`. opts: { width, selected, playhead, ink }.
// Returns { notes:[{index,x,y,w,h}], staves:[{x,width,topLineY,spacing,yTop,yBot,first,last}] }.
export function renderScore(VF, host, score, opts = {}) {
  const { Renderer, Stave, Formatter, Voice } = VF;
  const width = Math.max(320, opts.width || 680);
  const ink = opts.ink || cssColor('--ink', '#1b1b1b');
  const accent = opts.accent || cssColor('--accent', '#5b59d6');
  const good = opts.good || cssColor('--good', '#3f9d5a');
  const selected = opts.selected, playhead = opts.playhead;

  host.innerHTML = '';
  const measures = packMeasures(score.notes || []);
  const LEFT = 8, TOP = 12, SYS_H = 108, CLEF_W = 62;
  const usable = width - LEFT * 2;
  const perSystem = Math.max(1, Math.min(4, Math.floor(usable / 200)));
  const systems = [];
  for (let i = 0; i < measures.length; i += perSystem) systems.push(measures.slice(i, i + perSystem));
  const totalH = TOP * 2 + systems.length * SYS_H;

  const renderer = new Renderer(host, Renderer.Backends.SVG);
  renderer.resize(width, totalH);
  const ctx = renderer.getContext();
  ctx.setFillStyle(ink); ctx.setStrokeStyle(ink);

  const notes = [];
  const staves = [];

  systems.forEach((sysMeasures, si) => {
    const y = TOP + si * SYS_H;
    const n = sysMeasures.length;
    const base = (usable - CLEF_W) / n;
    let x = LEFT;
    sysMeasures.forEach((measure, mi) => {
      const first = mi === 0;
      const w = base + (first ? CLEF_W : 0);
      const stave = new Stave(x, y, w);
      stave.setStyle({ fillStyle: ink, strokeStyle: ink });
      if (first) { stave.addClef('treble'); if (si === 0) stave.addTimeSignature('4/4'); }
      stave.setContext(ctx).draw();

      const vfNotes = measure.notes.map(({ note, index }) => {
        const color = index === selected ? accent : index === playhead ? good : ink;
        return makeStaveNote(VF, note, color);
      });
      if (vfNotes.length) {
        const voice = new Voice({ numBeats: 4, beatValue: 4 }).setStrict(false);
        voice.addTickables(vfNotes);
        new Formatter().joinVoices([voice]).format([voice], Math.max(40, w - 24));
        voice.draw(ctx, stave);
        measure.notes.forEach(({ index }, k) => {
          try {
            const bb = vfNotes[k].getBoundingBox();
            if (bb) notes.push({ index, x: bb.getX(), y: bb.getY(), w: bb.getW(), h: bb.getH() });
          } catch { /* note without a bbox — skip hit-testing it */ }
        });
      }
      const topLineY = stave.getYForLine(0);
      const spacing = stave.getYForLine(1) - topLineY || 10;
      staves.push({
        x, width: w, topLineY, spacing,
        yTop: topLineY - spacing * 5, yBot: stave.getYForLine(4) + spacing * 5,
        first: measure.notes.length ? measure.notes[0].index : null,
        last: measure.notes.length ? measure.notes[measure.notes.length - 1].index : null,
      });
      x += w;
    });
  });

  return { notes, staves };
}

// Map a click at (x,y) in SVG coords to an action.
//  { type:'note', index }            → an existing note was clicked (select it)
//  { type:'place', key, insertAt }   → empty staff space (insert a note there)
//  { type:'none' }
export function hitTest(layout, x, y) {
  for (const n of layout.notes) {
    if (x >= n.x - 7 && x <= n.x + n.w + 7 && y >= n.y - 7 && y <= n.y + n.h + 7) return { type: 'note', index: n.index };
  }
  for (const s of layout.staves) {
    if (x >= s.x && x <= s.x + s.width && y >= s.yTop && y <= s.yBot) {
      const steps = Math.round((s.topLineY - y) / (s.spacing / 2));
      const di = Math.max(0, Math.min(DIATONIC.length - 1, F5_INDEX + steps));
      // Insertion point: before the first note in this measure whose center is right of the click.
      let insertAt = s.last != null ? s.last + 1 : null;
      if (s.first != null) {
        const inMeasure = layout.notes.filter((n) => n.index >= s.first && n.index <= s.last).sort((a, b) => a.x - b.x);
        for (const n of inMeasure) { if (x < n.x + n.w / 2) { insertAt = n.index; break; } }
      }
      return { type: 'place', key: DIATONIC[di], insertAt };
    }
  }
  return { type: 'none' };
}
