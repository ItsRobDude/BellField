# BellField — HVAC Field-Service Platform

BellField is a field-service platform being designed to start as a serious side project, be test-driven in a real HVAC business if possible, and eventually be strong enough to sell to other service companies.

The goal is not to one-shot a full ServiceTitan competitor. The goal is to build BellField in the right order, with maintainable architecture, practical workflows, and a clear path from internal-style usage to a real commercial product.

BellField should support the operational core of a field-service company, including:

- customer accounts / bill-to entities
- service locations / properties
- location-specific contacts
- equipment at each location
- service history by location and by equipment
- jobs and multi-appointment scheduling
- dispatch board / daily schedule
- service estimates and replacement estimates
- invoices and payments
- purchase orders and inventory
- technician truck inventory
- job costing
- notes, photos, videos, files, and audit history
- role-based office and field workflows
- PM reminders and recurring service planning later in the roadmap

The system is intended to be modern and clean, while still keeping dense operational information easy to reach.

---

## Product Direction

BellField is being built for real field-service companies.

Initial development assumptions:
- it may be test-driven by a real HVAC company such as Blaine Heating and Air Conditioning
- it must support both office workflows and field workflows from the beginning
- the mobile app is not optional later; it is part of version 1 planning
- the product should feel open and easy by default, with tighter controls available through permissions
- BellField should be built for a single company to use first, with future multi-tenant SaaS support kept in mind from the beginning

This product should be treated as commercial-software-grade in its structure, even while staying self-hosted-first, even if the early build is done gradually over weeks and months.

### Product positioning guidance
BellField should learn from strong existing products without copying any one of them outright.

- aim for ServiceTitan-like seriousness in dispatch, permissions, job history, invoice behavior, and operational depth
- aim for Housecall Pro and Jobber-like ease of use for small shops and daily workflows
- aim for FieldEdge-like HVAC practicality around equipment, office-to-field handoff, and service-company reality
- keep BellField's own identity around self-hosted-first ownership, boring maintainable structure, and stronger offline-tolerant field work
- do not chase broad growth-suite sprawl too early, such as marketing automation, call-center layers, customer portal polish, AI dispatch, advanced payroll, or commission systems

---

## Product Shape

The platform should be built as three connected surfaces:

### 1. Office App
A desktop-focused web application used by office staff and management.

Primary office roles:
- CSR
- Dispatcher
- Admin
- Owner
- Book Keeping

These default roles should exist, but permissions should not be hardcoded around them.

### 2. Field App
A mobile application used by technicians in the field.

This app must support:
- assigned job access
- appointment status changes
- notes and job register entries
- equipment inspection and editing
- file/photo/video upload
- estimate creation
- weak signal and offline tolerance
- simple workflows usable by older technicians

### 3. Shared Backend
A single backend should own all business logic and act as the single source of truth for both the office app and the field app.

The office app and field app do not communicate directly with each other. Both communicate only with the backend.

---

## Permissions Philosophy

BellField should ship with default roles, but permissions must be editable.

### Default roles
- CSR
- Dispatcher
- Admin
- Owner
- Book Keeping
- Technician

### Permission behavior
- permissions should be toggle-able with simple on/off controls such as checkboxes or switches
- owners or setup admins should be able to grant or revoke permissions quickly
- the product should feel fairly open by default
- companies can tighten access later if they want to
- most permissions should be feature-level permissions, not buried in code-only logic
- permissions should exist at both the role level and the individual employee level
- per-employee settings should be able to override or further refine role defaults
- BellField should aim for a permission depth similar to ServiceTitan, while keeping the UI simpler where possible

### Examples of permission-controlled actions
- add equipment
- remove equipment
- edit equipment details from the field
- build estimates
- collect payment
- reassign jobs
- edit invoices before posting
- approve larger estimates
- manage inventory and purchasing

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

1. **Customer / company first, then service locations**
   - BellField should be organized around the customer account first
   - one customer can have many service addresses
   - this supports property managers, landlords, and businesses with multiple sites

2. **Separate bill-to identity from location contacts**
   - the owner / customer account is not always the main on-site contact
   - each location needs its own contact list
   - location contacts may differ from the bill-to customer

3. **Treat locations as long-lived records**
   - locations continue to exist even when ownership or occupants change
   - names and contact details at a location may be updated over time
   - old records must still reflect who was there previously

4. **Preserve historical correctness**
   - old jobs, invoices, and service records must not change just because the current owner, tenant, or contact info changed later
   - history must remain visible and trustworthy

5. **Treat equipment as editable but historically traceable**
   - equipment must be editable from both office and field workflows
   - equipment changes should not erase service history
   - replaced or removed equipment should remain historically traceable

6. **Design for real field usage**
   - the field app must work in weak or intermittent signal areas
   - saved field work must sync later without losing data
   - offline support should mean meaningful work can be captured safely, not just viewed
   - the field workflow should stay simple enough for older technicians

7. **Keep the UI modern and clean, but not shallow**
   - dense operational info should still be available
   - tabs, tables, drawers, and grouped views should reduce clutter
   - important info should be easy to reach without turning the app into a goose hunt
   - screen organization should borrow from tools like ServiceTitan or FieldOps where that is useful, but stay easier to learn for a smaller shop

8. **Build for extension**
   - avoid spaghetti coupling
   - use clear module ownership
   - support future branch, PM contract, and broader SaaS use cases without rewriting the foundation

---

## Product Surfaces and Users

### Office Users
Primary office users include:
- CSR
- Dispatcher
- Admin
- Owner
- Book Keeping

### Field Users
Primary field users include:
- Service Technicians
- Install Technicians later if needed

---

## Account, Location, and Contact Rules

### Customer accounts
BellField should begin from the customer or company record.

Customer accounts should support:
- account/company/customer name
- bill-to identity
- billing details
- phone number
- email
- fax
- linked service locations
- linked contacts
- account notes
- account activity

### Service locations
A customer can have multiple serviceable locations.

Each location should support:
- service address
- display name / location name
- current linked customer / owner view
- separate contact list for that address
- service history
- equipment list
- location-specific notes
- change history

A location must always have at least one usable form of contact information, such as a phone number or email.

### Contacts
Contacts should be easy to add and remove from both customer and location records.

Contact fields should include at minimum:
- phone number
- email
- fax

UI expectations:
- there should be a clear "+" action to add contacts
- there should be a clear remove action for contacts
- locations and customer accounts can each have multiple contacts
- one contact can belong to both a customer and a location
- contacts should be linkable/shared rather than duplicated wherever possible
- contacts should support optional tags such as Primary, Billing, or similar labels

### Contact removal behavior
When removing a contact, BellField should allow a choice such as:
- archive
- delete / end-date

### Historical contact behavior
When people move or details change:
- the location can be updated
- the normal current view should show current information
- old jobs and old service records must still show the historical names/details tied to that work
- location history should remain reviewable in a dedicated history/activity area

---

## Equipment Management Rules

Equipment must be manageable from both:
- the location page in the office app
- the field mobile app

### Equipment view
Equipment should appear on a dedicated location tab/page.

Important clarification:
- each condenser, coil, furnace, air handler, package unit, and similar asset should be its own separate equipment record
- equipment should not be merged into one combined system record by default
- the location page should simply organize equipment under its own dedicated section/tab

### Optional equipment grouping
BellField should later support optional user-created grouping so office staff can link multiple related pieces of equipment together.

Example:
- a home with multiple split systems may need the office to highlight several separate equipment records and group them together so it is obvious which condenser, coil, and furnace belong to the same system

Grouping should be optional and should not replace individual equipment records.

### Equipment requirements
Each equipment record should support, at minimum:
- equipment type
- make / brand
- model
- serial number
- filter size
- equipment location description
- install date
- status
- notes
- photos / documents
- HVAC-specific details that may expand over time

Equipment that is actually equipment inventory should be serialized and tracked individually.

### Equipment editing rules
Technicians should be able to:
- add equipment
- edit equipment
- remove equipment

These actions should be permission-toggle controlled so each company can decide how open or restricted they want this behavior to be.

### Replacement workflow rule
When equipment is replaced:
- the PO for the new equipment should be tied to the replacement job
- if the purchased item is tagged as Equipment, the system should automatically add the new equipment to the job location once it is received
- old equipment removal should remain a manual action
- old equipment must remain historically traceable
- once the replacement job is completed, the new equipment simply remains on that location

Equipment should not be hard-deleted in normal workflow.

---

## Job, Appointment, and Dispatch Rules

### Job vs appointment model
A job lives at and is attached to a location.

Core job rules:
- every job gets a job number
- a job belongs to a location
- a job is the parent operational record
- a job can have one appointment or multiple appointments
- estimates attach to the job
- invoices come from the job

When creating a job, the office should be able to set:
- job type from a dropdown
- category / business unit
- job origin
- date
- time frame
- technician assignment
- summary / caller complaint

When a date and time frame are entered during job creation, BellField should create the appointment tied to that job.

That appointment:
- lives on the dispatch board
- shows the appointment status
- is immediately assigned to a technician if a technician was selected during job creation

### Job status model
For v1, job statuses should be simple:
- Open
- Closed / Completed
- Posted
- Cancelled

Important rules:
- the job itself is not considered done just because an appointment is finished
- closing/completing a job should be a manual office action when the office is ready to close it out and bill it as needed
- posted status is tied to accounting/financial completion later in the process

### Appointment status model
Appointment statuses should be flexible and not forced into a strict workflow order in v1.

Default statuses should include:
- Assigned
- Confirmed
- On the Way
- Arrived
- Working
- Finished
- No Answer

Clarifications:
- these statuses may be updated at any time
- strict sequential enforcement is not required for v1
- all statuses are optional for v1 behavior
- Confirmed means the office has confirmed the appointment, such as calling the day prior
- Finished means that appointment/visit is finished, not that the whole job is finished
- No Answer should act as a visible indicator/tag/color state for staff and should not automatically close or change the job itself

BellField should generally use ServiceTitan-like status behavior as a reference for how job status and appointment status should feel unless later design decisions intentionally differ.

### Job creation and origin tracking
Jobs should support both:
- job type / category labeling
- job origin tracking

Examples of job origin:
- inbound phone call
- PM contract reminder
- quote follow-up
- callback / warranty
- office-created / manager-created work

Job categories should support a business-unit style structure similar to how service companies separate work types.

### PM contracts and reminders
PM contracts and similar recurring service programs should later support job reminders for recurring tasks such as:
- filter changes
- seasonal maintenance
- repeating inspections

### Multi-appointment support
A single job must be able to have multiple appointments, including future appointments on later dates.

This supports:
- return visits
- parts follow-up
- unfinished work
- replacement scheduling

### Dispatch board
The dispatch board should be one of the main office screens and should visually resemble a technician timeline board similar to ServiceTitan or FieldOps.

#### Visual structure
- horizontal time / hour markers
- technicians listed vertically
- appointment cards on the timeline
- unassigned queue
- details panel / drawer

#### Dispatch information to show at a glance
- technician
- time
- job type
- location
- status
- priority
- parts needed later where available

---

## Field Technician Workflow Rules

The field app should be simple and practical.

A technician on a job should be able to:
- view address and primary contact
- open maps / directions
- update appointment status
- review problem description
- review service history
- review and edit equipment
- add notes
- add register entries / charges / invoice items
- upload images, videos, and files to the job
- create estimates
- complete the appointment work in the field

### Notes and register behavior
Technicians should always be prompted for notes.

They should also have a register-style area to add:
- labor
- charges
- invoice items
- service line items
- parts / consumables
- maintenance memberships
- related job entries as part of the field workflow

Everything the technician adds to the register should be reflected immediately on the invoice draft.

Those invoice/register items:
- can still be edited later
- remain editable until the job is closed/completed
- remain editable until the invoice is posted to accounting

### Photo / video / file behavior
Technicians should be able to upload and attach:
- images
- videos
- files

### Payment collection behavior
Whether technicians can collect payment in the field should be controlled by a toggle-able permission and should typically be off by default.

---

## Estimates and Invoices

### Estimates
BellField should treat these as separate estimate types:
- service estimates
- replacement estimates

The system should support:
- premade estimate templates
- custom estimate creation
- multi-option replacement estimates such as good / better / best or A / B / C style choices

Technicians should be able to create estimates in the field.

For now, estimates should not automatically trigger later workflows.

That means:
- an estimate can be created
- an estimate can be approved
- once approved, it is still up to the office to decide how to book or schedule follow-up work
- the estimate should also be visible from the location so users can see what work has been quoted there

### Invoices
Not every job needs a bill.

Examples:
- estimate-only calls may not create an invoice
- service jobs often will

Every job should still be able to be completed normally whether or not it produces an invoice.

An invoice should come from a job, not from an individual appointment.

### Invoice editability rule
An invoice should remain editable until it is posted on the accounting side.

After posting:
- the posted invoice becomes the authoritative accounting record
- history should remain reliable

---

## Purchasing, Inventory, and Job Costing

### Inventory locations
Technician trucks should be treated as their own inventory locations.

Office staff should be able to see what stock is on each truck.

Truck transfers do not need approval.

### PO rules
Each PO should tie to one location or one job.

Important rule:
- no split PO behavior in v1

Basic purchasing flow for now:
- create PO
- receive PO
- invoice PO

### Direct-to-job purchasing and material usage
Parts should be allowed to be assigned directly to a job.

This means BellField must support both:
- inventory flowing through stock locations
- purchasing or assignment directly against a specific job when needed

Clarifications:
- equipment should always go directly to a job
- once received, equipment-tagged items should populate in that location’s equipment tab
- non-equipment parts and consumables can also be added to a job
- non-equipment items do not need to appear in the equipment tab

### Job costing
Job costing should be part of version 1 planning, even if it lands later in the early build sequence.

The architecture should support job costing from the beginning.

---

## Real-Time vs Offline Requirements

### Real-Time Requirements
The following should update in near real time when signal exists:
- dispatch board changes
- technician status changes
- appointment assignment and reassignment
- job status changes
- estimate-related changes where relevant
- invoice / payment completion states later where enabled

### Save behavior
If a technician edits something in the field, office users should only see it after the technician saves those changes.

### Offline / Sync Requirements
The field app must support offline-tolerant behavior for:
- notes
- photos
- videos
- file attachments
- equipment edits
- estimate drafts
- job status updates
- register entries

If signal is poor:
- it is acceptable to save work locally
- the app should sync later when connection improves

### Financial posting rule
Final posting for official financial actions should remain server-side.

Examples:
- posting invoices
- final payment records
- official job costing entries

This keeps financial records controlled and historically reliable.

---

## Activity Logs and History

BellField should maintain visible history throughout the product.

### Job activity logs
Every job should have an activity log showing who changed what and when.

### Location history
Location pages should have a separate tab or area that records changes over time.

This should include things like:
- contact changes
- owner/customer relationship changes
- equipment changes
- notes or important updates

History should be easy to review, not hidden away.

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
- notes and register entries
- location and contact access
- equipment review and editing
- service history review
- estimate creation
- file/photo/video upload
- offline-safe local work

The field experience should stay simple enough for older technicians and should avoid clutter-heavy workflows.

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

## Module Interaction Rules

### Primary rule
Each module owns its own writes.

Other modules may read that data through approved interfaces, but should not directly mutate another module’s records.

### Examples
- Jobs can read location and equipment data.
- Billing should snapshot job/account/location data when invoices are posted.
- Inventory can issue material to a job without directly mutating job records.
- Equipment changes from the field app should go through the Equipment module, not by bypassing module rules.
- Purchasing should be able to feed equipment-typed items into equipment creation rules when tied to replacement work.

### Example internal events
- JobCreated
- AppointmentCreated
- AppointmentScheduled
- AppointmentReassigned
- AppointmentStatusUpdated
- TechnicianStatusChanged
- JobStatusSaved
- EquipmentUpdated
- EstimateCreated
- EstimateApproved
- InvoiceDrafted
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
1. product blueprint and workflow rules
2. platform foundation and permissions
3. customer / location / contact / equipment organization
4. jobs / appointments / dispatch
5. field app basics and offline save/sync
6. estimates / invoice draft flow
7. purchasing / inventory / job costing
8. reporting / permissions hardening / PM reminders
9. pilot / migration / rollout

---

## 12-Month Delivery Plan

## Month 1 — Product Definition and Structure
Goal: remove ambiguity and lock the product shape, rules, and initial code structure.

### Deliverables
- user role map
- permission model direction
- workflow map from call intake to completed job
- office screen map
- field screen map
- dispatch board wireframe
- location page and equipment tab wireframe
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
- toggle-able permissions
- audit logging foundation
- file upload plumbing
- shared app shells
- seed data
- API conventions
- worker setup
- real-time infrastructure starter

### End-of-month demo
- users can log in
- roles work
- permissions can be toggled
- attachments upload
- audit trail records activity
- application shell is live

---

## Month 3 — Accounts, Locations, Contacts, Equipment
Goal: build the organizational core of the app.

### Deliverables
- customer accounts
- locations
- account/location relationships with history
- customer contacts
- location contacts
- shared contact linking
- contact tags
- equipment records
- equipment status/history
- editable equipment tab on location page

### End-of-month demo
- create an account
- link multiple locations
- assign separate contacts
- link shared contacts
- add/edit/remove equipment
- preserve relationship and history behavior

---

## Month 4 — Jobs and Appointments
Goal: establish operational work records.

### Deliverables
- job intake
- job types / categories
- job origin tracking
- appointment creation
- future appointments
- job status tracking
- appointment status tracking
- technician assignment
- notes
- file/photo/video attachments
- service history views based on jobs and equipment

### End-of-month demo
- CSR creates a job
- dispatcher schedules it
- technician assignment is visible
- location and equipment history is available from the job

---

## Month 5 — Dispatch Board v1
Goal: let the office run the day on a real timeline board.

### Deliverables
- daily dispatch board
- unassigned queue
- horizontal time grid
- technicians vertically listed
- drag/drop scheduling
- reassignment and rescheduling
- visible appointment statuses
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
- status updates
- prompted notes
- register entries
- file/photo/video upload
- equipment view/edit
- cached job data
- offline queue
- sync retry logic

### End-of-month demo
- technician receives jobs
- updates status
- edits equipment
- adds notes and attachments
- office receives synced saved updates

---

## Month 7 — Estimates and Invoice Draft Flow
Goal: support technician quoting and early financial flow.

### Deliverables
- service estimate builder
- replacement estimate builder
- estimate templates
- multi-option proposals
- invoice draft flow
- register-to-invoice reflection
- editable invoice behavior before posting

### End-of-month demo
- technician creates estimate from template
- customer-facing options are visible
- office can draft and edit invoice before posting

---

## Month 8 — Posting, Payments, and Accounting Handoff
Goal: close jobs financially in a controlled way.

### Deliverables
- invoice posting workflow
- posted vs editable invoice behavior
- payment recording rules
- bill-to/location/job snapshots
- printable/exportable invoice output

### End-of-month demo
- completed job can become invoice draft
- accounting can post invoice
- history remains reliable after posting

---

## Month 9 — Inventory, PO, and Job Costing
Goal: make materials and costs operationally real.

### Deliverables
- item catalog
- inventory locations
- technician trucks as stock locations
- PO creation
- PO receiving
- PO invoicing
- direct-to-job assignment
- serialized equipment behavior
- equipment-tagged PO behavior for replacement work
- job cost rollup to jobs

### End-of-month demo
- materials can be purchased into truck or warehouse
- materials can be assigned to a job
- equipment-tagged PO items can feed replacement workflow
- job cost reflects material usage

---

## Month 10 — History, Reporting, and Management Tools
Goal: make the system useful for management and trustworthy over time.

### Deliverables
- stronger activity logs
- location change history views
- service history reports
- job profitability reporting
- inventory visibility
- owner/admin permission review tools

### End-of-month demo
- management can answer operational questions without digging through raw data
- historical changes are visible and understandable

---

## Month 11 — PM Reminder Planning and Pilot Readiness
Goal: prepare for more repeat-service workflows and controlled real usage.

### Deliverables
- PM reminder design / initial support
- import tools
- data cleanup scripts
- pilot controls
- support tooling
- issue triage workflow

### End-of-month demo
- one pilot group can operate selected workflows in the system
- PM reminder direction is visible

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
- advanced financing workflows
- deeper PM contract automation beyond reminders
- advanced payroll
- commission engine
- marketing attribution
- deep accounting integrations
- broader multi-tenant SaaS concerns beyond foundational design

These are valuable, but they should not be built before the operational core is reliable.

---

## Immediate Planning Priority

Before deep schema work begins, BellField should continue to define:

1. product rules and workflow states
2. screen-by-screen behavior
3. permissions and role toggles
4. field save/sync behavior
5. inventory and replacement rules
6. invoice draft vs posted behavior
7. milestone-by-milestone implementation order

These artifacts should remain aligned with the README so the codebase grows in the intended direction.

---

## Summary

BellField should be built as a clean, modern, field-service platform with:
- customer-first organization
- location-specific operational depth
- editable but permission-controlled workflows
- strong field support from the start
- trustworthy history and activity logs
- practical dispatching
- real job costing and inventory behavior
- phased, realistic milestones instead of an all-at-once build

The correct strategy is:
- define product rules first
- define user workflows and screen behavior
- split the codebase into maintainable modules
- support both office and field usage through one backend
- preserve historical correctness
- build in practical phases
- leave advanced extras for later

If this sequence is followed, BellField stays understandable, buildable, and expandable while moving toward a real sellable product.
