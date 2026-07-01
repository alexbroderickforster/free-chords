// FreeChords app shell — responsive: left sidebar on web/desktop,
// bottom tab bar on mobile. Ties the screens together.
import React, { useState, useEffect, useRef } from 'react';
import { TabBar, SideNav, IconButton, Button, Icon, Credit } from './components/index.js';
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
import { isConfigured as syncConfigured, fullSync, push as syncPush, disconnect as syncDisconnect, warmUp as warmUpSync } from './lib/sync.js';
import './styles/app.css';

const slugify = (s) =>
  (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'song';

// A fingerprint of the syncable data — used to push only when it actually changes.
const syncSig = (songs, tags, prefs, deletions, theme, themeAt) =>
  JSON.stringify({ s: songs, t: tags, p: prefs, d: deletions, th: theme, ta: themeAt });

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
  // Fingerprint of what's currently on Drive, so we only push real changes.
  const lastSyncSig = useRef(syncSig(songs, knownTags, prefs, deletions, dark ? 'dark' : 'light', themeAt));
  const markSynced = (merged) => {
    lastSyncSig.current = syncSig(merged.songs, merged.tags, merged.prefs, merged.deletions, merged.theme, merged.themeAt);
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
    const sig = syncSig(songs, knownTags, prefs, deletions, dark ? 'dark' : 'light', themeAt);
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
  }, [songs, knownTags, prefs, deletions, dark, themeAt, syncOn]);

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
    syncConfigured: syncConfigured(), syncOn, syncStatus, syncError, lastSyncedAt,
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
            <Credit className="app-credit--sidenav" />
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

      {toast && <div className={'app-toast' + (/fail|couldn|error/i.test(toast) ? ' app-toast--error' : '')}><Icon n={/fail|couldn|error/i.test(toast) ? 'circle-alert' : 'check'} s={16} />{toast}</div>}
    </div>
  );
}
