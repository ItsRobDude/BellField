# Field Mobile Smoke Runbook

This runbook validates the current Milestone 6 field app behavior against a local API and local seeded database.

It is intentionally a local development workflow. It does not add production setup, purchasing, PO receiving, inventory locations, or installer behavior.

## What This Covers

- field sign-in
- assigned-work home list
- job detail tabs
- local register entry queueing
- equipment edit and replacement-link visibility
- field media capture or pick when the runtime supports it
- manual Sync Now and retry behavior

## Prerequisites

- Local PostgreSQL is running.
- API migrations have been applied with `pnpm dev:migrate`.
- The API has been started at least once with seed data enabled so the demo rows exist.
- The API is reachable at `http://127.0.0.1:3001`.
- Expo Go supports the SDK version used by `apps/field-mobile`.
- An Android device is visible in `adb devices`.

Local demo technician:

- Email: `tech@bellfield.local`
- Password: `bellfield-tech`

## Prepare The Local Field Work Window

The field app intentionally loads assigned work for today and tomorrow. The bootstrap demo appointments are fixed historical dates, so local field smoke needs one explicit data-prep step.

From the repo root:

```powershell
pnpm dev:field-smoke-data
```

By default this command refuses non-local database hosts. It updates the existing seeded technician and seeded appointments only:

- `appointment-1001-a` becomes a scheduled appointment for today.
- `appointment-1002-a` becomes a working appointment for today.
- `appointment-1002-b` becomes a scheduled appointment for tomorrow.
- `job-service-1001` and `job-service-1002` are moved back into active demo statuses.

It does not delete register entries, media, equipment, customers, locations, or jobs.

## Start The Field App

On this Windows machine, use the LAN mode plus an explicit packager host when testing through `adb reverse`. The `--localhost` path can bind Metro to IPv6-only and leave the physical device unable to load the bundle.

From the repo root:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL = "http://127.0.0.1:3001"
$env:REACT_NATIVE_PACKAGER_HOSTNAME = "127.0.0.1"
pnpm --filter @bellfield/field-mobile exec expo start --lan --port 8081 --clear
```

In a second PowerShell window:

```powershell
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3001 tcp:3001
```

Then open Expo Go on the device, or launch the packager URL:

```powershell
adb shell am start -W -a android.intent.action.VIEW -d exp://127.0.0.1:8081/--/ host.exp.exponent
```

## Manual Smoke Checklist

Save screenshots under:

```text
%TEMP%\bellfield-field-smoke
```

Recommended screenshot names:

- `field-home-assigned-work.png`
- `field-job-overview.png`
- `field-job-appointments.png`
- `field-job-register-queued.png`
- `field-job-equipment.png`
- `field-job-sync.png`
- `field-media-queued.png`

Checklist:

1. Sign in as the local demo technician.
2. Confirm the home list shows assigned jobs for today or tomorrow.
3. Open a job detail.
4. Move through Overview, Appointments, Register, Equipment, and Sync.
5. Add or edit a register entry locally and confirm the queue badge updates.
6. Edit equipment locally and confirm the queue badge updates.
7. Check replacement-link visibility and empty-state wording.
8. Capture or pick image/video media if the current device/runtime supports it.
9. Run Sync Now.
10. Confirm successful queued operations clear.
11. If feasible, simulate a retryable failure by stopping the API before Sync Now, then restart the API and retry.

## Cleanup

Stop the Expo server and remove Android port reverses:

```powershell
adb reverse --remove tcp:8081
adb reverse --remove tcp:3001
```

## Known Boundaries

- PO-driven equipment receiving is the expected primary path for new replacement equipment, but it belongs to the later purchasing/inventory milestone.
- Manual equipment add remains a fallback for discovered equipment at a customer location.
- This runbook validates the local Expo/device path; production installer and customer network setup are separate deployment work.
