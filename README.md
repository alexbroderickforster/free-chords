# FreeChords

A calm, ad-free personal guitar chord app — chords sitting directly above the
lyric syllables they belong to, the deliberate opposite of cluttered,
upsell-heavy tab sites. Built for playing acoustic, chord-based songs from a
laptop or a tablet on a music stand.

**No ads, no clutter, no upsells, anywhere, ever.**

**▶ Live: <https://alexbroderickforster.github.io/free-chords/>** — open it on a
phone or tablet and use *Add to Home Screen* to install it (works offline after
the first load).

## Features

- **Song view (play mode).** A teleprompter-style reading view: large, legible
  chords-over-lyrics that fade only at the very top and bottom edges, smooth
  hands-free **auto-scroll** with a speed control, **transpose** (±semitones)
  and **capo** controls, adjustable font size, a **hide-chords** toggle for
  lyrics-only practice, and **hover (or tap) any chord** to see its fretboard
  diagram (covering essentially any chord, including barre and up-the-neck
  shapes). A full-screen mode (desktop) goes edge-to-edge — press **Esc** to leave.
  Each song **remembers its own** transpose, font size, hide-chords, and
  auto-scroll speed.
- **Library / songbook.** Searchable, sortable (Recent / Title / Artist),
  group-by-artist, and tag-filterable. Each song shows its key, when it was
  added, a favorite **★**, and a learning status (**To learn → Learning →
  Mastered**) you can cycle inline. Click an artist to see all their songs.
  **Export** your whole songbook to a JSON file and **import** it back (merges
  by song) to move it between browsers or share it.
- **Add / import.** Paste raw chords copied from a webpage and clean them into
  ChordPro, with a live rendered preview and detected-chord chips.
- **Edit.** Edit any saved song — title, artist, key, capo, tags, and the
  ChordPro source directly — with a live preview, or delete it.
- **Tuner.** Reference tones for each string plus a microphone "Listen" mode
  with live pitch detection and an in-tune meter.
- **Responsive.** A left sidebar on desktop/web, a bottom tab bar on mobile.
- **Warm light + low-light dark mode**, deep-indigo accent on warm paper.
- **Installable PWA.** Add it to your home screen and it runs **fully offline**
  — the app shell and fonts are self-hosted and cached on the device.
- **Optional Google Drive sync.** Connect your own Google Drive to keep the
  songbook in sync across devices. It's off by default and stays offline-first;
  your data lives in *your* Drive (a private app folder), not on any server.
  Requires a one-time setup — see **Cross-device sync** below.

## Tech

[Vite](https://vite.dev) + [React](https://react.dev). Songs are stored as
**ChordPro** and parsed/transposed with
[ChordSheetJS](https://github.com/martijnversluis/ChordSheetJS). Icons from
[lucide-react](https://lucide.dev); chord-fingering diagrams from the open
[chords-db](https://github.com/tombatossals/chords-db) database; fonts
self-hosted via [Fontsource](https://fontsource.org); offline support via
[vite-plugin-pwa](https://vite-pwa-org.netlify.app). The visual design (tokens,
components, screens) comes from the FreeChords design system authored in Claude
Design.

## Getting started

```bash
npm install
npm run dev      # start the dev server at http://localhost:5173
```

Other scripts:

```bash
npm run build    # production build into dist/
npm run preview  # preview the production build
```

## Project structure

```
src/
  components/   design-system primitives (Button, Card, Tag, SideNav, …) + Icon
  screens/      Library, SongView, AddImport, TunerView, Practice (parked)
  lib/          music (status), chordpro (ChordSheetJS), chords (chords-db),
                storage (localStorage), backup (export/import), sync (Drive)
  data/         sample songbook
  styles/       design tokens + app stylesheet
public/         brand SVGs (mark + wordmark)
```

> `Practice.jsx` is intentionally **parked** — kept as a record but not wired
> into the navigation. See the note at the top of that file to re-enable it.

## Status & roadmap

This is a personal app and a work in progress. The app ships with **one sample
song** so the layout is clear on first run; everything else — the songs you add,
favorites, learning status, tags, per-song playback prefs, and theme — is stored
**only in your own browser** (`localStorage`). Nothing you add is uploaded or
shared, and every visitor to a hosted copy gets their own private songbook.
For cross-device use there's **optional** Google Drive sync (see below); it's
off until you set it up, and the app stays fully usable and offline without it.

To **install on a phone or tablet**, the app needs to be served over HTTPS
(install/offline is allowed on `https://…` or `localhost`). Any free static
host — Netlify, Vercel, GitHub Pages — works; build with `npm run build` and
deploy the `dist/` folder.

## Cross-device sync (optional)

Sync keeps your songbook the same on your phone and laptop. It's **offline-first**
(your browser stays the working copy; Drive is just where it backs up and
reconciles) and **private** — your songs are saved to a hidden per-app folder in
*your own* Google Drive. The app never sees other people's data, and no server is
involved.

It's hidden until a Google OAuth **client ID** is provided at build time via the
`VITE_GOOGLE_CLIENT_ID` environment variable. To set it up:

### 1. Create the OAuth client ID

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and
   create a project (any name, e.g. "FreeChords").
2. **APIs & Services → Library →** search **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen:** choose **External**, fill in the
   app name and your email. Add the scope
   `https://www.googleapis.com/auth/drive.appdata`. Add yourself (and anyone
   else who'll use it) as a **Test user**. You can leave it in **Testing** mode —
   no Google verification needed for personal use.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID →
   Web application.** Under **Authorized JavaScript origins** add the origins
   you'll run from:
   - `http://localhost:5173` (local dev)
   - your hosted origin, e.g. `https://alexbroderickforster.github.io`
   (origins are scheme + host only — no path). Create it and copy the **Client ID**
   (looks like `1234-abcd.apps.googleusercontent.com`).

### 2. Use it locally

```bash
cp .env.example .env
# then edit .env and set VITE_GOOGLE_CLIENT_ID=<your client id>
npm run dev
```

The **Backup** controls (Export, Import, and **Sync with Google Drive**) live in
the sidebar footer on desktop, and at the bottom of the Songs page on mobile.

### 3. Use it on the deployed site

The build reads `VITE_GOOGLE_CLIENT_ID` from a repo **variable**. In the GitHub
repo: **Settings → Secrets and variables → Actions → Variables → New repository
variable**, name `VITE_GOOGLE_CLIENT_ID`, value = your client ID. The next deploy
will include sync. (The client ID is a public browser identifier, not a secret.)

> **Note:** in Testing mode you may be asked to re-authorize periodically — that's
> Google's behavior for unverified apps and is fine for personal use. Local data
> and offline use are never affected.

Contributions are welcome — see the license below.

## License

[MIT](./LICENSE).
