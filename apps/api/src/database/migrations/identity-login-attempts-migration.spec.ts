import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('20260619_001_identity_login_attempts migration', () => {
  const migrationSql = readFileSync(
    join(__dirname, '20260619_001_identity_login_attempts.up.sql'),
    'utf8'
  );

  it('indexes the stale-prune timestamp instead of unused blocked-until lookups', () => {
    expect(migrationSql).toContain('CREATE TABLE identity_login_attempts');
    expect(migrationSql).toContain('CREATE INDEX identity_login_attempts_updated_at_idx');
    expect(migrationSql).toContain('ON identity_login_attempts (updated_at)');
    expect(migrationSql).not.toContain('identity_login_attempts_blocked_until_idx');
  });
});
