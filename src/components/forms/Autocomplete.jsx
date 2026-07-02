import React, { useState } from 'react';
import { Input } from './Input.jsx';

const CSS = `
.fc-ac { position: relative; flex: 1; min-width: 0; }
.fc-ac-list {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 15;
  margin: 0; padding: 4px; list-style: none;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius-md); box-shadow: var(--shadow-lg);
  max-height: 240px; overflow-y: auto;
}
.fc-ac-opt {
  display: block; width: 100%; text-align: left; border: none; background: none; cursor: pointer;
  font-family: var(--font-sans); font-size: var(--text-sm); color: var(--ink);
  padding: 8px 10px; border-radius: var(--radius-sm);
}
.fc-ac-opt:hover, .fc-ac-opt.is-hi { background: var(--accent-soft); color: var(--accent); }
`;

function injectOnce(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id; el.textContent = css;
  document.head.appendChild(el);
}

// Text input with a themed suggestions dropdown. `onChange` receives the raw
// string (not the event), so call sites read `onChange={setArtist}`.
export function Autocomplete({ label, placeholder, value, onChange, options = [], iconLeft, className = '' }) {
  injectOnce('fc-autocomplete-styles', CSS);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);

  const q = (value || '').trim().toLowerCase();
  const matches = options.filter((o) => { const lo = o.toLowerCase(); return lo !== q && (q === '' || lo.includes(q)); }).slice(0, 8);
  const show = open && matches.length > 0;

  const pick = (v) => { onChange(v); setOpen(false); setHi(-1); };
  const onKey = (e) => {
    if (!show) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % matches.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + matches.length) % matches.length); }
    else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(matches[hi]); }
    else if (e.key === 'Escape') { setOpen(false); setHi(-1); }
  };

  return (
    <div className={['fc-ac', className].filter(Boolean).join(' ')}>
      <Input
        label={label} placeholder={placeholder} iconLeft={iconLeft} value={value}
        role="combobox" aria-expanded={show} aria-autocomplete="list"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHi(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        onBlur={() => setTimeout(() => setOpen(false), 0)} />
      {show && (
        <ul className="fc-ac-list" role="listbox">
          {matches.map((o, i) => (
            <li key={o} role="option" aria-selected={i === hi}>
              <button type="button" className={'fc-ac-opt' + (i === hi ? ' is-hi' : '')}
                onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                onMouseEnter={() => setHi(i)}>{o}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
