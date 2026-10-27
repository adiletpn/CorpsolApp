import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { SessionProvider } from './session';
import { onTelegramThemeChange } from './telegram';
import { applyAppearance, savedAppearance, syncAppearanceFromCloud } from './theme';
import './styles.css';

// Тема — до первого кадра: светлый клиент со вспышкой тёмного окна выглядит как сбой.
applyAppearance(savedAppearance());
void syncAppearanceFromCloud();

// «Как в Telegram» должно следовать за Telegram сразу, а не после перезапуска.
onTelegramThemeChange(() => {
  const appearance = savedAppearance();
  if (appearance.theme === 'system') applyAppearance(appearance);
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SessionProvider>
      <App />
    </SessionProvider>
  </React.StrictMode>,
);
