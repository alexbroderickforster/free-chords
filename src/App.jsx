// FreeChords app shell — responsive: left sidebar on web/desktop,
// bottom tab bar on mobile. Ties the screens together.
import React, { useState, useEffect } from 'react';
import { TabBar, SideNav, IconButton, Button, Icon } from './components/index.js';
import { SongView } from './screens/SongView.jsx';
import { SongEdit } from './screens/SongEdit.jsx';
import { Library } from './screens/Library.jsx';
import { AddImport } from './screens/AddImport.jsx';
import { TunerView } from './screens/TunerView.jsx';
import { SONGS, ALL_TAGS } from './data/songs.js';
import { nextStatus } from './lib/music.js';
import { BackupControls } from './screens/Backup.jsx';
import { loadSongs, saveSongs, loadTags, saveTags, loadTheme, saveTheme, loadThemeAt, saveThemeAt, loadPrefs, savePrefs, loadDeletions, saveDeletions, loadSyncOptIn, saveSyncOptIn } from './lib/storage.js';
import { exportSongbook, parseBackup } from './lib/backup.js';
import { isConfigured as syncConfigured, fullSync, push as syncPush, disconnect as syncDisconnect } from './lib/sync.js';
import './styles/app.css';

const slugify = (s) =>
  (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'song';

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
  const [syncStatus, setSyncStatus] = useState('idle'); // idle | syncing | synced | offline | error
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
  const closeSong = () => { setSong(null); setFocus(false); setEditing(false); };
  const goTab = (t) => { setSong(null); setFocus(false); setEditing(false); setTab(t); };
  const toggleTheme = () => { setDark((d) => !d); setThemeAt(Date.now()); };
  const goArtist = (artist) => { setSong(null); setFocus(false); setEditing(false); setArtistFilter(artist); setTab('songs'); };

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
  const PREF_DEFAULTS = { transpose: 0, fontSize: 28, hideChords: false, speed: 4 };
  const prefsFor = (id) => ({ ...PREF_DEFAULTS, ...(prefs[id] || {}) });
  const savePref = (id, patch) =>
    setPrefs((prev) => ({ ...prev, [id]: { ...PREF_DEFAULTS, ...(prev[id] || {}), ...patch } }));

  // ---- Google Drive sync (opt-in, offline-first) ----
  const buildDoc = () => ({
    version: 1, updatedAt: Date.now(),
    songs, tags: knownTags, prefs, deletions,
    theme: dark ? 'dark' : 'light', themeAt,
  });
  const adoptDoc = (doc) => {
    if (!doc) return;
    if (Array.isArray(doc.songs)) setSongs(doc.songs);
    if (Array.isArray(doc.tags)) setKnownTags(doc.tags);
    if (doc.prefs && typeof doc.prefs === 'object') setPrefs(doc.prefs);
    if (doc.deletions && typeof doc.deletions === 'object') setDeletions(doc.deletions);
    if (doc.theme && (doc.themeAt || 0) > themeAt) { setDark(doc.theme === 'dark'); setThemeAt(doc.themeAt || Date.now()); }
  };
  const connectSync = async () => {
    try {
      setSyncStatus('syncing');
      const merged = await fullSync(buildDoc(), true);
      adoptDoc(merged); setLastSyncedAt(Date.now());
      setSyncOn(true); saveSyncOptIn(true);
      setSyncStatus('synced'); setToast('Synced with Google Drive');
    } catch (e) { setSyncStatus('error'); setToast('Couldn’t connect to Google Drive'); }
  };
  const syncNow = async (interactive = false) => {
    if (!syncOn && !interactive) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setSyncStatus('offline'); return; }
    try {
      setSyncStatus('syncing');
      const merged = await fullSync(buildDoc(), interactive);
      adoptDoc(merged); setLastSyncedAt(Date.now());
      setSyncStatus('synced');
    } catch (e) { setSyncStatus('error'); }
  };
  const disconnectSync = () => {
    syncDisconnect(); setSyncOn(false); saveSyncOptIn(false); setSyncStatus('idle');
    setToast('Disconnected from Google Drive');
  };

  // Resume: if previously connected, attempt a best-effort silent sync on load.
  useEffect(() => {
    if (syncOn && syncConfigured()) syncNow(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced push of local changes once connected (no UI; ignore failures).
  useEffect(() => {
    if (!syncOn) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setSyncStatus('offline'); return; }
    const t = setTimeout(() => {
      syncPush(buildDoc()).then(() => { setSyncStatus('synced'); setLastSyncedAt(Date.now()); }).catch(() => setSyncStatus('error'));
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, knownTags, prefs, deletions, syncOn]);

  // Re-sync when the tab regains focus or the network returns.
  useEffect(() => {
    if (!syncOn) return;
    const onWake = () => syncNow(false);
    window.addEventListener('focus', onWake);
    window.addEventListener('online', onWake);
    return () => { window.removeEventListener('focus', onWake); window.removeEventListener('online', onWake); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncOn]);

  // Editing a saved song.
  const saveEdit = (id, patch) => { updateSong(id, patch); setEditing(false); setToast('Saved changes'); };
  const deleteSong = (id) => {
    setSongs((prev) => prev.filter((s) => s.id !== id));
    setDeletions((prev) => ({ ...prev, [id]: Date.now() })); // tombstone so the delete syncs
    setEditing(false); setSong(null); setFocus(false); setTab('songs');
    setToast('Deleted song');
  };

  // Export the whole songbook (songs, tags, per-song prefs, theme) to a file.
  const exportData = () => {
    const n = exportSongbook(songs, knownTags, prefs, dark ? 'dark' : 'light');
    setToast(`Exported ${n} ${n === 1 ? 'song' : 'songs'}`);
  };

  // Import a backup file: merge songs by id, union tags, restore prefs + theme.
  const importData = async (file) => {
    if (!file) return;
    try {
      const { songs: incoming, tags: incomingTags, prefs: incomingPrefs, theme: incomingTheme } = parseBackup(await file.text());
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
    { value: 'tuner', label: 'Tuner', icon: <Icon n="audio-lines" s={22} /> },
  ];
  // NOTE: 'Add' lives as a button on the Songs page header (not a nav item).
  // 'Practice' is parked — still in screens/Practice.jsx; see that file.

  // Backup + sync controls, shared between the desktop sidebar and mobile.
  const backupProps = {
    onExport: exportData, onImport: importData,
    syncConfigured: syncConfigured(), syncOn, syncStatus, lastSyncedAt,
    onConnectSync: connectSync, onSyncNow: () => syncNow(true), onDisconnectSync: disconnectSync,
  };

  const markSrc = `${import.meta.env.BASE_URL}freechords-mark.svg`;
  const brand = (
    <>
      <img src={markSrc} width="30" height="30" alt="" />
      <span className="fc-sidenav__word">Free<b>Chords</b></span>
    </>
  );

  const screen = (song && editing)
    ? <SongEdit song={song} knownTags={knownTags} onSave={saveEdit} onCancel={() => setEditing(false)} onDelete={deleteSong} />
    : song
    ? <SongView song={song} onBack={closeSong} onArtist={goArtist} dark={dark} onToggleTheme={toggleTheme} focusMode={focus} onToggleFocus={() => setFocus((f) => !f)} onToggleStar={toggleStar} onCycleStatus={cycleStatus} onUpdateTags={updateTags} onEdit={() => setEditing(true)} prefs={prefsFor(song.id)} onSavePref={(patch) => savePref(song.id, patch)} onCapo={(v) => updateSong(song.id, { capo: v })} />
    : (
      <main className="app-body">
        {tab === 'songs' && <Library songs={songs} tags={knownTags} onOpen={openSong} onAdd={() => setTab('add')} artistFilter={artistFilter} onClearArtist={() => setArtistFilter(null)} onArtist={goArtist} onToggleStar={toggleStar} onCycleStatus={cycleStatus}
          backupSlot={<BackupControls className="bk--mobile" {...backupProps} />} />}
        {tab === 'add' && <AddImport onBack={() => setTab('songs')} knownTags={knownTags} onSave={addSong} />}
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

      {toast && <div className="app-toast"><Icon n="check" s={16} />{toast}</div>}
    </div>
  );
}
