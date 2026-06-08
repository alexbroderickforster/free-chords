// FreeChords — sample songbook data.
// Each song's content is stored as ChordPro source and parsed/rendered with
// ChordSheetJS (see src/lib/chordpro.js). Section labels use {c: ...} comments.

export const SONGS = [
  {
    id: 'wonderwall', title: 'Wonderwall', artist: 'Oasis', year: 1995,
    key: 'F#m', capo: 2, tags: ['90s', 'Britpop', 'Acoustic'],
    starred: true, added: '3 days ago', status: 'mastered',
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
  {
    id: 'dont-look-back', title: 'Don\'t Look Back in Anger', artist: 'Oasis', year: 1995,
    key: 'C', capo: 0, tags: ['90s', 'Britpop'],
    starred: false, added: 'last week', status: 'learning',
    source: `{c: Verse 1}
[C]Slip inside the [G]eye of your [Am]mind
[E]Don't you know you [F]might find [G]a better place to play
[C]You said that [G]you'd never [Am]been
[E]But all the [F]things that [G]you've seen will slowly fade away

{c: Chorus}
[F]So Sally can [Fm]wait, she [C]knows it's too [G]late as we're walking on by
[F]Her soul [Fm]slides a[C]way, but [G]don't look back in anger I heard you say`,
  },
  {
    id: 'good-riddance', title: 'Good Riddance (Time of Your Life)', artist: 'Green Day', year: 1997,
    key: 'G', capo: 0, tags: ['90s', 'Acoustic'],
    starred: false, added: 'yesterday', status: 'mastered',
    source: `{c: Verse 1}
[G]Another turning point, a [Cadd9]fork stuck in the [D]road
[G]Time grabs you by the wrist, di[Cadd9]rects you where to [D]go
[Em]So make the [D]best of this [C]test and don't ask [G]why`,
  },
  {
    id: 'tears-in-heaven', title: 'Tears in Heaven', artist: 'Eric Clapton', year: 1992,
    key: 'A', capo: 0, tags: ['90s', 'Acoustic', 'Fingerstyle'],
    starred: true, added: '2 weeks ago', status: 'learning',
    source: `{c: Verse 1}
[A]Would you [E/G#]know my [F#m]name [A7]if I saw you in [D]heaven?
[A]Would it [E/G#]be the [F#m]same [A7]if I saw you in [D]heaven?`,
  },
  {
    id: 'champagne-supernova', title: 'Champagne Supernova', artist: 'Oasis', year: 1995,
    key: 'A', capo: 0, tags: ['90s', 'Britpop'],
    starred: false, added: '5 days ago', status: 'learn',
    source: `{c: Verse 1}
[A]How many special [G]people change
[A]How many lives are [G]living strange
[F#m]Where were [E]you while we were [A]getting high?`,
  },
  {
    id: 'iris', title: 'Iris', artist: 'Goo Goo Dolls', year: 1998,
    key: 'D', capo: 0, tags: ['90s', 'Acoustic'],
    starred: false, added: 'yesterday', status: 'mastered',
    source: `{c: Chorus}
[Bm]And I don't want the [A]world to [G]see me
[Bm]'Cause I don't think that [A]they'd under[G]stand`,
  },
  {
    id: 'zombie', title: 'Zombie', artist: 'The Cranberries', year: 1994,
    key: 'Em', capo: 0, tags: ['90s'],
    starred: true, added: 'last week', status: 'learning',
    source: `{c: Verse 1}
[Em]Another head [C]hangs lowly
[G]Child is slowly [D]taken`,
  },
  {
    id: 'creep', title: 'Creep', artist: 'Radiohead', year: 1992,
    key: 'G', capo: 0, tags: ['90s'],
    starred: false, added: 'a month ago', status: 'learn',
    source: `{c: Verse 1}
[G]When you were [B]here before
[C]Couldn't look you [Cm]in the eye`,
  },
];

export const RECENT = [
  { id: 'good-riddance', when: 'Yesterday', minutes: 18 },
  { id: 'wonderwall', when: '3 days ago', minutes: 24 },
  { id: 'tears-in-heaven', when: '2 weeks ago', minutes: 12 },
];

// Mutable known-tags list (the Add/Song screens push new tags onto it).
export const ALL_TAGS = ['90s', 'Britpop', 'Acoustic', 'Fingerstyle'];
