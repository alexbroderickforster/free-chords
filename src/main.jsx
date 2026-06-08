import React from 'react';
import ReactDOM from 'react-dom/client';
// Self-hosted webfonts (variable cuts), bundled so the app works offline.
import '@fontsource-variable/newsreader';
import '@fontsource-variable/hanken-grotesk';
import '@fontsource-variable/jetbrains-mono';
import { App } from './App.jsx';
import './styles/styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
