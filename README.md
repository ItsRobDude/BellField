# BellField — HVAC Field-Service Platform

BellField is an internal HVAC field-service management platform designed for a single company first, with a clean path to multi-branch support later.

The product is intended to cover the operational core of a field-service business, including:

- customer accounts / bill-to entities
- service locations / properties
- changing contacts and occupants over time
- equipment and unit tracking at each location
- service history by location and equipment
- jobs and appointments
- dispatch board / daily scheduling
- service and replacement estimates
- invoices and payments
- purchase orders and inventory
- technician vehicle inventory
- job costing
- notes, photos, attachments, and audit history
- role-based office and field workflows

The system is being planned as a maintainable, expandable product rather than a quick one-off app.

---

## Product Shape

The platform should be built as three connected surfaces:

### 1. Office App
A desktop-focused web application used by:

- CSR
- dispatch
- service manager
- accounting
- admin / office staff

This app handles dense operational workflows, scheduling, location/account management, financial processing, and reporting.

### 2. Field App
A mobile application used by technicians in the field.

This app must support:

- assigned job access
- status updates
- notes and photos
- equipment inspection and editing
- estimate creation
- signature capture
- invoice/payment handoff
- weak signal and offline tolerance

### 3. Shared Backend
A single backend should own all business logic and act as the single source of truth for both the office app and field app.

The office app and field app do not communicate directly with each other. Both communicate only with the backend.

---

## Architecture Approach

The platform should start as a **modular monolith**.

This means:

- one backend
- one PostgreSQL database
- clearly separated internal modules
- strict ownership boundaries
- shared domain events for cross-module communication

### Why this approach
This provides:

- simpler development and deployment
- easier reporting and transaction integrity
- fewer synchronization headaches
- easier long-term maintenance
- room to expand later without early microservice complexity

Microservices should not be used at the beginning.

---

## Recommended Technology Stack

### Frontend
- **Office app:** Next.js
- **Field app:** React Native with Expo

### Backend
- **API:** NestJS
- **Worker / background jobs:** Node-based worker service

### Data / Infrastructure
- **Database:** PostgreSQL
- **Realtime / cache / pub-sub:** Redis
- **File storage:** S3-compatible object storage
- **Mobile local storage:** SQLite
- **Shared validation / contracts:** TypeScript shared packages

### Reasoning
This keeps the stack mostly TypeScript across the product, which improves:

- consistency
- speed of development
- shared validation
- easier code reuse
- easier AI-assisted implementation

---

## Core Design Principles

1. **Separate bill-to accounts from service locations**
   - the payer is not always the service address
   - one account may be linked to many properties

2. **Treat contacts as changeable**
   - people move
   - tenants change
   - occupants change
   - old people and old roles must remain in history

3. **Treat locations as long-lived**
   - the property remains even when ownership or occupancy changes

4. **Treat equipment as editable but historically traceable**
   - units can be updated from the location page and field app
   - old units should not simply disappear
   - inactive / replaced / removed equipment should remain in history

5. **Preserve historical accuracy**
   - completed jobs and posted invoices must remain historically correct even if ownership, contacts, or account relationships change later

6. **Support field connectivity problems**
   - the field app must tolerate weak or intermittent signal
   - mobile changes must sync safely when connection returns

7. **Optimize for office speed**
   - the office app should be dense, practical, and fast
   - it should not feel like a stretched mobile app

8. **Build for extension**
   - avoid spaghetti coupling
   - use clear module ownership
   - keep future branch support in mind

---

## Product Surfaces and Users

### Office Users
Primary office users include:

- CSR
- dispatcher
- service manager
- accounting
- admin / leadership

### Field Users
Primary field users include:

- service technicians
- install technicians later if needed

---

## Office App — Main Product Areas

The office application should include the following major navigation areas:

- Dashboard
- Search
- Accounts
- Locations
- Jobs
- Dispatch
- Estimates
- Invoices
- Inventory
- Purchasing
- Reports
- Settings

### Key Office Priorities
The office app must support:

- fast search and account lookup
- quick location history review
- dense scheduling workflows
- equipment editing from the location page
- service history access from jobs and locations
- estimate and invoice workflows
- operational visibility across technicians

---

## Field App — Main Product Areas

The field app should focus on technician execution and speed.

### Primary navigation
- Today
- Jobs
- Estimates
- Inventory
- More

### Technician priorities
The field app must support:

- assigned appointments
- status changes
- notes and photos
- location and contact access
- equipment review and editing
- service history review
- estimate creation
- customer approval and signature
- invoice/payment handoff
- offline-safe local work

---

## Core Screen Map — Office App

### Dashboard
A role-based operational overview for office users.

### Search
Global search across:
- accounts
- locations
- contacts
- jobs
- equipment
- invoices

### Accounts
Used to manage bill-to entities.

Expected content:
- account overview
- billing details
- linked locations
- linked contacts
- account notes
- account activity

### Locations
A central operational hub for each service property.

### Jobs
Operational work records.

### Dispatch
The daily / weekly dispatch board.

### Estimates
Estimate list, status, approvals, and templates.

### Invoices
Invoice list, invoice detail, payments, and balances.

### Inventory
Item catalog, stock by location, technician vehicle inventory.

### Purchasing
Purchase orders and receiving.

### Reports
Operational, service, costing, and financial reports.

### Settings
User, permission, branch, and application settings.

---

## Core Screen Map — Location Page

The location page should be one of the most important hubs in the system.

### Recommended tabs
- Overview
- Contacts
- Billing / ownership history
- Equipment
- Service history
- Jobs
- Invoices
- Estimates
- Files
- Notes

### Why this matters
The location is where service actually happens, so office staff and technicians both need reliable, centralized visibility there.

---

## Equipment Management

Equipment must be manageable from both:

- the location page in the office app
- the field mobile app

### Equipment requirements
Each equipment record should support, at minimum:

- equipment type
- make
- model
- serial number
- filter sizes
- equipment location description
- install date
- status
- notes
- photos / documents
- HVAC-specific details that may expand over time

### Editing rules
Equipment should support:

- add new equipment
- update existing equipment
- mark inactive / removed / replaced
- keep service history tied to the proper unit
- preserve old equipment for historical reference

Equipment should not be hard-deleted in normal workflow.

---

## Dispatch Board / Daily Schedule

The dispatch board should be a major centerpiece of the office app.

### Recommended layout

#### Left panel
**Unscheduled / unassigned jobs queue**

Show:
- job number
- customer / location
- job type
- promised date
- priority
- job tags such as no-cool, PM, callback, etc.

#### Center panel
**Main time grid**

- rows = technicians
- horizontal axis = time of day
- appointment cards displayed on each technician timeline
- drag and drop rescheduling and reassignment

Should show:
- technician name
- truck
- current status
- skill tags
- branch later

Should warn about:
- overlaps
- travel conflicts
- skill mismatch
- after-hours issues

#### Right panel
**Selected job / appointment detail drawer**

Show:
- customer
- location
- contacts
- equipment summary
- problem description
- job notes
- previous service info
- estimate / invoice state
- quick actions

### Top toolbar
Should include:
- date selector
- day/week toggle
- branch filter
- technician filters
- search
- new job action
- scheduling warnings / notices

### Dispatch goals
The dispatch board should let the office actually run the day from one screen instead of bouncing between disconnected pages.

---

## Field Technician Workflow

A technician on a job should be able to:

- view address and primary contact
- open maps / directions
- mark on-my-way
- mark arrived
- review problem description
- review service history
- review and edit equipment
- add notes and photos
- create estimates from templates
- capture approval / signature
- move toward invoice/payment flow
- mark the job complete

The field app should be organized around this practical sequence.

---

## Real-Time vs Offline Requirements

### Real-Time Requirements
The following should update in near real time:

- dispatch board changes
- technician status changes
- appointment assignment and reassignment
- job status changes
- estimate approval notifications
- invoice / payment completion states

### Offline / Sync Requirements
The field app must support offline-tolerant behavior for:

- notes
- photos
- equipment edits
- estimate drafts
- job status updates
- signatures
- material usage drafts

When connection returns:

- queued actions should sync to the server
- the server should validate them
- accepted changes should be committed
- latest authoritative data should flow back to the device

### Financial posting rule
Final posting for official financial actions should remain server-side.

Examples:
- posting invoices
- final payment records
- official job costing entries

This keeps financial records controlled and historically reliable.

---

## Module Boundaries

The backend should be split into clear modules.

### Foundation Modules
- Identity
- Roles / permissions
- Branch context
- Audit
- Files / attachments

### Core Operational Modules
- CRM
- Locations
- Contacts
- Equipment
- Jobs
- Appointments / Dispatch

### Financial / Inventory Modules
- Estimates
- Billing / Invoices / Payments
- Inventory
- Purchasing
- Job Costing

### Cross-Cutting Modules
- Notifications
- Reporting
- Background worker tasks

---

## Module Responsibilities

### Identity
- users
- authentication
- authorization
- role handling

### CRM
- customer accounts
- bill-to entities
- account contact relationships

### Locations
- service properties
- location metadata
- ownership / billing relationship history

### Contacts
- people
- changing roles by account or location

### Equipment
- unit and system records
- equipment metadata
- equipment history and status

### Jobs
- work records
- notes
- attachments
- service execution

### Appointments / Dispatch
- calendar scheduling
- technician assignment
- rescheduling
- dispatch visibility

### Estimates
- service estimates
- replacement estimates
- templates
- customer approval flow

### Billing
- invoices
- payments
- financial snapshots

### Inventory
- stock locations
- technician truck stock
- inventory movement

### Purchasing
- vendors
- POs
- PO receiving

### Job Costing
- labor/material cost tied to jobs

### Audit
- change history
- activity timeline
- accountability

---

## Module Interaction Rules

### Primary rule
Each module owns its own writes.

Other modules may read that data through approved interfaces, but should not directly mutate another module’s records.

### Examples
- Jobs can read location and equipment data.
- Billing should snapshot job/account/location data when invoices are posted.
- Inventory can issue material to a job without directly mutating job records.
- Equipment changes from the field app should go through the Equipment module, not by bypassing module rules.

### Example internal events
- JobCreated
- AppointmentScheduled
- AppointmentReassigned
- TechnicianStatusChanged
- JobStatusChanged
- EquipmentUpdated
- EstimateApproved
- InvoicePosted
- InventoryIssuedToJob
- POReceived
- PaymentRecorded

These events help modules stay coordinated without becoming tightly coupled.

---

## Suggested Repository Structure

```text
/apps
  /office-web
  /field-mobile
  /api
  /worker

/packages
  /ui-office
  /ui-mobile
  /contracts
  /validation
  /workflow
  /utils

/infrastructure
  /db
  /migrations
  /deploy
```

### Structure notes
- `office-web` contains the office-facing web application
- `field-mobile` contains the technician app
- `api` contains the shared backend
- `worker` contains background processing tasks
- `contracts` contains shared request/response contracts and event shapes
- `validation` contains shared validation logic
- `ui-office` and `ui-mobile` hold reusable design components

---

## Product Roadmap

This project should be built in layers, not all at once.

### Build order
1. product blueprint
2. platform foundation
3. accounts / locations / contacts / equipment
4. jobs / appointments / dispatch
5. field app basics
6. estimates / invoices / payments
7. purchasing / inventory / job costing
8. reporting / permissions hardening
9. pilot / migration / rollout

---

## 12-Month Delivery Plan

## Month 1 — Blueprint and Product Definition
Goal: remove ambiguity and lock the shape of the product.

### Deliverables
- user role map
- workflow map from call intake to completed invoice
- office screen map
- field screen map
- dispatch board wireframe
- location page wireframe
- module boundaries
- sync strategy
- prioritized backlog
- repo skeleton
- starter design system direction

### End-of-month demo
- clickable office shell
- clickable field shell
- approved product map
- core architecture direction agreed

---

## Month 2 — Platform Foundation
Goal: establish the technical base.

### Deliverables
- authentication
- user roles
- branch context foundation
- audit logging
- file upload plumbing
- shared app shells
- seed data
- API conventions
- worker setup
- real-time infrastructure starter

### End-of-month demo
- users can log in
- roles work
- attachments upload
- audit trail records activity
- application shell is live

---

## Month 3 — Accounts, Locations, Contacts, Equipment
Goal: build the customer/property core.

### Deliverables
- customer accounts
- locations
- account/location relationships with history
- contacts
- equipment records
- equipment status/history
- editable equipment tab on location page

### End-of-month demo
- create an account
- link multiple locations
- assign contacts
- add/edit/deactivate equipment
- preserve relationship history

---

## Month 4 — Jobs and Appointments
Goal: establish real operational records.

### Deliverables
- job intake
- appointment creation
- job status tracking
- technician assignment
- notes
- photo attachments
- service history views based on jobs and equipment

### End-of-month demo
- CSR creates a job
- dispatcher schedules it
- technician assignment is visible
- location and equipment history is available from the job

---

## Month 5 — Dispatch Board v1
Goal: let the office run the daily schedule.

### Deliverables
- daily dispatch board
- unassigned queue
- drag/drop scheduling
- reassignment and rescheduling
- technician status indicators
- conflict checks
- day/week view

### End-of-month demo
- office can operate a day from the board
- technician assignment changes flow through quickly
- dispatch sees near real-time status updates

---

## Month 6 — Field App v1
Goal: let technicians execute jobs in the field.

### Deliverables
- field login
- today’s jobs
- job detail
- notes/photos
- status updates
- equipment view/edit
- cached job data
- offline queue
- sync retry logic

### End-of-month demo
- technician receives jobs
- updates job status
- edits equipment
- adds notes/photos
- office receives synced updates

---

## Month 7 — Estimates
Goal: support technician selling and quoting.

### Deliverables
- service estimate builder
- replacement estimate builder
- estimate templates
- multi-option proposals
- approval/signature capture
- conversion path from estimate to next workflow

### End-of-month demo
- technician creates estimate from template
- customer approves on device
- office sees estimate status immediately

---

## Month 8 — Invoices and Payments
Goal: close jobs financially.

### Deliverables
- invoice generation
- invoice lines
- tax/total logic
- bill-to/location/job snapshots
- payment recording
- printable/exportable invoice output

### End-of-month demo
- completed job becomes invoice
- customer signs
- payment is recorded
- invoice remains historically correct after later master-data changes

---

## Month 9 — Inventory, PO, and Job Costing
Goal: make materials and costs operationally real.

### Deliverables
- item catalog
- inventory locations
- technician trucks as stock locations
- PO creation
- PO receiving
- stock transfers
- issue to job
- cost rollup to jobs

### End-of-month demo
- materials can be purchased into truck or warehouse
- materials can be consumed on jobs
- job cost reflects material usage

---

## Month 10 — Reporting and Management Tools
Goal: make the system useful for leadership and control.

### Deliverables
- permissions hardening
- dashboards
- service history reports
- job profitability reporting
- inventory visibility
- branch filtering foundation
- activity timelines

### End-of-month demo
- management can answer operational questions without digging through raw data

---

## Month 11 — Pilot and Migration
Goal: begin controlled real-world use.

### Deliverables
- import tools
- data cleanup scripts
- pilot controls
- support tooling
- issue triage workflow

### End-of-month demo
- one pilot group can operate selected workflows in the system

---

## Month 12 — Stabilization and Rollout
Goal: make v1 dependable enough to trust.

### Deliverables
- performance tuning
- bug fixing
- monitoring
- backup / restore validation
- error recovery processes
- internal training materials
- rollout planning

### End-of-month demo
- stable internal v1 ready for controlled wider usage

---

## What to Postpone Until Later

The following should be delayed until the core system is stable:

- customer self-booking
- customer portal
- financing workflows
- recurring service agreements
- advanced payroll
- commission engine
- marketing attribution
- deep accounting integrations
- broader multi-tenant SaaS concerns

These are valuable, but they should not be built before the operational core is reliable.

---

## Immediate Planning Priority

Before writing the full schema, the team should finish these planning artifacts:

1. user roles and workflow map
2. office screen map
3. field screen map
4. dispatch board layout
5. 12-month roadmap with milestone demos
6. module boundaries and interaction rules
7. offline / real-time communication strategy

These artifacts should be approved before deep schema work begins.

---

## Summary

This platform should be built as a practical internal HVAC field-service system first, not a giant all-at-once ServiceTitan clone.

The correct strategy is:

- define the product shape first
- define user workflows and screen surfaces
- split the codebase into maintainable modules
- support both office and field usage through one backend
- build in phased, realistic milestones
- preserve historical correctness
- prioritize operational reliability before advanced extras

If this sequence is followed, the project stays understandable, buildable, and expandable.
