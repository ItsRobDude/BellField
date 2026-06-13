# Phase 6a Live Acceptance Smoke - 2026-06-13

This is the dated evidence for closing the Phase 6a build lane: estimate
acceptance links were minted by the live relay, opened in Chrome, decided by
the public customer page, polled by the local worker, and applied back to the
local install state.

## Scope

Proved in this smoke:

- local API rendered estimate PDFs and sent two estimates through
  `https://relay.bellfield.app`
- relay returned acceptance URLs and sent the emails to
  `admin@bellsoftwarellc.com`
- Chrome opened the public `/a/<token>` pages, submitted one approval and one
  decline
- worker polled the relay, applied both decisions locally, and acknowledged
  them
- local API readback showed the approved/declined estimate states and the
  structured decline reason codes

Not claimed here:

- a clean-machine/sold-shaped release install
- Windows service registration or reboot survival
- scratch-machine backup/restore
- real v(N) to v(N+1) updater proof

Those remain gate-day validation debt in
[gate-day-checklist.md](./gate-day-checklist.md).

## Environment

- Dev machine: Robert's Windows PC
- Date/time: 2026-06-13, local morning
- Database: local Docker Postgres container `bellfield-postgres`
- API/worker/office: local source dev processes
- Relay target: `https://relay.bellfield.app`
- Relay credentials: loaded from the local API key folder; no token material is
  recorded in this evidence file
- Backup job: disabled for this smoke (`BELLFIELD_BACKUP_ENABLED=false`)

The PC had power-cycled before the run. Docker Desktop was restarted, Docker
reported server version `29.5.2`, and `pnpm dev:migrate` applied the pending
`20260613_001_estimate_decline_reason_codes` migration before the app stack was
started.

## Commands and Checks

Setup and readiness:

```powershell
pnpm dev:postgres:docker
pnpm dev:migrate
Invoke-WebRequest http://127.0.0.1:3001/health
Invoke-WebRequest http://127.0.0.1:3000
```

Local stack:

- API started on `http://127.0.0.1:3001`
- office web started on `http://127.0.0.1:3000`
- worker started with delivery jobs enabled and backup disabled
- run logs were under
  `C:\Users\rober\AppData\Local\Temp\bellfield-6a-smoke-20260613-082256`

API smoke script actions:

- signed in as the seeded local admin account
- created one approval-path job and pending estimate
- sent the approval estimate to `admin@bellsoftwarellc.com`
- created one decline-path job and pending estimate
- sent the decline estimate to `admin@bellsoftwarellc.com`

Both send responses returned `status: "sent"` plus relay-minted acceptance URL
and expiry fields.

Chrome public-page smoke:

- approval link opened to the `BellField Dev` customer acceptance page
- approval note was submitted
- page reloaded to the settled "Thanks" state with approved copy
- decline link opened to the `BellField Dev` customer acceptance page
- decline note was submitted with reason codes `price` and `questions`
- page reloaded to the settled "Thanks" state with declined copy

Worker evidence:

```json
{
  "timestamp": "2026-06-13T15:27:19.112Z",
  "service": "worker",
  "level": "info",
  "message": "Acceptance decision poll completed.",
  "context": { "fetched": 2, "applied": 2 }
}
```

API readback after the worker poll:

| Path     | Estimate id                            | Final status | Local decision stamp       | Structured reasons   |
| -------- | -------------------------------------- | ------------ | -------------------------- | -------------------- |
| Approval | `6b3e0dd8-115a-4992-aad1-f101b0ab0892` | `approved`   | `2026-06-13T15:27:18.423Z` | n/a                  |
| Decline  | `1799c4fd-6067-4d50-8306-636e7e59dc1d` | `declined`   | `2026-06-13T15:27:18.770Z` | `price`, `questions` |

The associated outbound rows remained `sent` and had matching
`acceptanceDecisionAppliedAt` timestamps.

## Result

Phase 6a is closed as a build/functional lane on this repo: relay minting,
public page decision capture, install-side polling, state application,
structured decline reasons, and office/estimate state readback all passed
against the live relay.

The formal sold-shaped install proof remains separate. Gate day should run the
same acceptance flow from an installed release artifact with a license and
relay token, alongside the existing clean-machine install, restore, update, and
second-device gates.
