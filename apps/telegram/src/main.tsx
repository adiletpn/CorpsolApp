import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { SessionProvider } from './session';
import { applyAppearance, savedAppearance } from './theme';
import './styles.css';

// Тема — до первого кадра: светлый клиент со вспышкой тёмного окна выглядит как сбой.
applyAppearance(savedAppearance());

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </React.StrictMode>,
);
