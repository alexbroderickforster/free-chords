import React from 'react';

const CSS = `
.fc-seg{
  display: inline-flex; align-items: center; gap: 2px;
  background: var(--surface-sunken); border: 1px solid var(--line);
  border-radius: var(--radius-md); padding: 3px;
}
.fc-seg__item{
  appearance: none; border: none; cursor: pointer;
  font-family: var(--font-sans); font-size: var(--text-sm); font-weight: var(--weight-medium);
  color: var(--ink-soft); background: transparent;
  padding: 0 var(--space-4); height: 36px; border-radius: var(--radius-sm);
  display: inline-flex; align-items: center; gap: var(--space-2); white-space: nowrap;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.fc-seg__item:hover:not([aria-pressed="true"]){ color: var(--ink); }
.fc-seg__item[aria-pressed="true"]{
  background: var(--surface); color: var(--ink); box-shadow: var(--shadow-xs); font-weight: var(--weight-semi);
}
.fc-seg__item:focus-visible{ outline: 2px solid var(--accent-ring); outline-offset: 2px; }
.fc-seg--block{ display: flex; width: 100%; }
.fc-seg--block .fc-seg__item{ flex: 1; justify-content: center; }
`;

function injectOnce(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id; el.textContent = css;
  document.head.appendChild(el);
}

export function SegmentedControl({ options = [], value, onChange, block = false, className = '' }) {
  injectOnce('fc-seg-styles', CSS);
  const cls = ['fc-seg', block ? 'fc-seg--block' : '', className].filter(Boolean).join(' ');
  return (
    <div className={cls} role="group">
      {options.map((opt) => {
        const v = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        const icon = typeof opt === 'string' ? null : opt.icon;
        return (
          <button
            key={v}
            type="button"
            className="fc-seg__item"
            aria-pressed={value === v}
            onClick={() => onChange && onChange(v)}
          >
            {icon}{label}
          </button>
        );
      })}
    </div>
  );
}
