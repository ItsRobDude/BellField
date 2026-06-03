# BellField API Endpoint Catalog

This document is a quick map of the current API surface.
The code remains the exact source of truth; update this file when controllers change.

Most endpoints expect:

- `Authorization: Bearer <sessionToken>`
- JSON request bodies unless the endpoint explicitly says raw bytes
- shared request/response shapes from `packages/contracts/src/index.ts`

## Identity

| Method  | Path                              | Surface         | Permission gate                  | Purpose                                                    |
| ------- | --------------------------------- | --------------- | -------------------------------- | ---------------------------------------------------------- |
| `POST`  | `/identity/auth/login`            | office or field | none                             | Create a session for an employee and selected surface.     |
| `GET`   | `/identity/auth/me`               | office or field | active session                   | Return current employee summary and effective permissions. |
| `GET`   | `/identity/roles`                 | office          | `employeesPermissions:view`      | List default role templates.                               |
| `GET`   | `/identity/employees`             | office          | `employeesPermissions:view`      | List employee summaries.                                   |
| `PATCH` | `/identity/employees/:employeeId` | office          | `employeesPermissions:configure` | Update role, active state, or permission overrides.        |

## CRM

| Method  | Path                                                   | Surface | Permission gate    | Purpose                                                                 |
| ------- | ------------------------------------------------------ | ------- | ------------------ | ----------------------------------------------------------------------- |
| `GET`   | `/operations/crm`                                      | office  | `customers:view`   | Load current CRM workspace lists.                                       |
| `GET`   | `/operations/crm/search?q=...`                         | office  | `customers:view`   | Prefix SQL-backed CRM search across customers, locations, and contacts. |
| `GET`   | `/operations/crm/customers/:customerId`                | office  | `customers:view`   | Load customer detail.                                                   |
| `POST`  | `/operations/crm/customers`                            | office  | `customers:create` | Create customer with duplicate confirmation path.                       |
| `PATCH` | `/operations/crm/customers/:customerId`                | office  | `customers:edit`   | Update customer with duplicate confirmation path.                       |
| `GET`   | `/operations/crm/locations/:locationId`                | office  | `locations:view`   | Load location detail.                                                   |
| `POST`  | `/operations/crm/locations`                            | office  | `locations:create` | Create location with missing contact and duplicate confirmation paths.  |
| `PATCH` | `/operations/crm/locations/:locationId`                | office  | `locations:edit`   | Update location with missing contact and duplicate confirmation paths.  |
| `POST`  | `/operations/crm/locations/:locationId/reassign-owner` | office  | `locations:edit`   | Reassign current location owner/customer.                               |
| `GET`   | `/operations/crm/contacts/:contactId`                  | office  | `contacts:view`    | Load contact detail.                                                    |
| `POST`  | `/operations/crm/contacts`                             | office  | `contacts:create`  | Create shared contact.                                                  |
| `PATCH` | `/operations/crm/contacts/:contactId`                  | office  | `contacts:edit`    | Update global contact fields or a linked local override.                |
| `POST`  | `/operations/crm/contact-links`                        | office  | `contacts:edit`    | Link a contact to a customer or location.                               |
| `PATCH` | `/operations/crm/contact-links/:linkId`                | office  | `contacts:edit`    | Update link tags, active state, or end date.                            |

## Jobs, Appointments, Register, and Field Work

| Method  | Path                                                      | Surface         | Permission gate                                       | Purpose                                                                                                            |
| ------- | --------------------------------------------------------- | --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET`   | `/operations/jobs`                                        | office          | `jobs:view`                                           | Legacy broad jobs workspace payload. Prefer focused dispatch/detail/queue endpoints for new office surfaces.       |
| `GET`   | `/operations/jobs/intake-context`                         | office          | `jobs:view`                                           | Load customer/location/technician context for job creation.                                                        |
| `POST`  | `/operations/jobs`                                        | office          | `jobs:create`                                         | Create a job, optionally with the first appointment.                                                               |
| `PATCH` | `/operations/jobs/:jobId/status`                          | office          | `jobs:edit`; `jobs:configure` for reopen              | Change parent job status with warning metadata.                                                                    |
| `POST`  | `/operations/jobs/:jobId/appointments`                    | office          | `appointmentsDispatch:create`                         | Add a follow-up appointment to an open job.                                                                        |
| `POST`  | `/operations/jobs/:jobId/finished-visit-review`           | office          | `jobs:edit`                                           | Acknowledge finished-visit review as kept open. Follow-up scheduling is acknowledged through add-appointment flow. |
| `PATCH` | `/operations/jobs/appointments/:appointmentId`            | office          | `appointmentsDispatch:edit`                           | Update appointment date, start/end time, window label, or technician assignment.                                   |
| `PATCH` | `/operations/jobs/appointments/:appointmentId/status`     | office or field | `appointmentsDispatch:edit`                           | Update appointment status; field finish requires finish review fields.                                             |
| `POST`  | `/operations/jobs/:jobId/notes`                           | office or field | office `jobs:edit`; field `appointmentsDispatch:edit` | Add job note with field replay handling.                                                                           |
| `GET`   | `/operations/jobs/:jobId/register-entries`                | office or field | `register:view`                                       | List register entries, including voided rows.                                                                      |
| `POST`  | `/operations/jobs/:jobId/register-entries`                | office or field | `register:create`                                     | Create register entry.                                                                                             |
| `PATCH` | `/operations/jobs/register-entries/:registerEntryId`      | office or field | `register:edit`                                       | Edit register entry.                                                                                               |
| `POST`  | `/operations/jobs/register-entries/:registerEntryId/void` | office or field | `register:edit`                                       | Soft-void register entry.                                                                                          |
| `GET`   | `/operations/jobs/field/assigned-work`                    | field           | `appointmentsDispatch:view`                           | Load assigned work window for the signed-in technician.                                                            |

## Estimates

Estimates attach to a job and are priced server-side by `@bellfield/estimating`; clients send line inputs only and the API returns the snapshotted totals. Lifecycle is strict: only `pending` estimates can be edited, approved, or declined. Approval/decline does not change job status, create an invoice, or create any other downstream record; it does write a job timeline entry and bump `jobs.updated_at` as an audit trail.

| Method | Path                                                   | Surface | Permission gate     | Purpose                                                                                                                                                                                       |
| ------ | ------------------------------------------------------ | ------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/operations/jobs/:jobId/estimates`                    | office  | `estimates:view`    | List estimates for a job with line items and snapshotted totals.                                                                                                                              |
| `POST` | `/operations/jobs/:jobId/estimates`                    | office  | `estimates:create`  | Create a pending estimate; the server prices it and persists the snapshot.                                                                                                                    |
| `GET`  | `/operations/estimates/:estimateId`                    | office  | `estimates:view`    | Load one estimate with line items and totals.                                                                                                                                                 |
| `PUT`  | `/operations/estimates/:estimateId`                    | office  | `estimates:edit`    | Whole-estimate replacement; allowed only while pending. Re-prices.                                                                                                                            |
| `POST` | `/operations/estimates/:estimateId/approve`            | office  | `estimates:approve` | Approve a pending estimate (immutable afterward).                                                                                                                                             |
| `POST` | `/operations/estimates/:estimateId/decline`            | office  | `estimates:approve` | Decline a pending estimate with an optional reason.                                                                                                                                           |
| `POST` | `/operations/estimates/:estimateId/convert-to-invoice` | office  | `invoices:create`   | Convert an approved estimate's snapshot into the job's invoice draft. Body `{ mode?: 'append' \| 'replace' }`; mode is required when the draft already has active lines. Returns the invoice. |

## Invoices

Every job owns exactly one main invoice draft (created eagerly at job creation, backfilled for existing jobs). Register entries reflect into it automatically; office users can add/edit/void lines; an approved estimate can be converted into it. Posting locks the invoice (gated on `invoices:post`) and atomically freezes a customer/location/job display snapshot; once posted, every mutator (line edits, estimate conversion, register reflection) refuses the invoice — each line/total mutator locks the invoice row `for update` and re-checks `status = 'draft'` in-transaction so a concurrent post cannot be edited around. Posting does not change job status. An adjustment or credit (a separate invoice record, created only after the main is posted) is the correction path — addressed by invoice id. Payments are recorded against a posted invoice as an append-only ledger (they never change invoice totals); amount due is derived. The bookkeeping worklists are a read-only cross-job review surface.

| Method | Path                                          | Surface | Permission gate   | Purpose                                                                                                |
| ------ | --------------------------------------------- | ------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| `GET`  | `/operations/jobs/:jobId/invoice`             | office  | `invoices:view`   | Load the job's main invoice draft with its active line items and totals.                               |
| `POST` | `/operations/jobs/:jobId/invoice/lines`       | office  | `invoices:edit`   | Add a manual line to the draft.                                                                        |
| `PUT`  | `/operations/invoices/lines/:lineId`          | office  | `invoices:edit`   | Edit a draft line (detaches it from its register source).                                              |
| `POST` | `/operations/invoices/lines/:lineId/void`     | office  | `invoices:edit`   | Soft-void a draft line.                                                                                |
| `POST` | `/operations/jobs/:jobId/invoice/post`        | office  | `invoices:post`   | Post (lock) the draft: freezes the customer/location/job snapshot, then blocks further edits. No body. |
| `GET`  | `/operations/jobs/:jobId/invoice/adjustments` | office  | `invoices:view`   | List the job's adjustment/credit correction records (each a full invoice with lines).                  |
| `POST` | `/operations/jobs/:jobId/invoice/adjustments` | office  | `invoices:create` | Create an adjustment or credit against the posted main. Body `{ kind: 'adjustment' \| 'credit' }`.     |
| `GET`  | `/operations/jobs/:jobId/invoice/balance`     | office  | `invoices:view`   | Job money rollup: net billed (posted main + adjustments − credits), `paidTotal`, and `amountDue`.      |
| `GET`  | `/operations/invoices/:invoiceId`             | office  | `invoices:view`   | Load any invoice by id (the main or an adjustment/credit) with its lines and totals.                   |
| `POST` | `/operations/invoices/:invoiceId/lines`       | office  | `invoices:edit`   | Add a manual line to a specific invoice (used for adjustment/credit lines).                            |
| `POST` | `/operations/invoices/:invoiceId/post`        | office  | `invoices:post`   | Post (lock) a specific invoice by id (used for adjustments/credits). No body.                          |
| `GET`  | `/operations/jobs/:jobId/invoice/payments`    | office  | `payments:view`   | List the job's payments across its posted invoices (newest first).                                     |
| `POST` | `/operations/invoices/:invoiceId/payments`    | office  | `payments:create` | Record a payment against a posted invoice. Body `{ amount, method, receivedAt?, reference?, memo? }`.  |
| `POST` | `/operations/payments/:paymentId/void`        | office  | `payments:edit`   | Void a payment (the correction path; payments are never edited in place). Body `{ reason? }`.          |
| `GET`  | `/operations/bookkeeping/invoice-queues`      | office  | `invoices:view`   | Cross-job worklists: ready-to-post, open balances, recently posted (each bounded).                     |

## Inventory, Purchasing, and Job Costing (Milestone 9)

Inventory is an event ledger: on-hand quantity and value are derived from immutable
`inventory_movements`, never stored. Valuation is weighted-average per (item, location);
outbound movements remove the exact proportional value so full depletion leaves no
residual. Purchase orders hold expected cost only and never touch stock or job cost until
they are received: receiving captures actual cost and posts movements (parts) or creates
an equipment asset (the equipment bridge — pendingInstall at a customer location, active
at an inventory location). A PO ends at exactly one destination (inventory location or
customer location), enforced in the database (no-split), and must be ordered before it
can be received.

| Method | Path                                                   | Surface | Permission gate     | Purpose                                                                                                                                                                                                                                                                                                                                                            |
| ------ | ------------------------------------------------------ | ------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/operations/inventory/items`                          | office  | `inventory:view`    | List catalog items (parts and equipment-type items).                                                                                                                                                                                                                                                                                                               |
| `POST` | `/operations/inventory/items`                          | office  | `inventory:create`  | Create a catalog item.                                                                                                                                                                                                                                                                                                                                             |
| `PUT`  | `/operations/inventory/items/:itemId`                  | office  | `inventory:edit`    | Update a catalog item (incl. active state).                                                                                                                                                                                                                                                                                                                        |
| `GET`  | `/operations/inventory/locations`                      | office  | `inventory:view`    | List stock locations (warehouse/truck/other).                                                                                                                                                                                                                                                                                                                      |
| `POST` | `/operations/inventory/locations`                      | office  | `inventory:create`  | Create a stock location.                                                                                                                                                                                                                                                                                                                                           |
| `PUT`  | `/operations/inventory/locations/:locationId`          | office  | `inventory:edit`    | Update a stock location.                                                                                                                                                                                                                                                                                                                                           |
| `GET`  | `/operations/inventory/on-hand`                        | office  | `inventory:view`    | Derived on-hand per (item, location): quantity, weighted-average cost, total value.                                                                                                                                                                                                                                                                                |
| `GET`  | `/operations/inventory/movements?itemId=&jobId=`       | office  | `inventory:view`    | The immutable movement ledger, optionally filtered to an item or job (newest first).                                                                                                                                                                                                                                                                               |
| `POST` | `/operations/inventory/adjustments`                    | office  | `inventory:edit`    | Adjust on-hand (gain/loss). Body `{ itemId, locationId, quantityDelta, unitCost?, note? }`.                                                                                                                                                                                                                                                                        |
| `POST` | `/operations/inventory/transfers`                      | office  | `inventory:edit`    | Move stock between locations. Body `{ itemId, fromLocationId, toLocationId, quantity, note? }`.                                                                                                                                                                                                                                                                    |
| `POST` | `/operations/inventory/issues`                         | office  | `inventory:edit`    | Issue stock from a location to a job (outbound at the location's weighted-average; the value flows to job cost). Body `{ itemId, locationId, jobId, quantity, note? }`.                                                                                                                                                                                            |
| `GET`  | `/operations/purchase-orders`                          | office  | `purchasing:view`   | List purchase-order summaries.                                                                                                                                                                                                                                                                                                                                     |
| `GET`  | `/operations/purchase-orders/:id`                      | office  | `purchasing:view`   | Load a purchase order with its lines.                                                                                                                                                                                                                                                                                                                              |
| `POST` | `/operations/purchase-orders`                          | office  | `purchasing:create` | Create a draft PO (one destination, ≥1 line). Body `{ vendorName, destination*, jobId?, lines[] }`.                                                                                                                                                                                                                                                                |
| `POST` | `/operations/purchase-orders/:id/order`                | office  | `purchasing:edit`   | Transition a draft PO to ordered. No body.                                                                                                                                                                                                                                                                                                                         |
| `POST` | `/operations/purchase-orders/:id/receive`              | office  | `purchasing:edit`   | Receive an ordered PO in full → inventory movements (parts) + equipment assets; equipment received to a job also posts a `receiveToJob` cost movement. Body `{ note?, lines?, confirmMissingSerial? }` (optional per-line actual qty/cost and equipment `serialNumber` captured at receiving; `confirmMissingSerial` to receive an equipment line with no serial). |
| `POST` | `/operations/jobs/:jobId/labor`                        | office  | `jobCosting:create` | Append an immutable labor cost event. Body `{ description, hours, ratePerHour }`; amount is computed server-side as hours × rate, rounded to cents.                                                                                                                                                                                                                |
| `POST` | `/operations/jobs/:jobId/expenses`                     | office  | `jobCosting:create` | Append an immutable expense cost event. Body `{ description, amount }`; material/equipment costs flow through inventory movements instead of this endpoint.                                                                                                                                                                                                        |
| `POST` | `/operations/jobs/:jobId/cost-events/:eventId/reverse` | office  | `jobCosting:edit`   | Correct a labor/expense event by posting its negation (corrections are reversals, never edits/deletes). Body `{ reason? }`. Each event reverses at most once (DB-enforced); a reversal cannot itself be reversed. A finalized snapshot is left frozen.                                                                                                             |
| `GET`  | `/operations/jobs/:jobId/costing`                      | office  | `jobCosting:view`   | Job cost read model: the always-current `live` rollup (inventory receiveToJob/issueToJob + labor + expense), the `finalized` snapshot frozen at completion (`isFinalized` flags whether a current snapshot exists), and `events` (the labor/expense ledger incl. reversals; material detail is in `GET …/inventory/movements?jobId=`).                             |

## Focused Office Work Models

| Method | Path                                                           | Surface | Permission gate             | Purpose                                                                                                           |
| ------ | -------------------------------------------------------------- | ------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/operations/dispatch?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` | office  | `appointmentsDispatch:view` | Dated dispatch read model for appointment timeline cards. Range max is 31 days.                                   |
| `GET`  | `/operations/jobs/:jobId/detail?timelineLimit=N`               | office  | `jobs:view`                 | Focused job detail payload with bounded timeline. Register/media rows depend on `register:view` and `media:view`. |
| `GET`  | `/operations/jobs/queue`                                       | office  | `jobs:view`                 | Paginated job queues for review, waiting on parts, unscheduled, and open work.                                    |

## Equipment

| Method   | Path                                                    | Surface         | Permission gate                             | Purpose                                                              |
| -------- | ------------------------------------------------------- | --------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| `GET`    | `/operations/equipment?includeInactive=true`            | office          | `equipment:view`                            | Equipment workspace list.                                            |
| `GET`    | `/operations/equipment/:equipmentId`                    | office or field | `equipment:view`                            | Equipment detail.                                                    |
| `POST`   | `/operations/equipment`                                 | office or field | `equipment:create`                          | Create equipment; field placement is scoped to assigned locations.   |
| `PATCH`  | `/operations/equipment/:equipmentId`                    | office or field | `equipment:edit`                            | Update equipment; remove/replacement requires `equipment:configure`. |
| `POST`   | `/operations/equipment/:equipmentId/replacement-link`   | office or field | `equipment:edit` plus `equipment:configure` | Link replacement equipment.                                          |
| `DELETE` | `/operations/equipment/:equipmentId?confirmDelete=true` | office          | `equipment:delete`                          | True-delete equipment after explicit confirmation.                   |

## Media

| Method  | Path                                           | Surface               | Permission gate                       | Purpose                                                            |
| ------- | ---------------------------------------------- | --------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| `GET`   | `/operations/jobs/:jobId/media`                | office or field       | `media:view`                          | List media attachment metadata for a job.                          |
| `POST`  | `/operations/jobs/:jobId/media/upload-intents` | office or field       | `media:create`                        | Create/reuse metadata and mint upload token.                       |
| `GET`   | `/operations/media/:mediaId`                   | office or field       | `media:view`                          | Load media metadata.                                               |
| `PATCH` | `/operations/media/:mediaId`                   | office or field       | `media:edit`                          | Edit caption metadata.                                             |
| `POST`  | `/operations/media/:mediaId/void`              | office or field       | `media:edit`                          | Soft-void media metadata.                                          |
| `POST`  | `/operations/media/:mediaId/blob?token=...`    | token                 | signed upload token                   | Upload raw `application/octet-stream` bytes and finalize the blob. |
| `GET`   | `/operations/media/:mediaId/blob?token=...`    | office/field or token | `media:view` or signed download token | Stream stored media bytes.                                         |

## Notes

- Register and media voids preserve history; true media blob deletion is not part of the current endpoint surface.
- Field write endpoints preserve queued offline work using `occurredAt`, `baseUpdatedAt`, and `syncSource` where supported.
- New office UI should prefer the focused dispatch, job detail, and job queue endpoints instead of re-expanding the legacy broad `/operations/jobs` workspace.
