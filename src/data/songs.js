// FreeChords — starter songbook.
// One complete sample song so a brand-new visitor sees how a chord sheet looks.
// Anything the user adds lives only in their own browser (localStorage); it is
// never part of this bundle, so personal songs are never shared with anyone.
//
// Content is stored as ChordPro and parsed/rendered with ChordSheetJS
// (see src/lib/chordpro.js). Section labels use {c: ...} comments.

export const SONGS = [
  {
    id: 'wonderwall', title: 'Wonderwall', artist: 'Oasis', year: 1995,
    key: 'F#m', capo: 2, tags: ['90s', 'Britpop', 'Acoustic'],
    starred: false, added: 'sample', status: 'learn',
    source: `{c: Verse 1}
[Em7]Today is [G]gonna be the [Dsus4]day that they're [A7sus4]gonna throw it back to you
[Em7]By [G]now you should've [Dsus4]somehow real[A7sus4]ized what you gotta do
[Em7]I don't be[G]lieve that [Dsus4]anybody [A7sus4]feels the way I do
[Cadd9]about you [Dsus4]now

{c: Chorus}
[Cadd9]And all the roads we [Em7]have to walk are [G]winding
[Cadd9]And all the lights that [Em7]lead us there are [G]blinding
[Cadd9]There are many [Dsus4]things that I would [G]like to say to you[A7sus4] but I don't know how`,
  },
];

// Recent practice sessions (used by the parked Practice screen).
export const RECENT = [
  { id: 'wonderwall', when: '3 days ago', minutes: 24 },
];

// Mutable known-tags list (the Add/Song screens push new tags onto it).
export const ALL_TAGS = ['90s', 'Britpop', 'Acoustic'];
