# CLAUDE.md

@AGENTS.md

## Working in this checkout

- Spawn pnpm as `corepack pnpm` from scripts and tools. The root scripts already do. A bare `pnpm` can resolve to a different global copy; the repo pins pnpm 11.13.0.
- After switching machines or pulling new commits, run `pnpm sync`: fast-forward pull, frozen install, `pnpm dev:env`, and both database migrations. Skip a step with `--skip-pull`, `--skip-install`, `--skip-env`, or `--skip-migrate`.
- Local PostgreSQL is either the Docker container from `compose.yaml` (`pnpm dev:postgres:docker`) or the native user-space server (`pnpm dev:postgres`). Both answer on the default `DATABASE_URL`. The API and the relay each own a database (`bellfield`, `bellfield_relay`); migrate both with `pnpm dev:migrate` and `pnpm dev:relay:migrate`.
- The API, worker, and relay read `process.env`. In development they also load `<repo>/.env` and then `<app>/.env` at startup, with shell values winning; production never reads those files. `pnpm dev:env` copies the gitignored env files from the shared master folder described in `docs/dev-setup.md` section 4.
- Never print the contents of `.env` files, anything under the operator key folder, or relay, Resend, or Stripe values into chat, logs, tests, or commits. Refer to them by path only.
- Demo logins for local work are the seeded accounts in `apps/api/src/modules/identity-access/seed-employees.ts`.
- Pre-commit runs prettier through lint-staged; pre-push runs the secrets scan and the full test suite. Before handing work back run `pnpm typecheck`, `pnpm lint`, `pnpm test:tools`, `pnpm check:architecture`, and `pnpm check:file-size`.
- `.claude/launch.json` is gitignored and machine-local. It holds Browser-pane dev server entries (`office-web`, `api`) that launch through corepack.
