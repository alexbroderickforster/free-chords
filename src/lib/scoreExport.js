// Export a Score as a PNG image or a printable page. Both re-render the score
// off-screen in black ink (the on-screen copy follows the theme, which would be
// invisible on white paper), then rasterize / print that SVG.
import { renderScore } from './scoreRender.js';

const loadVexFlow = () => import('vexflow');

// Render the score to a standalone SVG element in black ink, sized to `width`.
async function renderSvg(score, width = 900) {
  const VF = await loadVexFlow();
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;background:#fff';
  document.body.appendChild(host);
  try {
    renderScore(VF, host, score, { width, ink: '#161616', accent: '#161616', good: '#161616' });
    const svg = host.querySelector('svg');
    return svg ? svg.cloneNode(true) : null;
  } finally {
    document.body.removeChild(host);
  }
}

function svgDims(svg) {
  const w = (svg.width && svg.width.baseVal && svg.width.baseVal.value) || parseFloat(svg.getAttribute('width')) || 900;
  const h = (svg.height && svg.height.baseVal && svg.height.baseVal.value) || parseFloat(svg.getAttribute('height')) || 300;
  return { w, h };
}

export async function exportScorePng(score, filename = 'score.png') {
  const svg = await renderSvg(score, 1000);
  if (!svg) throw new Error('Nothing to export yet.');
  const { w, h } = svgDims(svg);
  const xml = new XMLSerializer().serializeToString(svg);
  const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(w * scale); canvas.height = Math.ceil(h * scale);
      const c = canvas.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, canvas.width, canvas.height);
      c.setTransform(scale, 0, 0, scale, 0, 0);
      c.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Couldn’t render the image.')); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        resolve();
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('Couldn’t render the image.'));
    img.src = src;
  });
}

// Open a print-styled window with the score (Save as PDF from the print dialog).
export async function printScore(score, title = 'Score') {
  const svg = await renderSvg(score, 900);
  if (!svg) throw new Error('Nothing to print yet.');
  const xml = new XMLSerializer().serializeToString(svg);
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title>
<style>body{margin:32px;font-family:Georgia,serif;color:#161616}h1{font-size:22px;margin:0 0 18px}svg{max-width:100%}</style>
</head><body><h1>${title.replace(/</g, '&lt;')}</h1>${xml}
<script>window.onload=function(){setTimeout(function(){window.print()},150)}</script></body></html>`);
  w.document.close();
  return true;
}
