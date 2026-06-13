import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@bellfield/contracts': path.resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@bellfield/i18n': path.resolve(__dirname, '../../packages/i18n/src/index.ts')
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts']
  }
});
