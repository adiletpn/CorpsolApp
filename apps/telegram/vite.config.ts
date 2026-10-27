import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
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
});
