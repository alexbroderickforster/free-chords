import React from 'react';

const CSS = `
.fc-tabbar{
  display: flex; align-items: stretch; justify-content: space-around;
  background: var(--surface);
  border-top: 1px solid var(--line);
  min-height: var(--tabbar-h);
  padding-bottom: env(safe-area-inset-bottom, 0);
}
.fc-tabbar__item{
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  background: transparent; border: none; cursor: pointer; padding: 8px 4px;
  color: var(--ink-faint); font-family: var(--font-sans); font-size: var(--text-2xs); font-weight: var(--weight-medium);
  transition: color var(--dur-fast) var(--ease-out);
  -webkit-tap-highlight-color: transparent;
}
.fc-tabbar__item:hover{ color: var(--ink-soft); }
.fc-tabbar__item[aria-current="page"], .fc-tabbar__item--active{ color: var(--accent); }
.fc-tabbar__item:focus-visible{ outline: 2px solid var(--accent-ring); outline-offset: -3px; border-radius: var(--radius-sm); }
.fc-tabbar__icon{ display: inline-flex; }
.fc-tabbar__icon svg, .fc-tabbar__icon i{ width: 23px; height: 23px; }
.fc-tabbar__label{ line-height: 1; }
`;

function injectOnce(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id; el.textContent = css;
  document.head.appendChild(el);
}

export function TabBar({ items = [], value, onChange, className = '' }) {
  injectOnce('fc-tabbar-styles', CSS);
  return (
    <nav className={['fc-tabbar', className].filter(Boolean).join(' ')}>
      {items.map((it) => {
        const active = value === it.value;
        return (
          <button
            key={it.value}
            type="button"
            className={'fc-tabbar__item' + (active ? ' fc-tabbar__item--active' : '')}
            aria-current={active ? 'page' : undefined}
            style={active ? { color: 'var(--accent)' } : undefined}
            onClick={() => onChange && onChange(it.value)}
          >
            <span className="fc-tabbar__icon">{it.icon}</span>
            <span className="fc-tabbar__label">{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
