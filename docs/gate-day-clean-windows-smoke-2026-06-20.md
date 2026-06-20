# Clean Windows Gate-Day Smoke - 2026-06-20

This records the first fresh Windows install attempt from the prepared USB
artifact set. The raw notes were written on the scratch machine under
`evidence/gate-day-2026-06-20.md` and `evidence/command-log.txt` on the USB.
This repo doc is the sanitized, durable readout.

## Environment

- Scratch machine: `DESKTOP-R51IMEA`
- OS: Microsoft Windows 11 Pro 10.0.26200 build 26200, 64-bit
- CPU/RAM/storage: AMD Ryzen 9 5950X, 63.9 GB RAM, 1665.5 GB free on `C:`
- Network: Wi-Fi, `192.168.50.182`
- Existing tool check before install: `node`, `npm`, `pnpm`, `git`, `psql`,
  `docker`, and `code` were not on `PATH`
- Codex app: installed only as operator/note-taking tooling, not a BellField
  runtime dependency

Artifacts:

- Artifact A: `bellfield-v0.0.1-gateday.20260620.1.zip`, source commit
  `080463a`
- Artifact B: `bellfield-v0.0.1-gateday.20260620.2.zip`, source commit
  `080463a`
- Valid license: `licenses/bellfield-license.json`, paid, update window through
  `2027-06-20`
- Expired-window license: `licenses/bellfield-license-EXPIRED.json`, paid,
  update window through `2026-06-19`

## Result

Gate 1 failed before migrations, services, first-owner setup, backup, update,
or relay behavior could be tested.

The installed release was extracted to `C:\BellField\release`. Server config
generation completed with:

```powershell
.\release\runtime\node\node.exe .\release\tools\install\write-server-config.mjs --install-root=C:\BellField
```

The relay env values were then applied from the USB private relay config with
the token value redacted from evidence.

PostgreSQL provisioning failed with:

```text
initdb: error: file "C:/BellField/release/postgres/share/postgres.bki" does not exist
```

Scratch-machine readback showed:

- `C:\BellField\release\postgres` existed
- `C:\BellField\release\postgres\bin` existed
- `C:\BellField\release\postgres\share` did not exist
- `C:\BellField\release\postgres\share\postgres.bki` did not exist
- no `bellfield-*` services had been installed
- no PostgreSQL processes were left running

Repo-side USB verification after the run confirmed both signed zips had the
same bin-only PostgreSQL shape:

| Artifact                    | `release/postgres/*` entries | `bin` files | `lib` entries | `share` entries | `postgres.bki` |
| --------------------------- | ---------------------------: | ----------: | ------------: | --------------: | -------------: |
| `v0.0.1-gateday.20260620.1` |                           75 |          74 |             0 |               0 |              0 |
| `v0.0.1-gateday.20260620.2` |                           75 |          74 |             0 |               0 |              0 |

## Root Cause

The release assembly copied only the operator-provided PostgreSQL `bin`
directory into `release/postgres/bin`. It did not package PostgreSQL's broader
runtime tree, including `lib` and `share`.

That was enough for `pnpm smoke:release-build -- --require-gate-day-deps=true`
to pass, because the smoke only checked for required executables like
`postgres.exe`, `pg_ctl.exe`, and `initdb.exe`.

It was not enough for real PostgreSQL initialization. `initdb` failed first on
`share/postgres.bki`, but the package was also missing `lib`. The durable
requirement is a complete PostgreSQL runtime tree, not a one-file patch.

This is a packaging and automated-smoke coverage bug, not a Windows host
configuration problem.

## Follow-up Fix Prepared for Rerun

After this failure, release assembly was updated to package the complete
PostgreSQL runtime tree (`bin`, `lib`, and `share`) from a PostgreSQL root
instead of copying only `bin`. The replacement release assembly also copies
app-local Visual C++ runtime DLLs into `release/postgres/bin`, so PostgreSQL
does not rely on a target Windows machine already having the VC++ redistributable
installed.

The release-build smoke was also tightened so gate-day dependency builds must:

- run bundled Node with `--version`
- prove `release/postgres/lib` exists
- prove `release/postgres/share/postgres.bki` exists
- prove the required app-local VC++ runtime DLLs exist in `release/postgres/bin`
- functionally run packaged `initdb`, `pg_ctl`, `postgres`, and `psql` against
  a temporary data directory on an ephemeral localhost port

The replacement gate-day artifacts are `v0.0.1-gateday.20260620.3` for the
clean install and `v0.0.1-gateday.20260620.4` for the update gate. Repo-side
release smoke passed for both replacement artifacts, and the separate packaged
office-web smoke passed against the final release tree.

The clean Windows rerun is still required. The functional smoke proves the
packaged PostgreSQL runtime on the build machine; it does not replace the
clean-machine install, service, ACL, reboot, restore, update, second-device, or
relay gates.

## Blocked Gates

- Gate 1 clean install: failed during PostgreSQL provisioning
- Gate 2 restore drill: blocked because no install/backup existed
- Gate 3 real installed update: blocked because no install existed
- Gate 4 expired-window update refusal: blocked because the update gate was not
  reachable
- Gate 5 relay send and acceptance: blocked before app services existed

Not reached:

- service registration
- Windows ACL readback
- first-owner setup
- health endpoint
- reboot survival
- second office device
- Android field device
- backup/restore
- update-window refusal
- relay send/acceptance

## Relay Provisioning Note

The USB private relay config contained the installed-shop relay triplet:

- `BELLFIELD_RELAY_BASE_URL`
- `BELLFIELD_RELAY_TOKEN`
- `BELLFIELD_RELAY_SERVER_INSTANCE_ID`

For this first-party smoke, applying the triplet was acceptable as an assisted
internal step. For a professional paid-customer path, this is not the right
shape. The install already generates a fresh `serverInstanceId` in
`write-server-config.mjs`; shipping a fixed instance id from USB can erase the
distinction between physical installs and weaken the relay's single-active
rebind/flap signal.

The long-term relay provisioning path should use an activation-code exchange:
the install keeps its locally generated `serverInstanceId`, posts a short-lived
single-use activation code to the relay, and receives the relay token only after
the relay validates and binds that install. Manual relay-token triplets should
remain internal/break-glass only.

## Rerun Requirements

1. Reset or clean the scratch machine state, then rerun Gate 1 from the
   runbook using the replacement `.3` clean-install artifact.
2. Use the `.4` artifact for the real installed update gate.
3. Keep the existing office-web release smoke separate from the release-build
   smoke; it already boots the packaged standalone server and fetches static
   assets.
4. Keep relay token values redacted in evidence. For the next professional-grade
   iteration, replace manual relay triplet editing with the activation-code
   provisioning design.

## Severity

Blocking for install sellability. The failure is good news in one sense: the
clean-machine smoke found exactly the kind of packaging assumption it was meant
to catch, and it failed before customer data, services, or backups were touched.
