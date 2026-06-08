// Add / Import — paste raw chords (or extract from a PDF), clean into ChordPro,
// preview it rendered as chords-over-lyrics, and save.
import React, { useState, useRef } from 'react';
import { Input, Button, Card, SegmentedControl, Tag, Icon } from '../components/index.js';
import { cleanToChordPro, uniqueChords, toSections } from '../lib/chordpro.js';
import { extractChordText } from '../lib/pdf.js';

const SAMPLE = `C               G
Slip inside the eye of your mind
Am                 E
Don't you know you might find
F                 G
A better place to play`;

export function AddImport({ onSave, onBack, knownTags = [] }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [tags, setTags] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const [raw, setRaw] = useState('');
  const [cleaned, setCleaned] = useState('');
  const [view, setView] = useState('preview');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMsg, setPdfMsg] = useState('');
  const pdfRef = useRef(null);

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
  const reset = () => { setCleaned(''); setRaw(''); setTitle(''); setArtist(''); setTags([]); setTagDraft(''); setPdfMsg(''); };

  const loadPdf = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setPdfBusy(true); setPdfMsg('Reading PDF…');
    try {
      const text = await extractChordText(file);
      setRaw(text);
      if (!title && file.name) setTitle(file.name.replace(/\.pdf$/i, ''));
      setPdfMsg('Pulled text from the PDF — tidy it up if needed, then Clean up.');
    } catch (err) {
      setPdfMsg("Couldn't read that PDF. It may be scanned images (no selectable text).");
    } finally {
      setPdfBusy(false);
    }
  };

  const chords = cleaned ? uniqueChords(cleaned) : [];
  const previewSections = cleaned ? toSections(cleaned) : [];

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
      source: cleaned,
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
            <Button variant="quiet" iconLeft={<Icon n="file-text" s={17} />} onClick={() => pdfRef.current && pdfRef.current.click()} disabled={pdfBusy}>
              {pdfBusy ? 'Reading…' : 'PDF'}
            </Button>
            <Button variant="quiet" onClick={() => setRaw(SAMPLE)}>Use example</Button>
            <input ref={pdfRef} type="file" accept="application/pdf,.pdf" hidden onChange={loadPdf} />
          </div>
          <Button variant="primary" iconLeft={<Icon n="wand-2" s={18} />} onClick={doClean}>Clean up</Button>
        </div>
        {pdfMsg && <p className="add-pdfmsg">{pdfMsg}</p>}
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
                  {previewSections.map((sec, si) => (
                    <React.Fragment key={si}>
                      {sec.label && <div className="cp-seclabel fc-eyebrow">{sec.label}</div>}
                      {sec.lines.map((line, li) => (
                        <div className="cp-line" key={li}>
                          {line.map((s, j) => (
                            <span className="cp-seg" key={j}>
                              <span className="cp-chord">{s.chord || ' '}</span>
                              <span className="cp-lyric">{s.text || ' '}</span>
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
