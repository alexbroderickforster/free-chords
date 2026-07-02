// Playlists — build ordered sets of songs and play them straight through.
// List view ↔ detail view (self-contained, like Library). All mutations are
// props from App; song ids are resolved to live songs by the parent.
import React, { useState } from 'react';
import { Button, Card, Input, Icon } from '../components/index.js';

export function Playlists({ playlists, albums = [], resolvePlaylistSongs, onOpenSong, onPlayPlaylist, onCreatePlaylist, onCreateAlbumPlaylist, onRenamePlaylist, onDeletePlaylist, onRemoveSong, onMoveSong }) {
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // playlist id pending delete confirm

  const open = openId ? playlists.find((p) => p.id === openId) : null;

  const commitCreate = () => {
    const name = draftName.trim();
    setCreating(false); setDraftName('');
    if (name) onCreatePlaylist(name);
  };
  const startRename = () => { if (open) { setRenameDraft(open.name); setRenaming(true); } };
  const commitRename = () => { if (open) onRenamePlaylist(open.id, renameDraft); setRenaming(false); };

  // ---- Detail view ----
  if (open) {
    const songs = resolvePlaylistSongs(open);
    const isAlbum = open.type === 'album';
    return (
      <div className="screen pl">
        <button className="lib-artistchip" onClick={() => { setOpenId(null); setRenaming(false); setConfirmDelete(null); }}>
          <Icon n="arrow-left" s={15} /><span>All playlists</span>
        </button>

        <div className="pl-detail-head">
          {renaming
            ? <Input autoFocus value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); else if (e.key === 'Escape') setRenaming(false); }} />
            : <h1 className="screen-title pl-detail-title">{open.name}</h1>}
          {!renaming && (
            <div className="pl-detail-actions">
              {!isAlbum && <button className="pl-ic" aria-label="Rename playlist" onClick={startRename}><Icon n="pencil" s={17} /></button>}
              {confirmDelete === open.id
                ? <span className="pl-confirm">
                    <button className="pl-confirm-yes" onClick={() => { onDeletePlaylist(open.id); setOpenId(null); setConfirmDelete(null); }}>Delete</button>
                    <button className="pl-confirm-no" onClick={() => setConfirmDelete(null)}>Cancel</button>
                  </span>
                : <button className="pl-ic pl-ic--danger" aria-label="Delete playlist" onClick={() => setConfirmDelete(open.id)}><Icon n="trash-2" s={17} /></button>}
            </div>
          )}
        </div>

        {isAlbum && <div className="pl-badge">Album · auto-updating</div>}

        <Button variant="primary" block iconLeft={<Icon n="play" s={18} />} disabled={songs.length === 0} onClick={() => onPlayPlaylist(open.id)}>
          {songs.length === 0 ? 'No songs yet' : `Play playlist · ${songs.length} ${songs.length === 1 ? 'song' : 'songs'}`}
        </Button>

        {songs.length === 0 ? (
          <div className="pl-detail-empty">
            {isAlbum
              ? 'No songs have this album yet. Add songs with this album and they’ll appear here automatically.'
              : <>This playlist is empty. Add songs from the Songs tab with the <Icon n="list-music" s={14} /> icon on each song.</>}
          </div>
        ) : (
          <div className="pl-songlist">
            {songs.map((s, i) => (
              <div className="pl-song" key={s.id}>
                <div className="pl-song-main" role="button" tabIndex={0} onClick={() => onOpenSong(s)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenSong(s); } }}>
                  <div className="pl-song-title">{s.title}</div>
                  <div className="pl-song-artist">{s.artist}</div>
                </div>
                {!isAlbum && (
                  <div className="pl-song-actions">
                    <button className="pl-ic" aria-label="Move up" disabled={i === 0} onClick={() => onMoveSong(open.id, s.id, -1)}><Icon n="chevron-up" s={18} /></button>
                    <button className="pl-ic" aria-label="Move down" disabled={i === songs.length - 1} onClick={() => onMoveSong(open.id, s.id, 1)}><Icon n="chevron-down" s={18} /></button>
                    <button className="pl-ic pl-ic--danger" aria-label="Remove from playlist" onClick={() => onRemoveSong(open.id, s.id)}><Icon n="x" s={18} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- List view ----
  return (
    <div className="screen pl">
      <div className="screen-head">
        <div className="screen-eyebrow fc-eyebrow">Your playlists</div>
        <div className="lib-titlerow">
          <h1 className="screen-title">Playlists</h1>
          {!creating && <Button variant="primary" size="sm" iconLeft={<Icon n="plus" s={17} />} onClick={() => setCreating(true)}>New playlist</Button>}
        </div>
      </div>

      {creating && (
        <div className="pl-composer">
          <Input autoFocus placeholder="Playlist name" value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitCreate}
            onKeyDown={(e) => { if (e.key === 'Enter') commitCreate(); else if (e.key === 'Escape') { setCreating(false); setDraftName(''); } }} />
          {albums.length > 0 && (
            <div className="pl-album-suggest">
              <span className="pl-album-suggest-lbl">Or auto-build from an album:</span>
              {albums.map((a) => (
                <button key={a} className="pl-album-pick"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { const id = onCreateAlbumPlaylist(a); setCreating(false); setDraftName(''); if (id) setOpenId(id); }}>
                  <Icon n="list-music" s={13} />{a}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {playlists.length === 0 && !creating ? (
        <div className="lib-emptystate">
          <div className="lib-emptystate-title">No playlists yet</div>
          <p>Group songs into a set and play them straight through — each scrolls at its own tempo, then rolls into the next.</p>
          <Button variant="primary" iconLeft={<Icon n="plus" s={17} />} onClick={() => setCreating(true)}>New playlist</Button>
        </div>
      ) : (
        <div className="pl-list">
          {playlists.map((pl) => {
            const count = resolvePlaylistSongs(pl).length;
            return (
              <Card interactive className="pl-row" pad={false} onClick={() => setOpenId(pl.id)} key={pl.id}>
                <div className="pl-row-main">
                  <div className="pl-name">{pl.name}</div>
                  <div className="pl-sub">{pl.type === 'album' ? 'Album · ' : ''}{count} {count === 1 ? 'song' : 'songs'}</div>
                </div>
                <div className="pl-row-side">
                  {confirmDelete === pl.id
                    ? <span className="pl-confirm" onClick={(e) => e.stopPropagation()}>
                        <button className="pl-confirm-yes" onClick={(e) => { e.stopPropagation(); onDeletePlaylist(pl.id); setConfirmDelete(null); }}>Delete</button>
                        <button className="pl-confirm-no" onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}>Cancel</button>
                      </span>
                    : <span className="pl-ic pl-ic--danger" role="button" tabIndex={0} aria-label="Delete playlist"
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(pl.id); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setConfirmDelete(pl.id); } }}><Icon n="trash-2" s={16} /></span>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
