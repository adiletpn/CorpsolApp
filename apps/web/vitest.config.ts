import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Экраны панели работают с DOM, поэтому не node, а браузерное окружение.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      // Next.js разрешает такие пути сам, Vitest о них не знает.
      '@': new URL('./', import.meta.url).pathname,
    },
  },
});
