// FreeChords app shell — responsive: left sidebar on web/desktop,
// bottom tab bar on mobile. Ties the screens together.
import React, { useState, useEffect } from 'react';
import { TabBar, SideNav, IconButton, Button, Icon } from './components/index.js';
import { SongView } from './screens/SongView.jsx';
import { Library } from './screens/Library.jsx';
import { AddImport } from './screens/AddImport.jsx';
import { TunerView } from './screens/TunerView.jsx';
import { SONGS, ALL_TAGS } from './data/songs.js';
import { nextStatus } from './lib/music.js';
import { loadSongs, saveSongs, loadTags, saveTags, loadTheme, saveTheme } from './lib/storage.js';
import { exportSongbook, parseBackup } from './lib/backup.js';
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
  const [songs, setSongs] = useState(() => loadSongs(SONGS));
  const [knownTags, setKnownTags] = useState(() => loadTags(ALL_TAGS));

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    saveTheme(dark);
  }, [dark]);

  // Persist the songbook and the known-tags list whenever they change.
  useEffect(() => { saveSongs(songs); }, [songs]);
  useEffect(() => { saveTags(knownTags); }, [knownTags]);

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
  const closeSong = () => { setSong(null); setFocus(false); };
  const goTab = (t) => { setSong(null); setFocus(false); setTab(t); };
  const toggleTheme = () => setDark((d) => !d);
  const goArtist = (artist) => { setSong(null); setFocus(false); setArtistFilter(artist); setTab('songs'); };

  // Mutable songbook: star + learning-status toggles reflect everywhere.
  const updateSong = (id, patch) => {
    setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setSong((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  };
  const toggleStar = (id) => { const s = songs.find((x) => x.id === id); updateSong(id, { starred: !(s && s.starred) }); };
  const cycleStatus = (id) => { const s = songs.find((x) => x.id === id); updateSong(id, { status: nextStatus(s && s.status) }); };
  const updateTags = (id, tags) => updateSong(id, { tags });

  // Export the whole songbook to a JSON file the user can keep or share.
  const exportData = () => {
    const n = exportSongbook(songs, knownTags);
    setToast(`Exported ${n} ${n === 1 ? 'song' : 'songs'}`);
  };

  // Import a backup file: merge songs by id (incoming wins) and union tags.
  const importData = async (file) => {
    if (!file) return;
    try {
      const { songs: incoming, tags: incomingTags } = parseBackup(await file.text());
      setSongs((prev) => {
        const byId = new Map(prev.map((s) => [s.id, s]));
        incoming.forEach((s) => byId.set(s.id, s));
        return Array.from(byId.values());
      });
      setKnownTags((prev) => {
        const merged = [...prev];
        incomingTags.forEach((t) => { if (!merged.includes(t)) merged.push(t); });
        return merged;
      });
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
      return [{ ...draft, id }, ...prev];
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

  const brand = (
    <>
      <img src="/freechords-mark.svg" width="30" height="30" alt="" />
      <span className="fc-sidenav__word">Free<b>Chords</b></span>
    </>
  );

  const screen = song
    ? <SongView song={song} onBack={closeSong} onArtist={goArtist} dark={dark} onToggleTheme={toggleTheme} focusMode={focus} onToggleFocus={() => setFocus((f) => !f)} onToggleStar={toggleStar} onCycleStatus={cycleStatus} onUpdateTags={updateTags} />
    : (
      <main className="app-body">
        {tab === 'songs' && <Library songs={songs} tags={knownTags} onOpen={openSong} onAdd={() => setTab('add')} artistFilter={artistFilter} onClearArtist={() => setArtistFilter(null)} onArtist={goArtist} onToggleStar={toggleStar} onCycleStatus={cycleStatus} onExport={exportData} onImport={importData} />}
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
          <Button variant="ghost" block iconLeft={<Icon n={dark ? 'sun' : 'moon'} s={18} />} onClick={toggleTheme}>
            {dark ? 'Light mode' : 'Dark mode'}
          </Button>
        }
      />

      <div className="app-stage">
        {!song && (
          <header className="app-header">
            <div className="app-brand">
              <img src="/freechords-mark.svg" width="30" height="30" alt="" />
              <span className="app-word">Free<span className="app-word-accent">Chords</span></span>
            </div>
            <div className="app-header-actions">
              <IconButton icon={<Icon n={dark ? 'sun' : 'moon'} />} label="Toggle theme" onClick={toggleTheme} />
            </div>
          </header>
        )}

        {song ? <div className="app-body app-body--song">{screen}</div> : screen}

        {!song && <TabBar className="app-tabbar" items={navItems} value={tab} onChange={setTab} />}
      </div>

      {toast && <div className="app-toast"><Icon n="check" s={16} />{toast}</div>}
    </div>
  );
}
