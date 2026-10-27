import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd()), ...process.env };
  const apiOrigin = new URL(env.VITE_API_URL ?? 'http://localhost:3001/api').origin;

  return {
    plugins: [
      react(),
      {
        // Адрес сервера для preconnect берётся из того же VITE_API_URL,
        // что и запросы, — вторую переменную держать в согласии незачем.
        name: 'api-origin',
        transformIndexHtml: (html: string) => html.replace('__API_ORIGIN__', apiOrigin),
      },
    ],
    resolve: {
      // Общий пакет берём исходником: собранный он в CommonJS, а связанный
      // через workspace пакет Vite не прогоняет через преобразование CJS.
      alias: {
        '@corpsol/shared': fileURLToPath(
          new URL('../../packages/shared/src/index.ts', import.meta.url),
        ),
      },
    },
    test: {
      environment: 'jsdom',
    },
  };
});
