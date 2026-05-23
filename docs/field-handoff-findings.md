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

---

## Bug fixed in this lane

**`technician-workspace-screen.tsx` mislabeled appointments that were not assigned to the current technician.**

The render was `{appointment.technicianName || employee.displayName}`. If `technicianName` was undefined — which can happen for an unassigned appointment under an assigned job, or when the office reassigned to another tech whose name didn't resolve — the screen fell back to the current employee's name, making it look like the appointment belonged to them.

**Fix:** extracted `describeAppointmentAssignment(appointment, currentEmployeeId)` and `isAppointmentAssignedToCurrentTechnician` into `apps/field-mobile/src/modules/operations/field-assignment-display.ts`. Behavior:

- Resolved name → display the name.
- No `technicianId` → "Unassigned".
- `technicianId` matches the current employee but no resolved name → "You".
- `technicianId` set but unresolved → "Another technician".

The screen now reads `Assigned to you (Taylor Tech)` vs. `Assigned to Sam Tech` vs. `Assigned to Unassigned`, removing the mislabel.

Covered by `field-assignment-display.test.ts` (5 cases).

---

## Display gaps (Milestone 6 punch list — not fixed here)

These are real gaps a technician will notice once dispatch starts driving real-world schedule changes. None of them needed a fix to make the lane safe to land, but they should be on the next field lane's plate.

1. **No surface for office acknowledgement of finish review.** Backend writes `finishedReviewedAt`, `finishedReviewedBy`, and `finishedReviewDecision`. The field screen ignores all three. A technician can't see whether the office accepted their finish review or what decision was recorded.
2. **No work-order-number display.** `JobSummary.workOrderNumber` is in the snapshot but never rendered. Crews relying on a printed WO need it.
3. **No diff cue when refresh brings in office changes.** `refreshAssignedWork` quietly replaces state. A technician who had the screen open won't see that the office moved an appointment, reassigned a tech, or advanced a status. A small "Office changed X" callout would close the trust loop.
4. **No per-appointment "queued change" badge.** The sync card is global. If a technician saved a status update offline, the affected appointment card doesn't visibly indicate it's still queued. Pending count is visible only in the global sync summary.
5. **No per-appointment ownership UX cue beyond the new label.** Status buttons remain pressable on appointments not assigned to the current technician. The backend will accept those updates because the job is in the technician's window; it's a foot-gun more than a security issue, but worth a visible cue and probably a confirmation prompt.
6. **Location address shows only `addressLine1`.** City/state/postal are in the snapshot. For mobile context (especially when the tech is driving), the full address belongs on the card.
7. **No retry control for conflicted/rejected queue entries.** Once an item flips to `conflict` or `rejected` it stays in the queue with provenance, but the UI has no "discard" or "resolve" affordance. Today the technician has to sign out (which warns) or live with the alert tone.

---

## Workflow gaps against the Milestone 6 brief

Cross-referenced against `docs/milestone-implementation-plan.md` §11 and `docs/offline-sync.md`:

| Milestone 6 scope item | Current state |
| --- | --- |
| Technician home / dashboard | Partial. The technician workspace is a single scrollable card, not a home/dashboard per `docs/screen-behavior-spec.md` §11. |
| Assigned jobs for today/tomorrow window | Present. Backend window enforced; local cache mirrors the snapshot. |
| Local cached job/location/equipment data | Present via `expo-sqlite` store. |
| Notes | Present. Queueable + replay-safe. |
| Appointment statuses | Present. Field side excludes `cancelled`. |
| Register entries | **Not present.** Finish review captures a single free-text reminder but no line-item register. |
| Equipment edits | Present. |
| Estimate drafting foundations | **Not present.** |
| Photo/video/file queueing | **Not present.** |
| Background sync | Partial. `syncNow` is manual; there is no scheduled auto-sync loop. |
| Sync Now button | Present. |
| Pending sync indicator | Present (quiet-by-default tone). |
| Conflict flagging foundations | Present (conflict/rejected states with provenance). |
| Lost/revoked device behavior | **Not present** on the field side. No wipe-on-reconnect or sign-out-on-revoke surface. |

---

## Sync invariants worth preserving in future refactors

These are now pinned by tests and should stay true:

- Conflict and rejected ops are kept in the queue with `lastResultMessage`, not deleted.
- A network failure during `syncNow` leaves the entire queue untouched and only flips tone to alert via `lastSyncError`.
- Merge helpers only mutate cache entries that exist locally — they never invent new cached jobs or equipment from a response.
- Merge helpers strip `syncResult`/`warningMessages`/`history`/replacement links before folding into the snapshot.
- `buildSuccessfulSyncMetadata` always clears `lastSyncError`, so a successful refresh recovers the indicator from alert → quiet.

---

## Recommended next field lane

1. **Office-side change visibility.** Diff cue on refresh ("Office changed X since you opened this job") plus surfacing of `finishedReviewedDecision` once the office acknowledges.
2. **Per-appointment ownership UX.** Lock or warn status buttons on appointments not assigned to the current technician.
3. **Register / media queueing.** Real Milestone 6 scope, currently absent.
4. **Auto-sync loop.** Quiet background drain so technicians don't have to remember to press Sync Now.

Each item is small enough to ship as its own lane and none of them require dispatch-model decisions to be settled first.
