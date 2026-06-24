# Gate Day Checklist

One scratch-machine session that closes every open environmental gate in
[sellable-product-execution-plan.md](./sellable-product-execution-plan.md)
§Open validation debt. The split is deliberate: **prep happens on the dev
machine any evening; gate day itself is execution only.** If a step on gate
day requires building, downloading, or figuring something out, that step
belongs in prep and this checklist should be amended.

The scratch machine must be a Windows PC with **no developer tooling** — no
Node, no Git, no PostgreSQL, nothing on PATH. A freshly (re)installed Windows
is ideal. Record its OS edition and version in the evidence doc.

Rule of the day: **the runbooks are the product being tested as much as the
software.** Any deviation from
[install-runbook.md](./install-runbook.md) or
[restore-runbook.md](./restore-runbook.md) — a missing step, a wrong path, an
unclear instruction — gets written down and becomes a runbook edit during
closeout.

---

## What this closes

| Gate | Debt item                                                                                                                                            | Runbook anchor                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1    | Phase 1: clean-machine stranger install, browser owner setup + job booking, service registration, ACL readback, reboot survival, second-device proof | install-runbook.md (all sections through Health Check) |
| 2    | Phase 2: restore drill from a real worker-produced backup set                                                                                        | restore-runbook.md                                     |
| 3    | Phase 4: installed v(N) → v(N+1) update with real services and a real pre-update `pg_dump`                                                           | install-runbook.md §Update Existing Install            |
| 4    | Phase 4: real refusal against an expired-window license                                                                                              | install-runbook.md §Update Existing Install            |
| 5    | Phase 5/6a: sold-shaped installed release sends through the production relay and applies a customer acceptance decision                              | install-runbook.md + acceptance-links-design.md        |

Rough budget: prep 1–2 hours (before the day), Gate 1 ~2 hours, Gate 2 ~45
minutes, Gates 3+4 ~1 hour, Gate 5 ~20 minutes, closeout ~30 minutes.

---

## Prep (dev machine, before gate day)

This section is for the Codex/operator preparing the USB. It is not clean-machine
gate work. The clean-machine Codex starts at `START-HERE.txt` and uses the
completed `build-evidence/preflight-checkoff-rerun-<N>-<YYYY-MM-DD>.md` only as
proof that prep already happened.

- [ ] Run [release-usb-preflight-checklist.md](./release-usb-preflight-checklist.md)
      while assembling the USB. Do not start the scratch-machine gate until the
      active artifacts, source commit, SHA list, docs, evidence templates, and
      secret scan are all current. Prep is not complete until
      `build-evidence/preflight-checkoff-rerun-<N>-<YYYY-MM-DD>.md` exists on
      the USB and records a ready verdict or clearly labeled known risks.
- [ ] **Run source-level gates once for the final source commit** that both
      active artifacts will use:

  ```powershell
  pnpm smoke:install-helpers
  pnpm smoke:install-config
  pnpm smoke:service-manifests
  pnpm format:check
  git diff --check
  pnpm security:secrets
  ```

- [ ] Confirm the USB-prep record shows required GitHub checks green for the same
      source commit: `quality` and `install-helper-smoke`. This is prep
      provenance, not a clean-machine task.

- [ ] **Build artifact A — v(N):**

  ```powershell
  pnpm build:release `
    --version=<N> `
    --release-date=<YYYY-MM-DD> `
    --postgres-root=<path-to-PG16-x64-root> `
    --vc-redist-root=<path-to-VC-redist-x64-root> `
    --winsw-exe=<path-to-approved-WinSW-x64.exe>
  pnpm smoke:release-build -- --require-gate-day-deps=true
  pnpm package:release-zip -- --release-root=release --output=<bellfield-vN.zip>
  pnpm smoke:release-zip -- --zip=<bellfield-vN.zip> --require-gate-day-deps=true
  ```

- [ ] Confirm the release smoke passed with the complete PostgreSQL 16 x64
      runtime under `release\postgres` (including
      `release\postgres\lib` and `release\postgres\share\postgres.bki`) and
      app-local VC++ runtime DLLs in `release\postgres\bin`, plus the approved
      WinSW binary at `release\tools\winsw\WinSW-x64.exe`. The
      smoke must functionally run packaged `initdb`, `pg_ctl`, and `psql`
      against a temporary data directory, not only presence-check files. These
      files must be copied by `build:release` before the signed update manifest
      is written; do not add or replace release files after signing.
- [ ] Confirm `pnpm smoke:service-manifests` passed and shows the Postgres XML
      has no `<serviceaccount>` block while `install-windows-services.ps1`
      configures and reads back the SCM `StartName` before startup, validates
      packaged runtime config, waits for service/process-id stability, and
      polls API health before reporting success.
- [ ] Confirm `pnpm smoke:install-helpers` passed and proves the packaged
      baseline, service, LAN, migration, and evidence-redaction helpers are
      present and wired into the installer failure path. After rerun #9, this
      smoke must also exercise the LAN helper env reader/writer against
      generated-env-shaped lines containing blank separators. After rerun #10,
      it must also prove LAN configurator/collector firewall effectiveness
      checks use `Get-NetFirewallAddressFilter` for `RemoteAddress`, not
      `Get-NetFirewallPortFilter`. After rerun #11, it must also prove the LAN
      evidence collector has a fast exact-managed-rule readback path and cannot
      let broad firewall enumeration block JSON evidence output.
- [ ] Confirm `pnpm smoke:install-config` passed. It must run the real
      `write-server-config.mjs` helper and prove API/worker accept the generated
      clean-install relay-disabled env.
- [ ] Confirm the API identity-attempt PostgreSQL regression ran in CI. The
      failed-attempt throttle SQL must be exercised against real Postgres, not
      only by mocked repository tests.
- [ ] Confirm `pnpm smoke:release-zip -- --zip=<artifact.zip>
--require-gate-day-deps=true` passed for each active artifact, and record the
      evidence path for each ZIP. A run that does not pass is not USB-ready.
      With gate-day deps required, this smoke must issue a smoke license, run
      packaged migrations, run the packaged manual backup CLI, restore that
      backup through a non-`CREATEDB` app role while proving post-backup
      database marker data is erased, media files return to backup-set bytes,
      post-backup media is removed, the license file returns to backup-set
      bytes, API boots until `/health` is `ok`, invalid-token first-owner
      handling works, first owner creation works, the owner session verifies,
      and worker stays alive after startup.
- [ ] If this artifact is meant to close the service-identity blocker, save a
      passing elevated diagnostic JSON from
      `tools\install\diagnose-windows-service-account.ps1` using the same WinSW
      binary. The ordinary gate diagnostic should clean up after itself; reserve
      `-KeepArtifacts` for an explicit diagnostic/forensics run. This is
      supporting preflight evidence only, not a Gate 1 pass and not a
      clean-install step: the authoritative service-identity proof is the
      installer's own SCM `StartName` readback plus real service startup. A
      diagnostic that fails for tool reasons must not block a gate whose
      installer readback and service start pass; a genuine failure must still be
      investigated. Rerun #5 showed that virtual-account proof must account for
      the service identity appearing as the process user even when
      `whoami /groups` does not list the service-specific SID, which the
      diagnostic predicate now reflects.
- [ ] **Use the ZIP produced by `pnpm package:release-zip`** as
      `bellfield-vN.zip`; do not manually repackage the signed release tree.
- [ ] **Build artifact B — v(N+1):** same steps (PG16 + WinSW included), with
      a bumped `--version` and a `--release-date` the same day or later than
      artifact A's. Zip as `bellfield-vN+1.zip`. Build B **after** A so the
      signed manifests are distinct. Rerun the source-level gates only if source
      files changed after artifact A.
- [ ] **Issue two license files** (BellField-side, from
      [license-design.md](./license-design.md) key ceremony):
  - `bellfield-license.json` — valid, `--update-window-end` comfortably in
    the future (must be ≥ artifact B's release date)
  - `bellfield-license-EXPIRED.json` — `--update-window-end` strictly
    **before** artifact B's release date
- [ ] **Prepare sold-shaped relay config** for the gate install: relay base
      URL and relay token only. Do not copy
      `BELLFIELD_RELAY_SERVER_INSTANCE_ID` from the USB; preserve the value
      generated by `write-server-config.mjs`. Store token material only in the
      local API-key folder or the encrypted transfer path being used for the
      scratch machine; do not paste it into this checklist or the evidence doc.
      The clean install must start before relay credentials are copied. The
      accepted disabled-relay state is a generated server instance ID with empty
      base URL/token.
- [ ] **USB stick:** both zips, both license files, this checklist, and
      offline copies of install-runbook.md and restore-runbook.md (the
      scratch machine may have no network or no browser bookmarks).
- [ ] Hash verification helpers compare `SHA256SUMS.txt` using normalized
      forward-slash relative paths. Rerun #7 showed a Windows backslash path
      comparison can produce a false missing-hash result even when the artifact
      hash itself is correct.
      Prefer the packaged helper:

  ```powershell
  .\tools\install\verify-usb-hashes.ps1 -Root <usb-root>
  ```

- [ ] **Second device ready:** any other laptop/phone on the same LAN for the
      second-office-desktop proof; know the scratch machine's LAN IP plan and
      be ready to record the Windows network category, listener readback, local
      LAN-IP health checks, and firewall rule readback before trying the second
      device. Rerun #8 failed here with the scratch PC on a Public network and
      no obvious BellField/Node/3000/3001 inbound allow rule.

---

## Gate 1 — Clean-machine install (Phase 1)

Follow install-runbook.md top to bottom using artifact A. Checkpoints:

- [ ] Extract artifact A; **no tooling installed on the machine itself** —
      everything runs via `release\runtime\node\node.exe`.
- [ ] Capture the read-only install baseline before making changes:

  ```powershell
  .\release\tools\install\collect-windows-install-baseline.ps1 `
    -InstallRoot C:\BellField `
    -UsbRoot <usb-root> `
    -OutputPath <usb-evidence-path>\install-baseline-rerun-N.json
  ```

- [ ] `write-server-config.mjs --install-root=C:\BellField` writes the env
      file, generated secrets, and configured data-root folders. Do not expect
      `C:\BellField\data\postgres\PG_VERSION` yet; PostgreSQL initialization
      belongs to the next provisioning step.
- [ ] Configure supported LAN ingress before rendering services:

  ```powershell
  .\release\tools\install\configure-windows-lan-access.ps1 -InstallRoot C:\BellField
  ```

      If the selected LAN profile is `Public`, the helper must fail closed
      unless the operator explicitly reruns it with `-SetCurrentNetworkPrivate`
      after confirming this is the trusted shop LAN. It must configure
      LAN-safe `NEXT_PUBLIC_API_BASE_URL` / `BELLFIELD_OFFICE_ORIGINS`, create
      exact BellField-managed firewall rules for the office/API ports only, and
      never open PostgreSQL/5432.

- [ ] `provision-postgres.mjs` initializes the data dir, applies the
      generated password, flips auth to `scram-sha-256`.
- [ ] Run packaged migrations through the helper (runbook §Provision
      PostgreSQL), not a hand-rolled `pg_ctl` pipeline:

  ```powershell
  .\release\runtime\node\node.exe .\release\tools\install\run-packaged-migrations.mjs --install-root=C:\BellField
  ```

      The helper uses `pg_ctl -l <logfile>`, refuses an already-running
      PostgreSQL data directory, and tails redacted logs on failure.

- [ ] Place the **valid** license at
      `C:\BellField\data\license\bellfield-license.json`.
- [ ] Render manifests after LAN config, then install services from elevated
      PowerShell and confirm all four register/start in order
      (`bellfield-postgres`, `-api`, `-worker`, `-office-web`).
- [ ] Confirm the installer reports service stability and API health, not only
      service registration. It must require stable nonzero service process IDs
      across the settle window. Stop the gate if the installer prints service
      state or log-tail failure context.
- [ ] Save packaged service evidence from elevated PowerShell:

  ```powershell
  .\release\tools\install\collect-windows-service-evidence.ps1 `
    -InstallRoot C:\BellField `
    -OutputPath <usb-evidence-path>\service-evidence-rerun-N.json
  ```

- [ ] Read back service `State`, `StartName`, `ExitCode`, and `ProcessId`. Stop
      the gate if any auto-start BellField service is stopped or crash-looping;
      installer success alone is not enough.
- [ ] Confirm service identities:

  ```powershell
  Start-Sleep -Seconds 20
  Get-CimInstance Win32_Service -Filter "Name like 'bellfield-%'" |
    Select-Object Name, State, StartMode, StartName, ExitCode, ProcessId, PathName
  ```

  If embedding the command in an elevated transcript, quote the whole `-Filter`
  argument exactly as shown. The equivalent pipeline form is also acceptable:
  `Get-CimInstance Win32_Service | Where-Object { $_.Name -like 'bellfield-*' }`.

  Expect `bellfield-postgres` to run as
  `NT SERVICE\bellfield-postgres`. The API, worker, and office-web services may
  still show `LocalSystem` until the follow-up whole-stack least-privilege
  slice lands.

  This is an installed-service readback, not a manifest check. Rerun #4 proved
  that `bellfield-postgres.xml` can describe an intended account while the
  actual Windows service still reports `LocalSystem`; the fixed artifact should
  rely on SCM configuration/readback, not XML account ownership.

- [ ] **ACL readback** (evidence, not vibes):

  ```powershell
  icacls C:\BellField\bellfield-server.env
  icacls <release>\services
  icacls <release>\services\bellfield-postgres.xml
  icacls <release>\postgres
  icacls C:\BellField\data\postgres
  icacls C:\BellField\data\logs\services\bellfield-postgres
  ```

  Expect the env file to remain Administrators + SYSTEM only. Expect the
  PostgreSQL release/data/log paths to include only the narrow
  `NT SERVICE\bellfield-postgres` access needed by PostgreSQL, plus
  Administrators + SYSTEM. Paste output into the evidence doc. If a
  non-elevated readback gets `Access is denied` on hardened service paths, rerun
  the readback from an elevated read-only PowerShell session before treating it
  as a product failure.

- [ ] **First-owner setup:** the one-time token is in the API service log
      (WinSW captures stdout under
      `C:\BellField\data\logs\services\bellfield-api\bellfield-api.out.log`),
      not the UI. After ACL hardening, log capture may require an elevated
      read-only shell or packaged log collector. Prefer the packaged helper:

  ```powershell
  .\release\tools\install\copy-first-owner-setup-token.ps1 -InstallRoot C:\BellField
  ```

  Complete owner setup in the browser. If more than one token line exists, use
  the latest one; the token can change after an API restart. If the token is
  placed on the clipboard, overwrite it afterward with a harmless placeholder
  rather than an empty string; rerun #7 showed `Set-Clipboard` can reject empty
  text. The office setup form is part of the office auth shell after the server
  URL/API URL is accepted; do not navigate directly to
  `http://localhost:3000/identity/setup/first-owner`, because
  `/identity/setup/first-owner` is the API endpoint, not an office-web route.
  For disposable Gate Day scratch-machine runs, create the owner through the
  real browser setup flow with this fixed test-only credential:

  ```text
  Display name: Gate Day Owner
  Email: gate.owner@example.com
  Password: BellFieldGateDay!2026
  ```

  This credential is intentionally public and non-production so Codex can reuse
  it after reboot. Do not use it for customer installs, database credentials,
  relay credentials, licenses, or any other secret. Prefer recording `used
documented Gate Day dummy credential: yes` instead of echoing the password
  into evidence logs; if the exact dummy password appears in evidence, treat it
  as an allowlisted test value, not a hygiene blocker. Rerun #12 proved that
  relying on Codex/browser automation memory as the only copy loses the
  post-reboot login proof; rerun #13 proved the fixed dummy credential path
  through reboot and real second-device login.

- [ ] `Invoke-RestMethod http://localhost:3001/health` → `status: "ok"`.
- [ ] **Real office work in the browser:** create a customer, book a job,
      open it. This is the "stranger install includes job booking" clause.
- [ ] **Reboot the machine.** All four services come back automatically,
      health is `ok`, login still works.
- [ ] **Second device:** before using the other device, capture read-only LAN
      evidence with the packaged helper:

  ```powershell
  .\release\tools\install\collect-windows-lan-evidence.ps1 `
    -InstallRoot C:\BellField `
    -OutputPath <usb-evidence-path>\lan-evidence-rerun-N.json
  ```

      It records the scratch machine LAN IP decision, Windows network category,
      listening ports for `3000` and `3001`, local-origin installed-PC requests
      to `http://<scratch-lan-ip>:3000` and
      `http://<scratch-lan-ip>:3001/health`, inbound firewall rule readback,
      and `effectiveLanAccess`. The helper's URL checks do not prove remote
      reachability; then open the office app from another machine on the LAN and
      log in. If `effectiveLanAccess` is false, the collector hangs before
      producing JSON, or local LAN-IP checks pass but the external device times
      out, stop the strict gate and record the firewall/profile evidence. Rerun
      #11 showed why skipping collector output creates false confidence; rerun
      #12 stopped before this checkpoint because the post-reboot owner credential
      only existed in transient automation state. Actual second-device login is
      the only authoritative pass. Rerun #13 passed this checkpoint with
      packaged LAN evidence and a real iPhone same-Wi-Fi login.
      (Android field-device proof is a stretch goal - record it if attempted,
      it is tracked debt either way.)

---

## Gate 2 — Backup and restore drill (Phase 2)

- [ ] Produce a **real worker backup set**: either wait out the schedule or
      run the packaged backup helper from an elevated PowerShell session:

  ```powershell
  .\release\runtime\node\node.exe .\release\tools\install\run-packaged-backup.mjs --install-root=C:\BellField
  ```

  Rerun #13 blocker, fixed by PR #75: the bare packaged CLI command below failed
  with `pg_dump.exe failed: spawn pg_dump.exe ENOENT` when launched from an
  elevated shell whose current working directory did not make
  `release\postgres\bin` discoverable. Rerun #14 proved the packaged backup
  helper creates a fresh backup set on the clean install. Keep this helper as the
  copyable Gate 2 command; do not patch around backup tooling during a strict
  run by manually editing PATH or env values.

  Current rerun #14 blocker: restore failed because the old helper tried to
  recreate the database with the runtime app role, which intentionally lacks
  `CREATEDB`. The next artifact must restore through the owned database/schema
  path and prove marker erasure, media/license restore, service restart, login,
  and pre-backup data readback.

  Historical command shape:

  ```powershell
  <release>\runtime\node\node.exe <release>\apps\worker\dist\jobs\backup\run-backup-cli.js
  ```

- [ ] Verify the set under `C:\BellField\data\backups`: `database.dump`,
      media copy, `license\bellfield-license.json`, `manifest.json`.
- [ ] **Create marker data after the backup** (e.g. book a job titled
      `AFTER-BACKUP-MARKER`) so the restore has something to provably erase.
- [ ] Run the restore per restore-runbook.md
      (`restore-backup.mjs ... --confirm=RESTORE`).
- [ ] After restore: services healthy, login works, the marker job is
      **gone**, pre-backup data is present, license file is in place.

---

## Gate 3 — Real v(N) → v(N+1) update (Phase 4)

- [ ] Extract artifact B to a **separate directory** (never run the updater
      from the installed release root).
- [ ] Run the updater with **no skip flags** (runbook §Update Existing
      Install).
- [ ] Confirm, in order: signature verified → license verified → window
      check passed → staged copy → **pre-update backup actually ran** (a new
      backup set with a fresh `database.dump` exists) → services stopped →
      swap with timestamped rollback dir preserved → migrations → services
      restarted → health `ok`.
- [ ] System surface shows the v(N+1) version/release date.
- [ ] **Reboot again** — services come back on v(N+1).

---

## Gate 4 — Expired-window refusal (Phase 4)

- [ ] Replace the installed license with `bellfield-license-EXPIRED.json`
      (keep the valid one safe).
- [ ] Re-run the updater from artifact B. It must **refuse before touching
      anything**: no service stop, no swap, no backup consumed. Capture the
      refusal message verbatim.
- [ ] Confirm services were never interrupted (health still `ok` during).
- [ ] Restore the valid license file; health `ok`.

---

## Gate 5 — Production relay send and acceptance (Phase 5/6a)

Run this from the installed release, not from the repo checkout.

- [ ] Confirm `bellfield-server.env` contains the relay env triplet for
      `https://relay.bellfield.app` and no provider API key.
- [ ] In office-web, create or open a pending estimate and send it to the test
      mailbox (`admin@bellsoftwarellc.com` or the current BellField test
      address).
- [ ] Confirm delivery history shows a `sent` outbound row and an acceptance
      expiry. Do not record the full acceptance URL/token in the evidence doc.
- [ ] Open the customer acceptance page from the email or the recorded office
      reference and approve it.
- [ ] Within the worker poll interval, confirm office-web/API shows the
      estimate as customer-approved and the outbound row has
      `acceptanceDecisionAppliedAt`.
- [ ] Optional but preferred: send a second pending estimate, decline it with
      at least one structured reason, and confirm the reason code stores
      locally.

---

## Payments go-live (separate track, not part of the scratch-machine day)

Online payments (Phase 6b) have passed live-relay Stripe **sandbox** smokes for
invoice links, amount-scoped partial links, deposit links, and online refunds.
The remaining go-live proof is a real connected merchant/live-money business
track, not a scratch-machine gate — do it before enabling payments for any real
shop:

- [ ] Bell Software LLC Stripe Connect platform onboarding complete.
- [ ] Confirm Stripe Connect platform setup matches the BellField SaaS/direct
      charge posture: connected accounts are Stripe-responsible for losses,
      Stripe collects processing fees from the connected account, requirements
      collection is Stripe-hosted, and full Stripe Dashboard access is expected.
- [ ] In BellField Settings → Online payments, complete the one-time setup for
      the real merchant shop through the Stripe-hosted onboarding page. Confirm
      the office shows `Online payments ready` before creating any live link.
- [ ] Confirm the platform fee basis points
      (`BELLFIELD_RELAY_PAYMENTS_PLATFORM_FEE_BASIS_POINTS`) is exactly `100`
      before the first live charge. This is BellField's fixed 1% Connect
      application fee for online invoice and deposit payments, not a customer
      surcharge.
- [ ] Confirm the Stripe live webhook endpoint is a **Connect / connected
      accounts** endpoint for `https://relay.bellfield.app/webhooks/stripe`,
      subscribed to `checkout.session.completed`, `refund.created`,
      `refund.updated`, `refund.failed`, and `account.updated`. The relay's
      `BELLFIELD_RELAY_STRIPE_WEBHOOK_SECRET` must be this Connect endpoint's
      signing secret, not a platform-account webhook secret.
- [ ] Live-money webhook smoke: a real card payment through a generated link,
      using the lowest practical live-test amount and never more than `$2.00`
      unless the owner explicitly approves a higher amount at action time →
      Stripe webhook reconciles at the relay → worker records the payment and
      marks the session paid → office shows it. Confirm this used the normal
      Connect webhook path; the relay's payment-event poll fallback is only a
      safety net for missed webhooks.
- [ ] Refund smoke is separate from the payment smoke. Do not refund a live
      payment automatically, especially when the platform and connected account
      are both Bell Software LLC-controlled. Only run a live refund when the
      owner explicitly approves the refund at action time, and record that
      approval in the evidence notes. Prefer the smallest practical amount.
- [ ] Confirm `success`/`cancel` redirects land on a reachable public host
      (the relay's `publicBaseUrl`), not an internal address.
- [ ] **Stripe customer-receipt setting per connected account.** BellField now
      sends its own customer payment receipt (slices 1a/1b). The relay's Checkout
      session passes `customer_email` but does not set `receipt_email`, so Stripe
      only emails a receipt if the connected account has automatic customer
      receipts enabled in its Dashboard (Settings → Customer emails → Successful
      payments). To avoid the customer getting two receipts, disable Stripe's
      automatic receipt on the connected account (recommended, since BellField
      owns the receipt) — or knowingly accept the overlap. Verify per account.

---

## Closeout (same day)

- [ ] Write the evidence doc `docs/gate-day-<YYYY-MM-DD>.md` using the
      template below.
- [ ] If the run failed before all gates, write a dated failed-run evidence doc
      anyway. The first clean Windows attempt is recorded in
      [gate-day-clean-windows-smoke-2026-06-20.md](./gate-day-clean-windows-smoke-2026-06-20.md).
- [ ] Update [install-runbook.md](./install-runbook.md) §Current Boundary:
      move every proven item out of "Not yet validated" with the date.
- [ ] Update sellable-product-execution-plan §Open validation debt: date the
      closed gates; anything skipped (e.g. Android field device) stays
      listed.
- [ ] Turn every runbook deviation noted during the day into a runbook edit.

## Evidence template

```markdown
# Gate Day — <YYYY-MM-DD>

Scratch machine: <make/model>, <Windows edition + version>, no dev tooling
confirmed (`node`, `git`, `psql` not on PATH).
Artifacts: A = v<N> (<release-date>, commit <sha>), B = v<N+1> (<release-date>, commit <sha>).

## Gate 1 — clean install: PASSED/FAILED

- service registration: <notes>
- ACL readback: <icacls output>
- first-owner setup + job booking: <notes>
- reboot survival: <notes>
- second device: <notes>

## Gate 2 — restore drill: PASSED/FAILED

- backup set: <path + contents>
- marker erased / pre-backup data present: <notes>

## Gate 3 — real update: PASSED/FAILED

- pre-update backup set: <path>
- rollback dir: <path>
- post-update health + version: <notes>
- post-update reboot: <notes>

## Gate 4 — expired-window refusal: PASSED/FAILED

- refusal message: <verbatim>
- services uninterrupted: <notes>

## Gate 5 — production relay send and acceptance: PASSED/FAILED

- outbound message: sent/queued/failed <notes>
- customer acceptance page: <approve/decline result, token redacted>
- worker poll/application: <local estimate status + timestamp>

## Runbook deviations found

- <each one, with the runbook edit it produced>
```
