// Add / Import — paste chords (cleaned into ChordPro) or tablature (kept
// verbatim, monospace), preview it, and save.
import React, { useState } from 'react';
import { Input, Button, Card, SegmentedControl, Stepper, Tag, Icon } from '../components/index.js';
import { cleanToChordPro, uniqueChords, toSections } from '../lib/chordpro.js';
import { isMostlyTab } from '../lib/tab.js';

const SAMPLE = `C               G
Slip inside the eye of your mind
Am                 E
Don't you know you might find
F                 G
A better place to play`;

const TAB_SAMPLE = `[Intro]
G|---------------------------------|
D|---------------------------------|
A|-----------------5-5-3-----------|
E|---3-3-3-3-5-5-5---------3-3------|`;

export function AddImport({ onSave, onBack, knownTags = [] }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [key, setKey] = useState('');
  const [capo, setCapo] = useState(0);
  const [tags, setTags] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const [raw, setRaw] = useState('');
  const [cleaned, setCleaned] = useState('');
  const [view, setView] = useState('preview');
  const [format, setFormat] = useState('chordpro'); // 'chordpro' | 'tab'
  const [formatTouched, setFormatTouched] = useState(false);

  const isTab = format === 'tab';

  const addTag = (t) => {
    const v = (t || '').trim().replace(/,$/, '');
    if (v && !tags.some((x) => x.toLowerCase() === v.toLowerCase())) setTags([...tags, v]);
    setTagDraft('');
  };
  const removeTag = (t) => setTags(tags.filter((x) => x !== t));
  const suggestions = knownTags.filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()));

  // Follow the content: switch to Tab when a paste is predominantly tablature,
  // back to Chords otherwise — until the user picks a format by hand, after
  // which their choice always wins.
  const onRaw = (value) => {
    setRaw(value);
    if (!formatTouched) setFormat(isMostlyTab(value) ? 'tab' : 'chordpro');
  };
  const pickFormat = (v) => { setFormat(v); setFormatTouched(true); };

  const doClean = () => {
    const src = raw || (isTab ? TAB_SAMPLE : SAMPLE);
    setCleaned(isTab ? src : cleanToChordPro(src));
    setView('preview');
  };
  const pasteClip = async () => {
    try { const t = await navigator.clipboard.readText(); if (t) onRaw(t); }
    catch (e) { /* clipboard blocked — user can paste manually */ }
  };
  const reset = () => { setCleaned(''); setRaw(''); setTitle(''); setArtist(''); setKey(''); setCapo(0); setTags([]); setTagDraft(''); };

  const chords = (!isTab && cleaned) ? uniqueChords(cleaned) : [];
  const previewSections = (!isTab && cleaned) ? toSections(cleaned) : [];

  const save = () => {
    onSave && onSave({
      title: title.trim() || 'Untitled',
      artist: artist.trim() || 'Unknown',
      key: isTab ? '' : (key.trim() || chords[0] || ''), // typed key wins; fall back to the detected first chord
      capo: isTab ? 0 : capo,
      tags: [...tags],
      starred: false,
      added: 'just now',
      status: 'learn',
      source: cleaned,
      format,
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
        <p className="screen-lead">Paste chords or tab copied from a webpage. Chords get lined up over the lyrics; tab is kept exactly as-is.</p>
      </div>

      <div className="add-fields">
        <Input label="Title" placeholder="Song title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input label="Artist" placeholder="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
      </div>

      {!isTab && (
        <div className="edit-metarow">
          <Input label="Key" placeholder="e.g. G, F♯m" value={key} onChange={(e) => setKey(e.target.value)} className="edit-key" />
          <Stepper label="Capo" value={capo} min={0} max={9} format={(v) => (v === 0 ? '—' : String(v))} onChange={setCapo} />
        </div>
      )}

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
        <div className="add-formatrow">
          <label className="fc-eyebrow">Format</label>
          <SegmentedControl
            options={[{ value: 'chordpro', label: 'Chords' }, { value: 'tab', label: 'Tab' }]}
            value={format} onChange={pickFormat} />
        </div>
        <Input label={isTab ? 'Paste tab' : 'Paste chords'} multiline mono rows={9} value={raw}
          placeholder={isTab ? TAB_SAMPLE : SAMPLE} onChange={(e) => onRaw(e.target.value)} />
        <div className="add-actions">
          <div className="add-actions-l">
            <Button variant="quiet" iconLeft={<Icon n="clipboard" s={17} />} onClick={pasteClip}>Paste</Button>
            <Button variant="quiet" onClick={() => setRaw(isTab ? TAB_SAMPLE : SAMPLE)}>Use example</Button>
          </div>
          <Button variant="primary" iconLeft={<Icon n="wand-2" s={18} />} onClick={doClean}>{isTab ? 'Preview' : 'Clean up'}</Button>
        </div>
      </div>

      {cleaned && (
        <div className="add-preview">
          <div className="add-preview-head">
            <div className="fc-eyebrow">{isTab ? 'Tab' : `${chords.length} chord${chords.length === 1 ? '' : 's'} detected`}</div>
            {!isTab && (
              <SegmentedControl options={[{ value: 'preview', label: 'Preview' }, { value: 'source', label: 'ChordPro' }]}
                value={view} onChange={setView} />
            )}
          </div>

          {!isTab && chords.length > 0 && (
            <div className="add-chips">{chords.map((c) => <Tag key={c}>{c}</Tag>)}</div>
          )}

          <Card flat className="add-pre">
            {isTab
              ? <pre className="add-tab">{cleaned}</pre>
              : view === 'source'
                ? <pre>{cleaned}</pre>
                : (
                  <div className="cp">
                    {previewSections.map((sec, si) => (
                      <React.Fragment key={si}>
                        {sec.label && <div className="cp-seclabel fc-eyebrow">{sec.label}</div>}
                        {sec.lines.map((line, li) => (
                          <div className="cp-line" key={li}>
                            {line.map((s, j) => (
                              <span className="cp-seg" key={j}>
                                <span className="cp-chord">{s.chord || ' '}</span>
                                <span className="cp-lyric">{s.text || ' '}</span>
                              </span>
                            ))}
                          </div>
                        ))}
                        {si < previewSections.length - 1 && <div className="cp-gap"></div>}
                      </React.Fragment>
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
