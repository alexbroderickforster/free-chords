// FreeChords — optional, offline-first sync to the user's own Google Drive.
//
// Data is stored in Drive's hidden per-app "appDataFolder", so it's private to
// this app and invisible in the user's normal Drive. localStorage stays the
// source of truth on each device; this module just pushes/pulls/merges a single
// JSON document. Auth uses Google Identity Services (token model, no secret),
// which works from a static site — see README for the one-time setup.

const CLIENT_ID = (import.meta.env && import.meta.env.VITE_GOOGLE_CLIENT_ID) || '';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'freechords.json';

export function isConfigured() { return !!CLIENT_ID; }

// ---- Pure merge (the testable heart) ------------------------------------
// A doc is { songs:[{id,...,updatedAt}], tags:[], prefs:{[id]:{}}, deletions:{[id]:at} }.
// Songs merge by id with last-write-wins on updatedAt; a tombstone removes a
// song unless the song was re-added after it. Tags union; prefs shallow-merge
// (b wins ties). Pass (remote, local) so the local device wins pref conflicts.
export function mergeDocs(a, b) {
  a = a || {}; b = b || {};
  const deletions = { ...(a.deletions || {}) };
  for (const [id, at] of Object.entries(b.deletions || {})) {
    if (!deletions[id] || at > deletions[id]) deletions[id] = at;
  }
  const byId = {};
  for (const s of [...(a.songs || []), ...(b.songs || [])]) {
    if (!s || !s.id) continue;
    const prev = byId[s.id];
    if (!prev || (s.updatedAt || 0) > (prev.updatedAt || 0)) byId[s.id] = s;
  }
  const songs = Object.values(byId).filter((s) => {
    const delAt = deletions[s.id];
    return !(delAt && delAt >= (s.updatedAt || 0));
  });
  // A song re-added after deletion clears its (stale) tombstone.
  for (const s of songs) {
    if (deletions[s.id] && (s.updatedAt || 0) > deletions[s.id]) delete deletions[s.id];
  }
  const tags = Array.from(new Set([...(a.tags || []), ...(b.tags || [])]));
  const prefs = { ...(a.prefs || {}), ...(b.prefs || {}) };
  return { songs, tags, prefs, deletions };
}

// ---- Google Identity Services + Drive REST ------------------------------
let gisPromise = null;
function loadGis() {
  if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true;
      s.onload = resolve;
      s.onerror = () => { gisPromise = null; reject(new Error('Failed to load Google sign-in')); };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;
let pending = null; // { resolve, reject } for the in-flight token request

function settle(fn, value) {
  if (!pending) return;
  const p = pending; pending = null;
  p[fn](value);
}

async function ensureTokenClient() {
  await loadGis();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp && resp.access_token) {
          accessToken = resp.access_token;
          const ttl = (resp.expires_in ? resp.expires_in * 1000 : 3600000) - 60000;
          tokenExpiry = Date.now() + Math.max(60000, ttl);
          settle('resolve', accessToken);
        } else {
          settle('reject', new Error((resp && resp.error) || 'Authorization failed'));
        }
      },
      error_callback: (err) => settle('reject', new Error((err && err.type) || 'Authorization failed')),
    });
  }
}

function requestToken(prompt) {
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    // Safety net: if Google never calls back (e.g. a silently blocked popup),
    // don't leave the request hanging forever.
    const guard = setTimeout(() => settle('reject', new Error('timeout')), 60000);
    const done = (fn) => (v) => { clearTimeout(guard); fn(v); };
    pending = { resolve: done(resolve), reject: done(reject) };
    try { tokenClient.requestAccessToken({ prompt }); }
    catch (e) { settle('reject', e); }
  });
}

// interactive=true allows a popup (use on the user's click). interactive=false
// asks for a token without forcing UI (best-effort silent resume).
async function getToken(interactive) {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  if (!CLIENT_ID) throw new Error('Sync is not configured');
  await ensureTokenClient();
  return requestToken(interactive ? 'consent' : '');
}

const auth = (token) => ({ Authorization: 'Bearer ' + token });

async function findFile(token) {
  const url = 'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder'
    + '&fields=files(id,name)&q=' + encodeURIComponent(`name='${FILE_NAME}'`);
  const r = await fetch(url, { headers: auth(token) });
  if (!r.ok) throw new Error('Drive list failed');
  const j = await r.json();
  return j.files && j.files[0];
}

async function downloadFile(token, id) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: auth(token) });
  if (!r.ok) return null;
  return r.json();
}

async function createFile(token) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] }),
  });
  if (!r.ok) throw new Error('Drive create failed');
  return (await r.json()).id;
}

async function writeFile(token, id, doc) {
  const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
    method: 'PATCH',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  });
  if (!r.ok) throw new Error('Drive write failed');
}

// Pull remote, merge with local, write the merged doc back. Returns the merged
// doc so the caller can adopt it as the new local state.
export async function fullSync(localDoc, interactive) {
  const token = await getToken(interactive);
  const file = await findFile(token);
  const remote = file ? await downloadFile(token, file.id) : null;
  const merged = remote ? mergeDocs(remote, localDoc) : localDoc;
  const id = file ? file.id : await createFile(token);
  await writeFile(token, id, merged);
  return merged;
}

// Upload the local doc (used for debounced change-driven pushes). Never forces
// a popup; if a token isn't available without UI it simply throws and the
// caller can ignore it until the next full sync.
export async function push(localDoc) {
  const token = await getToken(false);
  const file = await findFile(token);
  const id = file ? file.id : await createFile(token);
  await writeFile(token, id, localDoc);
}

export function disconnect() {
  if (accessToken && window.google?.accounts?.oauth2) {
    try { window.google.accounts.oauth2.revoke(accessToken); } catch { /* ignore */ }
  }
  accessToken = null; tokenExpiry = 0;
}
