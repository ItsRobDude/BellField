# Clean Windows Gate-Day Smoke Rerun 2 - 2026-06-20

This records the second fresh Windows install attempt from the prepared USB
artifact set. The raw notes were written on the scratch machine under
`evidence/gate-day-rerun-2026-06-20.md` and
`evidence/command-log-rerun.txt` on the USB. This repo doc is the sanitized,
durable readout.

## Environment

- Scratch machine: `DESKTOP-R51IMEA`
- OS: Microsoft Windows 11 Pro 10.0.26200 build 26200, 64-bit
- CPU/RAM/storage: AMD Ryzen 9 5950X, 63.9 GiB RAM, 1665.3 GiB free on `C:`
- Network: Wi-Fi, `192.168.50.182`
- Existing tool check before install: `node`, `npm`, `pnpm`, `git`, `psql`,
  `docker`, and `code` were not on `PATH`
- Codex app: installed only as operator/note-taking tooling, not a BellField
  runtime dependency

Artifacts:

- Clean install artifact: `bellfield-v0.0.1-gateday.20260620.3.zip`
  - SHA-256:
    `3AA6B8C5E9643E2BA808DB4AF5913080C57C478AABF9E16BA581A596F30400B9`
  - version: `0.0.1-gateday.20260620.3`
  - source commit: `e4bc58b`
- Update artifact reserved for later gate:
  `bellfield-v0.0.1-gateday.20260620.4.zip`
  - SHA-256:
    `C6B1ABE102BA248647C838B95D983C66FFB30D4D383CF0BFF0A39E3E62C9587D`
  - version: `0.0.1-gateday.20260620.4`
  - source commit: `e4bc58b`

No relay tokens, database passwords, setup tokens, full acceptance URLs, or
license signatures were copied into this document.

## Result

Gate 1 failed during the documented migration step. Gates 2-5 were not reached.

The replacement artifacts did fix the first clean-machine failure:

- `release\postgres\bin` existed
- `release\postgres\lib` existed
- `release\postgres\share` existed
- `release\postgres\share\postgres.bki` existed
- `release\postgres\bin\vcruntime140.dll` existed
- `release\postgres\bin\vcruntime140_1.dll` existed
- `release\postgres\bin\msvcp140.dll` existed
- `release\tools\winsw\WinSW-x64.exe` existed
- `release\runtime\node\node.exe` existed

`write-server-config.mjs` completed and wrote
`C:\BellField\bellfield-server.env`. The operator intentionally did not record
the generated database password.

`provision-postgres.mjs` completed successfully using packaged PostgreSQL
16.14. It initialized `C:\BellField\data\postgres`, started PostgreSQL
temporarily on `127.0.0.1:5432`, created or updated the `bellfield` database
and login role from `DATABASE_URL`, changed host authentication from `trust` to
`scram-sha-256`, then stopped cleanly.

This closes the specific first-run packaging bug around missing
`release\postgres\share\postgres.bki`.

## Failure

The runbook migration step failed before creating any schema tables:

```powershell
$postgresData = "C:\BellField\data\postgres"
.\release\postgres\bin\pg_ctl.exe -D $postgresData -o "-h 127.0.0.1 -p 5432" -w start
$env:DATABASE_URL = "<value from C:\BellField\bellfield-server.env>"
.\release\runtime\node\node.exe .\release\apps\api\scripts\migrations\up.mjs
.\release\postgres\bin\pg_ctl.exe -D $postgresData -m fast -w stop
```

After the first timeout, packaged `psql` readback showed zero public tables:

```text
public_table_count: 0
```

A direct packaged-node diagnostic captured the underlying error:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'pg' imported from C:\BellField\release\apps\api\scripts\migrations\shared.mjs
```

The same package-resolution check from the migration helper base failed with:

```text
Error: Cannot find module 'pg'
Require stack:
- C:\BellField\release\apps\api\scripts\migrations\shared.mjs
```

Packaged SQL migration files were present under:

```text
C:\BellField\release\apps\api\src\database\migrations
```

The runtime package dependency graph was not usable from the extracted ZIP.
Repo-side inspection of the USB artifact confirmed `pg` existed under
`release/apps/api/node_modules/.pnpm/pg@8.13.1/...`, but the ZIP did not contain
the top-level `release/apps/api/node_modules/pg` entry that Node package
resolution needs. It likewise did not contain top-level API or worker direct
dependency entries such as `@nestjs/common`, `class-transformer`, or `rxjs`.

So the immediate symptom was the migration script's missing `pg` dependency,
but the root issue is broader: the release artifact was zipped from a release
tree whose `node_modules` depended on PNPM junctions/reparse points, and the
clean-machine extraction did not preserve the top-level dependency links.

## Blocked Gates

- Gate 1 clean install: failed during migrations
- Gate 2 restore drill: blocked because no migrated installed app or
  worker-produced backup existed
- Gate 3 installed update: blocked because no service-backed installed release
  existed
- Gate 4 expired-window update refusal: blocked because the update gate was not
  reachable
- Gate 5 relay send and acceptance: blocked before app services existed

Not reached:

- license file placement
- service manifest rendering
- Windows service installation
- Windows ACL readback
- first-owner setup
- office job booking
- health endpoint
- reboot survival
- second office device
- Android field device
- backup/restore
- update-window refusal
- relay send/acceptance

## Root Cause

The release smoke proved the generated `release/` tree on the build machine. It
did not prove the final ZIP after extraction with Windows' normal
`Expand-Archive` path. That distinction matters because the generated release
tree's `node_modules` uses PNPM's `.pnpm` store layout plus top-level
junctions/reparse points. The ZIP retained the package contents under `.pnpm`,
but not the top-level dependency entries that make package resolution work on
the clean machine.

The migration script exposed the issue first because
`apps/api/scripts/migrations/shared.mjs` imports `pg` at module load time. Even
the psql migration driver path cannot be reached until `pg` resolves, because
the import is unconditional.

This is a release-artifact packaging and smoke-coverage bug, not a PostgreSQL
runtime bug and not a Windows host configuration problem.

## Fix Direction

Required before the next clean-machine rerun:

1. Make the final ZIP self-contained after ordinary extraction. The release
   package must not depend on PNPM junctions that `Expand-Archive` drops.
   Options:
   - materialize top-level `node_modules` dependency directories in the release
     tree before signing/zipping
   - change the release package strategy to a zip method/layout that preserves
     and restores usable dependency links on Windows
   - produce app bundles that do not need runtime `node_modules` links for API,
     worker, or install-time scripts
2. Add a post-ZIP extraction smoke. The smoke should extract the produced ZIP
   into a temp directory using the same Windows extraction path the operator
   will use, then prove:
   - `release\runtime\node\node.exe` can resolve API direct dependencies such
     as `pg`
   - the packaged migration runner can start far enough to report missing
     `DATABASE_URL`, or can run against a temporary PostgreSQL database
   - the packaged API and worker entrypoints can resolve their runtime
     dependencies
3. Keep the functional PostgreSQL smoke. It caught the previous class after the
   fix, but it is necessary rather than sufficient.
4. Consider making the migration runner psql-capable without loading `pg`.
   Today `shared.mjs` imports `pg` unconditionally. Lazy-loading `pg` only for
   the `node` driver would let a packaged `psql` migration path work even if
   the Node driver is unavailable. That is a fallback, not a substitute for
   fixing API/worker dependency packaging.

## Relay Implications

The relay gate was not reached, so this run did not validate relay send,
acceptance, token auth, rebind behavior, or entitlement behavior.

It did expose a professionalism gap in the current assisted relay setup:
`START-HERE.txt` and the private relay README still allow applying a relay
"triplet" from USB. That triplet includes `BELLFIELD_RELAY_SERVER_INSTANCE_ID`,
which can overwrite the fresh instance id generated by
`write-server-config.mjs`. That weakens the intended one-installed-server
identity model because the instance id should belong to the physical install
that generated its env file.

Short-term next-rerun rule:

- apply only relay base URL and relay token from private config
- preserve the locally generated `BELLFIELD_RELAY_SERVER_INSTANCE_ID`
- make the timing explicit: relay config can be applied after
  `write-server-config.mjs` and before services start, but it is not needed
  before migrations

Professional-grade direction:

- replace manual relay-token triplets with a single-use activation-code flow
- `write-server-config.mjs` keeps generating the local `serverInstanceId`
- an install-side activation helper submits the activation code and the local
  `serverInstanceId` to the relay
- the relay validates the code, binds or rebinds the install, and returns the
  relay base URL/token for storage in `bellfield-server.env`
- relay support tooling can inspect, revoke, reissue, and audit activation
  events without ever putting long-lived relay tokens in ordinary USB
  instructions

That is the shape to pursue before paid customers. The manual triplet is still
acceptable for internal diagnostics, but it should be treated as break-glass
and should not define the customer install experience.

## Process Notes

- The first baseline logging wrapper had PowerShell quoting errors for some
  read-only probes. The probes were rerun successfully and did not affect
  product state.
- Two migration command wrappers exceeded their command timeout while capturing
  output and left temporary packaged PostgreSQL running. In both cases,
  process readback showed no migration `node.exe` still running, and PostgreSQL
  was stopped with packaged `pg_ctl`.
- No developer tooling was installed.
- No system Git, Node, pnpm, PostgreSQL, Docker, VS Code, pgAdmin, or source
  checkout was used to make the product work.

## Current Scratch-Machine State After Stop

- `C:\BellField` contains extracted artifact `.3`, generated config, and an
  initialized PostgreSQL data directory.
- Temporary PostgreSQL is stopped.
- No `bellfield-*` services were installed.
- The previous pre-run `C:\BellField` state was preserved at
  `C:\BellField.pre-rerun-20260620-131428`.

## Severity

Blocking for install sellability. The second run proves the PostgreSQL runtime
bundle is no longer the blocker, but the sold artifact still cannot complete a
clean Windows install because the extracted release cannot resolve its packaged
Node runtime dependencies.
