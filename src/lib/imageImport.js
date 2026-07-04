// Image import — turn a screenshot of a chord sheet into an editable song.
//
// Three paths, in priority order:
// 1. User's OWN key set → Claude vision, browser-direct to the Anthropic API
//    (their key, their spend). Understands chords sitting *above* lyrics and
//    returns clean ChordPro directly — no fragile column math.
// 2. No key, but a SHARED reader is configured (VITE_IMAGE_PROXY_URL) → the same
//    Claude vision, but via a proxy that holds the owner's key server-side and
//    rate-limits it (see worker/ + docs/shared-key-setup.md). If the shared pool
//    is used up, we fall through to OCR.
// 3. Otherwise → on-device OCR via Tesseract.js, loaded from a CDN only when
//    needed. OCR reads text linearly, so chord-over-lyric alignment is rough.
import { cleanToChordPro } from './chordpro.js';
import { isMostlyTab } from './tab.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';
// Optional shared-reader proxy. When set, screenshots work with no key of your
// own (subject to the proxy's rate limits). Inert until configured at build time.
const PROXY_URL = import.meta.env.VITE_IMAGE_PROXY_URL || '';
export const hasSharedReader = !!PROXY_URL;

const PROMPT = `You are given an image of a song's chord sheet (chords positioned above the lyrics), or possibly guitar tablature. Transcribe it faithfully.

Return ONLY a JSON object — no markdown fences, no commentary — with these fields:
- "format": "chordpro" for a chords-over-lyrics sheet, or "tab" for ASCII guitar tablature.
- "title": the song title if shown, else "".
- "artist": the artist if shown, else "".
- "key": the key if explicitly shown, else "".
- "capo": the capo fret as a number if shown, else 0.
- "content": the transcription (see below).

For "chordpro", write "content" as ChordPro, following these rules exactly:
- Read EVERY chord label in the image, top to bottom and left to right — do not skip or drop any. If a line has two or more chords above it, include all of them.
- Place each chord inline in square brackets IMMEDIATELY BEFORE the exact syllable it sits above, e.g. "When the [C]night has [G]come" — NOT bunched at the start like "[C] [G]When the night has come". A chord's horizontal position matters: a chord drawn toward the right of the line belongs over a later word, not an early one.
- For a chords-only line with no lyrics beneath it (like an intro or a turnaround), bracket each chord: "[G] [Dm] [C] [G]".
- Put section headers on their own line as {c: Verse 1}, {c: Chorus}, etc.
- Preserve line and verse breaks with \\n. Do not invent chords or lyrics the image doesn't show.

For "tab", put the tablature in "content" verbatim as plain text — keep the string letters and dashes exactly — with \\n between lines.

Transcribe exactly what you see. If part is unreadable, transcribe what you can.`;

// Load & downscale the image on a canvas. Caps the long edge (smaller = fewer
// image tokens and safely under the API's per-image size limit) and flattens
// transparency onto white. Prefers PNG for crisp text; falls back to JPEG only
// if the PNG base64 would be too large.
async function prepImage(file, maxEdge = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Could not read that image file.'));
      im.src = url;
    });
    const long = Math.max(img.naturalWidth, img.naturalHeight) || 1;
    const scale = Math.min(1, maxEdge / long);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    let mediaType = 'image/png';
    let dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length > 4_400_000) { // stay well under the 5MB base64 image cap
      mediaType = 'image/jpeg';
      dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    }
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return { mediaType, base64, dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function callClaude({ base64, mediaType, apiKey }) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Opt in to browser (CORS) access — the API requires this for direct
        // client-side calls (the SDK's `dangerouslyAllowBrowser` sets the same).
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });
  } catch {
    throw new Error('Couldn’t reach Claude — check your connection and try again.');
  }

  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = (j && j.error && j.error.message) || ''; } catch { /* ignore */ }
    if (res.status === 401) throw new Error('Your Claude API key was rejected. Update it in Backup & Sync.');
    if (res.status === 429) throw new Error('Claude is rate-limiting — wait a moment and try again.');
    if (res.status === 413 || (res.status === 400 && /image|large|size/i.test(detail)))
      throw new Error('That image was too large for Claude. Try a smaller or cropped screenshot.');
    throw new Error(detail || `Claude request failed (${res.status}).`);
  }

  const data = await res.json();
  if (data && data.stop_reason === 'refusal') throw new Error('Claude declined to process that image.');
  const text = ((data && data.content) || [])
    .filter((b) => b && b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!text) throw new Error('Claude returned an empty result — try again.');
  return text;
}

// Shared-reader path: POST the image to the proxy, which holds the owner's key
// and calls Claude. A 429 means the shared pool is spent/limited — we throw a
// tagged error so the orchestrator can fall back to OCR gracefully.
async function callProxy({ base64, mediaType }) {
  let res;
  try {
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: base64, mediaType }),
    });
  } catch {
    throw new Error('Couldn’t reach the image reader — check your connection and try again.');
  }
  if (res.status === 429 || res.status === 402) {
    const e = new Error('Shared reader is at its limit.');
    e.code = 'quota';
    throw e;
  }
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = (j && (j.error || j.message)) || ''; } catch { /* ignore */ }
    throw new Error(detail || `Image reader failed (${res.status}).`);
  }
  let data;
  try { data = await res.json(); } catch { data = null; }
  const text = (data && typeof data.text === 'string') ? data.text.trim() : '';
  if (!text) throw new Error('The image reader returned an empty result — try again.');
  return text;
}

// Tolerant parse of the model's reply into our normalized shape. Exported so the
// parsing can be unit-tested without a network call.
export function parseClaudeResult(text) {
  let t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();

  let obj = null;
  try { obj = JSON.parse(t); }
  catch {
    const s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s !== -1 && e > s) { try { obj = JSON.parse(t.slice(s, e + 1)); } catch { /* ignore */ } }
  }

  if (!obj || typeof obj !== 'object') {
    // Model didn't return JSON — treat the whole reply as ChordPro body.
    return { format: 'chordpro', title: '', artist: '', key: '', capo: 0, content: t };
  }

  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const capo = Number.isFinite(+obj.capo) ? Math.max(0, Math.min(12, Math.round(+obj.capo))) : 0;
  return {
    format: obj.format === 'tab' ? 'tab' : 'chordpro',
    title: str(obj.title),
    artist: str(obj.artist),
    key: str(obj.key),
    capo,
    content: typeof obj.content === 'string' ? obj.content : '',
  };
}

// --- On-device OCR fallback -------------------------------------------------
let tesseractPromise = null;
function loadTesseract() {
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js')
    .then((m) => m.default || m)
    .catch((e) => { tesseractPromise = null; throw e; });
  return tesseractPromise;
}

async function runOcr(dataUrl, onStatus) {
  let Tesseract;
  try { Tesseract = await loadTesseract(); }
  catch { throw new Error('Couldn’t load the on-device text reader — check your connection, or add a Claude API key.'); }
  const { data } = await Tesseract.recognize(dataUrl, 'eng', {
    logger: (m) => { if (m && m.status === 'recognizing text' && onStatus) onStatus('ocr', m.progress); },
  });
  return (data && data.text) ? data.text : '';
}

// Orchestrator. Returns a normalized result:
//   { method: 'claude'|'ocr', format: 'chordpro'|'tab',
//     title, artist, key, capo,
//     chordpro,  // ready-to-preview ChordPro (or verbatim tab text)
//     rawText }  // editable text to seed the paste box
// onStatus(step, progress?) is called with 'preparing' | 'claude' | 'ocr'.
export async function extractSongFromImage({ file, apiKey, onStatus }) {
  if (!file) throw new Error('No image selected.');
  if (!/^image\//.test(file.type || '')) throw new Error('That file isn’t an image.');

  if (onStatus) onStatus('preparing');
  const img = await prepImage(file);

  const key = (apiKey || '').trim();
  if (key) {
    // 1. User's own key → browser-direct.
    if (onStatus) onStatus('claude');
    const reply = await callClaude({ base64: img.base64, mediaType: img.mediaType, apiKey: key });
    const r = parseClaudeResult(reply);
    const chordpro = r.content || '';
    return { method: 'claude', format: r.format, title: r.title, artist: r.artist, key: r.key, capo: r.capo, chordpro, rawText: chordpro };
  }

  // 2. No key, but a shared reader is configured → via the proxy. If the pool is
  //    spent (tagged 'quota'), fall through to OCR; surface any other error.
  let sharedQuotaHit = false;
  if (PROXY_URL) {
    if (onStatus) onStatus('claude');
    try {
      const reply = await callProxy({ base64: img.base64, mediaType: img.mediaType });
      const r = parseClaudeResult(reply);
      const chordpro = r.content || '';
      return { method: 'shared', format: r.format, title: r.title, artist: r.artist, key: r.key, capo: r.capo, chordpro, rawText: chordpro };
    } catch (e) {
      if (e && e.code === 'quota') sharedQuotaHit = true;
      else throw e;
    }
  }

  // 3. On-device OCR (no key, no proxy, or the shared pool is used up).
  if (onStatus) onStatus('ocr', 0);
  const text = await runOcr(img.dataUrl, onStatus);
  if (!text.trim()) throw new Error('Couldn’t read any text from that image. Try a sharper screenshot, or add a Claude API key for far better results.');
  const format = isMostlyTab(text) ? 'tab' : 'chordpro';
  const chordpro = format === 'tab' ? text : cleanToChordPro(text);
  return { method: 'ocr', sharedQuotaHit, format, title: '', artist: '', key: '', capo: 0, chordpro, rawText: text };
}
