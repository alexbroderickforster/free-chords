// Backup & sync controls — Export / Import / Google Drive sync, plus the
// device-local Claude API key used for image import. Rendered in the sidebar
// footer on desktop and at the bottom of the library on mobile.
import React, { useRef, useState } from 'react';
import { Button, Input, Icon } from '../components/index.js';

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

// Claude API key — device-local, used only for image import. When absent, image
// import falls back to on-device OCR. Never synced or exported (it's a secret).
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
      <div className="fc-eyebrow bk-label">Image import</div>
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
          ? 'Screenshots are read by Claude vision. Stored only on this device.'
          : <>Paste a Claude key to read chord screenshots with Claude vision — best results. Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>. Without a key, image import uses on-device OCR (rougher). Stored only on this device.</>}
      </p>
    </div>
  );
}

export function BackupControls({
  className = '',
  onExport, onImport,
  syncConfigured, syncOn, syncStatus, syncError, lastSyncedAt,
  onConnectSync, onSyncNow, onDisconnectSync,
  apiKey, onSaveApiKey,
}) {
  const fileRef = useRef(null);
  const pick = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f && onImport) onImport(f);
  };

  return (
    <div className={'bk ' + className}>
      <div className="fc-eyebrow bk-label">Backup</div>
      <div className="bk-files">
        <Button variant="ghost" size="sm" iconLeft={<Icon n="download" s={16} />} onClick={onExport}>Export</Button>
        <Button variant="ghost" size="sm" iconLeft={<Icon n="upload" s={16} />} onClick={() => fileRef.current && fileRef.current.click()}>Import</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={pick} />
      </div>

      {syncConfigured && (
        <div className="bk-sync">
          {!syncOn ? (
            <>
              <Button variant="ghost" size="sm" block iconLeft={<Icon n="upload" s={16} />} onClick={onConnectSync}>
                Sync with Google Drive
              </Button>
              {syncError ? <p className="bk-error"><Icon n="circle-alert" s={14} />{syncError}</p> : null}
            </>
          ) : (
            <div className="bk-synced">
              <div className={'bk-status bk-status--' + syncStatus}>
                <span className="bk-dot" aria-hidden="true"></span>
                <span>Google Drive · {SYNC_LABEL[syncStatus] || 'Connected'}</span>
              </div>
              {lastSyncedAt ? (
                <div className="bk-when">Last synced {formatTime(lastSyncedAt)}</div>
              ) : null}
              {syncStatus === 'error' && syncError ? <p className="bk-error"><Icon n="circle-alert" s={14} />{syncError}</p> : null}
              <div className="bk-sync-actions">
                <button type="button" className="bk-link" onClick={onSyncNow}>Sync now</button>
                <span className="bk-sep" aria-hidden="true">·</span>
                <button type="button" className="bk-link" onClick={onDisconnectSync}>Disconnect</button>
              </div>
            </div>
          )}
        </div>
      )}

      {onSaveApiKey && <ApiKeyField apiKey={apiKey} onSave={onSaveApiKey} />}
    </div>
  );
}
