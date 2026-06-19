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

- [ ] **Build artifact A — v(N):**

  ```powershell
  pnpm build:release --version=<N> --release-date=<YYYY-MM-DD>
  ```

- [ ] **Bundle PostgreSQL 16 into artifact A:** place user-space PG16 x64
      binaries at `release\postgres\bin` (so `pg_ctl.exe`, `initdb.exe`,
      `psql.exe`, `pg_dump.exe` all exist there).
- [ ] **Bundle WinSW into artifact A:** place the approved binary at
      `release\tools\winsw\WinSW-x64.exe`.
- [ ] **Zip artifact A** as `bellfield-vN.zip`.
- [ ] **Build artifact B — v(N+1):** same steps (PG16 + WinSW included), with
      a bumped `--version` and a `--release-date` the same day or later than
      artifact A's. Zip as `bellfield-vN+1.zip`. Build B **after** A so the
      signed manifests are distinct.
- [ ] **Issue two license files** (BellField-side, from
      [license-design.md](./license-design.md) key ceremony):
  - `bellfield-license.json` — valid, `--update-window-end` comfortably in
    the future (must be ≥ artifact B's release date)
  - `bellfield-license-EXPIRED.json` — `--update-window-end` strictly
    **before** artifact B's release date
- [ ] **Prepare sold-shaped relay config** for the gate install: relay base
      URL, relay token, and server instance id. Store the token material only
      in the local API-key folder or the encrypted transfer path being used for
      the scratch machine; do not paste it into this checklist or the evidence
      doc.
- [ ] **USB stick:** both zips, both license files, this checklist, and
      offline copies of install-runbook.md and restore-runbook.md (the
      scratch machine may have no network or no browser bookmarks).
- [ ] **Second device ready:** any other laptop/phone on the same LAN for the
      second-office-desktop proof; know the scratch machine's LAN IP plan.

---

## Gate 1 — Clean-machine install (Phase 1)

Follow install-runbook.md top to bottom using artifact A. Checkpoints:

- [ ] Extract artifact A; **no tooling installed on the machine itself** —
      everything runs via `release\runtime\node\node.exe`.
- [ ] `write-server-config.mjs --install-root=C:\BellField` writes env +
      directories + secrets.
- [ ] `provision-postgres.mjs` initializes the data dir, applies the
      generated password, flips auth to `scram-sha-256`.
- [ ] Temporary `pg_ctl` start → migrations → stop (runbook §Provision
      PostgreSQL).
- [ ] Place the **valid** license at
      `C:\BellField\data\license\bellfield-license.json`.
- [ ] Render manifests, install services from elevated PowerShell, confirm
      all four register and start in order (`bellfield-postgres`, `-api`,
      `-worker`, `-office-web`).
- [ ] **ACL readback** (evidence, not vibes):

  ```powershell
  icacls C:\BellField\bellfield-server.env
  icacls <release>\services
  ```

  Expect Administrators + SYSTEM only; paste output into the evidence doc.

- [ ] **First-owner setup:** the one-time token is in the API service log
      (WinSW captures stdout — `<release>\services\bellfield-api.out.log`),
      not the UI. Complete owner setup in the browser.
- [ ] `Invoke-RestMethod http://localhost:3001/health` → `status: "ok"`.
- [ ] **Real office work in the browser:** create a customer, book a job,
      open it. This is the "stranger install includes job booking" clause.
- [ ] **Reboot the machine.** All four services come back automatically,
      health is `ok`, login still works.
- [ ] **Second device:** open the office app from another machine on the LAN
      and log in. (Android field-device proof is a stretch goal — record it
      if attempted, it is tracked debt either way.)

---

## Gate 2 — Backup and restore drill (Phase 2)

- [ ] Produce a **real worker backup set**: either wait out the schedule or
      run the packaged manual backup CLI with the server env applied:

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
