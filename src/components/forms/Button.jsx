import React from 'react';

const CSS = `
.fc-btn{
  font-family: var(--font-sans);
  font-weight: var(--weight-semi);
  font-size: var(--text-base);
  line-height: 1;
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  padding: 0 var(--space-5);
  min-height: var(--tap-min);
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--dur-fast) var(--ease-out),
              color var(--dur-fast) var(--ease-out),
              border-color var(--dur-fast) var(--ease-out),
              transform var(--dur-fast) var(--ease-out);
  -webkit-tap-highlight-color: transparent;
}
.fc-btn:active{ transform: scale(0.98); }
.fc-btn:focus-visible{ outline: 2px solid var(--accent-ring); outline-offset: 2px; }
.fc-btn[disabled]{ opacity: 0.45; cursor: not-allowed; transform: none; }

.fc-btn--primary{ background: var(--accent); color: var(--ink-on-accent); }
.fc-btn--primary:hover:not([disabled]){ background: var(--accent-hover); }

.fc-btn--secondary{ background: var(--surface); color: var(--ink); border-color: var(--line); box-shadow: var(--shadow-xs); }
.fc-btn--secondary:hover:not([disabled]){ background: var(--surface-hover); }

.fc-btn--ghost{ background: transparent; color: var(--ink); }
.fc-btn--ghost:hover:not([disabled]){ background: var(--surface-hover); }

.fc-btn--quiet{ background: transparent; color: var(--ink-soft); }
.fc-btn--quiet:hover:not([disabled]){ color: var(--accent); }

.fc-btn--sm{ min-height: 36px; padding: 0 var(--space-4); font-size: var(--text-sm); border-radius: var(--radius-sm); }
.fc-btn--lg{ min-height: 52px; padding: 0 var(--space-6); font-size: var(--text-md); }
.fc-btn--block{ width: 100%; }
`;

function injectOnce(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id; el.textContent = css;
  document.head.appendChild(el);
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  iconLeft = null,
  iconRight = null,
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  injectOnce('fc-button-styles', CSS);
  const cls = [
    'fc-btn',
    `fc-btn--${variant}`,
    size !== 'md' ? `fc-btn--${size}` : '',
    block ? 'fc-btn--block' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button type={type} className={cls} {...rest}>
      {iconLeft}
      {children != null && <span>{children}</span>}
      {iconRight}
    </button>
  );
}
