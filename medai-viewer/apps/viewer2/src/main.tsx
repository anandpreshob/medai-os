import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { executeCommand, listCommands, getCommandLog, toToolDefinitions } from '@medai/core';
import './styles.css';

// Test/agent hook: the same command surface the UI uses.
(window as unknown as { __medai: unknown }).__medai = { executeCommand, listCommands, getCommandLog, toToolDefinitions };

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
