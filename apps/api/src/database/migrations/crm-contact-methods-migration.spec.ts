import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('20260606_002_crm_contact_methods migration', () => {
  const migrationSql = readFileSync(
    join(__dirname, '20260606_002_crm_contact_methods.up.sql'),
    'utf8'
  );

  it('backfills legacy customer, location, and contact values into primary contact methods', () => {
    expect(migrationSql).toContain('create table if not exists crm_contact_methods');
    expect(migrationSql).toContain('insert into crm_contact_methods');
    expect(migrationSql).toContain('from customers');
    expect(migrationSql).toContain("where nullif(trim(phone), '') is not null");
    expect(migrationSql).toContain('from locations');
    expect(migrationSql).toContain("where nullif(trim(email), '') is not null");
    expect(migrationSql).toContain('from contacts');
    expect(migrationSql).toContain("where nullif(trim(fax), '') is not null");
    expect(migrationSql).toContain('on conflict (id) do nothing');
  });
});
