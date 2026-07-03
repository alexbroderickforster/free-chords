// Add / Import — paste chords (cleaned into ChordPro) or tablature (kept
// verbatim, monospace) or upload a screenshot (read by Claude vision, or
// on-device OCR when no key is set), preview it, and save.
import React, { useState, useRef } from 'react';
import { Input, Autocomplete, Button, Card, SegmentedControl, Stepper, Tag, Icon } from '../components/index.js';
import { cleanToChordPro, uniqueChords, toSections } from '../lib/chordpro.js';
import { isMostlyTab } from '../lib/tab.js';
import { extractSongFromImage } from '../lib/imageImport.js';

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

export function AddImport({ onSave, onBack, knownTags = [], artistOptions = [], albumOptions = [], apiKey = '' }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [key, setKey] = useState('');
  const [capo, setCapo] = useState(0);
  const [tags, setTags] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const [raw, setRaw] = useState('');
  const [cleaned, setCleaned] = useState('');
  const [view, setView] = useState('preview');
  const [format, setFormat] = useState('chordpro'); // 'chordpro' | 'tab'
  const [formatTouched, setFormatTouched] = useState(false);

  // Image upload state.
  const imgRef = useRef(null);
  const [imgBusy, setImgBusy] = useState(''); // '' | 'preparing' | 'claude' | 'ocr'
  const [imgProgress, setImgProgress] = useState(0);
  const [imgMethod, setImgMethod] = useState(null); // 'claude' | 'ocr' after success
  const [imgError, setImgError] = useState('');

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
  const reset = () => { setCleaned(''); setRaw(''); setTitle(''); setArtist(''); setAlbum(''); setKey(''); setCapo(0); setTags([]); setTagDraft(''); setImgMethod(null); setImgError(''); };

  // Upload a screenshot → Claude vision (if a key is set) or on-device OCR.
  const onPickImage = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setImgError(''); setImgMethod(null); setImgProgress(0); setImgBusy('preparing');
    try {
      const r = await extractSongFromImage({
        file, apiKey,
        onStatus: (step, prog) => { setImgBusy(step); if (prog != null) setImgProgress(prog); },
      });
      setFormat(r.format); setFormatTouched(true);
      setRaw(r.rawText);
      setCleaned(r.chordpro);
      setView('preview');
      if (r.title && !title.trim()) setTitle(r.title);
      if (r.artist && !artist.trim()) setArtist(r.artist);
      if (r.key && !key.trim()) setKey(r.key);
      if (r.capo && !capo) setCapo(r.capo);
      setImgMethod(r.method);
    } catch (err) {
      setImgError((err && err.message) || 'Couldn’t read that image.');
    } finally {
      setImgBusy(''); setImgProgress(0);
    }
  };

  const imgStatusText = () => {
    if (imgBusy === 'preparing') return 'Preparing image…';
    if (imgBusy === 'claude') return 'Reading chords with Claude…';
    if (imgBusy === 'ocr') return `Reading on-device with OCR…${imgProgress ? ` ${Math.round(imgProgress * 100)}%` : ''}`;
    return '';
  };

  const chords = (!isTab && cleaned) ? uniqueChords(cleaned) : [];
  const previewSections = (!isTab && cleaned) ? toSections(cleaned) : [];

  const save = () => {
    onSave && onSave({
      title: title.trim() || 'Untitled',
      artist: artist.trim() || 'Unknown',
      album: album.trim(),
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
        <p className="screen-lead">Paste chords or tab copied from a webpage — or upload a screenshot and let it read the chords for you. Chords get lined up over the lyrics; tab is kept exactly as-is.</p>
      </div>

      <div className="add-fields">
        <Input label="Title" placeholder="Song title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Autocomplete label="Artist" placeholder="Artist" value={artist} onChange={setArtist} options={artistOptions} />
      </div>

      <div className="add-fields">
        <Autocomplete label="Album" placeholder="Album (optional)" value={album} onChange={setAlbum} options={albumOptions} />
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

        <div className="add-imgblock">
          <div className="add-imgrow">
            <Button variant="quiet" iconLeft={<Icon n="image" s={17} />} onClick={() => imgRef.current && imgRef.current.click()} disabled={!!imgBusy}>
              {imgBusy ? 'Reading image…' : 'Upload screenshot'}
            </Button>
            <input ref={imgRef} type="file" accept="image/*" hidden onChange={onPickImage} />
            <span className="add-imghint">
              {apiKey
                ? 'Reads chords with Claude vision.'
                : <>No Claude API key — uses on-device OCR (rougher). Add a key in Backup &amp; Sync for best results.</>}
            </span>
          </div>
          {imgBusy && <div className="add-imgstatus"><span className="add-imgspin" aria-hidden="true" />{imgStatusText()}</div>}
          {imgError && <div className="add-imgmsg add-imgmsg--err"><Icon n="circle-alert" s={14} />{imgError}</div>}
          {imgMethod && !imgBusy && !imgError && (
            <div className="add-imgmsg add-imgmsg--ok">
              <Icon n="check" s={14} />
              {imgMethod === 'claude'
                ? 'Read with Claude — review and tidy below before saving.'
                : 'Read with on-device OCR — alignment is rough, so check it over before saving.'}
            </div>
          )}
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
