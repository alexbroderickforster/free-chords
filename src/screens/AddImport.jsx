// Add / Import — paste raw chords copied from a webpage, clean into ChordPro,
// preview it rendered as chords-over-lyrics, and save.
import React, { useState } from 'react';
import { Input, Button, Card, SegmentedControl, Tag, Icon } from '../components/index.js';

const CHORD_RE = /^[A-G][#b]?(m|maj|min|dim|aug|sus|add)?[0-9]*(\/[A-G][#b]?)?$/;
function isChordLine(line) {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  return toks.every((t) => CHORD_RE.test(t));
}

// Merge a chords-over-lyrics block into inline ChordPro: [C]lyric…
function cleanToChordPro(raw) {
  const lines = raw.replace(/\r/g, '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isChordLine(line) && i + 1 < lines.length && !isChordLine(lines[i + 1]) && lines[i + 1].trim()) {
      const lyric = lines[i + 1];
      const placed = [];
      const re = /\S+/g; let m;
      while ((m = re.exec(line))) placed.push({ col: m.index, chord: m[0] });
      let result = ''; let cursor = 0;
      placed.forEach((p) => {
        const col = Math.min(p.col, lyric.length);
        result += lyric.slice(cursor, col) + `[${p.chord}]`;
        cursor = col;
      });
      result += lyric.slice(cursor);
      out.push(result.trimEnd());
      i++;
    } else if (isChordLine(line) && line.trim()) {
      out.push(line.trim().split(/\s+/).map((c) => `[${c}]`).join(' '));
    } else {
      out.push(line);
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Parse one inline-ChordPro line into {chord,text} segments for rendering.
function parseLine(line) {
  const parts = line.split(/(\[[^\]]+\])/g).filter((s) => s !== '');
  const segs = []; let chord = '';
  parts.forEach((p) => {
    const m = p.match(/^\[([^\]]+)\]$/);
    if (m) chord = m[1];
    else { segs.push({ chord, text: p }); chord = ''; }
  });
  if (chord) segs.push({ chord, text: '' });
  return segs.length ? segs : [{ chord: '', text: line }];
}

function detectChords(cleaned) {
  const set = []; const re = /\[([^\]]+)\]/g; let m;
  while ((m = re.exec(cleaned))) if (!set.includes(m[1])) set.push(m[1]);
  return set;
}

// Turn cleaned ChordPro into the { label, lines:[segments] } section model the
// song view renders. Blank lines separate sections (no labels on imports).
function buildSections(cleaned) {
  return cleaned.split(/\n{2,}/).map((block) => ({
    label: '',
    lines: block.split('\n').filter((l) => l.trim() !== '').map(parseLine),
  })).filter((s) => s.lines.length);
}

const SAMPLE = `       C              G
Slip inside the eye of your mind
       Am             E
Don't you know you might find
       F           G
A better place to play`;

export function AddImport({ onSave, onBack, knownTags = [] }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [tags, setTags] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const [raw, setRaw] = useState('');
  const [cleaned, setCleaned] = useState('');
  const [view, setView] = useState('preview');

  const addTag = (t) => {
    const v = (t || '').trim().replace(/,$/, '');
    if (v && !tags.some((x) => x.toLowerCase() === v.toLowerCase())) setTags([...tags, v]);
    setTagDraft('');
  };
  const removeTag = (t) => setTags(tags.filter((x) => x !== t));
  const suggestions = knownTags.filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()));

  const doClean = () => { setCleaned(cleanToChordPro(raw || SAMPLE)); setView('preview'); };
  const pasteClip = async () => {
    try { const t = await navigator.clipboard.readText(); if (t) setRaw(t); }
    catch (e) { /* clipboard blocked — user can paste manually */ }
  };
  const reset = () => { setCleaned(''); setRaw(''); setTitle(''); setArtist(''); setTags([]); setTagDraft(''); };

  const chords = cleaned ? detectChords(cleaned) : [];

  const save = () => {
    onSave && onSave({
      title: title.trim() || 'Untitled',
      artist: artist.trim() || 'Unknown',
      key: chords[0] || '',
      capo: 0,
      tags: [...tags],
      starred: false,
      added: 'just now',
      status: 'learn',
      chords,
      sections: buildSections(cleaned),
    });
  };

  return (
    <div className="screen add">
      {onBack && (
        <button className="add-back" onClick={onBack}><Icon n="arrow-left" s={16} />Songs</button>
      )}
      <div className="screen-head">
        <div className="screen-eyebrow fc-eyebrow">New song</div>
        <h1 className="screen-title">Add a song</h1>
        <p className="screen-lead">Paste chords copied from a webpage. They'll be lined up into ChordPro.</p>
      </div>

      <div className="add-fields">
        <Input label="Title" placeholder="Song title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input label="Artist" placeholder="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
      </div>

      <div className="add-tagfield">
        <label className="fc-eyebrow add-taglabel">Tags</label>
        <div className="add-tagbox">
          {tags.map((t) => (
            <span className="add-tagchip" key={t}>
              {t}
              <button aria-label={`Remove ${t}`} onClick={() => removeTag(t)}><Icon n="x" s={13} /></button>
            </span>
          ))}
          <input
            className="add-taginput"
            placeholder={tags.length ? 'Add a tag…' : 'e.g. 90s, Acoustic, Britpop'}
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagDraft); }
              else if (e.key === 'Backspace' && !tagDraft && tags.length) removeTag(tags[tags.length - 1]);
            }} />
        </div>
        {suggestions.length > 0 && (
          <div className="add-tagsuggest">
            <span className="add-tagsuggest-lbl">Existing:</span>
            {suggestions.map((t) => (
              <button key={t} className="add-tagsuggest-chip" onClick={() => addTag(t)}>+ {t}</button>
            ))}
          </div>
        )}
      </div>

      <div className="add-paste">
        <Input label="Paste chords" multiline mono rows={9} value={raw}
          placeholder={SAMPLE} onChange={(e) => setRaw(e.target.value)} />
        <div className="add-actions">
          <div className="add-actions-l">
            <Button variant="quiet" iconLeft={<Icon n="clipboard" s={17} />} onClick={pasteClip}>Paste</Button>
            <Button variant="quiet" onClick={() => setRaw(SAMPLE)}>Use example</Button>
          </div>
          <Button variant="primary" iconLeft={<Icon n="wand-2" s={18} />} onClick={doClean}>Clean up</Button>
        </div>
      </div>

      {cleaned && (
        <div className="add-preview">
          <div className="add-preview-head">
            <div className="fc-eyebrow">{chords.length} chord{chords.length === 1 ? '' : 's'} detected</div>
            <SegmentedControl options={[{ value: 'preview', label: 'Preview' }, { value: 'source', label: 'ChordPro' }]}
              value={view} onChange={setView} />
          </div>

          {chords.length > 0 && (
            <div className="add-chips">{chords.map((c) => <Tag key={c}>{c}</Tag>)}</div>
          )}

          <Card flat className="add-pre">
            {view === 'source'
              ? <pre>{cleaned}</pre>
              : (
                <div className="cp">
                  {cleaned.split('\n').map((ln, i) => (
                    ln.trim() === ''
                      ? <div className="cp-gap" key={i}></div>
                      : (
                        <div className="cp-line" key={i}>
                          {parseLine(ln).map((s, j) => (
                            <span className="cp-seg" key={j}>
                              <span className="cp-chord">{s.chord || ' '}</span>
                              <span className="cp-lyric">{s.text || ' '}</span>
                            </span>
                          ))}
                        </div>
                      )
                  ))}
                </div>
              )}
          </Card>

          <div className="add-save">
            <Button variant="secondary" onClick={reset}>Discard</Button>
            <Button variant="primary" iconLeft={<Icon n="check" s={18} />} onClick={save}>Save to library</Button>
          </div>
        </div>
      )}
    </div>
  );
}
