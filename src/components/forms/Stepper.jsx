import React from 'react';

const CSS = `
.fc-stepper{ display: inline-flex; flex-direction: column; gap: var(--space-2); }
.fc-stepper__label{
  font-family: var(--font-sans); font-size: var(--text-2xs); font-weight: var(--weight-semi);
  letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-faint);
}
.fc-stepper__control{
  display: inline-flex; align-items: center;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius-md); box-shadow: var(--shadow-xs);
  overflow: hidden;
}
.fc-stepper__btn{
  width: 44px; height: 44px; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: none; cursor: pointer;
  color: var(--ink-soft); font-size: 20px; line-height: 1;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.fc-stepper__btn:hover:not([disabled]){ background: var(--surface-hover); color: var(--accent); }
.fc-stepper__btn:active:not([disabled]){ background: var(--accent-soft); }
.fc-stepper__btn[disabled]{ opacity: 0.35; cursor: not-allowed; }
.fc-stepper__btn:focus-visible{ outline: 2px solid var(--accent-ring); outline-offset: -2px; }
.fc-stepper__value{
  min-width: 64px; text-align: center; padding: 0 var(--space-2);
  font-family: var(--font-mono); font-weight: var(--weight-bold); font-size: var(--text-md);
  color: var(--ink); border-left: 1px solid var(--line); border-right: 1px solid var(--line);
  height: 44px; display: flex; align-items: center; justify-content: center;
  font-variant-numeric: tabular-nums;
}
`;

function injectOnce(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id; el.textContent = css;
  document.head.appendChild(el);
}

const defaultFormat = (v) => (v > 0 ? `+${v}` : `${v}`);

export function Stepper({
  label,
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  format = defaultFormat,
  className = '',
}) {
  injectOnce('fc-stepper-styles', CSS);
  const set = (v) => {
    const clamped = Math.max(min, Math.min(max, v));
    onChange && onChange(clamped);
  };
  return (
    <div className={['fc-stepper', className].filter(Boolean).join(' ')}>
      {label && <span className="fc-stepper__label">{label}</span>}
      <div className="fc-stepper__control">
        <button type="button" className="fc-stepper__btn" aria-label={`Decrease ${label || ''}`}
          disabled={value <= min} onClick={() => set(value - step)}>−</button>
        <span className="fc-stepper__value" aria-live="polite">{format(value)}</span>
        <button type="button" className="fc-stepper__btn" aria-label={`Increase ${label || ''}`}
          disabled={value >= max} onClick={() => set(value + step)}>+</button>
      </div>
    </div>
  );
}
