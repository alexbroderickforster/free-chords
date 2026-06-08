// FreeChords — sample songbook data.
// Lyric lines are modeled the way ChordSheetJS pairs them: an array of
// { chord, text } segments, so a chord sits directly above its syllable.

const seg = (chord, text) => ({ chord, text });

export const SONGS = [
  {
    id: 'wonderwall', title: 'Wonderwall', artist: 'Oasis', year: 1995,
    key: 'F#m', capo: 2, tags: ['90s', 'Britpop', 'Acoustic'],
    starred: true, added: '3 days ago', status: 'mastered',
    chords: ['Em7', 'G', 'Dsus4', 'A7sus4', 'Cadd9'],
    sections: [
      {
        label: 'Verse 1', lines: [
          [seg('Em7', 'Today is '), seg('G', 'gonna be the '), seg('Dsus4', 'day that they\'re '), seg('A7sus4', 'gonna throw it back to you')],
          [seg('Em7', 'By '), seg('G', 'now you should\'ve '), seg('Dsus4', 'somehow real'), seg('A7sus4', 'ized what you gotta do')],
          [seg('Em7', 'I don\'t be'), seg('G', 'lieve that '), seg('Dsus4', 'anybody '), seg('A7sus4', 'feels the way I do')],
          [seg('Cadd9', 'about you '), seg('Dsus4', 'now')],
        ],
      },
      {
        label: 'Chorus', lines: [
          [seg('Cadd9', 'And all the roads we '), seg('Em7', 'have to walk are '), seg('G', 'winding')],
          [seg('Cadd9', 'And all the lights that '), seg('Em7', 'lead us there are '), seg('G', 'blinding')],
          [seg('Cadd9', 'There are many '), seg('Dsus4', 'things that I would '), seg('G', 'like to say to you'), seg('A7sus4', ' but I don\'t know how')],
        ],
      },
    ],
  },
  {
    id: 'dont-look-back', title: 'Don\'t Look Back in Anger', artist: 'Oasis', year: 1995,
    key: 'C', capo: 0, tags: ['90s', 'Britpop'],
    starred: false, added: 'last week', status: 'learning',
    chords: ['C', 'Em', 'F', 'G', 'Am'],
    sections: [
      {
        label: 'Verse 1', lines: [
          [seg('C', 'Slip inside the '), seg('G', 'eye of your '), seg('Am', 'mind')],
          [seg('E', 'Don\'t you know you '), seg('F', 'might find '), seg('G', 'a better place to play')],
          [seg('C', 'You said that '), seg('G', 'you\'d never '), seg('Am', 'been')],
          [seg('E', 'But all the '), seg('F', 'things that '), seg('G', 'you\'ve seen will slowly fade away')],
        ],
      },
      {
        label: 'Chorus', lines: [
          [seg('F', 'So Sally can '), seg('Fm', 'wait, she '), seg('C', 'knows it\'s too '), seg('G', 'late as we\'re walking on by')],
          [seg('F', 'Her soul '), seg('Fm', 'slides a'), seg('C', 'way, but '), seg('G', 'don\'t look back in anger I heard you say')],
        ],
      },
    ],
  },
  {
    id: 'good-riddance', title: 'Good Riddance (Time of Your Life)', artist: 'Green Day', year: 1997,
    key: 'G', capo: 0, tags: ['90s', 'Acoustic'],
    starred: false, added: 'yesterday', status: 'mastered',
    chords: ['G', 'Cadd9', 'D', 'Em'],
    sections: [
      {
        label: 'Verse 1', lines: [
          [seg('G', 'Another turning '), seg('', 'point, a '), seg('Cadd9', 'fork stuck in the '), seg('D', 'road')],
          [seg('G', 'Time grabs you '), seg('', 'by the wrist, di'), seg('Cadd9', 'rects you where to '), seg('D', 'go')],
          [seg('Em', 'So make the '), seg('D', 'best of this '), seg('C', 'test and don\'t ask '), seg('G', 'why')],
        ],
      },
    ],
  },
  {
    id: 'tears-in-heaven', title: 'Tears in Heaven', artist: 'Eric Clapton', year: 1992,
    key: 'A', capo: 0, tags: ['90s', 'Acoustic', 'Fingerstyle'],
    starred: true, added: '2 weeks ago', status: 'learning',
    chords: ['A', 'E', 'F#m', 'D'],
    sections: [
      {
        label: 'Verse 1', lines: [
          [seg('A', 'Would you '), seg('E/G#', 'know my '), seg('F#m', 'name '), seg('A7', 'if I saw you in '), seg('D', 'heaven?')],
          [seg('A', 'Would it '), seg('E/G#', 'be the '), seg('F#m', 'same '), seg('A7', 'if I saw you in '), seg('D', 'heaven?')],
        ],
      },
    ],
  },
  {
    id: 'champagne-supernova', title: 'Champagne Supernova', artist: 'Oasis', year: 1995,
    key: 'A', capo: 0, tags: ['90s', 'Britpop'],
    starred: false, added: '5 days ago', status: 'learn',
    chords: ['A', 'G', 'F#m', 'E'],
    sections: [
      {
        label: 'Verse 1', lines: [
          [seg('A', 'How many special '), seg('G', 'people change')],
          [seg('A', 'How many lives are '), seg('G', 'living strange')],
          [seg('F#m', 'Where were '), seg('E', 'you while we were '), seg('A', 'getting high?')],
        ],
      },
    ],
  },
  {
    id: 'iris', title: 'Iris', artist: 'Goo Goo Dolls', year: 1998,
    key: 'D', capo: 0, tags: ['90s', 'Acoustic'],
    starred: false, added: 'yesterday', status: 'mastered',
    chords: ['D', 'Bm', 'A', 'G'],
    sections: [
      {
        label: 'Chorus', lines: [
          [seg('Bm', 'And I don\'t want the '), seg('A', 'world to '), seg('G', 'see me')],
          [seg('Bm', '’Cause I don\'t think that '), seg('A', 'they\'d under'), seg('G', 'stand')],
        ],
      },
    ],
  },
  {
    id: 'zombie', title: 'Zombie', artist: 'The Cranberries', year: 1994,
    key: 'Em', capo: 0, tags: ['90s'],
    starred: true, added: 'last week', status: 'learning',
    chords: ['Em', 'C', 'G', 'D'],
    sections: [
      {
        label: 'Verse 1', lines: [
          [seg('Em', 'Another head '), seg('C', 'hangs lowly')],
          [seg('G', 'Child is slowly '), seg('D', 'taken')],
        ],
      },
    ],
  },
  {
    id: 'creep', title: 'Creep', artist: 'Radiohead', year: 1992,
    key: 'G', capo: 0, tags: ['90s'],
    starred: false, added: 'a month ago', status: 'learn',
    chords: ['G', 'B', 'C', 'Cm'],
    sections: [
      {
        label: 'Verse 1', lines: [
          [seg('G', 'When you were '), seg('B', 'here before')],
          [seg('C', 'Couldn\'t look you '), seg('Cm', 'in the eye')],
        ],
      },
    ],
  },
];

export const RECENT = [
  { id: 'good-riddance', when: 'Yesterday', minutes: 18 },
  { id: 'wonderwall', when: '3 days ago', minutes: 24 },
  { id: 'tears-in-heaven', when: '2 weeks ago', minutes: 12 },
];

// Mutable known-tags list (the Add/Song screens push new tags onto it).
export const ALL_TAGS = ['90s', 'Britpop', 'Acoustic', 'Fingerstyle'];
