# Developer Setup

This document captures what has been scaffolded so far, why the initial tooling choices were made, and how to run BellField locally in a self-hosted development style.

## 1) What was scaffolded

### Apps
- `apps/office-web` — Next.js office-facing web app scaffold.
- `apps/field-mobile` — Expo + React Native mobile scaffold for technicians.
- `apps/api` — NestJS API scaffold (modular monolith host).
- `apps/worker` — lightweight Node/TypeScript worker scaffold for background tasks.

### Shared packages
- `packages/contracts` — shared TS contracts/shapes between surfaces.
- `packages/validation` — shared TS validation helpers.
- `packages/utils` — shared TS utility functions.

### Migration path
- API migrations are set up as SQL-first scripts run through repo-owned shell helpers (`migration:create`, `migration:up`, `migration:down`).
- This gives us an explicit, reviewable path for schema evolution while schema/domain design is still stabilizing.

### Tooling baseline
- Workspace monorepo layout with root scripts for dev/start/build/lint/typecheck/test.
- TypeScript configured across apps and packages.
- ESLint configured in root and per-app where needed.
- Minimal runtime defaults in each app so teams can start each surface independently.

## 2) Why these key tooling choices were made

### Minimal first
- The scaffold intentionally avoids heavy framework add-ons until product/workflow rules are stable.
- It is easier to add complexity than to remove accidental complexity.

### Conservative choices
- SQL-first migration scripts are explicit and easy to reason about in code review.
- Separate app surfaces and a worker are created early, but kept thin so architecture can evolve without rework.

### TypeScript-first across the stack
- Shared language and types reduce integration friction between office web, mobile, API, worker, and shared packages.
- Improves interface clarity and catches contract drift earlier during local development.

## 3) Install instructions

### Prerequisites
- Node.js 20+ (LTS recommended).
- `pnpm` 9+.

### Install
```bash
# from repository root
pnpm install
```

If `pnpm` is not installed yet:
```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
```

## 4) Run commands (per surface)

From repository root:

### office-web
```bash
pnpm dev:office-web
```

### field-mobile
```bash
pnpm dev:field-mobile
```

### api
```bash
pnpm dev:api
```

### worker
```bash
pnpm dev:worker
```

> Equivalent direct workspace form (example): `pnpm --filter @bellfield/api dev`.

## 5) Repo-wide quality/check commands

From repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Optional all-in-one sequence:

```bash
pnpm lint && pnpm typecheck && pnpm test
```

## 6) Intentionally deferred items (explicit)

The current scaffold is intentionally foundation-only. These are deferred on purpose:

1. Auth implementation (login/session/identity flows).
2. Role/permission enforcement implementation.
3. Business modules beyond starter health/shells (CRM, Jobs, Dispatch, Estimates, Billing, Inventory, etc.).
4. Real production schema/domain model (beyond starter migration path and placeholders).
5. Offline sync behavior implementation details (queue semantics, conflict resolution, retry policy, reconciliation UX).

## 7) Troubleshooting notes (local self-hosted oriented)

- **Port collisions:** If a surface fails to boot, check for port conflicts and stop old local processes.
- **Dependency drift:** Re-run `pnpm install` after lockfile updates or branch switches.
- **Expo/device issues:** Ensure Android emulator/device tooling is running before `field-mobile` startup.
- **API migration commands:** Provide `DATABASE_URL` when running migration scripts locally.
- **Type errors across workspaces:** Run `pnpm typecheck` at root to catch shared-package breakages affecting multiple apps.
- **Fresh start fallback:** If local state is inconsistent, clear local build artifacts and reinstall dependencies, then re-run the individual dev command.

