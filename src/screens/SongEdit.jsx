// SongEdit — edit a saved song: title, artist, key, capo, tags, and the
// ChordPro source directly, with a live preview. Also deletes the song.
import React, { useState, useMemo } from 'react';
import { Input, Button, Stepper, Card, SegmentedControl, Icon } from '../components/index.js';
import { toSections } from '../lib/chordpro.js';

export function SongEdit({ song, knownTags = [], onSave, onCancel, onDelete }) {
  const [title, setTitle] = useState(song.title || '');
  const [artist, setArtist] = useState(song.artist || '');
  const [key, setKey] = useState(song.key || '');
  const [capo, setCapo] = useState(song.capo || 0);
  const [tags, setTags] = useState(song.tags ? [...song.tags] : []);
  const [tagDraft, setTagDraft] = useState('');
  const [source, setSource] = useState(song.source || '');
  const [format, setFormat] = useState(song.format === 'tab' ? 'tab' : 'chordpro');
  const [confirmDel, setConfirmDel] = useState(false);

  const isTab = format === 'tab';

  const addTag = (t) => {
    const v = (t || '').trim().replace(/,$/, '');
    if (v && !tags.some((x) => x.toLowerCase() === v.toLowerCase())) setTags([...tags, v]);
    setTagDraft('');
  };
  const removeTag = (t) => setTags(tags.filter((x) => x !== t));
  const suggestions = knownTags.filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()));

  const previewSections = useMemo(() => (!isTab && source.trim() ? toSections(source) : []), [source, isTab]);

  const save = () => {
    onSave(song.id, {
      title: title.trim() || 'Untitled',
      artist: artist.trim() || 'Unknown',
      key: key.trim(), // kept even in tab mode (the field is hidden, not discarded) so switching format is non-destructive
      capo,
      tags: [...tags],
      source,
      format,
    });
  };

  return (
    <div className="screen add">
      <button className="add-back" onClick={onCancel}><Icon n="arrow-left" s={16} />Back to song</button>
      <div className="screen-head">
        <div className="screen-eyebrow fc-eyebrow">Edit song</div>
        <h1 className="screen-title">{song.title}</h1>
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
            placeholder={tags.length ? 'Add a tag…' : 'e.g. 90s, Acoustic'}
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
            value={format} onChange={setFormat} />
        </div>
        <Input label={isTab ? 'Tab' : 'ChordPro'} multiline mono rows={12} value={source}
          placeholder={isTab ? 'Paste tablature — kept exactly as-is' : '[C]Put chords in brackets [G]above the words'} onChange={(e) => setSource(e.target.value)} />
      </div>

      <div className="add-preview">
        <div className="add-preview-head">
          <div className="fc-eyebrow">Preview</div>
        </div>
        <Card flat className="add-pre">
          {isTab
            ? (source.trim() ? <pre className="add-tab">{source}</pre> : <div className="edit-emptyprev">Nothing to preview yet.</div>)
            : previewSections.length === 0
            ? <div className="edit-emptyprev">Nothing to preview yet.</div>
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
      </div>

      <div className="edit-foot">
        <div className="edit-foot-l">
          {confirmDel ? (
            <div className="edit-confirm">
              <span>Delete this song?</span>
              <Button variant="danger" size="sm" onClick={() => onDelete(song.id)}>Delete</Button>
              <Button variant="quiet" size="sm" onClick={() => setConfirmDel(false)}>Keep</Button>
            </div>
          ) : (
            <Button variant="quiet" size="sm" iconLeft={<Icon n="trash-2" s={16} />} onClick={() => setConfirmDel(true)}>Delete song</Button>
          )}
        </div>
        <div className="edit-foot-r">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" iconLeft={<Icon n="check" s={18} />} onClick={save}>Save changes</Button>
        </div>
      </div>
    </div>
  );
}
