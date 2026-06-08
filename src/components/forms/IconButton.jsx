import React from 'react';

const CSS = `
.fc-iconbtn{
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--ink-soft);
  cursor: pointer;
  width: var(--tap-min); height: var(--tap-min);
  flex: none;
  transition: background var(--dur-fast) var(--ease-out),
              color var(--dur-fast) var(--ease-out),
              border-color var(--dur-fast) var(--ease-out),
              transform var(--dur-fast) var(--ease-out);
  -webkit-tap-highlight-color: transparent;
}
.fc-iconbtn:hover:not([disabled]){ background: var(--surface-hover); color: var(--ink); }
.fc-iconbtn:active{ transform: scale(0.94); }
.fc-iconbtn:focus-visible{ outline: 2px solid var(--accent-ring); outline-offset: 2px; }
.fc-iconbtn[disabled]{ opacity: 0.4; cursor: not-allowed; }
.fc-iconbtn[data-active="true"]{ color: var(--accent); background: var(--accent-soft); }

.fc-iconbtn--bordered{ border-color: var(--line); background: var(--surface); box-shadow: var(--shadow-xs); }
.fc-iconbtn--sm{ width: 36px; height: 36px; border-radius: var(--radius-sm); }
.fc-iconbtn--lg{ width: 52px; height: 52px; }
`;

function injectOnce(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id; el.textContent = css;
  document.head.appendChild(el);
}

export function IconButton({
  icon,
  label,
  size = 'md',
  bordered = false,
  active = false,
  className = '',
  ...rest
}) {
  injectOnce('fc-iconbtn-styles', CSS);
  const cls = [
    'fc-iconbtn',
    bordered ? 'fc-iconbtn--bordered' : '',
    size !== 'md' ? `fc-iconbtn--${size}` : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={cls}
      aria-label={label}
      title={label}
      data-active={active ? 'true' : undefined}
      {...rest}
    >
      {icon}
    </button>
  );
}
