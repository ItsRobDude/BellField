# Architecture Guardrails

BellField uses a small repo-specific architecture check to keep the codebase from drifting away from the documented monorepo boundaries.

Run it with:

```powershell
pnpm check:architecture
```

The check protects these rules:

- shared API/client wire types belong in `packages/contracts`
- office, field, API, and worker apps must not import from each other
- shared packages must not import app or API internals
- `company-data` repositories are private foundation persistence glue

When this check fails, prefer the boring fix:

- move shared request/response/status types to `packages/contracts`
- expose behavior through a public module service instead of importing another module's repository
- keep shared packages pure and app-agnostic
- update this document only when the intended boundary changes deliberately

