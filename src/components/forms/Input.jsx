import React from 'react';

const CSS = `
.fc-field{ display: flex; flex-direction: column; gap: var(--space-2); width: 100%; }
.fc-field__label{
  font-family: var(--font-sans); font-size: var(--text-2xs); font-weight: var(--weight-semi);
  letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-faint);
}
.fc-input{
  display: flex; align-items: center; gap: var(--space-3);
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius-md); box-shadow: var(--shadow-inset);
  padding: 0 var(--space-4); min-height: var(--tap-min);
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.fc-input:focus-within{ border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
.fc-input__icon{ color: var(--ink-faint); display: inline-flex; flex: none; }
.fc-input input, .fc-input textarea{
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font-family: var(--font-sans); font-size: var(--text-base); color: var(--ink);
  padding: var(--space-3) 0; resize: none;
}
.fc-input input::placeholder, .fc-input textarea::placeholder{ color: var(--ink-faint); }
.fc-input--multiline{ align-items: flex-start; }
.fc-input--mono textarea, .fc-input--mono input{ font-family: var(--font-mono); font-size: var(--text-sm); line-height: 1.6; }
`;

function injectOnce(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id; el.textContent = css;
  document.head.appendChild(el);
}

export function Input({
  label,
  iconLeft = null,
  trailing = null,
  multiline = false,
  rows = 6,
  mono = false,
  className = '',
  id,
  ...rest
}) {
  injectOnce('fc-input-styles', CSS);
  const cls = [
    'fc-input',
    multiline ? 'fc-input--multiline' : '',
    mono ? 'fc-input--mono' : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={['fc-field', className].filter(Boolean).join(' ')}>
      {label && <label className="fc-field__label" htmlFor={id}>{label}</label>}
      <div className={cls}>
        {iconLeft && <span className="fc-input__icon">{iconLeft}</span>}
        {multiline
          ? <textarea id={id} rows={rows} {...rest} />
          : <input id={id} {...rest} />}
        {trailing}
      </div>
    </div>
  );
}
