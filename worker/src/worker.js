// FreeChords image-import proxy (Cloudflare Worker).
//
// Holds Alex's Anthropic key as a server-side SECRET so it never ships to the
// browser. The app POSTs { image (base64), mediaType }; this builds the Claude
// request itself (model / max_tokens / prompt are fixed here — the client can't
// choose them) and returns { text }.
//
// The HARD spend ceiling is NOT this code — it's Anthropic-side: a $10 prepaid
// credit balance with auto-reload OFF, plus a dedicated workspace spend limit
// (see docs/shared-key-setup.md). The KV counters below are a courtesy throttle
// so the pool lasts and one person can't drain it; KV is eventually consistent,
// so treat its caps as approximate, not exact.

// NOTE: keep this PROMPT identical to the one in src/lib/imageImport.js (the
// own-key browser path) — both paths must transcribe the same way.
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

const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const utcDay = () => new Date().toISOString().slice(0, 10);

function originAllowed(origin, env) {
  if (!origin) return false;
  const list = (env.ALLOWED_ORIGINS || 'https://freechords.app')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(origin);
}

function corsHeaders(origin, env) {
  return {
    'Access-Control-Allow-Origin': originAllowed(origin, env) ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...headers } });

// Per-day global + per-IP counters. Pre-charged BEFORE forwarding so concurrent
// requests don't all slip past a stale read. KV is eventually consistent, so the
// caps are approximate — the real money bound is the Anthropic prepaid balance.
async function checkAndBumpLimits(env, ip, day) {
  if (!env.LIMITS) return { ok: true }; // no KV bound → rely on the Anthropic spend cap
  const dailyMax = int(env.DAILY_MAX, 200);
  const ipMax = int(env.IP_DAILY_MAX, 25);
  const gKey = `g:${day}`, ipKey = `ip:${day}:${ip}`;
  const [gRaw, ipRaw] = await Promise.all([env.LIMITS.get(gKey), env.LIMITS.get(ipKey)]);
  const g = int(gRaw, 0), i = int(ipRaw, 0);
  if (g >= dailyMax) return { ok: false, reason: 'The shared reader is used up for today — try tomorrow, or add your own key.' };
  if (i >= ipMax) return { ok: false, reason: 'You’ve hit today’s shared-import limit — add your own Claude key for unlimited imports.' };
  await Promise.all([
    env.LIMITS.put(gKey, String(g + 1), { expirationTtl: 172800 }),
    env.LIMITS.put(ipKey, String(i + 1), { expirationTtl: 172800 }),
  ]);
  return { ok: true };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, cors);

    // Courtesy gate only — Origin is trivially spoofable by non-browsers, so the
    // rate limits + Anthropic spend cap are the real defense, not this check.
    if (!originAllowed(origin, env)) return json({ error: 'This origin isn’t allowed.' }, 403, cors);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    try {
      const gate = await checkAndBumpLimits(env, ip, utcDay());
      if (!gate.ok) return json({ error: gate.reason }, 429, cors); // 429 → app falls back to OCR
    } catch {
      return json({ error: 'Rate limiter unavailable — try again shortly.' }, 503, cors); // fail closed
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Bad request body.' }, 400, cors); }
    const image = body && body.image;
    const mediaType = (body && body.mediaType) || 'image/png';
    if (!image || typeof image !== 'string') return json({ error: 'No image provided.' }, 400, cors);
    if (image.length > 6_500_000) return json({ error: 'That image is too large.' }, 413, cors);

    let ar;
    try {
      ar = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: env.MODEL || 'claude-sonnet-5',
          max_tokens: 8192,
          // Transcription needs no reasoning. Sonnet 5 thinks by default (effort
          // high) and on a dense page burns the whole token budget thinking and
          // never emits text — so turn thinking off. Keep this in sync with
          // src/lib/imageImport.js.
          thinking: { type: 'disabled' },
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              { type: 'text', text: PROMPT },
            ],
          }],
        }),
      });
    } catch {
      return json({ error: 'Couldn’t reach Claude — try again.' }, 502, cors);
    }

    // Credits exhausted (402) or upstream rate-limited (429) → tell the app the
    // shared pool is unavailable so it falls back to OCR / bring-your-own-key.
    if (ar.status === 402 || ar.status === 429) {
      return json({ error: 'The shared Claude reader is at its limit right now.' }, 429, cors);
    }
    if (!ar.ok) {
      let detail = '';
      try { const j = await ar.json(); detail = (j && j.error && j.error.message) || ''; } catch { /* ignore */ }
      return json({ error: detail || `Claude request failed (${ar.status}).` }, 502, cors);
    }

    let data;
    try { data = await ar.json(); }
    catch { return json({ error: 'Claude returned a malformed response — try again.' }, 502, cors); }
    if (data && data.stop_reason === 'refusal') return json({ error: 'Claude declined to process that image.' }, 422, cors);
    const text = ((data && data.content) || [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!text) return json({ error: 'Claude returned an empty result.' }, 502, cors);
    return json({ text }, 200, cors);
  },
};
