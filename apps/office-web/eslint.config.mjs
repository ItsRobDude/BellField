import nextPlugin from '@next/eslint-plugin-next';
import { createTypeScriptConfig } from '../../eslint.config.mjs';

const typeScriptConfig = createTypeScriptConfig({
  files: ['**/*.ts', '**/*.tsx'],
  tsconfigRootDir: import.meta.dirname
});

export default [
  {
    ignores: ['.next/**', 'node_modules/**']
  },
  {
    plugins: {
      '@next/next': nextPlugin
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules
    },
    settings: {
      next: {
        rootDir: '.'
      }
    }
  },
  typeScriptConfig
];
