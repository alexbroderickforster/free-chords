# Feedback → Google Sheet setup

The in-app **Feedback** button (bottom-right on mobile, in the sidebar on desktop,
and in the Guide) sends each submission to a Google Sheet you own. There's no
backend and no third-party service — a tiny Google Apps Script receives the POST
and appends a row. Setup is a one-time, ~5-minute job.

## 1. Create the Sheet

1. Make a new Google Sheet (any name, e.g. **FreeChords feedback**).
2. Rename the first tab to **Feedback** (optional — the script falls back to the
   first tab). Headers are added automatically on the first submission.

## 2. Add the script

In that Sheet: **Extensions → Apps Script**. Delete whatever's there, paste this,
and **Save**:

```javascript
// FreeChords — feedback sink. Appends one row per submission.
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Feedback') || ss.getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['When', 'Type', 'Message', 'Page', 'Song', 'Name',
                       'Commit', 'Theme', 'Viewport', 'URL', 'User agent']);
    }
    var d = JSON.parse(e.postData.contents);
    sheet.appendRow([
      new Date(), d.type || '', d.message || '', d.page || '', d.song || '',
      d.name || '', d.commit || '', d.theme || '', d.viewport || '',
      d.url || '', d.ua || ''
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
```

## 3. Deploy it as a web app

1. **Deploy → New deployment → (gear) Web app**.
2. **Execute as:** Me. **Who has access:** **Anyone**.
   (The app posts anonymously from browsers, so it must be "Anyone". The URL is a
   capability token — it only ever *appends a row*, and can't read the Sheet.)
3. **Deploy**, authorize when prompted, and copy the **Web app URL** — it ends in
   `/exec`.

> Editing the script later? Use **Deploy → Manage deployments → (pencil) → Version:
> New version** so the same `/exec` URL keeps working.

## 4. Point the app at it

Set `VITE_FEEDBACK_URL` to that `/exec` URL.

- **Local:** add it to `.env` (`cp .env.example .env`, then paste the URL).
- **Deployed (GitHub Pages):** repo **Settings → Secrets and variables → Actions →
  Variables → New repository variable**, name `VITE_FEEDBACK_URL`, value = the URL.
  The next deploy picks it up.

## 5. Test

Open the app, hit **Feedback**, send a note, and confirm a new row lands in the
Sheet. Until the endpoint is set, submissions are held in the browser and sent
automatically once it's configured (or the device comes back online).

### Notes

- Delivery is fire-and-forget: browsers can't read an Apps Script response
  cross-origin, so the app can't detect a *server* error (a wrong/expired URL
  looks like success to the sender). Always confirm a real submission lands
  during setup, and re-check after changing the deployment.
- Want it in Slack or email too? Add a Google Sheets → Slack/Gmail automation
  (Apps Script trigger or a no-code tool) on top of the Sheet — the app side
  doesn't change.
