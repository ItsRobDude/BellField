import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Guards the "paid licenses never self-expire" fail-safe in normal CI. The
// real key ceremony smoke (pnpm smoke:license-key) can't run in CI because it
// needs the private key on Rob's machine, so this spec mints with a throwaway
// generated key and asserts the issuance tool refuses a paid+operationEnd
// license. If this guard ever regresses, a paid perpetual license could be
// issued carrying an operationEnd and silently behave like an expiring trial.
const issueLicenseTool = resolve(__dirname, '../../../../../tools/license/issue-license.mjs');

describe('issue-license.mjs issuance invariants', () => {
  let workDir: string;
  let privateKeyPath: string;
  let ledgerPath: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'bellfield-issue-license-spec-'));
    privateKeyPath = join(workDir, 'license-private-key.pem');
    ledgerPath = join(workDir, 'issued-licenses.jsonl');
    const { privateKey } = generateKeyPairSync('ed25519');
    writeFileSync(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string);
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  function issue(args: string[], outputPath: string) {
    return spawnSync(
      process.execPath,
      [
        issueLicenseTool,
        `--private-key=${privateKeyPath}`,
        '--shop-name=BellField Issue License Spec',
        `--output=${outputPath}`,
        `--ledger=${ledgerPath}`,
        ...args
      ],
      { encoding: 'utf8', shell: false }
    );
  }

  it('refuses to issue a paid license carrying operationEnd', () => {
    const outputPath = join(workDir, 'paid-with-operation-end.json');
    const result = issue(
      [
        '--kind=paid',
        '--license-id=lic_spec_paid_bad',
        '--update-window-end=2027-06-11',
        '--operation-end=2026-07-11'
      ],
      outputPath
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stderr}\n${result.stdout}`).toContain(
      'paid licenses must never carry operationEnd'
    );
    // The tool must reject before writing anything.
    expect(existsSync(outputPath)).toBe(false);
  });

  it('issues a well-formed paid license without operationEnd', () => {
    const outputPath = join(workDir, 'paid-ok.json');
    const result = issue(
      ['--kind=paid', '--license-id=lic_spec_paid_ok', '--update-window-end=2027-06-11'],
      outputPath
    );

    expect(result.status).toBe(0);
    expect(existsSync(outputPath)).toBe(true);
  });
});
