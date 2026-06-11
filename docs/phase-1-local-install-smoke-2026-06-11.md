# Phase 1 Local Install Smoke - 2026-06-11

This records the strongest nondestructive Phase 1 gate approximation run on the available daily Windows development PC.

It is evidence for the repo-side install path. It is not the clean-machine stranger install gate.

## Machine Boundary

Machine state:

- Windows daily-use development PC
- repo checkout and dev tooling already present
- Docker Desktop installed
- existing `bellfield-postgres` Docker container running `postgres:16` on host port `5432`

Deliberately not touched:

- no Windows service registration
- no reboot
- no firewall changes
- no host PostgreSQL install or user-space PostgreSQL provisioning
- no production install root such as `C:\BellField`
- no persistent BellField test database left behind

## Smoke Flow

The smoke used the generated `release/` artifact and release-bundled Node runtime.

Steps performed:

1. Built the release folder with `pnpm build:release`.
2. Created isolated test database `bellfield_phase1_gate_1781140529820` inside the existing Docker Postgres container.
3. Ran release-packaged migrations with `release/apps/api/scripts/migrations/up.mjs`.
4. Started release API from `release/apps/api/dist/apps/api/src/main.js` on port `3101`.
5. Started release worker from `release/apps/worker/dist/index.js`.
6. Started release office-web standalone server from `release/apps/office-web/apps/office-web/server.js` on port `3100`.
7. Verified unauthenticated `/health` returned `ok`.
8. Read the first-owner setup token from the API process log.
9. Created the first owner through `POST /identity/setup/first-owner`.
10. Verified setup mode exited with `GET /identity/setup/status`.
11. Created a customer, location, and scheduled job through the release API.
12. Verified office-web served the app shell.
13. Verified the worker stayed running during the smoke.
14. Stopped the release processes, dropped the test database, and removed the smoke scratch directory.

## Result

Passed.

Observed result:

```json
{
  "database": "bellfield_phase1_gate_1781140529820",
  "apiPort": 3101,
  "officePort": 3100,
  "health": {
    "status": "ok",
    "timestamp": "2026-06-11T01:15:33.152Z"
  },
  "owner": {
    "email": "phase1.gate.1781140529820@example.com",
    "roleId": "owner"
  },
  "job": {
    "id": "aed04d5a-f9f1-472a-8642-f05647f44f07",
    "status": "scheduled",
    "number": "1003"
  }
}
```

Migrations applied in the isolated database: `54`.

Cleanup check after the smoke:

- no `bellfield_phase1_gate_%` databases remained
- no release Node processes remained
- `release/phase1-gate-smoke` was removed

## Notes

One first attempt failed at customer creation because the smoke used display label `Residential` instead of the actual supported account type value `residential`. No code change was needed; the rerun passed with the correct value.

## Not Proven

This smoke does not prove:

- clean Windows machine with no developer tooling
- bundled PostgreSQL binaries under `release/postgres/bin`
- WinSW binary availability or service install
- reboot service recovery
- log rotation under Windows services
- second office desktop access over LAN
- Android field-device access
- backup, restore, update, uninstall, or repair

Those remain later validation gates. They should not block continued product work now that the compiled release path, first-owner setup, health readiness, migrations, office serving, worker boot, and basic job booking path have passed locally.
