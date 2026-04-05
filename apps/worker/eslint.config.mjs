import { createTypeScriptConfig } from '../../eslint.config.mjs';

export default [createTypeScriptConfig({ tsconfigRootDir: import.meta.dirname })];
