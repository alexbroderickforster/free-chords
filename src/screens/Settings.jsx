// Settings — one home for sync, offline, backup files, image-import key, and
// appearance. Keeps the sidebar/tab bar uncluttered. Most controls reuse the
// existing .bk-* styles; the page adds a light section layout on top.
import React, { useRef, useState } from 'react';
import { Button, Input, Switch, Icon } from '../components/index.js';

const SYNC_LABEL = {
  syncing: 'Syncing…',
  synced: 'Up to date',
  offline: 'Offline — will sync later',
  error: 'Sync error — tap retry',
};

function formatTime(ts) {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

// Compact Google Drive status for the sidebar footer — tap to open Settings.
export function SyncBadge({ syncConfigured, syncOn, syncStatus, onOpen }) {
  if (!syncConfigured) return null;
  const state = syncOn ? syncStatus : 'off';
  const label = syncOn ? (SYNC_LABEL[syncStatus] || 'Connected') : 'Not syncing';
  return (
    <button className={'sync-badge sync-badge--' + state} onClick={onOpen} aria-label="Open sync settings">
      <span className="sync-badge-dot" aria-hidden="true"></span>
      <span className="sync-badge-lbl">Google Drive · {label}</span>
    </button>
  );
}

// Claude API key for image import. Device-local only; never synced or exported.
function ApiKeyField({ apiKey, onSave }) {
  const has = !!(apiKey && apiKey.trim());
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const start = () => { setDraft(apiKey || ''); setEditing(true); };
  const commit = () => { if (onSave) onSave(draft.trim()); setEditing(false); };
  const cancel = () => setEditing(false);
  const remove = () => { if (onSave) onSave(''); setEditing(false); };

  return (
    <div className="bk-key">
      {has && !editing ? (
        <div className="bk-key-saved">
          <span className="bk-key-mask"><Icon n="key-round" s={14} />Claude key ·••••{apiKey.slice(-4)}</span>
          <span className="bk-key-links">
            <button type="button" className="bk-link" onClick={start}>Change</button>
            <span className="bk-sep" aria-hidden="true">·</span>
            <button type="button" className="bk-link" onClick={remove}>Remove</button>
          </span>
        </div>
      ) : (
        <div className="bk-key-edit">
          <Input type="password" placeholder="Claude API key (sk-ant-…)" value={draft}
            autoComplete="off" spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') cancel(); }} />
          <div className="bk-key-actions">
            <Button variant="ghost" size="sm" onClick={commit} disabled={!draft.trim()}>Save key</Button>
            {has && <button type="button" className="bk-link" onClick={cancel}>Cancel</button>}
          </div>
        </div>
      )}
      <p className="bk-key-note">
        {has
          ? 'Chord screenshots are read by Claude vision. Stored only on this device.'
          : <>Paste a Claude key to read chord screenshots with Claude vision — best results. Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>. Without a key, image import uses on-device OCR (rougher). Stored only on this device.</>}
      </p>
    </div>
  );
}

export function Settings({
  onExport, onImport,
  syncConfigured, syncOn, syncStatus, syncError, lastSyncedAt,
  onConnectSync, onSyncNow, onDisconnectSync,
  apiKey, onSaveApiKey,
  songCount, standalone, ios, canInstall, onInstall,
  dark, onToggleTheme,
}) {
  const fileRef = useRef(null);
  const pick = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f && onImport) onImport(f);
  };

  return (
    <div className="screen settings">
      <div className="screen-head">
        <div className="screen-eyebrow fc-eyebrow">FreeChords</div>
        <h1 className="screen-title">Settings</h1>
      </div>

      {/* Sync */}
      <section className="set-section">
        <h2 className="set-h">Sync</h2>
        {!syncConfigured ? (
          <p className="set-note">Google Drive sync isn’t set up for this build. Your songs are still saved on this device — use Export below for a backup file you can carry.</p>
        ) : !syncOn ? (
          <>
            <p className="set-note">Back up and sync your songbook across devices through your own Google Drive. It stays private to this app.</p>
            <Button variant="ghost" iconLeft={<Icon n="upload" s={16} />} onClick={onConnectSync}>Sync with Google Drive</Button>
            {syncError ? <p className="bk-error"><Icon n="circle-alert" s={14} />{syncError}</p> : null}
          </>
        ) : (
          <div className="set-synced">
            <div className={'bk-status bk-status--' + syncStatus}>
              <span className="bk-dot" aria-hidden="true"></span>
              <span>Google Drive · {SYNC_LABEL[syncStatus] || 'Connected'}</span>
            </div>
            {lastSyncedAt ? <div className="bk-when">Last synced {formatTime(lastSyncedAt)}</div> : null}
            {syncStatus === 'error' && syncError ? <p className="bk-error"><Icon n="circle-alert" s={14} />{syncError}</p> : null}
            <div className="set-actions">
              <button type="button" className="bk-link" onClick={onSyncNow}>Sync now</button>
              <span className="bk-sep" aria-hidden="true">·</span>
              <button type="button" className="bk-link" onClick={onDisconnectSync}>Disconnect</button>
            </div>
          </div>
        )}
      </section>

      {/* Offline */}
      <section className="set-section">
        <h2 className="set-h">Offline</h2>
        <div className="bk-offline-ready"><Icon n="check" s={14} />{songCount} {songCount === 1 ? 'song' : 'songs'} saved on this device</div>
        <p className="set-note">
          Everything is stored here and plays with no signal — good for camping or a dead zone.{syncOn ? ' Pull the latest from Drive before you head out:' : ''}
        </p>
        <div className="set-buttons">
          {syncOn && <Button variant="ghost" size="sm" iconLeft={<Icon n="download" s={16} />} onClick={onSyncNow}>Update from Drive</Button>}
          {!standalone && (canInstall
            ? <Button variant="ghost" size="sm" iconLeft={<Icon n="plus" s={16} />} onClick={onInstall}>Add to home screen</Button>
            : null)}
        </div>
        {!standalone && !canInstall && ios && (
          <p className="set-hint">To install for offline: tap <b>Share</b>, then <b>Add to Home Screen</b>.</p>
        )}
      </section>

      {/* Backup */}
      <section className="set-section">
        <h2 className="set-h">Backup file</h2>
        <p className="set-note">Save your whole songbook to a file, or restore one — a portable backup that doesn’t need Drive.</p>
        <div className="set-buttons">
          <Button variant="ghost" size="sm" iconLeft={<Icon n="download" s={16} />} onClick={onExport}>Export</Button>
          <Button variant="ghost" size="sm" iconLeft={<Icon n="upload" s={16} />} onClick={() => fileRef.current && fileRef.current.click()}>Import</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={pick} />
        </div>
      </section>

      {/* Image import */}
      <section className="set-section">
        <h2 className="set-h">Image import</h2>
        <ApiKeyField apiKey={apiKey} onSave={onSaveApiKey} />
      </section>

      {/* Appearance */}
      <section className="set-section">
        <h2 className="set-h">Appearance</h2>
        <Switch checked={!!dark} onChange={onToggleTheme} label="Dark mode" />
      </section>
    </div>
  );
}
