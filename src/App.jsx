// FreeChords app shell — responsive: left sidebar on web/desktop,
// bottom tab bar on mobile. Ties the screens together.
import React, { useState, useEffect } from 'react';
import { TabBar, SideNav, IconButton, Button, Icon } from './components/index.js';
import { SongView } from './screens/SongView.jsx';
import { Library } from './screens/Library.jsx';
import { AddImport } from './screens/AddImport.jsx';
import { TunerView } from './screens/TunerView.jsx';
import { SONGS } from './data/songs.js';
import { nextStatus } from './lib/music.js';
import './styles/app.css';

export function App() {
  const [tab, setTab] = useState('songs');
  const [song, setSong] = useState(null);
  const [dark, setDark] = useState(false);
  const [toast, setToast] = useState('');
  const [artistFilter, setArtistFilter] = useState(null);
  const [focus, setFocus] = useState(false);
  const [songs, setSongs] = useState(SONGS);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
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
    ? <SongView song={song} onBack={closeSong} onArtist={goArtist} dark={dark} onToggleTheme={toggleTheme} focusMode={focus} onToggleFocus={() => setFocus((f) => !f)} onToggleStar={toggleStar} onCycleStatus={cycleStatus} />
    : (
      <main className="app-body">
        {tab === 'songs' && <Library songs={songs} onOpen={openSong} onAdd={() => setTab('add')} artistFilter={artistFilter} onClearArtist={() => setArtistFilter(null)} onArtist={goArtist} onToggleStar={toggleStar} onCycleStatus={cycleStatus} />}
        {tab === 'add' && <AddImport onBack={() => setTab('songs')} onSaved={() => { setToast('Saved to library'); setTab('songs'); }} />}
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
