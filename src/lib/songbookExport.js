// Standalone songbook export — render songs into a self-contained HTML document
// that works offline on any device, no app required. Two modes:
//   'player' — an offline web page that auto-scrolls through the songs at each
//              song's saved tempo (a portable version of the play view).
//   'print'  — a static, one-song-per-page layout that opens the print dialog so
//              the user can "Save as PDF".
// CSS, JS, and the rendered chords are all inlined, so a single file is enough.
import { toSections } from './chordpro.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function renderSheet(song) {
  if (song.format === 'tab') return `<pre class="tab">${esc(song.source || '')}</pre>`;
  const sections = toSections(song.source || '');
  return sections.map((sec) => {
    const label = sec.label ? `<div class="label">${esc(sec.label)}</div>` : '';
    const lines = sec.lines.map((line) => {
      const segs = line.map((s) =>
        `<span class="seg"><span class="chord">${esc(s.chord || ' ')}</span><span class="lyric">${esc(s.text || ' ')}</span></span>`
      ).join('');
      return `<div class="line">${segs}</div>`;
    }).join('');
    return `<section class="section">${label}${lines}</section>`;
  }).join('') || '<div class="empty">No chords yet.</div>';
}

function metaLine(song, t) {
  const bits = [];
  if (song.artist && song.artist !== 'Unknown') bits.push(esc(song.artist));
  if (song.album) bits.push(esc(song.album));
  if (song.key) bits.push('Key ' + esc(song.key));
  if (song.capo > 0) bits.push('Capo ' + song.capo);
  if (t && t.useBpm) bits.push(esc(String(t.bpm)) + ' BPM');
  return bits.join(' &middot; ');
}

function renderSong(song, t, withHead) {
  t = t || {};
  const data = `data-usebpm="${t.useBpm ? 1 : 0}" data-bpm="${Number(t.bpm) || 90}" data-speed="${Number(t.speed) || 4}"`;
  // A single-song export puts the title in the document header, so skip the
  // per-song heading to avoid printing the title twice. The title still rides
  // on data-title for the player bar.
  const head = withHead === false ? '' : `<div class="song-head">
    <h2 class="song-title">${esc(song.title || 'Untitled')}</h2>
    <div class="song-meta">${metaLine(song, t)}</div>
  </div>`;
  return `<section class="song" data-title="${esc(song.title || 'Untitled')}" ${data}>
  ${head}<div class="sheet">${renderSheet(song)}</div>
  <div class="song-end">— end —</div>
</section>`;
}

const BASE_CSS = `
:root{--bg:#f6f0e3;--ink:#2b2a26;--soft:#6f675c;--faint:#9a9080;--accent:#3b3a8e;--line:#e4dccb;}
*{box-sizing:border-box;}
html,body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;}
.doc-head{max-width:760px;margin:0 auto;padding:30px 24px 6px;}
.doc-title{font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;margin:0;}
.doc-sub{color:var(--soft);font-size:14px;margin-top:4px;}
#book{max-width:760px;margin:0 auto;padding:0 24px;}
.song{padding:34px 0 6px;}
.song-head{margin-bottom:18px;}
.song-title{font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;margin:0;}
.song-meta{color:var(--soft);font-size:13px;margin-top:3px;}
.sheet{--lyric:22px;}
.section{margin-bottom:22px;}
.label{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:10px;}
.line{display:flex;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px;}
.seg{display:inline-flex;flex-direction:column;align-items:flex-start;}
.chord{font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace;font-weight:700;font-size:calc(var(--lyric)*.66);color:var(--accent);line-height:1.1;height:1.5em;padding-right:.6em;white-space:pre;}
.lyric{font-size:var(--lyric);line-height:1.28;white-space:pre-wrap;}
.tab{font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace;font-size:14px;line-height:1.5;white-space:pre;overflow-x:auto;}
.empty{color:var(--faint);font-style:italic;}
.song-end{text-align:center;color:var(--faint);font-size:12px;letter-spacing:.14em;text-transform:uppercase;padding:6px 0 0;}
.credit{text-align:center;color:var(--faint);font-size:12px;padding:26px 0 10px;}
`;

const PLAYER_CSS = `
body{padding-bottom:120px;}
#bar{position:fixed;left:0;right:0;bottom:0;display:flex;align-items:center;gap:14px;padding:12px 18px;background:rgba(246,240,227,.94);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-top:1px solid var(--line);}
#pp{width:52px;height:52px;border-radius:50%;border:none;background:var(--accent);color:#fff;font-size:19px;cursor:pointer;flex:none;display:inline-flex;align-items:center;justify-content:center;}
#pp:active{transform:scale(.95);}
#now{min-width:0;flex:1;}
#now-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#now-next{color:var(--soft);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;}
`;

const PRINT_CSS = `
.printbar{position:sticky;top:0;z-index:2;background:var(--bg);padding:12px 24px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center;}
.printbar button{padding:8px 16px;border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;}
.printbar span{color:var(--soft);font-size:13px;}
@media print{
  body{background:#fff;}
  .printbar{display:none;}
  #book{max-width:none;padding:0 10mm;}
  .doc-head{max-width:none;padding:8mm 10mm 0;}
  .song{break-before:page;padding-top:0;}
  .song:first-child{break-before:auto;}
  .line{break-inside:avoid;}
  .song-end,.credit{display:none;}
  .chord{color:#111;}.label{color:#111;}
}
`;

// Inlined player: continuous auto-scroll where the scroll speed tracks the song
// currently at the top of the view, so each song rolls at its own saved tempo.
// Mirrors the app's math: BPM mode ≈ one bar (4 beats) per text row.
const PLAYER_JS = `
(function(){
  var songs=[].slice.call(document.querySelectorAll('.song'));
  var pp=document.getElementById('pp'),nowT=document.getElementById('now-title'),nowN=document.getElementById('now-next');
  var playing=false,raf=0,last=0,acc=0,rowPx=0;
  function measure(){var seg=document.querySelector('.seg');if(seg){var h=seg.getBoundingClientRect().height;if(h>0)rowPx=h;}if(!rowPx)rowPx=51;}
  function current(){for(var i=0;i<songs.length;i++){if(songs[i].getBoundingClientRect().bottom>100)return i;}return songs.length-1;}
  function label(){var i=current(),s=songs[i];nowT.textContent=s?(s.getAttribute('data-title')||''):'';var nx=songs[i+1];nowN.textContent=nx?('Up next: '+(nx.getAttribute('data-title')||'')):(playing?'Last song':'Tap play to roll through');return i;}
  function speed(i){var el=songs[i];if(!el)return 40;if(el.getAttribute('data-usebpm')==='1'){var b=Math.max(30,Math.min(300,parseInt(el.getAttribute('data-bpm'),10)||90));return (b/4)*rowPx/60;}var sp=parseInt(el.getAttribute('data-speed'),10)||4;return sp*sp*0.7+3;}
  function atEnd(){return (window.scrollY+window.innerHeight)>=(document.documentElement.scrollHeight-2);}
  function tick(now){if(!last)last=now;var dt=now-last;last=now;var i=label();acc+=speed(i)*dt/1000;if(acc>=1){var whole=Math.floor(acc);acc-=whole;window.scrollBy(0,whole);if(atEnd()){stop();return;}}raf=requestAnimationFrame(tick);}
  function start(){if(playing)return;playing=true;pp.innerHTML='&#10073;&#10073;';last=0;measure();raf=requestAnimationFrame(tick);}
  function stop(){playing=false;pp.innerHTML='&#9654;';cancelAnimationFrame(raf);label();}
  pp.addEventListener('click',function(){playing?stop():start();});
  window.addEventListener('resize',measure);
  measure();label();
})();
`;

const PRINT_JS = `window.addEventListener('load',function(){setTimeout(function(){try{window.print();}catch(e){}},400);});`;

export function renderSongbookHtml(songs, opts) {
  opts = opts || {};
  const mode = opts.mode === 'print' ? 'print' : 'player';
  const title = opts.title || 'FreeChords';
  const bpmFor = typeof opts.bpmFor === 'function' ? opts.bpmFor : () => ({});
  const list = Array.isArray(songs) ? songs : [];
  const single = !!opts.single && list.length === 1;
  const body = list.map((s) => renderSong(s, bpmFor(s), !single)).join('\n');
  const count = list.length;
  const css = BASE_CSS + (mode === 'print' ? PRINT_CSS : PLAYER_CSS);
  const head = single
    ? `<header class="doc-head"><h1 class="doc-title">${esc(list[0].title || 'Untitled')}</h1><div class="doc-sub">${metaLine(list[0], bpmFor(list[0])) || 'FreeChords'}</div></header>`
    : `<header class="doc-head"><h1 class="doc-title">${esc(title)}</h1><div class="doc-sub">${count} song${count === 1 ? '' : 's'} &middot; FreeChords</div></header>`;
  const printbar = mode === 'print'
    ? `<div class="printbar"><button onclick="window.print()">Print / Save as PDF</button><span>Use your browser's print dialog and choose “Save as PDF”.</span></div>`
    : '';
  const foot = mode === 'player'
    ? `<div id="bar"><button id="pp" aria-label="Play or pause">&#9654;</button><div id="now"><div id="now-title"></div><div id="now-next"></div></div></div><script>${PLAYER_JS}</script>`
    : `<script>${PRINT_JS}</script>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head><body>${printbar}${head}<main id="book">${body}</main><div class="credit">Made with FreeChords &middot; freechords.app</div>${foot}</body></html>`;
}

// Download the document as a standalone .html file.
export function downloadHtml(filename, html) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Open the document in a new tab (print mode auto-opens the print dialog).
export function openDoc(html) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return !!w;
}
