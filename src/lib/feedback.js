// FreeChords — client-side feedback delivery.
//
// Submissions POST to a Google Apps Script web app that appends a row to a
// Google Sheet (endpoint URL in VITE_FEEDBACK_URL — see docs/feedback-setup.md).
// Apps Script can't return CORS headers, so we send a `no-cors` "simple" request
// (text/plain, no preflight) and can't read the response — it's fire-and-forget.
// If the network is down (or no endpoint is configured yet), the note is queued
// in localStorage and flushed on the next app load / when we come back online,
// so nothing a tester writes is ever lost.

const ENDPOINT = import.meta.env.VITE_FEEDBACK_URL || '';
const QUEUE_KEY = 'freechords:v2:feedbackQueue';

// Build/device context attached to every submission, for triage.
function deviceContext() {
  const c = {};
  try { c.commit = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'dev'; } catch { c.commit = 'dev'; }
  try { c.theme = document.documentElement.dataset.theme || ''; } catch { /* ignore */ }
  try { c.viewport = `${window.innerWidth}×${window.innerHeight}`; } catch { /* ignore */ }
  try { c.ua = navigator.userAgent || ''; } catch { /* ignore */ }
  try { c.url = location.href; } catch { /* ignore */ }
  return c;
}

async function postOnce(payload) {
  // no-cors keeps the browser from demanding CORS headers Apps Script can't send;
  // text/plain keeps it a "simple" request so there's no preflight OPTIONS.
  // keepalive lets an in-flight submit survive the page being closed mid-send.
  // Caveat: with no-cors the response is opaque, so this resolves on ANY HTTP
  // status — a server-side failure (bad URL, quota) can't be detected here. The
  // queue below only rescues network-level failures; confirm the Sheet during setup.
  await fetch(ENDPOINT, {
    method: 'POST',
    mode: 'no-cors',
    keepalive: true,
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
}

function readQueue() {
  try { const r = JSON.parse(localStorage.getItem(QUEUE_KEY)); return Array.isArray(r) ? r : []; }
  catch { return []; }
}
function writeQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* storage unavailable */ }
}

// Send one piece of feedback. Returns { ok } on delivery, or { queued } if it was
// stashed for a later retry (offline, or no endpoint configured yet).
export async function submitFeedback({ type, message, name, page, song }) {
  const payload = {
    type: type || 'idea',
    message: message || '',
    name: name || '',
    page: page || '',
    song: song || '',
    at: new Date().toISOString(),
    ...deviceContext(),
  };
  if (!ENDPOINT) { writeQueue([...readQueue(), payload]); return { ok: false, queued: true }; }
  try {
    await postOnce(payload);
    return { ok: true };
  } catch {
    writeQueue([...readQueue(), payload]);
    return { ok: false, queued: true };
  }
}

// Best-effort flush of anything queued while offline or before the endpoint was
// configured. Safe to call on every app load; a no-op when there's nothing to send.
let flushing = false;
export async function flushFeedbackQueue() {
  if (!ENDPOINT || flushing) return; // guard against mount + 'online' double-runs
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  flushing = true;
  try {
    const q = readQueue();
    if (!q.length) return;
    const failed = [];
    for (const item of q) {
      try { await postOnce(item); }
      catch { failed.push(item); }
    }
    // Re-read in case new feedback was queued during the awaits, so we don't
    // clobber it: keep the retries plus anything appended after our snapshot.
    const after = readQueue();
    const appended = after.length > q.length ? after.slice(q.length) : [];
    writeQueue([...failed, ...appended]);
  } finally {
    flushing = false;
  }
}
