import { readdirSync } from 'node:fs';

describe('API migration file pairs', () => {
  it('keeps every forward migration paired with a rollback companion', () => {
    const filenames = readdirSync(__dirname);
    const upMigrations = new Set(
      filenames.filter((filename) => filename.endsWith('.up.sql')).map(toMigrationName)
    );
    const downMigrations = new Set(
      filenames.filter((filename) => filename.endsWith('.down.sql')).map(toMigrationName)
    );

    expect([...upMigrations].filter((name) => !downMigrations.has(name)).sort()).toEqual([]);
    expect([...downMigrations].filter((name) => !upMigrations.has(name)).sort()).toEqual([]);
  });
});

function toMigrationName(filename: string) {
  return filename.replace(/\.(?:up|down)\.sql$/, '');
}
