// FreeChords — extract chord text from a PDF, client-side, with pdf.js.
//
// Chord sheets in PDFs place chords above lyrics using x/y positions, so we
// rebuild each line from positioned text runs: group runs by their y position,
// order by x, and pad spaces from x gaps to recover the monospace-style column
// alignment. That feeds the same chords-over-words cleaner as a pasted sheet.
//
// Works on text-based PDFs only — scanned/image PDFs have no selectable text
// (that would need OCR, which is out of scope). pdf.js is lazy-loaded.

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })().catch((e) => { pdfjsPromise = null; throw e; });
  }
  return pdfjsPromise;
}

function reconstructPage(items) {
  const runs = items
    .filter((i) => i.str && i.str.length)
    .map((i) => ({ x: i.transform[4], y: i.transform[5], str: i.str, w: i.width || 0, h: i.height || 0 }));
  if (!runs.length) return '';

  // Estimate a character width (median of width / length) and a line tolerance.
  const widths = runs.filter((r) => r.w > 0 && r.str.trim().length).map((r) => r.w / r.str.length);
  widths.sort((a, b) => a - b);
  const charW = widths.length ? Math.max(3, widths[Math.floor(widths.length / 2)]) : 6;
  const heights = runs.map((r) => r.h).filter(Boolean).sort((a, b) => a - b);
  const lineTol = heights.length ? Math.max(3, heights[Math.floor(heights.length / 2)] * 0.6) : 4;

  // Group runs into lines by y (top of page = larger y), then order each by x.
  const sorted = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const r of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - r.y) <= lineTol) { last.items.push(r); }
    else lines.push({ y: r.y, items: [r] });
  }

  return lines.map((line) => {
    line.items.sort((a, b) => a.x - b.x);
    const minX = line.items[0].x;
    let out = '';
    for (const it of line.items) {
      const col = Math.round((it.x - minX) / charW);
      if (col > out.length) out += ' '.repeat(col - out.length);
      out += it.str;
    }
    return out.replace(/\s+$/, '');
  }).join('\n');
}

export async function extractChordText(file) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  try {
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      pages.push(reconstructPage(tc.items));
    }
    const text = pages.join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) throw new Error('No selectable text — the PDF may be scanned images.');
    return text;
  } finally {
    try { await pdf.destroy(); } catch { /* ignore */ }
  }
}
