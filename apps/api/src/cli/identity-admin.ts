import { DatabaseService } from '../database/database.service';
import { IdentityAccessRepository } from '../modules/identity-access/identity-access.repository';
import {
  loginAttemptBucketKey,
  normalizeLoginEmail
} from '../modules/identity-access/login-attempt-policy';

type IdentityAdminCommand = { command: 'clear-login-attempts'; email: string };

const usage = [
  'Usage:',
  '  identity-admin clear-login-attempts --email=<employee@example.com>'
].join('\n');

function getFlag(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function parseArgs(
  args: string[]
): { ok: true; command: IdentityAdminCommand } | { ok: false; error: string } {
  const [command, ...rest] = args;

  if (command !== 'clear-login-attempts') {
    return { ok: false, error: 'Unsupported identity-admin command.' };
  }

  const email = getFlag(rest, 'email')?.trim();
  if (!email) {
    return { ok: false, error: 'clear-login-attempts requires --email.' };
  }

  return { ok: true, command: { command, email } };
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(`Error: ${parsed.error}`);
    console.error(usage);
    return 1;
  }

  const database = new DatabaseService();
  const repository = new IdentityAccessRepository(database);

  try {
    const normalizedEmail = normalizeLoginEmail(parsed.command.email);
    const clearedCount = await repository.clearLoginAttemptState(
      loginAttemptBucketKey(normalizedEmail)
    );
    console.log(
      JSON.stringify({
        command: parsed.command.command,
        email: normalizedEmail,
        cleared: clearedCount > 0
      })
    );
    return 0;
  } finally {
    await database.close();
  }
}

void main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'identity-admin failed.');
    process.exitCode = 1;
  });
