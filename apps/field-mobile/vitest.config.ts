import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@bellfield/contracts': path.resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@bellfield/i18n': path.resolve(__dirname, '../../packages/i18n/src/index.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts']
  }
});
