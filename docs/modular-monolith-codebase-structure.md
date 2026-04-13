# Field-Service Platform - Modular Monolith Codebase Structure

This document defines the implementation-facing repository and module structure for the BellField field-service platform.

## 1) Repo Layout

```text
BellField/
|-- apps/
|   |-- office-web/                 # Desktop-first web app for CSR/dispatch/manager/accounting/admin
|   |-- field-mobile/               # Mobile app for technicians (offline-first)
|   |-- api/                        # Modular monolith backend (HTTP + background consumers)
|   |-- worker/                     # Async/background jobs
|   `-- realtime-gateway/           # WebSocket/SSE fanout (thin adapter, no business writes)
|
|-- packages/
|   |-- contracts/                  # API DTOs, event contracts, typed clients
|   |-- validation/                 # Shared validators/schemas
|   |-- workflow/                   # Shared workflow/state-machine primitives
|   |-- ui-office/                  # Office design system/components
|   |-- ui-mobile/                  # Mobile design system/components
|   |-- auth-kit/                   # Auth helpers, permission checks
|   |-- sync-kit/                   # Offline sync primitives (op-log envelopes, conflict metadata)
|   |-- realtime-contracts/         # Channel names + payload contracts
|   `-- utils/                      # Cross-cutting utilities (pure, no domain behavior)
|
|-- services/
|   `-- notifications-adapter/      # SMS/Email push adapter wrappers (provider-agnostic)
|
|-- infrastructure/
|   |-- db/
|   |   |-- migrations/
|   |   |-- seed/
|   |   `-- views/
|   |-- storage/                    # File storage config (S3/Azure/GCS abstraction)
|   |-- queues/                     # Queue topics, retry/backoff policy
|   |-- observability/              # Logging, metrics, tracing setup
|   `-- deploy/                     # IaC/runtime deployment manifests
|
|-- docs/
|   |-- product-shape-plan.md
|   `-- modular-monolith-codebase-structure.md
|
`-- tools/
    |-- scripts/
    `-- codegen/
```

---

## 2) Apps and Shared Packages

### apps/office-web
- Dense desktop UX.
- Reads/writes only through `apps/api`.
- Uses `packages/contracts`, `packages/ui-office`, `packages/auth-kit`, `packages/realtime-contracts`.

### apps/field-mobile
- Offline-first technician workflow.
- Local operation log + background sync.
- Uses `packages/contracts`, `packages/ui-mobile`, `packages/sync-kit`, `packages/auth-kit`.

### apps/api
- Single modular backend process.
- Hosts HTTP APIs and orchestrates module use cases.
- Publishes domain events to internal bus/outbox.

### apps/worker
- Executes async tasks (PDF generation, notifications, image processing, retries).
- Consumes domain events/outbox and queue messages.

### apps/realtime-gateway
- Subscribes to approved backend event streams and pushes UI-safe updates via WS/SSE.
- Never writes business entities directly.

### Shared package usage rules
- `contracts` can be imported by all apps.
- `validation` can be imported by apps and packages but contains no side effects.
- Domain logic must **not** be implemented in shared UI/util packages.

---

## 3) Backend Modules (inside `apps/api/src/modules`)

```text
apps/api/src/modules/
|-- identity-access/
|-- crm/
|-- locations/
|-- contacts/
|-- equipment/
|-- operations/         # jobs + appointments + dispatch state transitions
|-- estimates/          # service + replacement templates
|-- billing/            # invoices + payments
|-- inventory/          # stock and truck/vehicle inventory
|-- purchasing/         # POs + receiving
|-- job-costing/
|-- files/
|-- notifications/
|-- audit/
|-- reporting/
`-- sync/               # mobile sync API, version vectors/tokens, conflict resolution
```

Each module contains:
```text
<module>/
|-- domain/             # entities, value objects, domain services, invariants
|-- application/        # use cases/commands/queries
|-- infrastructure/     # repositories/adapters for this module only
|-- api/                # route handlers/controllers/mappers
|-- events/             # domain event definitions + handlers
`-- tests/
```

---

## 4) Ownership Boundaries Between Modules

### Ownership map
- `identity-access`: users, roles, permissions.
- `crm`: bill-to account master.
- `locations`: service location master and lifecycle.
- `contacts`: contact persons + effective-date history.
- `equipment`: equipment master and equipment lifecycle.
- `operations`: jobs, appointments, dispatch assignment/status.
- `estimates`: service/replacement estimates and template instantiation.
- `billing`: invoices, payments, immutable financial posting.
- `inventory`: stock levels and movements by warehouse/truck.
- `purchasing`: PO lifecycle and receiving.
- `job-costing`: cost ledgers/rollups tied to jobs.
- `files`: attachment metadata + linking.
- `notifications`: outbound comm intent and delivery state.
- `audit`: append-only change history.
- `sync`: mobile sync cursors/op application/conflict handling.

### Boundary rule (hard)
A module may write only its own aggregate roots/tables. Cross-module changes happen via:
1) explicit public application service call, or
2) domain event + handler.

---

## 5) Interaction Architecture

## 5.1 Office web -> Backend
- Office web calls REST/GraphQL endpoints in `apps/api`.
- Reads frequently via query endpoints optimized for dense grids.
- Real-time board/timeline updates via `realtime-gateway` channels.

## 5.2 Field mobile -> Backend
- Pull sync packs by cursor/version token.
- Push offline op-log batches to `sync` module.
- Server returns accepted/rejected ops + conflict details.

## 5.3 Backend -> Database
- Single PostgreSQL instance.
- Separate schema namespace per module (or strict table prefixes) to make ownership explicit.
- Cross-module reporting uses read models/materialized views, not cross-module writes.

## 5.4 Backend -> File storage
- Files module issues pre-signed upload URLs.
- Clients upload directly to storage.
- Backend stores metadata + attachment links and emits `AttachmentStored`.

## 5.5 Backend -> Notifications
- Domain events create notification intents.
- Worker processes intents via provider adapters (SMS/email/push).
- Delivery results recorded asynchronously.

## 5.6 Backend -> Real-time updates
- Modules publish domain events to outbox.
- Realtime gateway consumes curated event stream and fans out UI payloads.
- UI payload contracts live in `packages/realtime-contracts`.

---

## 6) Key Domain Events

- `AccountCreated`
- `BillToLinkedToLocation`
- `LocationOwnershipChanged`
- `LocationContactChanged`
- `EquipmentAdded`
- `EquipmentUpdated`
- `EquipmentReplaced`
- `JobCreated`
- `AppointmentScheduled`
- `AppointmentReassigned`
- `TechnicianStatusChanged`
- `JobStatusChanged`
- `EstimateCreated`
- `EstimateApproved`
- `InvoicePosted`
- `PaymentRecorded`
- `InventoryIssuedToJob`
- `InventoryAdjusted`
- `POCreated`
- `POReceived`
- `AttachmentStored`
- `AuditEntryCreated`
- `SyncBatchApplied`
- `SyncConflictDetected`

Event publishing rules:
- Published only after local transaction commit (outbox pattern).
- Event payloads include immutable IDs + version/timestamp metadata.
- Consumers must be idempotent.

---

## 7) Rules for Preventing Tight Coupling

1. **No direct repository access across modules.**
   - Use application services or events only.

2. **No shared mutable domain objects in `packages/`.**
   - Shared packages contain contracts/validation/utilities only.

3. **Stable contracts first.**
   - API DTOs and event schemas versioned in `packages/contracts`.

4. **Outbox + idempotent consumers mandatory.**
   - Prevent hidden runtime coupling and duplicate side effects.

5. **Read models for composition.**
   - Complex office screens compose data via query/read-model layer, not cross-module writes.

6. **Sync module owns conflict policy.**
   - Field/mobile clients do not implement business conflict decisions.

7. **Financial immutability.**
   - Posted invoices/payments are append-only; adjustments use explicit corrective entries.

8. **Audit everywhere.**
   - Mutations produce audit records with actor, source, and correlation IDs.

9. **Enforced dependency direction.**
   - Domain -> application -> infrastructure/api only (never reverse).

10. **Module fitness tests in CI.**
    - Automated import/dependency checks fail build on illegal cross-module references.
