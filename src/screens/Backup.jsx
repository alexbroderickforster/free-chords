// Backup & sync controls — Export / Import / Google Drive sync. Rendered in the
// sidebar footer on desktop and at the bottom of the library on mobile.
import React, { useRef } from 'react';
import { Button, Icon } from '../components/index.js';

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

export function BackupControls({
  className = '',
  onExport, onImport,
  syncConfigured, syncOn, syncStatus, lastSyncedAt,
  onConnectSync, onSyncNow, onDisconnectSync,
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
            <Button variant="ghost" size="sm" block iconLeft={<Icon n="upload" s={16} />} onClick={onConnectSync}>
              Sync with Google Drive
            </Button>
          ) : (
            <div className="bk-synced">
              <div className={'bk-status bk-status--' + syncStatus}>
                <span className="bk-dot" aria-hidden="true"></span>
                <span>Google Drive · {SYNC_LABEL[syncStatus] || 'Connected'}</span>
              </div>
              {lastSyncedAt ? (
                <div className="bk-when">Last synced {formatTime(lastSyncedAt)}</div>
              ) : null}
              <div className="bk-sync-actions">
                <button type="button" className="bk-link" onClick={onSyncNow}>Sync now</button>
                <span className="bk-sep" aria-hidden="true">·</span>
                <button type="button" className="bk-link" onClick={onDisconnectSync}>Disconnect</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
