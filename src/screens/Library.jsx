// Library — the songbook. Search, sort, group-by-artist, tag filters; quiet rows.
import React, { useState } from 'react';
import { Input, Tag, SegmentedControl, Switch, Button, Card, KeyBadge, Icon } from '../components/index.js';
import { STATUS } from '../lib/music.js';
import { ALL_TAGS } from '../data/songs.js';

function recencyDays(s) {
  s = (s || '').toLowerCase();
  if (s.includes('yesterday')) return 1;
  if (s.includes('month')) return 30;
  const w = s.match(/(\d+)\s*week/); if (w) return +w[1] * 7;
  if (s.includes('last week')) return 7;
  const d = s.match(/(\d+)\s*day/); if (d) return +d[1];
  return 99;
}
const sortKey = (t) => (t || '').replace(/^(the|a|an)\s+/i, '').toLowerCase();

function SongRow({ song, onOpen, onArtist, onTag, activeTags, onToggleStar, onCycleStatus }) {
  const status = song.status || 'learn';
  return (
    <Card interactive onClick={() => onOpen(song)} className="lib-row" pad={false}>
      <div className="lib-row-main">
        <div className="lib-row-head">
          <span className="lib-title">{song.title}</span>
          <span className={'lib-star' + (song.starred ? ' is-on' : '')} role="button" tabIndex={0}
            aria-label={song.starred ? 'Unfavorite' : 'Favorite'} aria-pressed={song.starred ? 'true' : 'false'}
            onClick={(e) => { e.stopPropagation(); onToggleStar && onToggleStar(song.id); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggleStar && onToggleStar(song.id); } }}>
            <Icon n="star" s={15} />
          </span>
        </div>
        <div className="lib-meta">
          {onArtist
            ? <span className="lib-artist" role="link" tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onArtist(song.artist); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onArtist(song.artist); } }}>{song.artist}</span>
            : <span>{song.artist}</span>}
          <span className="lib-dot">·</span>
          <span>Added {song.added}</span>
        </div>
        {song.tags && song.tags.length > 0 && (
          <div className="lib-rowtags">
            {song.tags.map((t) => (
              <span key={t} role="button" tabIndex={0}
                className={'lib-rowtag' + (activeTags && activeTags.includes(t) ? ' is-on' : '')}
                onClick={(e) => { e.stopPropagation(); onTag && onTag(t); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onTag && onTag(t); } }}>{t}</span>
            ))}
          </div>
        )}
      </div>
      <div className="lib-row-side">
        <KeyBadge musicKey={song.key} />
        <span className={'lib-status lib-status--' + status} role="button" tabIndex={0}
          aria-label={`Status: ${STATUS[status].label}. Tap to change.`}
          onClick={(e) => { e.stopPropagation(); onCycleStatus && onCycleStatus(song.id); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onCycleStatus && onCycleStatus(song.id); } }}>
          <span className="lib-status-dot" aria-hidden="true"></span>{STATUS[status].label}
        </span>
      </div>
    </Card>
  );
}

export function Library({ songs: songsProp, onOpen, onAdd, artistFilter, onClearArtist, onArtist, onToggleStar, onCycleStatus }) {
  const [q, setQ] = useState('');
  const [activeTags, setActiveTags] = useState([]);
  const [sort, setSort] = useState('recent');
  const [group, setGroup] = useState(false);

  const toggleTag = (t) =>
    setActiveTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const cmp = {
    recent: (a, b) => recencyDays(a.added) - recencyDays(b.added),
    title: (a, b) => sortKey(a.title).localeCompare(sortKey(b.title)),
    artist: (a, b) => sortKey(a.artist).localeCompare(sortKey(b.artist)) || sortKey(a.title).localeCompare(sortKey(b.title)),
  }[sort];

  let songs = (songsProp || []).filter((s) => {
    const matchA = !artistFilter || s.artist === artistFilter;
    const matchQ = !q || (s.title + ' ' + s.artist).toLowerCase().includes(q.toLowerCase());
    const matchT = activeTags.length === 0 || activeTags.every((t) => s.tags.includes(t));
    return matchA && matchQ && matchT;
  });
  songs = [...songs].sort(cmp);

  let body;
  if (songs.length === 0) {
    body = <div className="empty">Nothing here yet. Paste a song to get started.</div>;
  } else if (group) {
    const groups = {};
    songs.forEach((s) => { (groups[s.artist] = groups[s.artist] || []).push(s); });
    const artists = Object.keys(groups).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    body = artists.map((ar) => (
      <div className="lib-group" key={ar}>
        <div className="lib-group-head"><span>{ar}</span><span className="lib-group-n">{groups[ar].length}</span></div>
        <div className="lib-list">{groups[ar].map((s) => <SongRow key={s.id} song={s} onOpen={onOpen} onArtist={onArtist} onTag={toggleTag} activeTags={activeTags} onToggleStar={onToggleStar} onCycleStatus={onCycleStatus} />)}</div>
      </div>
    ));
  } else {
    body = <div className="lib-list">{songs.map((s) => <SongRow key={s.id} song={s} onOpen={onOpen} onArtist={onArtist} onTag={toggleTag} activeTags={activeTags} onToggleStar={onToggleStar} onCycleStatus={onCycleStatus} />)}</div>;
  }

  return (
    <div className="screen lib">
      <div className="screen-head">
        <div className="screen-eyebrow fc-eyebrow">{artistFilter || 'Your songbook'}</div>
        <div className="lib-titlerow">
          <h1 className="screen-title">{artistFilter || 'Songs'}</h1>
          {onAdd && !artistFilter && (
            <Button variant="primary" size="sm" iconLeft={<Icon n="plus" s={17} />} onClick={onAdd}>Add a song</Button>
          )}
        </div>
      </div>

      {artistFilter && (
        <button className="lib-artistchip" onClick={onClearArtist}>
          <Icon n="arrow-left" s={15} /><span>All songs</span>
        </button>
      )}

      <div className="lib-search">
        <Input iconLeft={<Icon n="search" s={18} />} placeholder="Search songs and artists"
          value={q} onChange={(e) => setQ(e.target.value)}
          trailing={q ? <button className="lib-clear" onClick={() => setQ('')} aria-label="Clear"><Icon n="x" s={16} /></button> : null} />
      </div>

      <div className="lib-tags">
        {ALL_TAGS.map((t) => (
          <Tag key={t} selected={activeTags.includes(t)} onClick={() => toggleTag(t)}>{t}</Tag>
        ))}
      </div>

      <div className="lib-controls">
        <SegmentedControl
          options={[
            { value: 'recent', label: 'Recent' },
            { value: 'title', label: 'Title' },
            { value: 'artist', label: 'Artist' },
          ]}
          value={sort} onChange={setSort} />
        <Switch checked={group} onChange={setGroup} label="Group by artist" />
      </div>

      <div className="lib-count">{songs.length} {songs.length === 1 ? 'song' : 'songs'}</div>

      {body}
    </div>
  );
}
