# Field-Service Platform — Product Shape (Pre-Schema)

> Status: historical planning context.
> This document is not BellField's primary source of truth.
> Prefer `product-rules.md`, `screen-behavior-spec.md`, `workflows-and-state-machines.md`, `offline-sync.md`, `milestone-implementation-plan.md`, and `../README.md` for current guidance.

This document defines the product shape before database schema design.

BellField is intended to serve service industries broadly, not HVAC alone.
HVAC remains a strong early reference case in this document because it is a practical starting point for equipment, dispatch, and field workflow design.

## A) Major Product Surfaces

### 1) Office Web App (desktop-first web)
Primary users: CSR, dispatcher, service manager, accounting, admin.

Principles:
- Dense information layout (table + side panel + keyboard shortcuts).
- Fast search-first workflows.
- Multi-tab multitasking and “sticky” context (current customer/location/job).
- Strong auditability and role-sensitive controls.

### 2) Field Mobile App (native-first behavior)
Primary users: service technicians.

Principles:
- Offline-first local cache with queue-based sync.
- Big touch targets and quick action flow.
- Camera/signature support and fast attachment upload with retry.
- “Today-first” UX with minimal navigation depth.

### 3) Shared Backend + Shared PostgreSQL
- Single modular backend (modular monolith) and one PostgreSQL database.
- Backend owns business rules; clients never bypass it.
- Internal module events for decoupling.

---

## B) User Roles and Who Does What

### CSR
- Create/update customer (bill-to) accounts.
- Manage service locations and contacts.
- Intake calls and create jobs.
- Book first-pass appointments.
- Send service/replacement estimates for approval.

### Dispatcher
- Own daily dispatch board.
- Assign/reassign appointments.
- Route optimization and emergency insertion.
- Monitor technician status and SLA risk.

### Service Manager
- Oversee work quality, callbacks, estimate conversion.
- Approve replacement estimates over threshold.
- Manage technician skills/certifications matrix.
- Review job costing and operational KPIs.

### Accounting
- Post invoices and collect/apply payments.
- Manage PO-to-bill reconciliation (later AP integration).
- Handle credits/adjustments and aging follow-up.

### Admin
- User/role/permission administration.
- Global settings: statuses, templates, numbering rules.
- Branch configuration (enabled later by feature flags).
- Audit and compliance oversight.

### Technician (Field)
- Execute assigned appointments/jobs.
- Update statuses and timestamps.
- Capture notes, photos, forms, signatures.
- Edit/add equipment at location when discovered in field.
- Create service or replacement estimates and collect payment when enabled.

---

## C) Office Web Screen Map

### Global shell
- Top bar: universal search, create (+), notifications, user/branch selector.
- Left nav (module): Dashboard, Customers, Locations, Jobs, Dispatch, Estimates, Invoices, Payments, Purchasing, Inventory, Reports, Settings.

### Dashboard
- KPI cards (today jobs, overdue invoices, estimate pipeline).
- Alerts feed (unassigned calls, missed appointments, low truck stock).
- Quick actions.

### Customers (Bill-to Accounts)
- List/grid with filters (status, credit hold, AR aging segment).
- Account detail tabs:
  - Overview
  - Locations
  - Contacts (with effective date timeline)
  - Financials (invoices/payments)
  - Documents
  - Audit

### Locations (Service Properties)
- List/map split view.
- Location detail tabs:
  - Overview (owner/tenant snapshot, access notes)
  - Contacts timeline (historical + current)
  - Equipment (editable grid)
  - Service History
  - Open Jobs/Appointments
  - Attachments/Photos
  - Audit

### Jobs
- Job inbox list (new/triage/in-progress/waiting/closed).
- Job detail:
  - Header (status, priority, SLA, linked account/location)
  - Problem description + internal notes
  - Appointments tab
  - Equipment involved
  - Estimates linked
  - Costing snapshot
  - Activity timeline

### Dispatch
- Dedicated board (detailed in section E).

### Estimates
- Service estimates queue.
- Replacement estimates queue + template library.
- Approval workflow and conversion actions.

### Invoices & Payments
- Invoice workbench: draft/review/post.
- Payments console: capture/apply/refund.
- Customer AR aging and statements.

### Purchasing & Inventory
- PO list/detail/receiving.
- Inventory by location (warehouse + trucks).
- Stock movements and adjustments.

### Reports
- Operational, financial, and technician performance.
- Export center.

### Settings/Admin
- Users/roles/permissions.
- Status dictionaries, estimate templates, tax rules, numbering.
- Branch settings (feature-hidden initially).

---

## D) Field Mobile Screen Map

### Login + Sync bootstrap
- Auth, device registration, initial sync pack.

### Today
- Chronological appointment list with status chips.
- Quick filters: My open / overdue / emergency.

### Appointment Detail
- Customer/location header and tap-to-call.
- Checklist and required fields by job type.
- Actions: Start travel, Arrive, Start work, Pause, Complete.

### Job Workspace (single-scroll task flow)
- Problem & diagnostics.
- Labor/material entries.
- Equipment section (view/edit/add).
- Photos/attachments.
- Recommendations + estimate creation.
- Signature/payment handoff.

### Location & Equipment
- Location info (access, safety notes, contacts).
- Equipment list at site with quick filters.
- Equipment detail with service history and parts used.

### Estimate Builder (mobile)
- Prebuilt replacement templates.
- Optional add-ons and pricing preview.
- Customer approval capture (onscreen signature/email send).

### Invoice/Payment Handoff
- Invoice preview.
- Payment capture methods (card/check/cash as configured).
- Receipt delivery option.

### Offline Queue / Sync Center
- Pending actions list, retry controls, conflict notices.

---

## E) Exact Dispatch Board Layout

### Layout structure (desktop, 3-pane)
1. **Left pane (20%) — Unscheduled / Incoming Queue**
   - New jobs (card list).
   - SLA breach countdown.
   - Filters: priority, trade, zone, customer tier.

2. **Center pane (55%) — Time Grid**
   - Columns = technicians (or crews).
   - Rows = time slots (15-min granularity, 24h window).
   - Appointment cards with color by status:
     - Gray = scheduled
     - Blue = en route
     - Green = on-site
     - Purple = paused
     - Red = at risk/late
   - Drag/drop to assign, resize for duration, split jobs when allowed.

3. **Right pane (25%) — Details + Constraints**
   - Selected job/appointment details.
   - Required skill/cert checks.
   - Travel estimate and route hints.
   - Conflict warnings (overlap, overtime, parts unavailable).

### Board controls (top row)
- Date selector (day/week).
- Branch selector (single now, multi later).
- Auto-assign suggestion button.
- Toggle: technician columns vs zone columns.
- Live mode indicator + last sync timestamp.

### Must-have interactions
- One-click “dispatch next best tech”.
- Bulk reassign when technician unavailable.
- Soft-lock for in-progress appointments (requires override role).
- Instant technician notification on assignment changes.

---

## F) Equipment Editing from Location Page and Field App

### Core behavior
- Equipment is a first-class entity linked to location.
- Editable from both office location page and mobile job workspace.
- Every equipment change writes audit event with actor/time/source (office/mobile/API).

### Office location page editing
- Equipment tab uses dense editable grid:
  - columns: type, make, model, serial, install date, status, warranty, last service.
- Inline quick edit for non-critical fields.
- “Open detail drawer” for full edit.
- Bulk actions (status update, assign tag, export list).
- Add equipment wizard supports template defaults by equipment type.

### Field app editing
- Lightweight “Add/Update Equipment” flow optimized for speed:
  - scan/enter serial
  - pick type
  - add condition + photo
  - optional equipment label or nameplate OCR assist (future enhancement)
- Can update runtime-critical fields offline (condition, notes, photo, observed serial/model).
- Sensitive fields (pricing-linked warranty overrides) may require manager approval after sync.

### Historical correctness rules
- Jobs and invoices store immutable snapshots of “equipment at time of service”.
- Later edits to equipment master record do not rewrite closed historical transactions.
- If equipment replaced, old unit status becomes retired/replaced with replacement linkage.

---

## G) Module Boundaries and How Modules Interact

### Bounded modules
1. Identity & Access
2. CRM (bill-to accounts, contacts)
3. Locations
4. Equipment
5. Operations (jobs, appointments, dispatch)
6. Estimates (service + replacement + templates)
7. Billing (invoices/payments)
8. Inventory
9. Purchasing
10. Job Costing
11. Files/Attachments
12. Audit
13. Reporting

### Interaction rules
- Module owns its own writes; others consume via API/query models/events.
- No cross-module direct table mutation.
- Cross-module coordination via domain events and idempotent handlers.

### Critical event flows
- JobCreated → Dispatch queue + CSR confirmation.
- AppointmentAssigned → Technician notification + mobile sync priority bump.
- EquipmentUpdated → Location timeline + operations context refresh.
- EstimateApproved → convert-to-job or convert-to-invoice path.
- InventoryIssuedToJob → Job Costing update.
- InvoicePosted → AR update and immutable financial snapshot.
- PaymentRecorded → Invoice balance update + receipt artifact.

---

## H) What Must Be Real-Time vs Offline Sync

### Real-time required
- Dispatch board assignments/reassignments.
- Technician status (en route/on-site/completed).
- SLA risk indicators and overdue alerts.
- Office-side queue updates (new call intake, emergency jobs).

### Offline-capable with eventual sync
- Field notes, photos, attachments metadata.
- Job checklist progress.
- Equipment edits from field.
- Labor/material line capture.
- Signatures and customer acknowledgments.
- Payment intents (with guarded completion rules depending on gateway capability).

### Sync strategy
- Local operation log on mobile with ordered replay.
- Server-issued version tokens for conflict detection.
- Conflict policy:
  - append-only entities (notes/photos): merge
  - mutable scalar fields: role + recency rule, flag exceptions
  - locked financial objects: reject and require office resolution

---

## I) 12-Month Roadmap with Monthly Milestones and Working Demos

### Month 1 — Product foundation
- Finalize UX flows, role matrix, module contracts, event taxonomy.
- Demo: clickable office + mobile prototypes with end-to-end happy path.

### Month 2 — Identity + core CRM
- Auth, users/roles/permissions; bill-to accounts + locations + contacts timeline.
- Demo: create account, link multiple locations, update contact timeline.

### Month 3 — Jobs intake + appointments basics
- CSR intake, job lifecycle states, appointment creation.
- Demo: call intake to scheduled appointment.

### Month 4 — Dispatch board v1
- Time-grid board, drag/drop assignment, technician status feed.
- Demo: dispatch/reassign with live board updates.

### Month 5 — Field app v1 (offline core)
- Today list, appointment detail, status updates, local sync queue.
- Demo: complete appointment offline then sync successfully.

### Month 6 — Equipment + service history
- Equipment registry, edit from location page + field app, history timelines.
- Demo: tech adds equipment on-site; office sees synced record + audit trail.

### Month 7 — Estimates (service + replacement templates)
- Estimate builder, template application, approval capture.
- Demo: build replacement estimate from template and convert on approval.

### Month 8 — Billing and payments v1
- Invoice generation from completed jobs, payment posting, receipts.
- Demo: complete job → post invoice → apply payment.

### Month 9 — Inventory + truck stock
- Inventory locations including technician vehicles; issue/return transactions.
- Demo: reserve part, issue to job, truck stock decrement.

### Month 10 — Purchasing + receiving
- PO lifecycle and receiving into inventory.
- Demo: create PO, receive partial shipment, update stock.

### Month 11 — Job costing + reporting
- Cost rollups (labor/material/purchase impacts), KPI dashboards.
- Demo: job margin report and technician productivity board.

### Month 12 — Hardening + branch-ready architecture
- Performance tuning, permission hardening, branch dimension feature flag.
- Demo: pilot-ready release candidate with branch-aware test scenario.

---

## J) What to Postpone Until Later

- Full multi-branch operational routing (design now, activate later).
- Advanced optimization/AI dispatch.
- Customer self-service portal.
- Deep accounting ERP integrations (keep export/import first).
- IoT/telematics automatic equipment diagnostics.
- Dynamic pricing engine and complex contract billing.
- OCR/equipment-label automation and computer-vision enhancements.
- Native tablet-specific UX refinements beyond core responsive support.

---

## Architecture Guardrails (Non-Negotiables)
- Preserve historical correctness via snapshots for jobs/invoices.
- Maintain timeline/effective dating for ownership/tenant/contact changes.
- Keep office UX dense and keyboard-friendly.
- Keep field workflows resilient under poor connectivity.
- Enforce modular boundaries to avoid spaghetti coupling.
