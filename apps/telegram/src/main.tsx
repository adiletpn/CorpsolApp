import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { SessionProvider } from './session';
import { colorScheme, prepareWindow } from './telegram';
import './styles.css';

// Тема — от Telegram: светлый клиент со вспышкой тёмного окна выглядит как сбой.
const scheme = colorScheme();
document.documentElement.dataset.theme = scheme;
prepareWindow(scheme === 'light' ? '#f4f4f7' : '#0b0b0f');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </React.StrictMode>,
);
