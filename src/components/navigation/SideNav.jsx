import React from 'react';

const CSS = `
.fc-sidenav{
  display: flex; flex-direction: column; gap: var(--space-5);
  width: 244px; flex: none; height: 100%;
  background: var(--surface); border-right: 1px solid var(--line);
  padding: var(--space-5) var(--space-4);
}
.fc-sidenav__brand{ display: flex; align-items: center; gap: 10px; padding: var(--space-2) var(--space-2) 0; }
.fc-sidenav__word{ font-family: var(--font-display); font-size: 22px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink); }
.fc-sidenav__word b{ color: var(--accent); font-weight: 600; }
.fc-sidenav__nav{ display: flex; flex-direction: column; gap: 2px; }
.fc-sidenav__item{
  display: flex; align-items: center; gap: var(--space-3);
  padding: 10px var(--space-3); border-radius: var(--radius-md);
  background: transparent; border: none; cursor: pointer; width: 100%; text-align: left;
  font-family: var(--font-sans); font-size: var(--text-md); font-weight: var(--weight-medium);
  color: var(--ink-soft);
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.fc-sidenav__item:hover{ background: var(--surface-hover); color: var(--ink); }
.fc-sidenav__item--active{ background: var(--accent-soft); color: var(--accent); font-weight: var(--weight-semi); }
.fc-sidenav__item:focus-visible{ outline: 2px solid var(--accent-ring); outline-offset: 2px; }
.fc-sidenav__icon{ display: inline-flex; flex: none; }
.fc-sidenav__spacer{ flex: 1; }
.fc-sidenav__footer{ display: flex; flex-direction: column; gap: var(--space-2); padding: 0 var(--space-2); }
`;

function injectOnce(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id; el.textContent = css;
  document.head.appendChild(el);
}

export function SideNav({ brand, items = [], value, onChange, footer, className = '' }) {
  injectOnce('fc-sidenav-styles', CSS);
  return (
    <nav className={['fc-sidenav', className].filter(Boolean).join(' ')}>
      {brand && <div className="fc-sidenav__brand">{brand}</div>}
      <div className="fc-sidenav__nav">
        {items.map((it) => {
          const active = value === it.value;
          return (
            <button
              key={it.value}
              type="button"
              className={'fc-sidenav__item' + (active ? ' fc-sidenav__item--active' : '')}
              aria-current={active ? 'page' : undefined}
              style={active ? { color: 'var(--accent)' } : undefined}
              onClick={() => onChange && onChange(it.value)}
            >
              <span className="fc-sidenav__icon">{it.icon}</span>
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>
      <div className="fc-sidenav__spacer" />
      {footer && <div className="fc-sidenav__footer">{footer}</div>}
    </nav>
  );
}
