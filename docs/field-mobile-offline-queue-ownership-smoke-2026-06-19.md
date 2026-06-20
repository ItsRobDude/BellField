# Field Mobile Offline Queue Ownership Smoke - 2026-06-19

## Summary

Result: **PASS**.

This run validated the field-mobile offline queue ownership fix on a real Android tablet. It proved that queued work belongs to the employee login that created it: a second employee could not see, drain, or overwrite the first employee's pending operation, and the original employee could return and sync it.

Run date: 2026-06-19 evening Pacific / 2026-06-20 UTC.

## Environment

- Repo: `BellField`
- Branch: `main`
- Base commit: `f0574fd`
- Working tree: dirty with the offline queue ownership patch under review
- Device: Samsung Galaxy Tab S9 Ultra, model `SM-X910`
- Android: 16
- Expo Go: 56.0.1
- API: `http://127.0.0.1:3001`
- Database: local Docker Postgres container `bellfield-postgres`
- Screenshots/UI dumps captured locally under:
  `C:\Users\rober\AppData\Local\Temp\bellfield-field-smoke`

## Repo Checks

Before the tablet smoke, the following checks passed:

```powershell
pnpm --filter @bellfield/field-mobile typecheck
pnpm --filter @bellfield/field-mobile test:unit
pnpm --filter @bellfield/field-mobile lint
pnpm check:file-size
pnpm check:architecture
pnpm check:ui-copy
git diff --check
```

Field-mobile unit coverage included owner-scoped queue load/drain/update/remove, legacy null-owner adoption, owner-scoped replacement delete by `entity_key`, owner-scoped media staging paths, and cache-owner mismatch clearing.

## Setup

The local API was started with seed data enabled and a throwaway media root:

```powershell
$env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/bellfield'
$env:PORT = '3001'
$env:BOOTSTRAP_SEED_DATA = 'true'
$env:BELLFIELD_MEDIA_ROOT = "$env:TEMP\bellfield-field-smoke-runtime\media"
$env:BELLFIELD_MEDIA_TOKEN_SECRET = 'local-field-smoke-token-secret-1234567890'
pnpm --filter @bellfield/api start
```

The local field smoke data was prepared:

```powershell
$env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/bellfield'
pnpm dev:field-smoke-data
```

Prepared rows after cleanup:

```text
appointment-1001-a|scheduled
appointment-1002-a|working
appointment-1002-b|scheduled
```

Metro/Expo was started with explicit localhost routing for `adb reverse`:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:3001'
$env:REACT_NATIVE_PACKAGER_HOSTNAME = '127.0.0.1'
pnpm --filter @bellfield/field-mobile exec expo start --lan --port 8081 --clear
```

ADB reverses used during the run:

```powershell
adb reverse tcp:8081 tcp:8081
adb reverse tcp:3001 tcp:3001
```

## Flow 1 - Same Employee Offline Preservation And Drain

1. Launched Expo Go on the tablet with:

   ```powershell
   adb shell am start -W -a android.intent.action.VIEW -d exp://127.0.0.1:8081/--/ host.exp.exponent
   ```

2. Signed in as Taylor Technician (`tech@bellfield.local`).
3. Confirmed assigned jobs rendered:
   - Job 1002
   - Job 1001
4. Removed only the API reverse to simulate tablet-side API outage while keeping Metro connected:

   ```powershell
   adb reverse --remove tcp:3001
   ```

5. Opened Job 1002, Appointments tab.
6. Queued an appointment status change for `appointment-1002-a` from `working` to `arrived`.
7. Confirmed the tablet UI showed:
   - `1 change waiting to sync`
   - Job 1002 badge `1 queued`
   - Appointment copy `Appointment change queued on this device.`
   - Replayed local status `Status: arrived`
8. Confirmed Postgres still had the server value:

   ```text
   appointment-1002-a|working
   ```

9. Force-stopped and relaunched Expo Go. It returned to sign-in.
10. Restored the API reverse and signed in again as Taylor.
11. Confirmed Taylor still saw the pending operation:
    - `1 change waiting to sync`
    - Job 1002 badge `1 queued`
12. Tapped Sync Now.
13. Confirmed the queue cleared and the UI returned to `Synced`.
14. Confirmed Postgres received Taylor's queued operation:

    ```text
    appointment-1002-a|arrived
    ```

## Flow 2 - Different Employee Does Not Inherit Queue

1. Removed the API reverse again.
2. As Taylor, queued a second local operation on the same appointment, changing `appointment-1002-a` back from `arrived` to `working`.
3. Confirmed Taylor saw:
   - `1 change waiting to sync`
   - Job 1002 badge `1 queued`
   - local replay `Status: working`
4. Confirmed Postgres still had the server value:

   ```text
   appointment-1002-a|arrived
   ```

5. Force-stopped Expo Go and relaunched to sign-in.
6. Restored the API reverse.
7. Selected the Dylan Dispatcher demo account (`dispatcher@bellfield.local`) and signed in.
8. Confirmed Dylan did **not** inherit Taylor's queue:
   - UI showed `Synced`
   - UI showed `No assigned jobs`
   - no `1 change waiting to sync`
   - no Job 1002 queue badge
9. Confirmed Postgres still had:

   ```text
   appointment-1002-a|arrived
   ```

10. Force-stopped Expo Go and relaunched to sign-in.
11. Selected Taylor Technician again and signed in.
12. Confirmed Taylor's queue was still preserved for Taylor:
    - `1 change waiting to sync`
    - Job 1002 badge `1 queued`
13. Tapped Sync Now.
14. Confirmed the queue cleared and Postgres moved back to:

    ```text
    appointment-1002-a|working
    ```

## Cleanup

The smoke data was reset after the run:

```powershell
$env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/bellfield'
pnpm dev:field-smoke-data
```

Final checked appointment state:

```text
appointment-1001-a|scheduled
appointment-1002-a|working
appointment-1002-b|scheduled
```

The temporary API and Expo helper processes were stopped, Expo Go was force-stopped, and ADB reverses were removed. Docker Postgres was left running because it was already running before the smoke.

## Issues And Notes

- No product-blocking issue was found in the offline ownership behavior.
- Same-employee preservation worked after Expo Go force-stop and re-login.
- Different-employee isolation worked: Dylan Dispatcher did not see or drain Taylor Technician's pending operation.
- Returning to Taylor preserved Taylor's queue until Taylor synced it.
- The `entity_key` replacement path was exercised indirectly by queuing a second status operation for the same appointment; the second employee did not remove or replace the first employee's row.
- The run did not repeat full media capture/pick on-device. Media ownership paths were covered by unit tests in this patch, and a prior real-device media upload smoke remains the current full media-device proof.

## Friction And Cosmetic Follow-Ups

- UIAutomator bounds were more reliable than screenshot-relative tap coordinates on the tablet. This is test-harness friction, not an app bug.
- Expo Go returned to sign-in after force-stop. That did not threaten queued work, and the re-login path was the behavior under test.
- The Expo log printed an available Expo update notice (`56.0.8` / `56.0.12` range). It did not block this run.
- The first seeded/same-user load can show an `Office changed this work` panel when prior cached smoke data differs from the freshly seeded snapshot. It is accurate enough, but a little noisy during smoke runs.
- The field sign-in dev demo list includes Dispatcher and Owner accounts. Useful for this smoke, but if that list ever appears outside development/demo mode it would be confusing in a technician-facing app.
- The initial cleanup script attempted to use PowerShell's read-only `$PID` variable as a loop variable. The corrected cleanup used a different variable name and confirmed no API/Expo helpers or ADB reverses remained.
