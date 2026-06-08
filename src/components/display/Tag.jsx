import React from 'react';

const CSS = `
.fc-tag{
  display: inline-flex; align-items: center; gap: var(--space-2);
  font-family: var(--font-sans); font-size: var(--text-sm); font-weight: var(--weight-medium);
  line-height: 1; color: var(--ink-soft);
  background: var(--surface-sunken); border: 1px solid transparent;
  border-radius: var(--radius-pill); padding: 6px var(--space-3); white-space: nowrap;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out),
              border-color var(--dur-fast) var(--ease-out);
}
button.fc-tag{ cursor: pointer; }
button.fc-tag:hover{ color: var(--ink); }
.fc-tag[data-selected="true"]{ background: var(--accent-soft); color: var(--accent); border-color: color-mix(in oklab, var(--accent) 30%, transparent); }
.fc-tag:focus-visible{ outline: 2px solid var(--accent-ring); outline-offset: 2px; }

.fc-tag--good{ background: var(--good-soft); color: var(--good); }
.fc-tag--star{ background: color-mix(in oklab, var(--star) 16%, transparent); color: var(--star); }
.fc-tag--dot::before{ content:''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; opacity: .85; }
`;

function injectOnce(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id; el.textContent = css;
  document.head.appendChild(el);
}

export function Tag({
  tone = 'neutral',
  selected = false,
  dot = false,
  icon = null,
  onClick,
  className = '',
  children,
  ...rest
}) {
  injectOnce('fc-tag-styles', CSS);
  const cls = [
    'fc-tag',
    tone !== 'neutral' ? `fc-tag--${tone}` : '',
    dot ? 'fc-tag--dot' : '',
    className,
  ].filter(Boolean).join(' ');
  const TagEl = onClick ? 'button' : 'span';
  const extra = onClick ? { type: 'button', onClick, 'data-selected': selected ? 'true' : undefined } : {};
  return <TagEl className={cls} {...extra} {...rest}>{icon}{children}</TagEl>;
}
