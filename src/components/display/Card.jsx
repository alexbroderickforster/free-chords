import React from 'react';

const CSS = `
.fc-card{
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: background var(--dur-fast) var(--ease-out),
              border-color var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-fast) var(--ease-out),
              transform var(--dur-fast) var(--ease-out);
}
.fc-card--pad{ padding: var(--space-5); }
.fc-card--interactive{ cursor: pointer; text-align: left; width: 100%; display: block; font: inherit; color: inherit; }
.fc-card--interactive:hover{ border-color: var(--accent-tint); box-shadow: var(--shadow-md); }
.fc-card--interactive:active{ transform: scale(0.992); }
.fc-card--interactive:focus-visible{ outline: 2px solid var(--accent-ring); outline-offset: 2px; }
.fc-card--flat{ box-shadow: none; }
`;

function injectOnce(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id; el.textContent = css;
  document.head.appendChild(el);
}

export function Card({
  pad = true,
  interactive = false,
  flat = false,
  as,
  className = '',
  children,
  ...rest
}) {
  injectOnce('fc-card-styles', CSS);
  const Tag = as || (interactive ? 'button' : 'div');
  const cls = [
    'fc-card',
    pad ? 'fc-card--pad' : '',
    interactive ? 'fc-card--interactive' : '',
    flat ? 'fc-card--flat' : '',
    className,
  ].filter(Boolean).join(' ');
  const extra = interactive && Tag === 'button' ? { type: 'button' } : {};
  return <Tag className={cls} {...extra} {...rest}>{children}</Tag>;
}
