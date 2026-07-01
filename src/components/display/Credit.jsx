import React from 'react';

// "Built by" credit — shown in the desktop sidebar footer and at the bottom of
// the mobile library (mirrors where the backup controls live).
export function Credit({ className = '' }) {
  return (
    <div className={'app-credit' + (className ? ' ' + className : '')}>
      <span className="app-credit__by">Built by</span>
      <a className="app-credit__name" href="https://github.com/alexbroderickforster" target="_blank" rel="noopener noreferrer">
        Alex Broderick-Forster
      </a>
      <span className="app-credit__links">
        <a href="https://github.com/alexbroderickforster" target="_blank" rel="noopener noreferrer">GitHub</a>
        <span className="app-credit__dot" aria-hidden="true">·</span>
        <a href="https://www.linkedin.com/in/alexbf/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
      </span>
    </div>
  );
}
