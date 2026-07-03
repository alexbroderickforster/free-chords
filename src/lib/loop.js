// Practice loop tool — pure helpers (no DOM), so they're easy to test.

// Pull an 11-char YouTube id out of a URL or accept a bare id.
export function parseYouTubeId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s; // bare id
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Figure out what the user pasted: a YouTube video, or a direct audio/media URL.
export function detectSource(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const id = parseYouTubeId(s);
  if (id) return { kind: 'youtube', id };
  if (/^https?:\/\//i.test(s)) return { kind: 'audioUrl', url: s };
  return null;
}

// Seconds → "m:ss" (or "h:mm:ss"), optional tenths for fine readouts.
export function fmtTime(t, tenths = false) {
  if (!isFinite(t) || t < 0) t = 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const pad = (n) => String(n).padStart(2, '0');
  const base = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  if (!tenths) return base;
  const d = Math.floor((t * 10) % 10);
  return `${base}.${d}`;
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (n) => Math.round(n * 10) / 10;

// Move the A/B window forward/back by its own length, staying in [0, dur].
export function shiftLoop(a, b, dur, dir) {
  if (a == null || b == null) return { a, b };
  const len = b - a;
  let na = a + dir * len;
  na = clamp(na, 0, Math.max(0, (dur || Infinity) - len));
  return { a: round1(na), b: round1(na + len) };
}

// Halve or double the loop length, anchored at A, staying in bounds.
export function scaleLoop(a, b, dur, factor) {
  if (a == null || b == null) return { a, b };
  let len = (b - a) * factor;
  len = Math.max(0.2, len);
  let nb = a + len;
  if (dur) nb = Math.min(nb, dur);
  return { a: round1(a), b: round1(nb) };
}

// A saved/shareable loop ⇄ URL query params. Local files can't be shared
// (there's no persistable source), so only youtube / audioUrl round-trip.
export function loopToParams(loop) {
  const p = new URLSearchParams();
  if (!loop) return p;
  if (loop.kind === 'youtube' && loop.id) p.set('yt', loop.id);
  else if (loop.kind === 'audioUrl' && loop.url) p.set('au', loop.url);
  else return p;
  if (loop.a != null) p.set('a', round1(loop.a));
  if (loop.b != null) p.set('b', round1(loop.b));
  if (loop.speed && loop.speed !== 1) p.set('r', loop.speed);
  if (loop.preRoll) p.set('p', loop.preRoll);
  return p;
}

export function paramsToLoop(search) {
  const p = new URLSearchParams(search || '');
  const yt = p.get('yt');
  const au = p.get('au');
  if (!yt && !au) return null;
  const num = (k) => { const v = p.get(k); return v == null || v === '' ? null : Number(v); };
  const loop = { a: num('a'), b: num('b'), speed: num('r') || 1, preRoll: num('p') || 0 };
  if (yt) { loop.kind = 'youtube'; loop.id = yt; }
  else { loop.kind = 'audioUrl'; loop.url = au; }
  return loop;
}

// YouTube only exposes discrete playback rates; snap a desired rate to the
// nearest allowed one.
export function snapRate(rate, allowed) {
  if (!allowed || !allowed.length) return rate;
  return allowed.reduce((best, r) => (Math.abs(r - rate) < Math.abs(best - rate) ? r : best), allowed[0]);
}
