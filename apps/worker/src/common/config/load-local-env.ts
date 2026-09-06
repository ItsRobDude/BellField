import { workerLog } from '../logger';
import { loadLocalEnvFiles } from './local-env';

// Imported first from index.ts so process.env is seeded before any module reads
// runtime configuration. Development only; see local-env.ts for precedence.
const loadedFiles = loadLocalEnvFiles();

if (loadedFiles.length > 0) {
  workerLog('info', 'Loaded local env files.', { files: loadedFiles.join(', ') });
}
