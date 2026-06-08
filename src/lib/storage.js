// FreeChords — tiny localStorage persistence layer.
// Versioned keys so a future schema change can migrate or reset cleanly.
// v2: songs now store ChordPro `source` instead of a `sections` array.
const NS = 'freechords:v2';
const key = (name) => `${NS}:${name}`;

function read(name, fallback) {
  try {
    const raw = localStorage.getItem(key(name));
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(name, value) {
  try {
    localStorage.setItem(key(name), JSON.stringify(value));
  } catch {
    /* storage full or unavailable (e.g. private mode) — fail quietly */
  }
}

export function loadSongs(seed) {
  const stored = read('songs', null);
  return Array.isArray(stored) && stored.length ? stored : seed;
}
export function saveSongs(songs) { write('songs', songs); }

export function loadTags(seed) {
  const stored = read('tags', null);
  return Array.isArray(stored) && stored.length ? stored : seed;
}
export function saveTags(tags) { write('tags', tags); }

export function loadTheme() { return read('theme', 'light') === 'dark'; }
export function saveTheme(dark) { write('theme', dark ? 'dark' : 'light'); }
export function loadThemeAt() { return read('themeAt', 0) || 0; }
export function saveThemeAt(at) { write('themeAt', at); }

// Whether the one-time "add your first song" welcome has been dismissed.
export function loadHelpDismissed() { return read('helpDismissed', false) === true; }
export function saveHelpDismissed(v) { write('helpDismissed', !!v); }

// Per-song playback preferences, keyed by song id:
// { [id]: { transpose, fontSize, hideChords, speed } }
export function loadPrefs() {
  const stored = read('prefs', null);
  return stored && typeof stored === 'object' ? stored : {};
}
export function savePrefs(prefs) { write('prefs', prefs); }

// Deletion tombstones for sync: { [songId]: deletedAtEpochMs }
export function loadDeletions() {
  const stored = read('deletions', null);
  return stored && typeof stored === 'object' ? stored : {};
}
export function saveDeletions(d) { write('deletions', d); }

// Whether the user has opted into Google Drive sync on this device.
export function loadSyncOptIn() { return read('syncOptIn', false) === true; }
export function saveSyncOptIn(v) { write('syncOptIn', !!v); }
