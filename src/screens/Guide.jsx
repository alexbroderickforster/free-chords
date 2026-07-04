// Guide — a friendly intro / feature tour. Auto-opens on first launch and is
// reachable any time from the nav. Keep it in sync as features are added.
import React from 'react';
import { Icon } from '../components/index.js';

function Feature({ icon, title, go, onGo, action, children }) {
  return (
    <div className="guide-card">
      <div className="guide-card-ic"><Icon n={icon} s={20} /></div>
      <div className="guide-card-body">
        <div className="guide-card-h">{title}</div>
        <p className="guide-card-p">{children}</p>
        {go && <button className="guide-try" onClick={() => onGo(go)}>{action || 'Open'}<Icon n="arrow-left" s={13} cls="guide-try-arrow" /></button>}
      </div>
    </div>
  );
}

export function Guide({ firstRun = false, onGo, onDone }) {
  return (
    <div className="screen guide">
      <div className="screen-head">
        <div className="screen-eyebrow fc-eyebrow">Welcome</div>
        <h1 className="screen-title">How FreeChords works</h1>
        <p className="screen-lead">A calm, ad-free home for your chord sheets — chords sit right above the words. Add songs, play along with a scrolling teleprompter, then practice, tune, and train your ear. Everything stays on your device.</p>
        {firstRun
          ? <button className="guide-start" onClick={onDone}>Start using FreeChords<Icon n="arrow-left" s={16} cls="guide-try-arrow" /></button>
          : <button className="guide-start guide-start--quiet" onClick={onDone}>Back to my songs<Icon n="arrow-left" s={16} cls="guide-try-arrow" /></button>}
      </div>

      <section className="guide-sec">
        <h2 className="guide-h2">Add a song — three ways</h2>
        <div className="guide-cards">
          <Feature icon="clipboard" title="Paste chords" go="add" onGo={onGo} action="Add a song">
            Copy a chord sheet from anywhere and paste it — FreeChords lines the chords up over the lyrics automatically.
          </Feature>
          <Feature icon="image" title="Upload a screenshot" go="add" onGo={onGo} action="Add a song">
            Snap or screenshot a chart and it reads the chords for you. Add a Claude API key in Settings for the sharpest results, or it falls back to on-device OCR.
          </Feature>
          <Feature icon="music" title="Grid editor" go="add" onGo={onGo} action="Add a song">
            Prefer to build it yourself? Type or paste your lyrics, then click above any word to drop a chord — drag it to nudge, or leave a line lyric-less for an intro.
          </Feature>
        </div>
      </section>

      <section className="guide-sec">
        <h2 className="guide-h2">Playing a song</h2>
        <p className="guide-note">Open any song for the play-along view. A few things to try from the bar at the bottom and the toolbar up top:</p>
        <ul className="guide-list">
          <li><b>Auto-scroll</b> — press play; set the pace with <b>Speed</b>, or switch to <b>BPM</b> and tap the tempo (or the space bar).</li>
          <li><b>Transpose &amp; capo</b> — move the whole song to a key that fits your voice; the chords rewrite instantly.</li>
          <li><b>Chord diagrams</b> — hover or tap any chord to see its fingering.</li>
          <li><b>Focus mode</b> — full-screen the sheet for a music stand.</li>
          <li><b>Key ping &amp; metronome</b> — hear the key before you start, and keep time.</li>
          <li><b>Hide chords, bigger text</b> — tailor the sheet to how you read.</li>
        </ul>
      </section>

      <section className="guide-sec">
        <h2 className="guide-h2">Everything else it can do</h2>
        <div className="guide-cards">
          <Feature icon="circle" title="Record a scratch take" go="songs" onGo={onGo} action="Open a song">
            In a song, hit record — a 3·2·1 count-in, then it captures your mic while the sheet scrolls. Save or share the audio file (its name includes the key and capo). Great for sending a bandmate a cover in a new key.
          </Feature>
          <Feature icon="list-music" title="Playlists" go="playlists" onGo={onGo}>
            Build a set and play straight through — it auto-advances between songs, previews the next song's key and capo, and cross-fades.
          </Feature>
          <Feature icon="repeat" title="Practice — A/B loops" go="practice" onGo={onGo}>
            Paste a YouTube link or load an audio file, set an A–B loop over a tricky bit, and slow it down without changing pitch. Save loops and share them as links.
          </Feature>
          <Feature icon="graduation-cap" title="Training — ear trainer" go="training" onGo={onGo}>
            Hear two notes and name the interval. It drills the intervals you miss more often and tracks your accuracy over time.
          </Feature>
          <Feature icon="audio-lines" title="Tuner" go="tuner" onGo={onGo}>
            Reference tones plus live mic tuning that locks onto each string. Set how tight "in tune" should be — perfect tuning never lasts.
          </Feature>
          <Feature icon="wifi-off" title="Offline &amp; backup" go="settings" onGo={onGo} action="Open settings">
            Everything works with no signal. Install it to your home screen, back up to a file, or sync across devices with your own Google Drive. Export a song as an offline HTML player or a printable PDF.
          </Feature>
        </div>
      </section>

      <section className="guide-sec guide-sec--tips">
        <div className="guide-tips">
          <Icon n="sparkles" s={18} cls="guide-tips-ic" />
          <div>
            <div className="guide-card-h">You're testing an early build</div>
            <p className="guide-card-p">Everything lives on your device — no account, no ads, nothing leaves your phone unless you choose to sync or share. Poke around, break things, and note anything that feels off or missing. New feature ideas are very welcome.</p>
          </div>
        </div>
      </section>

      <div className="guide-foot">
        <button className="guide-start" onClick={onDone}>{firstRun ? 'Start using FreeChords' : 'Back to my songs'}<Icon n="arrow-left" s={16} cls="guide-try-arrow" /></button>
      </div>
    </div>
  );
}
