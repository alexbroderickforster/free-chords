import React from 'react';

const CSS = `
.fc-switch{ display: inline-flex; align-items: center; gap: var(--space-3); cursor: pointer; user-select: none; }
.fc-switch[data-disabled="true"]{ opacity: 0.45; cursor: not-allowed; }
.fc-switch__track{
  position: relative; width: 46px; height: 28px; flex: none;
  background: var(--surface-sunken); border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  transition: background var(--dur-base) var(--ease-out), border-color var(--dur-base) var(--ease-out);
}
.fc-switch__thumb{
  position: absolute; top: 2px; left: 2px; width: 22px; height: 22px;
  background: var(--surface); border-radius: 50%;
  box-shadow: var(--shadow-sm);
  transition: transform var(--dur-base) var(--ease-out);
}
.fc-switch input{ position: absolute; opacity: 0; width: 0; height: 0; }
.fc-switch input:checked + .fc-switch__track{ background: var(--accent); border-color: var(--accent); }
.fc-switch input:checked + .fc-switch__track .fc-switch__thumb{ transform: translateX(18px); }
.fc-switch input:focus-visible + .fc-switch__track{ outline: 2px solid var(--accent-ring); outline-offset: 2px; }
.fc-switch__label{ font-family: var(--font-sans); font-size: var(--text-base); color: var(--ink); }
`;

function injectOnce(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id; el.textContent = css;
  document.head.appendChild(el);
}

export function Switch({ checked = false, onChange, label, disabled = false, className = '', ...rest }) {
  injectOnce('fc-switch-styles', CSS);
  return (
    <label className={['fc-switch', className].filter(Boolean).join(' ')} data-disabled={disabled ? 'true' : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange && onChange(e.target.checked)}
        {...rest}
      />
      <span className="fc-switch__track"><span className="fc-switch__thumb" /></span>
      {label && <span className="fc-switch__label">{label}</span>}
    </label>
  );
}
