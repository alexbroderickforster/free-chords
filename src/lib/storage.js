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

// Ear-training "key ping" toggle (device-local practice pref, default on).
export function loadKeyPing() { return read('keyPing', true) === true; }
export function saveKeyPing(v) { write('keyPing', !!v); }

// Tuner in-tune tolerance preset (device-local): 'strict' | 'standard' | 'relaxed'.
export function loadTunerTol() { const v = read('tunerTol', 'standard'); return ['strict', 'standard', 'relaxed'].includes(v) ? v : 'standard'; }
export function saveTunerTol(v) { write('tunerTol', v); }

// "Listen while I play and flag an out-of-tune guitar" toggle (device-local,
// default off — it's a mic, so strictly opt-in).
export function loadTuningMonitor() { return read('tuningMonitor', false) === true; }
export function saveTuningMonitor(v) { write('tuningMonitor', !!v); }

// Ear-training (interval trainer) settings — device-local.
export function loadTraining() { const d = read('training', null); return d && typeof d === 'object' ? d : null; }
export function saveTraining(v) { write('training', v); }

// Lifetime per-interval accuracy: { [semitones]: { c, t } }. Drives the adaptive
// weighting so weaker intervals come up more often.
export function loadTrainingStats() { const d = read('trainingStats', null); return d && typeof d === 'object' ? d : {}; }
export function saveTrainingStats(v) { write('trainingStats', v); }

// Whether the intro/guide has been dismissed (so it only auto-opens first run).
export function loadSeenGuide() { return read('seenGuide', false) === true; }
export function saveSeenGuide(v) { write('seenGuide', !!v); }

// Claude API key for image import. Device-local only — deliberately NOT part of
// the Drive-sync payload (it's a secret and must never leave this device).
export function loadApiKey() { return read('apiKey', '') || ''; }
export function saveApiKey(v) { write('apiKey', (v || '').trim()); }

// Playlists: [{ id, name, songIds:[], createdAt, updatedAt }]. Default [] (no seed).
export function loadPlaylists() {
  const stored = read('playlists', null);
  return Array.isArray(stored) ? stored : [];
}
export function savePlaylists(pls) { write('playlists', pls); }

// Deletion tombstones for playlists (sync): { [playlistId]: deletedAtEpochMs }
export function loadPlaylistDeletions() {
  const stored = read('playlistDeletions', null);
  return stored && typeof stored === 'object' ? stored : {};
}
export function savePlaylistDeletions(d) { write('playlistDeletions', d); }

// Saved practice loops: [{ id, name, kind, id/url/name, a, b, speed, preRoll, createdAt, updatedAt }]
export function loadLoops() {
  const stored = read('loops', null);
  return Array.isArray(stored) ? stored : [];
}
export function saveLoops(v) { write('loops', v); }
export function loadLoopDeletions() {
  const stored = read('loopDeletions', null);
  return stored && typeof stored === 'object' ? stored : {};
}
export function saveLoopDeletions(d) { write('loopDeletions', d); }
