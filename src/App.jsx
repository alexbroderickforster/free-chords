// FreeChords app shell — responsive: left sidebar on web/desktop,
// bottom tab bar on mobile. Ties the screens together.
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TabBar, SideNav, IconButton, Button, Icon, Credit } from './components/index.js';
import { SongView } from './screens/SongView.jsx';
import { SongEdit } from './screens/SongEdit.jsx';
import { Library } from './screens/Library.jsx';
import { Playlists } from './screens/Playlists.jsx';
import { AddImport } from './screens/AddImport.jsx';
import { TunerView } from './screens/TunerView.jsx';
import { SONGS, ALL_TAGS } from './data/songs.js';
import { nextStatus } from './lib/music.js';
import { BackupControls } from './screens/Backup.jsx';
import { loadSongs, saveSongs, loadTags, saveTags, loadTheme, saveTheme, loadThemeAt, saveThemeAt, loadPrefs, savePrefs, loadDeletions, saveDeletions, loadSyncOptIn, saveSyncOptIn, loadPlaylists, savePlaylists, loadPlaylistDeletions, savePlaylistDeletions, loadKeyPing, saveKeyPing, loadApiKey, saveApiKey } from './lib/storage.js';
import { exportSongbook, parseBackup } from './lib/backup.js';
import { isConfigured as syncConfigured, fullSync, push as syncPush, disconnect as syncDisconnect, warmUp as warmUpSync } from './lib/sync.js';
import './styles/app.css';

const slugify = (s) =>
  (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'song';

// A fingerprint of the syncable data — used to push only when it actually changes.
const syncSig = (songs, tags, prefs, deletions, theme, themeAt, playlists, playlistDeletions) =>
  JSON.stringify({ s: songs, t: tags, p: prefs, d: deletions, th: theme, ta: themeAt, pl: playlists, pld: playlistDeletions });

// Is the app running as an installed (standalone) iOS web app? The Google
// sign-in popup is structurally broken there, so we steer the user to a browser.
const isIosStandalone = () =>
  typeof navigator !== 'undefined' && navigator.standalone === true;

// Turn a raw sync error into something a person (on a phone, with no console) can read.
function friendlySyncError(e) {
  const m = (e && e.message) || '';
  if (/origin|not allowed|invalid_client/i.test(m)) return 'This site isn’t authorized for Google sign-in yet (origin not allowed). The app owner needs to add it in Google Cloud.';
  if (/popup_failed_to_open|popup.*block/i.test(m)) return 'The Google sign-in popup was blocked. Allow popups, then tap Connect again.';
  if (/popup_closed|user_cancel|access_denied/i.test(m)) return 'Sign-in was cancelled. Tap Connect to try again.';
  if (/timeout|superseded/i.test(m)) return 'Google sign-in didn’t respond. If you’re using the installed app, open freechords.app in your browser instead, then tap Connect.';
  if (/Failed to load Google sign-in/i.test(m)) return 'Couldn’t load Google sign-in — check your connection and try again.';
  if (/\(401|\(403/.test(m)) return 'Google rejected the request (' + m.replace(/^.*\((\d{3}.*)\)$/, '$1') + '). Try Connect again.';
  return m || 'Sync failed for an unknown reason.';
}

export function App() {
  const [tab, setTab] = useState('songs');
  const [song, setSong] = useState(null);
  const [dark, setDark] = useState(() => loadTheme());
  const [toast, setToast] = useState('');
  const [artistFilter, setArtistFilter] = useState(null);
  const [focus, setFocus] = useState(false);
  const [editing, setEditing] = useState(false);
  const [songs, setSongs] = useState(() => loadSongs(SONGS));
  const [knownTags, setKnownTags] = useState(() => loadTags(ALL_TAGS));
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const [deletions, setDeletions] = useState(() => loadDeletions());
  const [syncOn, setSyncOn] = useState(() => loadSyncOptIn());
  const [playlists, setPlaylists] = useState(() => loadPlaylists());
  const [playlistDeletions, setPlaylistDeletions] = useState(() => loadPlaylistDeletions());
  const [addToPlaylistSong, setAddToPlaylistSong] = useState(null);
  const [playSession, setPlaySession] = useState(null); // { playlistId, index } — ephemeral, per-device
  const [keyPing, setKeyPing] = useState(() => loadKeyPing());
  const [apiKey, setApiKey] = useState(() => loadApiKey());
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | synced | offline | error
  const [syncError, setSyncError] = useState(''); // human-readable reason, shown persistently
  const [themeAt, setThemeAt] = useState(() => loadThemeAt());
  const [lastSyncedAt, setLastSyncedAt] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    saveTheme(dark);
  }, [dark]);
  useEffect(() => { saveThemeAt(themeAt); }, [themeAt]);

  // Persist the songbook, known-tags list, playback prefs, and deletions.
  useEffect(() => { saveSongs(songs); }, [songs]);
  useEffect(() => { saveTags(knownTags); }, [knownTags]);
  useEffect(() => { savePrefs(prefs); }, [prefs]);
  useEffect(() => { saveDeletions(deletions); }, [deletions]);
  useEffect(() => { savePlaylists(playlists); }, [playlists]);
  useEffect(() => { savePlaylistDeletions(playlistDeletions); }, [playlistDeletions]);
  useEffect(() => { saveKeyPing(keyPing); }, [keyPing]);
  useEffect(() => { saveApiKey(apiKey); }, [apiKey]);

  // Register any tag that appears on a song into the known-tags list.
  useEffect(() => {
    setKnownTags((prev) => {
      const merged = [...prev];
      let changed = false;
      songs.forEach((s) => (s.tags || []).forEach((t) => {
        if (!merged.includes(t)) { merged.push(t); changed = true; }
      }));
      return changed ? merged : prev;
    });
  }, [songs]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // Esc leaves immersive full-screen play mode.
  useEffect(() => {
    if (!focus) return;
    const onKey = (e) => { if (e.key === 'Escape') setFocus(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus]);

  const openSong = (s) => setSong(s);
  const closeSong = () => { setSong(null); setFocus(false); setEditing(false); setPlaySession(null); };
  const goTab = (t) => { setSong(null); setFocus(false); setEditing(false); setPlaySession(null); setTab(t); };
  const toggleTheme = () => { setDark((d) => !d); setThemeAt(Date.now()); };
  const goArtist = (artist) => { setSong(null); setFocus(false); setEditing(false); setPlaySession(null); setArtistFilter(artist); setTab('songs'); };

  // Mutable songbook: star + learning-status toggles reflect everywhere.
  // Every edit stamps updatedAt so sync can resolve which copy is newest.
  const updateSong = (id, patch) => {
    const stamped = { ...patch, updatedAt: Date.now() };
    setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, ...stamped } : s)));
    setSong((prev) => (prev && prev.id === id ? { ...prev, ...stamped } : prev));
  };
  const toggleStar = (id) => { const s = songs.find((x) => x.id === id); updateSong(id, { starred: !(s && s.starred) }); };
  const cycleStatus = (id) => { const s = songs.find((x) => x.id === id); updateSong(id, { status: nextStatus(s && s.status) }); };
  const updateTags = (id, tags) => updateSong(id, { tags });

  // Per-song playback preferences (defaults merged with any saved overrides).
  const PREF_DEFAULTS = { transpose: 0, fontSize: 28, hideChords: false, speed: 4, bpm: 90, useBpm: false };
  const prefsFor = (id) => ({ ...PREF_DEFAULTS, ...(prefs[id] || {}) });
  const savePref = (id, patch) =>
    setPrefs((prev) => ({ ...prev, [id]: { ...PREF_DEFAULTS, ...(prev[id] || {}), ...patch } }));

  // ---- Playlists: ordered sets of song ids, synced like songs (LWW+tombstones) ----
  const songById = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);
  const albumKey = (a) => (a || '').trim().toLowerCase();
  // Album playlists derive their membership from the songs' album; manual ones use
  // songIds (dangling ids — a song deleted on another device — are skipped, never pruned).
  const resolvePlaylistSongs = (pl) => {
    if (!pl) return [];
    if (pl.type === 'album') {
      const k = albumKey(pl.album);
      return k ? songs.filter((s) => albumKey(s.album) === k) : [];
    }
    return (pl.songIds || []).map((sid) => songById.get(sid)).filter(Boolean);
  };
  // Distinct artists / albums already in the library, for form autocomplete.
  const artistOptions = useMemo(() => Array.from(new Set(songs.map((s) => (s.artist || '').trim()).filter((a) => a && a !== 'Unknown'))).sort((a, b) => a.localeCompare(b)), [songs]);
  const albumOptions = useMemo(() => Array.from(new Set(songs.map((s) => (s.album || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [songs]);

  const createPlaylist = (name) => {
    const now = Date.now();
    const ids = new Set(playlists.map((p) => p.id));
    let base = slugify(name || 'playlist'), id = base, n = 2;
    while (ids.has(id)) id = `${base}-${n++}`;
    const pl = { id, name: (name || 'Untitled playlist').trim() || 'Untitled playlist', type: 'manual', songIds: [], createdAt: now, updatedAt: now };
    setPlaylists((prev) => [pl, ...prev]);
    return id;
  };
  // Smart playlist: membership always tracks every song of this album.
  const createAlbumPlaylist = (album) => {
    const name = (album || '').trim();
    if (!name) return null;
    const existing = playlists.find((p) => p.type === 'album' && albumKey(p.album) === albumKey(name));
    if (existing) { setToast('Playlist already exists for ' + name); return existing.id; }
    const now = Date.now();
    const ids = new Set(playlists.map((p) => p.id));
    let base = slugify('album-' + name), id = base, n = 2;
    while (ids.has(id)) id = `${base}-${n++}`;
    setPlaylists((prev) => [{ id, name, type: 'album', album: name, songIds: [], createdAt: now, updatedAt: now }, ...prev]);
    return id;
  };
  const updatePlaylist = (id, patch) =>
    setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)));
  const renamePlaylist = (id, name) => updatePlaylist(id, { name: (name || '').trim() || 'Untitled playlist' });
  const deletePlaylist = (id) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    setPlaylistDeletions((prev) => ({ ...prev, [id]: Date.now() }));
  };
  const addSongToPlaylist = (id, songId) =>
    setPlaylists((prev) => prev.map((p) =>
      p.id === id ? (p.songIds.includes(songId) ? p : { ...p, songIds: [...p.songIds, songId], updatedAt: Date.now() }) : p));
  const removeSongFromPlaylist = (id, songId) => {
    const pl = playlists.find((p) => p.id === id);
    if (pl) updatePlaylist(id, { songIds: pl.songIds.filter((s) => s !== songId) });
  };
  const movePlaylistSong = (id, songId, dir) => {
    const pl = playlists.find((p) => p.id === id);
    if (!pl) return;
    const arr = [...pl.songIds], i = arr.indexOf(songId), j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    updatePlaylist(id, { songIds: arr });
  };

  // ---- Chained playback session (ephemeral): walk a playlist's resolved songs ----
  const startPlaylist = (id) => {
    const pl = playlists.find((p) => p.id === id);
    const list = resolvePlaylistSongs(pl);
    if (!list.length) { setToast('This playlist has no available songs'); return; }
    setPlaySession({ playlistId: pl.id, index: 0 });
    setSong(list[0]); setEditing(false); setTab('playlists');
  };
  const sessionList = () => resolvePlaylistSongs(playlists.find((p) => p.id === (playSession && playSession.playlistId)));
  const playlistNext = () => {
    if (!playSession) return;
    const list = sessionList(), next = playSession.index + 1;
    if (next < list.length) { setPlaySession((s) => ({ ...s, index: next })); setSong(list[next]); }
    else setPlaySession(null); // finished — degrade to a normal single-song view
  };
  const playlistPrev = () => {
    if (!playSession) return;
    const list = sessionList(), prev = playSession.index - 1;
    if (prev >= 0) { setPlaySession((s) => ({ ...s, index: prev })); setSong(list[prev]); }
  };
  const exitPlaylist = () => setPlaySession(null);

  // ---- Google Drive sync (opt-in, offline-first) ----
  const buildDoc = () => ({
    version: 1, updatedAt: Date.now(),
    songs, tags: knownTags, prefs, deletions,
    theme: dark ? 'dark' : 'light', themeAt,
    playlists, playlistDeletions,
  });
  const adoptDoc = (doc) => {
    if (!doc) return;
    if (Array.isArray(doc.songs)) setSongs(doc.songs);
    if (Array.isArray(doc.tags)) setKnownTags(doc.tags);
    if (doc.prefs && typeof doc.prefs === 'object') setPrefs(doc.prefs);
    if (doc.deletions && typeof doc.deletions === 'object') setDeletions(doc.deletions);
    if (Array.isArray(doc.playlists)) setPlaylists(doc.playlists);
    if (doc.playlistDeletions && typeof doc.playlistDeletions === 'object') setPlaylistDeletions(doc.playlistDeletions);
    if (doc.theme && (doc.themeAt || 0) > themeAt) { setDark(doc.theme === 'dark'); setThemeAt(doc.themeAt || Date.now()); }
  };
  // Fingerprint of what's currently on Drive, so we only push real changes.
  const lastSyncSig = useRef(syncSig(songs, knownTags, prefs, deletions, dark ? 'dark' : 'light', themeAt, playlists, playlistDeletions));
  const markSynced = (merged) => {
    lastSyncSig.current = syncSig(merged.songs, merged.tags, merged.prefs, merged.deletions, merged.theme, merged.themeAt, merged.playlists, merged.playlistDeletions);
    setLastSyncedAt(Date.now());
  };

  const connectSync = async () => {
    // The Google sign-in popup doesn't work in an installed iOS web app.
    if (isIosStandalone()) {
      setSyncStatus('error');
      setSyncError('Open freechords.app in Safari (not the installed app) to connect Google Drive — Apple blocks the sign-in popup in installed web apps.');
      return;
    }
    try {
      setSyncStatus('syncing'); setSyncError('');
      const merged = await fullSync(buildDoc(), true);
      adoptDoc(merged); markSynced(merged);
      setSyncOn(true); saveSyncOptIn(true);
      setSyncStatus('synced'); setToast('Synced with Google Drive');
    } catch (e) {
      console.error('[FreeChords sync] connect failed:', e);
      setSyncStatus('error'); setSyncError(friendlySyncError(e));
    }
  };
  const syncNow = async (interactive = false, silent = false) => {
    if (!syncOn && !interactive) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) { if (!silent) setSyncStatus('offline'); return; }
    try {
      if (!silent) { setSyncStatus('syncing'); setSyncError(''); } // silent = quiet background pull on load
      const merged = await fullSync(buildDoc(), interactive);
      adoptDoc(merged); markSynced(merged);
      setSyncStatus('synced'); setSyncError('');
    } catch (e) {
      console.error('[FreeChords sync] sync failed:', e);
      // A silent (on-load) sync that can't get a token shouldn't nag — leave
      // the status as-is; the user can Sync now or it'll retry on the next edit.
      if (!silent) { setSyncStatus('error'); setSyncError(friendlySyncError(e)); }
    }
  };
  const disconnectSync = () => {
    syncDisconnect(); setSyncOn(false); saveSyncOptIn(false); setSyncStatus('idle'); setSyncError('');
    setToast('Disconnected from Google Drive');
  };

  // On load: pre-warm Google sign-in (so the popup opens inside the tap gesture
  // on mobile), and pull once if already connected so other-device edits show up.
  useEffect(() => {
    if (!syncConfigured()) return;
    warmUpSync();
    if (syncOn) syncNow(false, true); // silent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push, debounced, only when the songbook data actually changed since the
  // last sync — not on plain page loads or tab switches.
  useEffect(() => {
    if (!syncOn) return;
    const sig = syncSig(songs, knownTags, prefs, deletions, dark ? 'dark' : 'light', themeAt, playlists, playlistDeletions);
    if (sig === lastSyncSig.current) return; // nothing new to save
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setSyncStatus('offline'); return; }
    setSyncStatus('syncing');
    const t = setTimeout(() => {
      syncPush(buildDoc())
        .then(() => { lastSyncSig.current = sig; setSyncStatus('synced'); setSyncError(''); setLastSyncedAt(Date.now()); })
        .catch((e) => { console.error('[FreeChords sync] push failed:', e); setSyncStatus('error'); setSyncError(friendlySyncError(e)); });
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, knownTags, prefs, deletions, dark, themeAt, syncOn, playlists, playlistDeletions]);

  // Editing a saved song.
  const saveEdit = (id, patch) => { updateSong(id, patch); setEditing(false); setToast('Saved changes'); };
  const deleteSong = (id) => {
    setSongs((prev) => prev.filter((s) => s.id !== id));
    setDeletions((prev) => ({ ...prev, [id]: Date.now() })); // tombstone so the delete syncs
    // Leave any playlist references dangling — resolvePlaylistSongs skips them,
    // and pruning here would race with sync on other devices.
    setEditing(false); setSong(null); setFocus(false); setPlaySession(null); setTab('songs');
    setToast('Deleted song');
  };

  // Export the whole songbook (songs, tags, per-song prefs, theme, playlists) to a file.
  const exportData = () => {
    const n = exportSongbook(songs, knownTags, prefs, dark ? 'dark' : 'light', playlists);
    setToast(`Exported ${n} ${n === 1 ? 'song' : 'songs'}`);
  };

  // Import a backup file: merge songs by id, union tags, restore prefs + theme + playlists.
  const importData = async (file) => {
    if (!file) return;
    try {
      const { songs: incoming, tags: incomingTags, prefs: incomingPrefs, theme: incomingTheme, playlists: incomingPlaylists } = parseBackup(await file.text());
      const now = Date.now();
      setSongs((prev) => {
        const byId = new Map(prev.map((s) => [s.id, s]));
        incoming.forEach((s) => byId.set(s.id, { ...s, updatedAt: s.updatedAt || now }));
        return Array.from(byId.values());
      });
      setKnownTags((prev) => {
        const merged = [...prev];
        incomingTags.forEach((t) => { if (!merged.includes(t)) merged.push(t); });
        return merged;
      });
      if (incomingPrefs && Object.keys(incomingPrefs).length) {
        setPrefs((prev) => ({ ...prev, ...incomingPrefs }));
      }
      if (incomingTheme) { setDark(incomingTheme === 'dark'); setThemeAt(now); }
      if (incomingPlaylists && incomingPlaylists.length) {
        setPlaylists((prev) => {
          const byId = new Map(prev.map((p) => [p.id, p]));
          incomingPlaylists.forEach((p) => { const ex = byId.get(p.id); if (!ex || (p.updatedAt || 0) > (ex.updatedAt || 0)) byId.set(p.id, p); });
          return Array.from(byId.values());
        });
      }
      setToast(`Imported ${incoming.length} ${incoming.length === 1 ? 'song' : 'songs'}`);
      setTab('songs');
    } catch (e) {
      setToast('Couldn’t read that file');
    }
  };

  // Add a freshly-imported song to the top of the library (with a unique id).
  const addSong = (draft) => {
    setSongs((prev) => {
      const ids = new Set(prev.map((s) => s.id));
      let base = slugify(draft.title), id = base, n = 2;
      while (ids.has(id)) id = `${base}-${n++}`;
      return [{ ...draft, id, updatedAt: Date.now() }, ...prev];
    });
    setToast('Saved to library');
    setTab('songs');
  };

  const navItems = [
    { value: 'songs', label: 'Songs', icon: <Icon n="library" s={22} /> },
    { value: 'playlists', label: 'Playlists', icon: <Icon n="list-music" s={22} /> },
    { value: 'tuner', label: 'Tuner', icon: <Icon n="audio-lines" s={22} /> },
  ];
  // NOTE: 'Add' lives as a button on the Songs page header (not a nav item).
  // 'Practice' is parked — still in screens/Practice.jsx; see that file.

  // Backup + sync controls, shared between the desktop sidebar and mobile.
  const backupProps = {
    onExport: exportData, onImport: importData,
    syncConfigured: syncConfigured(), syncOn, syncStatus, syncError, lastSyncedAt,
    onConnectSync: connectSync, onSyncNow: () => syncNow(true), onDisconnectSync: disconnectSync,
    apiKey, onSaveApiKey: setApiKey,
  };

  const markSrc = `${import.meta.env.BASE_URL}freechords-mark.svg`;
  const brand = (
    <>
      <img src={markSrc} width="30" height="30" alt="" />
      <span className="fc-sidenav__word">Free<b>Chords</b></span>
    </>
  );

  // Playlist-session props for the play view (computed over resolved, existing songs).
  const plList = playSession ? sessionList() : null;
  const svPlaylist = (playSession && plList) ? {
    pos: playSession.index + 1,
    total: plList.length,
    nextTitle: plList[playSession.index + 1] ? plList[playSession.index + 1].title : null,
    nextKey: plList[playSession.index + 1] ? plList[playSession.index + 1].key : null,
    isLast: playSession.index + 1 >= plList.length,
  } : null;

  const screen = (song && editing)
    ? <SongEdit song={song} knownTags={knownTags} artistOptions={artistOptions} albumOptions={albumOptions} onSave={saveEdit} onCancel={() => setEditing(false)} onDelete={deleteSong} />
    : song
    ? <SongView song={song} onBack={closeSong} onArtist={goArtist} dark={dark} onToggleTheme={toggleTheme} focusMode={focus} onToggleFocus={() => setFocus((f) => !f)} onToggleStar={toggleStar} onCycleStatus={cycleStatus} onUpdateTags={updateTags} onEdit={() => setEditing(true)} prefs={prefsFor(song.id)} onSavePref={(patch) => savePref(song.id, patch)} onCapo={(v) => updateSong(song.id, { capo: v })} onAddToPlaylist={setAddToPlaylistSong} playlist={svPlaylist} onPlaylistNext={playlistNext} onPlaylistPrev={playlistPrev} onPlaylistExit={exitPlaylist} keyPing={keyPing} onToggleKeyPing={() => setKeyPing((v) => !v)} />
    : (
      <main className="app-body">
        {tab === 'songs' && <Library songs={songs} tags={knownTags} onOpen={openSong} onAdd={() => setTab('add')} artistFilter={artistFilter} onClearArtist={() => setArtistFilter(null)} onArtist={goArtist} onToggleStar={toggleStar} onCycleStatus={cycleStatus} onAddToPlaylist={setAddToPlaylistSong}
          backupSlot={<BackupControls className="bk--mobile" {...backupProps} />} />}
        {tab === 'playlists' && <Playlists playlists={playlists} albums={albumOptions} resolvePlaylistSongs={resolvePlaylistSongs} onOpenSong={openSong} onPlayPlaylist={startPlaylist} onCreatePlaylist={createPlaylist} onCreateAlbumPlaylist={createAlbumPlaylist} onRenamePlaylist={renamePlaylist} onDeletePlaylist={deletePlaylist} onRemoveSong={removeSongFromPlaylist} onMoveSong={movePlaylistSong} />}
        {tab === 'add' && <AddImport onBack={() => setTab('songs')} knownTags={knownTags} artistOptions={artistOptions} albumOptions={albumOptions} apiKey={apiKey} onSave={addSong} />}
        {tab === 'tuner' && <TunerView />}
      </main>
    );

  return (
    <div className={'app' + (focus && song ? ' app--focus' : '')} data-song={song ? '1' : undefined}>
      <SideNav
        className="app-sidenav"
        brand={brand}
        items={navItems}
        value={tab}
        onChange={goTab}
        footer={
          <>
            <BackupControls className="bk--sidenav" {...backupProps} />
            <div className="app-footdiv" aria-hidden="true" />
            <Button variant="ghost" block iconLeft={<Icon n={dark ? 'sun' : 'moon'} s={18} />} onClick={toggleTheme}>
              {dark ? 'Light mode' : 'Dark mode'}
            </Button>
          </>
        }
      />

      <div className="app-stage">
        {!song && (
          <header className="app-header">
            <div className="app-brand">
              <img src={markSrc} width="30" height="30" alt="" />
              <span className="app-word">Free<span className="app-word-accent">Chords</span></span>
            </div>
            <div className="app-header-actions">
              <IconButton icon={<Icon n={dark ? 'sun' : 'moon'} />} label="Toggle theme" onClick={toggleTheme} />
            </div>
          </header>
        )}

        {song && !editing ? <div className="app-body app-body--song">{screen}</div>
          : song && editing ? <div className="app-body">{screen}</div>
          : screen}

        {!song && <TabBar className="app-tabbar" items={navItems} value={tab} onChange={setTab} />}
      </div>

      {addToPlaylistSong && (
        <div className="pl-sheet-backdrop" onClick={() => setAddToPlaylistSong(null)}>
          <div className="pl-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="pl-sheet-head">
              <span className="pl-sheet-title">Add “{addToPlaylistSong.title}” to…</span>
              <button className="pl-sheet-x" aria-label="Close" onClick={() => setAddToPlaylistSong(null)}><Icon n="x" s={18} /></button>
            </div>
            <div className="pl-sheet-list">
              {playlists.filter((pl) => pl.type !== 'album').map((pl) => {
                const has = pl.songIds.includes(addToPlaylistSong.id);
                return (
                  <button className="pl-sheet-item" key={pl.id} onClick={() => {
                    if (has) setToast('Already in ' + pl.name);
                    else { addSongToPlaylist(pl.id, addToPlaylistSong.id); setToast('Added to ' + pl.name); }
                    setAddToPlaylistSong(null);
                  }}>
                    <span className="pl-sheet-item-main">
                      <span className="pl-sheet-item-name">{pl.name}</span>
                      <span className="pl-sheet-item-sub">{pl.songIds.length} {pl.songIds.length === 1 ? 'song' : 'songs'}</span>
                    </span>
                    {has && <Icon n="check" s={18} />}
                  </button>
                );
              })}
              <button className="pl-sheet-item pl-sheet-new" onClick={() => {
                const pid = createPlaylist('New playlist');
                addSongToPlaylist(pid, addToPlaylistSong.id);
                setToast('Added to new playlist');
                setAddToPlaylistSong(null);
              }}>
                <span className="pl-sheet-item-name"><Icon n="plus" s={16} /> New playlist</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={'app-toast' + (/fail|couldn|error/i.test(toast) ? ' app-toast--error' : '')}><Icon n={/fail|couldn|error/i.test(toast) ? 'circle-alert' : 'check'} s={16} />{toast}</div>}

      <Credit className="app-credit--float" />
    </div>
  );
}
