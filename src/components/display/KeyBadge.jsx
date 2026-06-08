import React from 'react';

const CSS = `
.fc-key{
  display: inline-flex; align-items: baseline; gap: 1px;
  font-family: var(--font-mono); font-weight: var(--weight-bold);
  color: var(--ink); background: var(--surface-sunken);
  border: 1px solid var(--line); border-radius: var(--radius-sm);
  padding: 3px 9px; line-height: 1.2; font-variant-numeric: tabular-nums;
}
.fc-key--accent{ color: var(--accent); background: var(--accent-soft); border-color: transparent; }
.fc-key--plain{ background: transparent; border-color: transparent; padding: 0; }
.fc-key__pre{ font-family: var(--font-sans); font-weight: var(--weight-semi); font-size: 0.7em; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-faint); margin-right: 4px; }
.fc-key--sm{ font-size: var(--text-sm); }
.fc-key--md{ font-size: var(--text-base); }
.fc-key--lg{ font-size: var(--text-md); }
`;

function injectOnce(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id; el.textContent = css;
  document.head.appendChild(el);
}

/** Render proper musical accidentals: F#m -> F♯m, Bb -> B♭ */
export function prettyKey(k) {
  if (k == null) return '';
  return String(k).replace(/#/g, '♯').replace(/b(?![a-z])/g, '♭');
}

export function KeyBadge({
  musicKey,
  size = 'sm',
  variant = 'default',
  showLabel = false,
  className = '',
  ...rest
}) {
  injectOnce('fc-key-styles', CSS);
  const cls = [
    'fc-key',
    `fc-key--${size}`,
    variant !== 'default' ? `fc-key--${variant}` : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <span className={cls} {...rest}>
      {showLabel && <span className="fc-key__pre">Key</span>}
      {prettyKey(musicKey)}
    </span>
  );
}
