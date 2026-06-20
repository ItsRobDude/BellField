# Field Mobile Smoke Runbook

This runbook validates current field app behavior against a local API and local seeded database.

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
- `field-sync-api-stopped.png`
- `field-sync-retry-success.png`
- `field-media-upload-success.png`

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
11. If feasible, simulate a retryable failure:
    - queue at least one register or media operation
    - stop the API before Sync Now
    - run Sync Now and confirm the operation remains retryable rather than disappearing
    - restart the API
    - run Sync Now again and confirm the operation clears
12. For media, confirm the upload intent is replayed, the raw blob finalizes, the media row becomes uploaded, and the staged local file is cleaned up after successful sync.
13. Note any skipped device/runtime capability, such as camera unavailable in the current Expo runtime.

## Evidence Note

Create a short note beside the screenshots, for example:

```text
commit: <git sha>
api: http://127.0.0.1:3001
device: <device model / Android version>
expo: <Expo Go or dev-client version>
result: pass/fail/partial
skipped:
- camera capture skipped because ...
findings:
- ...
```

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

## Run Log

### 2026-06-04 — slice 5 (field workspace screen split) — PASS

- Commit: `e81a514`
- Device: Samsung Galaxy Tab S9 Ultra (SM-X910), Expo Go SDK 56, real hardware
- API: `http://localhost:3001` reached over `adb reverse tcp:3001`; Metro over `adb reverse tcp:8081`
- Purpose: confirm the slice-5 refactor (`field-sync-drain.ts` drain engine +
  `field-operation-handlers.ts` queue-handler factory) is behavior-preserving on real hardware.
- Result: **PASS** on every requested flow, core paths verified server-side (DB), no regression:
  - field login; assigned-work home loads (jobs 1002/1027/1030 + office-change notice)
  - queue a job note and an appointment-status change (queue badge / "1 change waiting")
  - background sync auto-drains (`FieldSmokeNote3` reached the job-1002 timeline)
  - manual Sync Now drains (`OfflineNote1` reached the job-1002 timeline)
  - **conflict round-trip**: queued `arrived` while offline, office changed the same appointment
    to `confirmed` (later `updated_at`), sync preserved it as "1 conflict needs office review"
    with Retry / Discard; Discard cleared the queue and the server kept `confirmed` (the
    discarded change never applied)
  - sign-out warning with unsynced work ("Unsynced work … Sign out anyway?")
  - bonus: offline graceful failure ("Sync failed — work is queued locally" + ConnectException);
    pending queue survived a full sign-out → sign-in cycle (durable SQLite)
- Not driven on-device this run: register / equipment / media queueing specifically (same
  `createFieldOperationHandlers` + `drainFieldSyncQueue` path the proven ops exercised). Media
  was driven in the follow-up run below.
- Evidence (gitignored): `artifacts/validation/2026-06-04T21-58-46-085Z/field/` — 53 screenshots
  - `field-smoke-notes.md`.
- Gotcha re-confirmed: on Windows, `expo start --localhost` binds Metro to IPv6 only and the
  device can't load the bundle over `adb reverse`; use `--host lan` with
  `REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1` (as the Start The Field App section already says).
- Follow-up idea: encode this as a Maestro flow so it is repeatable headlessly.

### 2026-06-05 — field media upload — PASS

- Device: Samsung Galaxy Tab S9 Ultra (SM-X910), Expo Go SDK 56, real hardware
- Setup: same as above, plus `BELLFIELD_MEDIA_ROOT` pointed at a throwaway folder so the
  finalized blob could be inspected on disk.
- Flow: Job 1002 → Overview → Media → **Pick from library** → select a photo → Done. The app
  staged the file and queued a media-upload op ("1 change waiting", job badge "1 queued").
  Manual Sync Now drained it.
- Result: **PASS**, verified server-side:
  - upload intent replayed → a `media_attachments` row was created for job 1002 (kind=image,
    `image/png`, 240409 bytes, original filename from the device)
  - raw blob finalized: the file landed at `<media root>/job-service-1002/<id>.png` and its
    on-disk size (240409 bytes) matches the row's `byte_size`
  - media row marked uploaded: `uploaded_at` and `storage_path` populated, `is_void=false`
  - the pending queue cleared after the successful sync
- Staged-file cleanup runs in the same drain success path (`deleteStagedFieldMedia`) but was not
  independently inspected — the staged file lives in Expo Go's app sandbox, which isn't reachable
  over adb without root.
- Evidence (gitignored): `artifacts/validation/2026-06-05T02-15-14-442Z/field-media/`.

### 2026-06-08 — register sync and revoked-session wipe — PASS

- Commit: `e717bd5` plus the later field revoked-device hardening patch.
- Device: Samsung Galaxy Tab S9 Ultra (SM-X910), Android 16, Expo Go 56.0.1, real hardware.
- API: `http://127.0.0.1:3001`; Docker Postgres; migrations applied; `pnpm dev:field-smoke-data` prepared the today/tomorrow work window.
- Setup: Expo Go app data was cleared with `adb shell pm clear host.exp.exponent`, then Metro and API were reached over `adb reverse tcp:8081` and `adb reverse tcp:3001`.
- Result: **PASS** for the focused field reliability slice:
  - field sign-in loaded assigned work for Job 1002 and Job 1001.
  - Job 1002 detail opened with Overview, Appointments, Register, Equipment, and Sync tabs visible.
  - a truck-stock register line was saved locally; the header changed to "1 change waiting to sync" and the job badge showed "1 queued".
  - manual Sync Now cleared the queue and returned the header to "Synced".
  - server-side DB verification found the synced register entry on `job-service-1002` with the expected description, quantity, inventory item/location ids, and `client_operation_id`.
  - the active field session was revoked through the admin API; the next tablet refresh returned to sign-in and displayed "Device access ended. BellField cleared local field data from this device."
- Evidence (gitignored): `artifacts/validation/2026-06-08T17-40-49-960Z/field/`.
- Not repeated in this run: media capture/pick and transient media retry. The prior 2026-06-05 media upload smoke remains the current real-device media proof; media transient retry remains the next hardening/smoke target.

### 2026-06-19 — offline queue ownership — PASS

- Base commit: `f0574fd` with the offline queue ownership patch in the working tree.
- Device: Samsung Galaxy Tab S9 Ultra (SM-X910), Android 16, Expo Go 56.0.1, real hardware.
- API: `http://127.0.0.1:3001`; Docker Postgres; `pnpm dev:field-smoke-data` prepared the today/tomorrow work window.
- Result: **PASS** for same-employee preservation, different-employee isolation, and owner-scoped drain:
  - Taylor Technician queued an appointment status change while the tablet could not reach the API; the app showed `1 change waiting to sync`, and Postgres did not change.
  - after Expo Go force-stop and re-login as Taylor, the queue was still present and Sync Now drained it server-side.
  - Taylor then queued another status change for the same appointment, switched to Dylan Dispatcher, and Dylan saw `Synced` / `No assigned jobs` with no inherited queue.
  - Taylor returned and still saw the queued operation; Sync Now applied it and cleared the queue.
- Evidence note: [field-mobile-offline-queue-ownership-smoke-2026-06-19.md](./field-mobile-offline-queue-ownership-smoke-2026-06-19.md).
