# Field Register and Media Implementation Plan

Smallest-safe-first implementation brief for the next Milestone 6 slice covering register entries (line items) and media (photos/videos/files) on the BellField field app, with the office-side API surface that consumes them.

This is a brief, not a final spec. The v1 entity shapes are recommended starting points that need product confirmation before the first migration. Office UI is explicitly out of scope here — only API/service contracts.

Audience: the next implementation agent. Read this end-to-end first.

---

## 1. Snapshot of current state

Audit findings as of `88f43c9 Add structured appointment times to dispatch scheduling`.

### Register entries
- No structured register entity exists in `apps/api`, `packages/contracts`, or the field app.
- The only register-adjacent field today is `AppointmentSummary.registerFollowUpNote: string`, captured during finish review. It is a single free-text reminder, not a line-item structure.
- `docs/workflows-and-state-machines.md` §6 and `docs/data-modeling-rules.md` §11 both explicitly call for structured register lines feeding the invoice draft. The current code is behind that spec.

### Media
- Zero presence. No tables, contracts, endpoints, or field-side capture path. `docs/offline-sync.md` §4 and §9 call for queued photo/video/file uploads; the code has none of it.

### Migrations
- No prior register or media migrations. The proposed v1 will require new migrations.

### Permissions
- Existing `PermissionArea` includes `jobs`, `appointmentsDispatch`, `invoices`, but not `register` or `media`. A new area is the cleanest path; a fallback that reuses `jobs:*` is listed under open product questions.

### Doc/code disagreement
- `registerFollowUpNote` (single text field) does not implement what §11 of data-modeling-rules describes (line types: labor, service items, parts, memberships, other). The conservative path is to **keep** `registerFollowUpNote` as-is for v1 — it complements structured register entries as a free-text reminder — and layer structured entries on top. No backwards-incompatible change.

---

## 2. Register: proposed v1 data model

**Status: proposed. Needs product confirmation before migration.**

### Entity: `register_entries`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | primary key |
| `job_id` | uuid (FK → `jobs.id`) | required. Register entries live at the job level so they survive appointment lifecycle changes. |
| `appointment_id` | uuid (FK → `appointments.id`) | optional. Records which visit captured the entry, for history and future invoice attribution. |
| `kind` | enum: `labor`, `serviceItem`, `part`, `membership`, `other` | matches `docs/data-modeling-rules.md` §11. |
| `description` | text | required, ≤500 chars. Human-readable label ("Replace contactor"). |
| `quantity` | numeric(10, 2) | required. Default `1`. |
| `unit_of_measure` | text | optional. e.g. `hr`, `each`, `ft`. |
| `unit_price` | numeric(12, 2) | optional. null for time-only entries when pricing is set elsewhere. |
| `total_amount` | numeric(12, 2) | required, stored (not just derived). Snapshot integrity: the value as captured. |
| `part_number` | text | optional. |
| `inventory_source_label` | text | optional. e.g. `truck`, `warehouse`. Avoids a hard FK to inventory in v1. |
| `captured_by_employee_id` | uuid | required. Who entered the line. |
| `captured_by_name` | text | required. Snapshotted at capture time so historical lines stay readable after employee renames. |
| `captured_at` | timestamptz | required. |
| `is_void` | boolean | default `false`. Soft-archive flag (see §10 below). |
| `void_reason` | text | optional. Set when `is_void = true`. |
| `created_at` | timestamptz | required. |
| `updated_at` | timestamptz | required. |

Indexes:
- `(job_id, captured_at)` — fast read for "all register lines on a job."
- `(appointment_id)` partial where `appointment_id is not null` — read for "what was captured on this visit."

Notes on shape:
- **No FK to invoice draft yet.** When the invoice-draft entity exists (M7), the draft will read register lines via job-id. The register table does not need to know about invoice posting.
- **No status field.** Sync state (pending/conflict/rejected) belongs to the pending operation queue, not the entity. Once a row exists, it just exists.
- **`total_amount` is stored.** Computed in the caller from `quantity × unit_price` when both are set, stored for snapshot integrity so later unit-price drift on a catalog doesn't rewrite historical job costs.

### Companion timeline entry
Register additions/voids should write into `job_timeline_entries` using new `kind` values:
- `registerEntryAdded`
- `registerEntryEdited`
- `registerEntryVoided`

These satisfy the §13 "unified history" rule in data-modeling-rules.

---

## 3. Media: proposed v1 data model

**Status: proposed. Needs product confirmation before migration.**

### Entity: `media_attachments`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | primary key |
| `job_id` | uuid (FK → `jobs.id`) | required. Anchored to the job. |
| `appointment_id` | uuid (FK → `appointments.id`) | optional. Indicates which visit captured the file. |
| `kind` | enum: `image`, `video`, `document` | broad bucket only. Specific MIME lives in `content_type`. |
| `original_filename` | text | required. Preserves what the device called it. |
| `content_type` | text | required. e.g. `image/jpeg`. |
| `byte_size` | bigint | required. |
| `sha256` | char(64) | required. Used for dedupe + integrity verification on upload completion. |
| `storage_path` | text | required. Relative to `BELLFIELD_MEDIA_ROOT`. See §4 below. |
| `uploaded_by_employee_id` | uuid | required. |
| `uploaded_by_name` | text | required. Snapshotted. |
| `captured_at` | timestamptz | required. Device-reported capture timestamp. May be null for non-camera files; treat null as same as `uploaded_at`. |
| `uploaded_at` | timestamptz | required. Server-side receipt time. |
| `caption` | text | optional, ≤500 chars. |
| `is_void` | boolean | default `false`. |
| `created_at` | timestamptz | required. |
| `updated_at` | timestamptz | required. |

Indexes:
- `(job_id, captured_at)` — primary read path.
- `(appointment_id)` partial where not null.
- unique `(job_id, sha256)` to dedupe accidental re-uploads from offline replays.

Notes on shape:
- **No "thumbnail" entity in v1.** Thumbnail generation is a worker task that can land later; the field app can render the device-local file until upload completes, and the office UI can lazy-decode the original for v1.
- **No public URL stored.** Retrieval is permission-checked via a server endpoint (see §4).
- **`sha256` deduplicates offline-replay collisions.** If a technician retries an upload, the server can recognize the same bytes and respond with the existing media id instead of double-storing.

---

## 4. Media storage path (self-hosted-first)

Default BellField posture is filesystem-on-the-office-server. The plan should not require cloud blob storage to function.

### Storage layout
- Configured root: `BELLFIELD_MEDIA_ROOT` env var. Defaults to `<server-data-dir>/media` for Windows-friendly deployment.
- Path scheme: `<root>/<job-id>/<media-id><ext>` where `<ext>` is derived from `content_type`. Predictable, easy to inspect, easy to back up.
- File mode: write-once. Edits create new media rows; old rows void.
- No file in subdirectory deeper than one level. Keeps Windows filesystem behavior boring.

### Upload sequence (online)
1. Field calls `POST /operations/jobs/{jobId}/media/upload-intents` with metadata (kind, contentType, byteSize, sha256, captured_at, caption, appointmentId?). Server returns the media row plus a short-lived signed upload token unless the bytes are already present.
2. Field uploads bytes via `POST /operations/media/{mediaId}/blob` as raw `application/octet-stream` using the signed token. Server writes to `storage_path` and verifies sha256 + byteSize.
3. On success, server finalizes the media row (`uploaded_at` set, `storage_path` confirmed) and returns the canonical `MediaAttachmentSummary`.

If the technician supplies an active `(job_id, sha256)` that already exists, step 1 returns the existing media id and `uploadCompleted: true` — no blob upload needed. Voided media rows are historical and do not block re-attaching the same bytes as a new active row.

### Retrieval
- Office and field call `GET /operations/media/{mediaId}` — returns metadata.
- `GET /operations/media/{mediaId}/blob` — streams the file with `Content-Disposition`. Authenticated office/session access or a signed download token is required.

### Signed token shape
- HMAC-signed string carrying `{ mediaId, exp, scope }`. No external dependency. Signed by a server-side secret env (`BELLFIELD_MEDIA_TOKEN_SECRET`). Token expiry default 5 minutes.

### Future note (not now)
If BellField later offers a managed/cloud deployment, the storage adapter can be pluggable: replace filesystem reads/writes with an S3-style blob client. The DB rows above don't change; only the `storage_path` interpretation does. **Do not** build the adapter abstraction in v1. The filesystem path is enough.

---

## 5. API endpoints — field-mobile

All endpoints require an authenticated session with `surface = 'field-mobile'`. Permission checks per §6.

### Register
- `POST /operations/jobs/{jobId}/register-entries` — create. Request body:
  ```ts
  {
    appointmentId?: string;
    kind: 'labor' | 'serviceItem' | 'part' | 'membership' | 'other';
    description: string;
    quantity: number;
    unitOfMeasure?: string;
    unitPrice?: number;
    totalAmount: number;
    partNumber?: string;
    inventorySourceLabel?: string;
    occurredAt?: string;          // for offline replay
    baseUpdatedAt?: string;       // for conflict detection on the parent job
    syncSource?: 'field-save-queue';
  }
  ```
  Returns `JobMutationResponse` (mirrors existing field write shape) so `mergeJobMutationIntoAssignedWork` can keep doing its job.
- `PATCH /operations/jobs/register-entries/{registerEntryId}` — edit fields. Same replay/conflict shape.
- `POST /operations/jobs/register-entries/{registerEntryId}/void` — void with optional reason. Returns updated job summary.

### Media
- `POST /operations/jobs/{jobId}/media/upload-intents` — see §4.
- `POST /operations/media/{mediaId}/blob` — see §4.
- `PATCH /operations/media/{mediaId}` — caption edits + void.
- `GET /operations/media/{mediaId}` — metadata.
- `GET /operations/media/{mediaId}/blob` — stream bytes (signed token required).

### What flows back to the field
The field assigned-work response should grow to include:
- `registerEntries: RegisterEntrySummary[]` per job
- `mediaAttachments: MediaAttachmentSummary[]` per job

Both should be filtered by the technician's assigned-work window the same way appointments are today. Cached in the existing snapshot.

---

## 6. API endpoints — office-web

Office endpoints reuse the same backend module; only the surface check differs.

- `GET /operations/jobs/{jobId}/register-entries` — list active + voided. Driven by `register:view`.
- `PATCH /operations/jobs/register-entries/{registerEntryId}` — edit. Driven by `register:edit`.
- `POST /operations/jobs/register-entries/{registerEntryId}/void` — same.
- `GET /operations/jobs/{jobId}/media` — list metadata. `jobs:view`.
- `GET /operations/media/{mediaId}` and `/blob` — same as field.
- `PATCH /operations/media/{mediaId}` — caption/void. `jobs:edit` or `media:edit`.

**No office UI is specced here.** When the office UI lane picks up register/media, it will add to the existing job-detail surface — no new top-level routes implied.

**Invoice draft handoff (later, not now).** When the invoice draft entity lands in Milestone 7, the office invoice-draft loader will read register entries by `job_id` and assemble draft lines. This plan does not implement that mapping; it just keeps the register entity shaped so the M7 mapping is straightforward.

---

## 7. Offline-queue behavior — v1 vs online-only

### Offline-queueable in v1
- Register entry creation, edits, and voids. Land in the existing `PendingOperation` queue with new `kind` values:
  - `registerEntryCreate`
  - `registerEntryEdit`
  - `registerEntryVoid`
- Media **metadata** intent (the upload-intent POST). The intent payload includes the local file URI and the device-computed sha256 so the queue can attempt the blob upload when connection returns.

### Online-only in v1
- The actual media **byte upload**. Even when offline-queued, the blob upload step is deferred. The intent reserves a media row server-side with `uploaded_at = null` and `storage_path = null`; the blob upload is what finalizes it. While the intent is reserved but not finalized, the office view can show "Pending upload from {tech}" via metadata only.
- Bulk media operations (no API in v1).
- Posting register entries onto an invoice draft (M7 territory).

### Replay provenance
- All field writes carry `occurredAt`, `baseUpdatedAt` (against the parent job's `updatedAt`), and `syncSource: 'field-save-queue'` to match the existing field-mobile pattern.
- Conflict on a register entry create when the parent job is `cancelled` should follow the same "Field appointment update synced after the job had already been cancelled" sync-flag pattern that already exists.

---

## 8. Permissions

### Recommended new areas
Add to `PermissionArea` in `packages/contracts/src/index.ts`:
- `register` — for register entry CRUD.
- `media` — for media attachment CRUD.

Default role permissions:
| Role | Register | Media |
| --- | --- | --- |
| owner | view/create/edit/delete | view/create/edit/delete |
| admin | view/create/edit/delete | view/create/edit/delete |
| csr | view/create/edit | view |
| dispatcher | view | view |
| bookKeeping | view | view |
| technician | view/create/edit | view/create/edit |

**Technicians explicitly do not get `delete`.** Void via `is_void` is allowed; true delete requires admin/owner. Matches the §14 archive-vs-delete preference in data-modeling-rules.

### Fallback if new areas are rejected
- Register → `jobs:edit` (create/edit), `jobs:configure` (delete).
- Media → `jobs:edit`, `jobs:configure`.
- This is more conservative on the contract but less clear in permission audits later. Recommend `register` / `media` as own areas.

### Authorization gates in service code
- `RegisterEntryService.createEntry` — `getAuthorizedEmployee(sessionToken, 'register:create')` then permission-aware surface checks (field-mobile or office-web).
- `MediaService.createUploadIntent` — `getAuthorizedEmployee(sessionToken, 'media:create')`.
- Reads — `register:view` / `media:view`.
- Edits — `register:edit` / `media:edit`.
- Void — `register:edit` / `media:edit` (void is a soft action).
- True delete — `register:delete` / `media:delete`, with an extra confirmation prompt per §14 data-modeling rules.

---

## 9. History and timeline notes

New `JobTimelineEntry.kind` values to support unified history:
- `registerEntryAdded`
- `registerEntryEdited`
- `registerEntryVoided`
- `mediaAttached`
- `mediaCaptionEdited`
- `mediaVoided`

Messages should be human-readable and snapshot the actor and any voided reason. Examples:
- `Taylor Tech added a Part register entry: "Capacitor 45/5 µF" ($28.50).`
- `Office voided register entry "Diagnostic" (Reason: duplicate).`
- `Taylor Tech attached photo IMG_1043.jpg captured at 2026-05-22T14:12:00Z.`

The unified-history rule (§13 of data-modeling-rules) means these flow through `job_timeline_entries`, not a separate stream.

---

## 10. Archive vs delete behavior

- Default is `is_void = true` (soft archive). Voided rows are filtered out of the active view but visible via "Show voided" toggles where appropriate.
- True delete requires `register:delete` / `media:delete` permission and a confirmation prompt at the UI layer (out of scope here).
- A voided register entry should **not** be silently rewritten by edits. To change something, void the existing row and add a new one. This preserves the §2 historical-snapshot rule.
- Media file blobs on disk should remain until **true** delete. Voided rows keep their files so undo is possible until an admin truly deletes.

---

## 11. Test plan

### Repo / service spec (backend, can land per slice)
- Register entry CRUD writes the expected timeline kinds.
- Voiding a register entry leaves the row in place with `is_void = true` and writes `registerEntryVoided`.
- Cancelled jobs reject new register entries unless the field replay provenance branch already exists for the job (mirror current sync-flag pattern).
- Permission checks: technician can create/edit, cannot delete; bookKeeping can view, cannot create.
- Media upload-intent dedup: same `(job_id, sha256)` returns the existing media id.
- Media blob endpoint enforces signed-token expiry.

### Contract spec
- `RegisterEntrySummary` and `MediaAttachmentSummary` shapes are exported and not re-declared in client API helpers (matches existing architecture check rule).
- `PermissionArea` includes `register` and `media`.

### Field-mobile (pure helpers)
- Pending operation types extended with `registerEntryCreate`, `registerEntryEdit`, `registerEntryVoid`, `mediaUploadIntent`.
- `applyPendingOperations` overlays register entries on the cached snapshot in `occurredAt` order.
- `mergeJobMutationIntoAssignedWork` folds an applied register response without leaking `syncResult`/`warningMessages`.
- The screen renders pending register entries with the same "queued/conflicted/rejected" badges already used for appointment status.

### Office-web
- Job-card captured-work surface lazy-loads register entries and media attachments.
- Office can edit active register entries, edit media captions, void register/media rows, and open uploaded media blobs.
- Pending media uploads render as metadata-only rows until bytes arrive.

---

## 12. Migration boundaries

Recommended sequencing — one migration per slice:

1. **`register_entries` table + `register` permission area.** Smallest first. New table, new permission key, new DTO/contract types. No changes to existing tables. Field + office endpoints created but only register CRUD is wired.
2. **`media_attachments` table + `media` permission area + filesystem storage scaffolding.** Adds the table, the `BELLFIELD_MEDIA_ROOT` config, the upload-intent endpoint, the blob endpoint, and backend tests. No retrieval UI.
3. **Field-mobile queue extension.** Add the new `PendingOperation` kinds, the screen render path, and the offline replay tests. No backend changes.
3a. **Office-web captured-work review.** Add job-card register/media review, edit, void, and media download/open actions. No field camera capture.
4. **Field-mobile media capture.** Wires the field to capture a photo, store the local URI, queue the intent, and finalize the blob upload on Sync Now. (This step may need a new field-mobile dep for camera access; flag it for product approval first per the no-new-deps rule.)

**Hard boundaries within this plan:**
- No changes to the `appointments` table for register/media.
- No change to `AppointmentSummary.registerFollowUpNote`. It stays as a complementary text reminder.
- No invoice-draft entity. The register table is shaped so M7 can read it without schema changes.
- No estimate-builder work.
- No new dependencies in slices 1–3. Slice 4 may need one (camera) and should pause for approval.

---

## 13. Open product questions

Inline-tagged above, summarized here. Slice 1 answered the first three as implementation assumptions; the remaining media/UX questions still need confirmation before their slices.

1. **Are `labor`, `serviceItem`, `part`, `membership`, `other` the right v1 kinds?** Slice 1 uses these values only. `discount`, `fee`, and `tax` remain later additions.
2. **Should `unit_price` and `total_amount` allow negative values?** Slice 1 keeps money fields nonnegative. Discounts/corrections need a later explicit model.
3. **Is `register` (and `media`) a justified new `PermissionArea`, or should we reuse `jobs:edit` / `jobs:configure`?** Slices 1-2 add dedicated `register` and `media` areas.
4. **Should technicians be able to edit any register entry on the job, or only the ones they captured?** This plan assumes "any entry on a job they're assigned to" mirroring current note/equipment-edit behavior. Tighter is possible.
5. **What is the max byte size for an uploaded media file?** Implemented default is 50 MB via `BELLFIELD_MEDIA_MAX_BYTES`. Larger video uploads can wait for chunked-upload support post-v1.
6. **Should a voided media row delete the blob file from disk?** Implemented behavior keeps the file; true delete remains a later dangerous action.
7. **Camera/file-picker library for slice 4.** No new dep without product approval. Recommendation: `expo-image-picker` since the field app is already Expo-based, but defer to slice 4.
8. **Should `registerFollowUpNote` (the existing free-text reminder on the appointment) eventually be replaced by structured register entries?** Recommendation: no. They serve different purposes — `registerFollowUpNote` is a "remind office to look at X" note, structured register entries are billable line items. Confirm to keep both.

---

## 14. Later phases (not now)

- Register-line drag-and-drop reordering, bulk operations, pricing catalogs.
- Media thumbnails and EXIF stripping (worker task).
- Invoice draft integration (M7 lane).
- Discount/fee/tax kinds if not in v1.
- Voided-undo affordance UX.
- Lost/revoked device wipe of locally-staged media bytes (touches the broader device-revoke work that's still absent on the field side).
- Cloud blob storage adapter for hosted BellField deployments. Filesystem is sufficient until then.

---

## 15. Doc/code disagreement summary

Captured for traceability:

- **`docs/data-modeling-rules.md` §11 + `docs/workflows-and-state-machines.md` §6** call for structured register lines feeding invoice draft. Slice 1 now provides backend register entries without removing `registerFollowUpNote`; invoice-draft reflection still waits for the invoice-draft entity.
- **`docs/offline-sync.md` §4 and §9** call for queued photo/video/file uploads. Backend metadata/blob storage is now present; field-mobile camera capture and blob replay remain the open field slice.
- No other doc/code disagreements found in this audit.

---

## 16. Files Codex's queue-resolution lane will likely touch (DO NOT EDIT FROM THIS LANE)

For coordination only — the next implementation slice will need to extend these once Codex's lane lands. **Do not** modify them while his queue-resolution lane is in flight:

- `apps/field-mobile/src/modules/operations/technician-workspace-screen.tsx`
- `apps/field-mobile/src/modules/operations/field-sync-store.ts`
- `apps/field-mobile/src/modules/operations/field-sync-types.ts`
- `apps/field-mobile/src/modules/operations/field-pending-replay.ts`
- `apps/field-mobile/src/modules/operations/__tests__/*`

The pending-operation queue extensions in §7 will need additions to `field-sync-types.ts` and `field-pending-replay.ts` once Codex's queue-resolution work lands. Coordinate before opening the next slice.

---

## 17. Implementation order checklist

Recommended smallest-safe-first order, one PR per item:

- [ ] Confirm open questions §13 with Rob.
- [x] Slice 1 — `register_entries` migration + contracts + service + tests. No client changes yet.
- [x] Slice 2 — `media_attachments` migration + storage scaffolding + intent/blob endpoints + tests. Filesystem only, no UI.
- [x] Slice 3 — Field-mobile pending-operation extensions (register only). Test against the existing field harness. No media yet.
- [x] Slice 3a — Office-web captured-work review surface. No media capture yet.
- [ ] Slice 4 — Field-mobile media capture. Pause for product approval on the camera library dependency before opening.
- [ ] Slice 5 — Office-web deeper invoice/register handoff after invoice drafts exist.

Each slice should run `pnpm --filter @bellfield/api test`, `pnpm check:architecture`, and the touched-app's lint + test. Migrations land with tracked up/down per `docs/database-migrations.md`.
