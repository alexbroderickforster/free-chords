# FreeChords

A calm, ad-free personal guitar chord app — chords sitting directly above the
lyric syllables they belong to, the deliberate opposite of cluttered,
upsell-heavy tab sites. Built for playing acoustic, chord-based songs from a
laptop or a tablet on a music stand.

**No ads, no clutter, no upsells, anywhere, ever.**

## Features

- **Song view (play mode).** A teleprompter-style reading view: large, legible
  chords-over-lyrics that fade only at the very top and bottom edges, smooth
  hands-free **auto-scroll** with a speed control, **transpose** (±semitones)
  and **capo** controls, adjustable font size, a **hide-chords** toggle for
  lyrics-only practice, and **hover (or tap) any chord** to see its fretboard
  diagram. A full-screen mode (desktop) goes edge-to-edge — press **Esc** to leave.
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

## Tech

[Vite](https://vite.dev) + [React](https://react.dev). Songs are stored as
**ChordPro** and parsed/transposed with
[ChordSheetJS](https://github.com/martijnversluis/ChordSheetJS). Icons from
[lucide-react](https://lucide.dev). The visual design (tokens, components,
screens) comes from the FreeChords design system authored in Claude Design.

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
  lib/          music utilities (transpose, chord diagrams, learning status)
  data/         sample songbook
  styles/       design tokens + app stylesheet
public/         brand SVGs (mark + wordmark)
```

> `Practice.jsx` is intentionally **parked** — kept as a record but not wired
> into the navigation. See the note at the top of that file to re-enable it.

## Status & roadmap

This is a personal app and a work in progress. The songbook starts from a small
sample set, but your changes — favorites, learning status, tags, added songs,
and theme — now **persist in the browser via localStorage**. Planned next steps:

- Sync the songbook across devices automatically (a backend / cloud sync).
- Self-hosted fonts and a PWA/installable build for offline use.
- Per-song playback preferences (font size, transpose) that stick.

Contributions are welcome — see the license below.

## License

[MIT](./LICENSE).
