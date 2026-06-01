# Field Handoff Readiness Findings

Snapshot of where the BellField field app stands against the Milestone 6 brief, what is solid enough for a technician to trust today, and the named gaps the next field lane should pick up.

Scope of this audit: `apps/field-mobile`. Backend, contracts, and office-web dispatch UI were intentionally out of scope.

---

## What's solid today

Behaviors backed by tests in `apps/field-mobile/src/modules/operations/__tests__/`:

- **Pending operations replay (`applyPendingOperations`)** — local notes, status changes, finish reviews, and equipment edits all overlay the cached snapshot deterministically. Conflict and rejected ops stay visible on the local view; pending edits are never silently dropped.
- **Merge helpers for applied sync results** — `mergeJobMutationIntoAssignedWork` and `mergeEquipmentMutationIntoAssignedWork` fold an applied response into the cache without polluting it with `syncResult`, `warningMessages`, `history`, or replacement links. They no-op cleanly when the response is for a job or equipment record outside the local cache window.
- **Sync indicator tone (`summarizeSyncHealth`)** — quiet when nothing is queued and nothing is failing, attention when only pending edits exist, alert when work is at risk (sync error, conflicts/rejects, or device never synced).
- **`buildSuccessfulSyncMetadata`** — clears prior `lastSyncError`, advances `lastSnapshotVersion`, and supports an explicit `attemptedAt` distinct from `successfulAt` for the `syncNow` drain path.
- **Refresh after office change** — when `refreshAssignedWork` pulls a new snapshot, locally queued notes/status/equipment edits still apply on top of the new server values. Pending queue order is `occurredAt`-sorted before drain.
- **Field cancel boundary** — the screen's `fieldAppointmentStatuses` list excludes `cancelled`, matching the backend's `ForbiddenException` on technician-initiated cancel.
- **Field trust display helpers** — work order number, full location address, structured schedule display, finished-review acknowledgement, per-appointment queue badges, and office-change refresh summaries are covered by pure helper tests.
- **Queue resolution controls** — conflicted/rejected local operations stay visible but are no longer replayed by ordinary `Sync Now` until the technician explicitly marks them for retry. The technician can also discard one conflicted/rejected local change after confirmation.
- **Register entries** — technicians can add line-item register entries, edit existing register lines, and void existing register lines locally. Register operations use the same pending queue, conflict/rejected preservation, Sync Now, background drain, and local overlay model as notes/status/equipment.
- **Background sync** — the technician workspace now runs an in-screen background drain loop while mounted, plus an active-app regain trigger. It avoids OS-level background fetch dependencies.

---

## Field trust fixes landed after the audit

**Appointment ownership is no longer misleading.**

The render was `{appointment.technicianName || employee.displayName}`. If `technicianName` was undefined — which can happen for an unassigned appointment under an assigned job, or when the office reassigned to another tech whose name didn't resolve — the screen fell back to the current employee's name, making it look like the appointment belonged to them.

**Fix:** extracted `describeAppointmentAssignment(appointment, currentEmployeeId)` and `isAppointmentAssignedToCurrentTechnician` into `apps/field-mobile/src/modules/operations/field-assignment-display.ts`. Behavior:

- Resolved name → display the name.
- No `technicianId` → "Unassigned".
- `technicianId` matches the current employee but no resolved name → "You".
- `technicianId` set but unresolved → "Another technician".

The screen now reads `Assigned to you (Taylor Tech)` vs. `Assigned to Sam Tech` vs. `Unassigned`, removing the mislabel.

The screen also now confirms before a technician changes status or saves a finish review on an appointment assigned to someone else or currently unassigned.

Covered by `field-assignment-display.test.ts`.

**The field job card now carries the identifiers and office feedback a technician needs while working.**

- `JobSummary.workOrderNumber` renders when present.
- Location cards render address line, city, state, and postal code instead of only `addressLine1`.
- Appointment schedules prefer structured `scheduledStartTime` / `scheduledEndTime`, falling back to `timeWindowLabel`.
- Finished appointments show office acknowledgement with reviewer, decision, and review date when `finishedReviewedAt`, `finishedReviewedBy`, and `finishedReviewDecision` are present.
- Appointment cards show whether a local appointment change is queued, conflicted, or rejected.
- Refresh/startup compares the previous cached snapshot with the latest assigned-work response and shows a short "Office changed this work" summary for schedule, assignment, status, new appointment, or removed-from-feed changes.

Covered by `field-appointment-display.test.ts`.

**Conflicted or rejected queue items now have explicit resolution actions.**

The pending queue shows `Retry on next sync` and `Discard local change` only for `conflict` and `rejected` operations. Normal `Sync Now` drains only `pending` operations, which keeps failed items preserved until a technician intentionally retries or discards them. Discard requires confirmation because it removes the local overlay from the device and will not sync to the office.

Covered by `field-queue-resolution.test.ts`.

---

## Display gaps (Milestone 6 punch list — not fixed here)

These are real gaps a technician will notice once dispatch starts driving real-world schedule changes. None of them needed a fix to make the lane safe to land, but they should be on a later field lane's plate.

1. **No explicit route/navigation action from the address.** The full address is visible now, but there is no tap target to hand it to device maps.
2. **No field-side detail drawer.** The screen remains one scrollable operational card, so the new trust signals are readable but not organized into the dashboard/detail pattern described in the screen behavior spec.

---

## Workflow gaps against the Milestone 6 brief

Cross-referenced against `docs/milestone-implementation-plan.md` §11 and `docs/offline-sync.md`:

| Milestone 6 scope item                   | Current state                                                                                                                                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technician home / dashboard              | Partial. The technician workspace is a single scrollable card, not a home/dashboard per `docs/screen-behavior-spec.md` §11.                                                                                                         |
| Assigned jobs for today/tomorrow window  | Present. Backend window enforced; local cache mirrors the snapshot.                                                                                                                                                                 |
| Local cached job/location/equipment data | Present via `expo-sqlite` store.                                                                                                                                                                                                    |
| Notes                                    | Present. Queueable + replay-safe.                                                                                                                                                                                                   |
| Appointment statuses                     | Present. Field side excludes `cancelled`.                                                                                                                                                                                           |
| Register entries                         | Present for field-mobile line creation/edit/void with offline queue replay. Finish review still keeps its separate free-text reminder.                                                                                              |
| Equipment edits                          | Present.                                                                                                                                                                                                                            |
| Estimate drafting foundations            | **Not present.** Estimates are office-only in the current milestone; the field app has no estimate builder yet.                                                                                                                     |
| Photo/video/file queueing                | Present. Expo image/video capture or pick with app-owned local staging, a 50 MB client guard, SHA-256 metadata, upload-intent replay, raw blob finalization, and staged-file cleanup after sync. Manual device smoke still pending. |
| Background sync                          | Present as an in-screen mounted-workspace loop plus active-app regain trigger. No OS-level background fetch.                                                                                                                        |
| Sync Now button                          | Present.                                                                                                                                                                                                                            |
| Pending sync indicator                   | Present (quiet-by-default tone).                                                                                                                                                                                                    |
| Conflict flagging foundations            | Present (conflict/rejected states with provenance).                                                                                                                                                                                 |
| Lost/revoked device behavior             | **Not present** on the field side. No wipe-on-reconnect or sign-out-on-revoke surface.                                                                                                                                              |

---

## Sync invariants worth preserving in future refactors

These are now pinned by tests and should stay true:

- Conflict and rejected ops are kept in the queue with `lastResultMessage`, not deleted.
- Ordinary `Sync Now` replays `pending` operations only; conflict/rejected entries require an explicit retry action before another server attempt.
- Discarding a conflict/rejected queue entry is an explicit destructive action and removes only that one local operation.
- A network failure during `syncNow` leaves the entire queue untouched and only flips tone to alert via `lastSyncError`.
- Merge helpers only mutate cache entries that exist locally — they never invent new cached jobs or equipment from a response.
- Merge helpers strip `syncResult`/`warningMessages`/`history`/replacement links before folding into the snapshot.
- `buildSuccessfulSyncMetadata` always clears `lastSyncError`, so a successful refresh recovers the indicator from alert -> quiet.

---

## Recommended next field lane

1. **Media queueing/capture.** Real Milestone 6 scope, still absent on field-mobile.
2. **Field dashboard/detail split.** Move the single long card toward the documented technician home/detail workflow once the data and sync trust surfaces are stable.
3. **Estimate drafting foundations.** Still absent and should wait until register/media trust is stable.

Each item is small enough to ship as its own lane and none of them require dispatch-model decisions to be settled first.
