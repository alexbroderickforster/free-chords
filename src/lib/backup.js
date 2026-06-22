// FreeChords — songbook backup: export to / import from a JSON file.
const slugify = (s) =>
  (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'song';

// Normalize an imported song into the shape the app expects.
function normalizeSong(s) {
  return {
    id: s.id || slugify(s.title),
    title: s.title || 'Untitled',
    artist: s.artist || 'Unknown',
    key: s.key || '',
    capo: Number(s.capo) || 0,
    tags: Array.isArray(s.tags) ? s.tags : [],
    starred: !!s.starred,
    status: ['learn', 'learning', 'mastered'].includes(s.status) ? s.status : 'learn',
    added: s.added || 'imported',
    source: typeof s.source === 'string' ? s.source : '',
    format: s.format === 'tab' ? 'tab' : 'chordpro',
    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : undefined,
  };
}

// Trigger a download of the songbook as a JSON file.
export function exportSongbook(songs, tags, prefs, theme) {
  const payload = {
    app: 'FreeChords',
    version: 3,
    exportedAt: new Date().toISOString(),
    tags: tags || [],
    songs: songs || [],
    prefs: prefs || {},
    theme: theme || 'light',
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `freechords-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return payload.songs.length;
}

// Parse + validate a backup file's text. Accepts either a {songs,tags} object
// or a bare songs array. Throws if it can't find any usable songs.
export function parseBackup(text) {
  const data = JSON.parse(text);
  const rawSongs = Array.isArray(data) ? data : data && data.songs;
  if (!Array.isArray(rawSongs)) throw new Error('No songs found in file');
  const songs = rawSongs.filter((s) => s && (s.title || s.source)).map(normalizeSong);
  if (!songs.length) throw new Error('No songs found in file');
  const tags = data && Array.isArray(data.tags) ? data.tags : [];
  const prefs = data && data.prefs && typeof data.prefs === 'object' ? data.prefs : {};
  const theme = data && (data.theme === 'dark' || data.theme === 'light') ? data.theme : null;
  return { songs, tags, prefs, theme };
}
