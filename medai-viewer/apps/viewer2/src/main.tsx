import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { executeCommand, listCommands, getCommandLog, toToolDefinitions } from '@medai/core';
import './styles.css';

// Cornerstone's image-load pool keeps a second, unobserved copy of a failed decode's promise. The failure is
// already reported through our own awaits / IMAGE_LOAD_FAILED, so keep it out of the uncaught-error channel.
window.addEventListener('unhandledrejection', (e) => {
  const msg = String((e.reason as { message?: string } | undefined)?.message ?? e.reason ?? '');
  if (/loadImageFromNaturalizedMetadata|loadImageFromImageLoader|decodeImageFrame|imageLoader/.test(msg)) {
    console.warn('[engine] image load rejected:', msg);
    e.preventDefault();
  }
});

// Test/agent hook: the same command surface the UI uses.
(window as unknown as { __medai: unknown }).__medai = { executeCommand, listCommands, getCommandLog, toToolDefinitions };
// Engine internals for debugging and tests (metadata providers, cache); not part of the command surface.
void import('@cornerstonejs/core').then((core) => ((window as unknown as { __cs: unknown }).__cs = core));
void import('@cornerstonejs/tools').then((tools) => ((window as unknown as { __cstools: unknown }).__cstools = tools));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
