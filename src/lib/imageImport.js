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

// Shown when Claude returns no text — most often because it won't transcribe a
// whole page of copyrighted lyrics at once. A tighter crop reliably goes through.
const EMPTY_MSG = 'Claude didn’t return a transcription for that image. This tends to happen with a full page of lyrics — try a tighter crop of just the part you want (a verse or two), which goes through far more reliably.';

// NOTE: keep this PROMPT identical to the one in worker/src/worker.js (the shared
// reader) — both paths must transcribe the same way.
const PROMPT = `You are given an image of a song's chord sheet (chords printed above the lyrics), or possibly guitar tablature. Transcribe it faithfully.

Return ONLY a JSON object — no markdown fences, no commentary — with these fields:
- "format": "chordpro" for a chords-over-lyrics sheet, or "tab" for ASCII guitar tablature.
- "title": the song title if shown, else "".
- "artist": the artist if shown, else "".
- "key": the key if explicitly shown, else "".
- "capo": the capo fret as a number if shown, else 0.
- "content": the transcription (rules below).

Write "content" as ChordPro. The rule that matters most: put every chord INLINE inside the lyric line, in [square brackets], immediately before the exact syllable it sits above.

Worked example — if the image shows:
    G            C          D
    I walk the long road down to the sea
then "content" for that line must be exactly:
I walk the [G]long road [C]down to the [D]sea

Rules, follow exactly:
- Bracket EVERY chord, including the first one on a line: "[G]I walk the...". Never leave a chord as a bare letter sitting outside brackets.
- Horizontal position matters: a chord drawn toward the right of the line belongs over a later word, not an early one. Read every chord label; skip none.
- A chords-only line with no lyrics under it (intro, turnaround, ending) is a plain line of bracketed chords: "[G] [D] [Em] [C]".
- NEVER put lyrics, or a row of chords, inside a {c: ...} directive. Use {c: ...} ONLY for a short section label on its own line, like {c: Verse 1} or {c: Chorus}, and only if the image clearly shows one.
- If a chord is written with a fingering in parentheses like "Dsus(000230)", use just the chord name: "[Dsus]".
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

// Mark an error the orchestrator may retry once (transient: an empty completion,
// a 5xx, or a network blip). NOT tagged: bad key, rate limit, too-large, refusal,
// or a shared-pool 'quota' signal — retrying those is pointless.
const retryable = (e) => { e.retry = true; return e; };
async function withRetry(fn) {
  try { return await fn(); }
  catch (e) { if (e && e.retry) return await fn(); throw e; }
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
        max_tokens: 8192,
        // Transcription needs no reasoning. Sonnet 5 thinks by default and on a
        // dense page spends the whole token budget thinking, emitting no text —
        // so turn thinking off. Keep in sync with worker/src/worker.js.
        thinking: { type: 'disabled' },
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
    throw retryable(new Error('Couldn’t reach Claude — check your connection and try again.'));
  }

  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = (j && j.error && j.error.message) || ''; } catch { /* ignore */ }
    if (res.status === 401) throw new Error('Your Claude API key was rejected. Update it in Backup & Sync.');
    if (res.status === 429) throw new Error('Claude is rate-limiting — wait a moment and try again.');
    if (res.status === 413 || (res.status === 400 && /image|large|size/i.test(detail)))
      throw new Error('That image was too large for Claude. Try a smaller or cropped screenshot.');
    const e = new Error(detail || `Claude request failed (${res.status}).`);
    throw res.status >= 500 ? retryable(e) : e; // a 5xx is worth one more try
  }

  const data = await res.json();
  if (data && data.stop_reason === 'refusal') throw new Error('Claude declined to process that image.');
  const text = ((data && data.content) || [])
    .filter((b) => b && b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!text) {
    const diag = ` [diagnostic — stop_reason: ${data && data.stop_reason}; blocks: ${((data && data.content) || []).map((b) => b && b.type).join(',') || 'none'}; output_tokens: ${data && data.usage && data.usage.output_tokens}]`;
    throw retryable(new Error(EMPTY_MSG + diag));
  }
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
    throw retryable(new Error('Couldn’t reach the image reader — check your connection and try again.'));
  }
  if (res.status === 429 || res.status === 402) {
    const e = new Error('Shared reader is at its limit.');
    e.code = 'quota';
    throw e;
  }
  if (!res.ok) {
    let detail = '', diag = '';
    try {
      const j = await res.json();
      detail = (j && (j.error || j.message)) || '';
      if (j && j.stop_reason) diag = ` [diagnostic — stop_reason: ${j.stop_reason}; blocks: ${(j.blocks || []).join(',') || 'none'}; output_tokens: ${j.output_tokens}]`;
    } catch { /* ignore */ }
    // The proxy reports an empty completion as a 5xx with an "empty" message —
    // surface the actionable crop guidance instead of the raw text.
    const msg = /empty/i.test(detail) ? EMPTY_MSG : (detail || `Image reader failed (${res.status}).`);
    throw retryable(new Error(msg + diag));
  }
  let data;
  try { data = await res.json(); } catch { data = null; }
  const text = (data && typeof data.text === 'string') ? data.text.trim() : '';
  if (!text) throw retryable(new Error(EMPTY_MSG));
  return text;
}

// The vision model sometimes wraps a chord line in a {c: ...} comment directive
// with the first chord left bare — e.g. "{c: C She took [D]it}" (chord over the
// first word) or "{c: G [Em] [G]}" (an intro run) — instead of clean inline
// ChordPro. {c: ...} should only ever be a short SECTION label, so unwrap any
// {c:} whose content actually leads with a chord: bracket the leading bare
// chord(s) and drop the wrapper. Real labels ("Verse 1", "Chorus") don't lead
// with a chord, so they're left untouched.
const CHORD_TOKEN = /^[A-G][#b]?(?:m|maj|min|dim|aug|sus[0-9]?|add[0-9]*|M)?[0-9]*(?:\/[A-G][#b]?)?$/;
const COMMENT_LINE = /^\{\s*(?:c|comment)\s*:\s*(.*?)\s*\}$/i;

export function normalizeChordPro(src) {
  return String(src || '').split('\n').map((line) => {
    const m = line.match(COMMENT_LINE);
    if (!m) return line;
    const tokens = m[1].trim().split(/\s+/);
    if (!tokens.length || !CHORD_TOKEN.test(tokens[0])) return line; // a real section label — leave it
    let i = 0; const lead = [];
    while (i < tokens.length && CHORD_TOKEN.test(tokens[i])) lead.push(tokens[i++]); // peel leading bare chords
    const rest = tokens.slice(i).join(' ');
    const brackets = lead.map((c) => `[${c}]`);
    if (!rest) return brackets.join(' ');                              // {c: D} -> [D]
    if (rest.startsWith('[')) return brackets.join(' ') + ' ' + rest;  // chord run -> [D] [Bm] ...
    return brackets.join('') + rest;                                   // over lyrics -> [C]She took...
  }).join('\n');
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
    return { format: 'chordpro', title: '', artist: '', key: '', capo: 0, content: normalizeChordPro(t) };
  }

  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const capo = Number.isFinite(+obj.capo) ? Math.max(0, Math.min(12, Math.round(+obj.capo))) : 0;
  return {
    format: obj.format === 'tab' ? 'tab' : 'chordpro',
    title: str(obj.title),
    artist: str(obj.artist),
    key: str(obj.key),
    capo,
    content: typeof obj.content === 'string'
      ? (obj.format === 'tab' ? obj.content : normalizeChordPro(obj.content))
      : '',
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
    const reply = await withRetry(() => callClaude({ base64: img.base64, mediaType: img.mediaType, apiKey: key }));
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
      const reply = await withRetry(() => callProxy({ base64: img.base64, mediaType: img.mediaType }));
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
