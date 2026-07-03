// Practice — light stats: recent songs, a simple practice log, basic counts.
//
// ⏸ PARKED (June 2026): This screen is intentionally NOT wired into the app's
// navigation right now. The component is kept here as the record so it can be
// re-added later. To bring it back:
//   1. add { value: 'practice', label: 'Practice', icon: <Icon n="library" s={22} /> }
//      to navItems in App.jsx
//   2. restore {tab === 'practice' && <Practice onOpen={openSong} />} in the screen switch
// It still imports/builds fine; it is just unreachable from the UI.
//
// NOTE: play-tracking ("plays") was removed from the data model when the library
// dropped the "Played N×" line, so the Plays stat is guarded with (s.plays || 0).
import React, { useState } from 'react';
import { SegmentedControl, Card, KeyBadge, Icon } from '../components/index.js';
import { SONGS, RECENT } from '../data/songs.js';

function Stat({ value, label }) {
  return (
    <div className="pr-stat">
      <div className="pr-stat-val">{value}</div>
      <div className="pr-stat-lbl">{label}</div>
    </div>
  );
}

export function Practice({ onOpen }) {
  const [range, setRange] = useState('week');

  const songsById = Object.fromEntries(SONGS.map((s) => [s.id, s]));
  const totalPlays = SONGS.reduce((a, s) => a + (s.plays || 0), 0);
  const mastered = SONGS.filter((s) => s.status === 'mastered').length;
  const minutes = RECENT.reduce((a, r) => a + r.minutes, 0);

  return (
    <div className="screen pr">
      <div className="screen-head">
        <div className="screen-eyebrow fc-eyebrow">What you've been playing</div>
        <h1 className="screen-title">Practice</h1>
      </div>

      <div className="pr-range">
        <SegmentedControl options={[{ value: 'week', label: 'This week' }, { value: 'month', label: 'Month' }, { value: 'all', label: 'All time' }]}
          value={range} onChange={setRange} block />
      </div>

      <Card flat className="pr-stats">
        <Stat value={`${minutes}m`} label="Practiced" />
        <div className="pr-div" />
        <Stat value={totalPlays} label="Plays" />
        <div className="pr-div" />
        <Stat value={`${mastered}/${SONGS.length}`} label="Mastered" />
      </Card>

      <div className="pr-section">
        <div className="fc-eyebrow">Recent sessions</div>
        <div className="pr-log">
          {RECENT.map((r, i) => {
            const song = songsById[r.id];
            return (
              <Card key={i} interactive pad={false} className="pr-logrow" onClick={() => onOpen(song)}>
                <div className="pr-logrow-l">
                  <span className="pr-logicon"><Icon n="music" s={16} /></span>
                  <div>
                    <div className="pr-logtitle">{song.title}</div>
                    <div className="pr-logsub">{r.when} · {r.minutes} min</div>
                  </div>
                </div>
                <KeyBadge musicKey={song.key} variant="plain" />
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
