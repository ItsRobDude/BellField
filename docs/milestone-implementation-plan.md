# BellField Milestone Implementation Plan

This document defines the recommended order for building BellField.

Its purpose is to turn BellField's product vision, workflow rules, deployment rules, and engineering standards into a practical implementation sequence.

This is the build-order source of truth.

It should answer:
- what gets built first
- what gets delayed on purpose
- what "done" means for each major phase
- what should not be started too early

This document is intentionally biased toward quality, maintainability, and real-world usefulness over flashy breadth.

---

## 1. Core Build Philosophy

BellField should be built in a controlled sequence.

Important rules:
- do not try to build the whole product at once
- do not jump into advanced features before the operational core is trustworthy
- do not build cloud-first assumptions into a self-hosted-first product
- do not let UI polish outrun business rules
- do not let schema work outrun product rules
- do not let mobile and office drift into separate systems

BellField should aim to become:
1. usable
2. trustworthy
3. maintainable
4. broader over time

That order matters.

### Product benchmark posture
BellField should take cues from strong existing products without inheriting their full sprawl.

- take ServiceTitan-like depth seriously in dispatch, permissions, billing controls, and operational history
- keep daily workflows easier to learn and lighter to operate for a small shop, more in the spirit of Housecall Pro or Jobber
- keep trade-specific practicality in focus, similar to the useful parts of FieldEdge, while avoiding HVAC-only assumptions where the broader service-platform model should stay flexible
- do not allow broad suite expansion to outrun the operational core BellField is trying to make trustworthy

---

## 2. What Is Already Defined Before Coding

Before serious feature coding begins, BellField now has the following source-of-truth documents:
- `README.md`
- `docs/deployment-model.md`
- `docs/product-rules.md`
- `docs/workflows-and-state-machines.md`
- `docs/permissions-model.md`
- `docs/offline-sync.md`
- `docs/screen-behavior-spec.md`
- `docs/data-modeling-rules.md`
- `docs/engineering-standards.md`

These documents should guide all implementation work.

The next step is not more abstract planning first.

The next step is controlled execution.

---

## 3. Build Strategy Summary

BellField should be built in this order:

1. project foundation
2. app shells, authentication, and employee basics
3. customers, locations, and contacts
4. equipment and location service context
5. jobs and appointments core
6. dispatch board v1
7. field app v1 and offline work
8. estimates and invoice draft workflow
9. invoice posting and bookkeeping workflow
10. inventory, PO, and job costing
11. reporting, history hardening, and admin polish
12. self-hosted pilot deployment
13. stabilization and beta readiness

This plan deliberately puts the operational backbone first.

Each milestone should produce a trustworthy capability layer, not just a demo.

Moving to the next milestone should mean:
- the current layer is believable enough that later work does not need to keep rewriting it
- the milestone's main user-facing workflows exist in a stable enough shape to build on
- BellField is still avoiding later-stage breadth that would dilute the active milestone

---

## 4. What Should Not Be Built Early

The following should be postponed until later unless there is a very strong reason:
- customer portal
- customer self-booking
- advanced text/email automation
- call-center style layers and contact-center sprawl
- cloud-hosted BellField data services
- advanced route optimization/AI dispatch
- broad marketing-suite features
- advanced payroll/commission systems
- deep accounting integrations
- highly customizable dashboards before core screens are solid
- multi-tenant SaaS infrastructure beyond design awareness

BellField should first become excellent at serving one self-hosted company well.

Important interpretation rule:
- work that repairs a weak earlier foundation is allowed
- work that quietly starts a later milestone under the label of "prep" is not
- if a change adds real new user-facing workflow from a later milestone, it should usually wait until that milestone is active
- schema hooks, shared types, and narrow technical support for a later milestone are acceptable only when they directly support the active milestone or a necessary foundation repair

---

## 5. Milestone 0 - Project Foundation

### Goal
Prepare the repo and codebase so future work stays clean.

### Scope
- establish monorepo/app structure
- establish TypeScript-first stack foundations
- set up formatting/linting/basic checks
- set up migration workflow
- set up environment/config conventions
- set up base logging/error standards
- create placeholder app shells for office, field, backend, and worker
- establish basic CI expectations later if not immediately

### Not yet
This milestone is not about real business workflows, real persistence-backed operations, or production-ready office/field behavior.

It is about making BellField safe to build.

### Definition of done
Milestone 0 is done when:
- the repo has the approved basic structure
- formatting/linting/basic checks run consistently
- no one needs to guess where new code should go
- app shells exist and boot successfully
- configuration/secrets are not hardcoded
- future DB changes have a clear tracked migration path

---

## 6. Milestone 1 - App Shells, Authentication, and Employee Basics

### Goal
Create a usable skeleton for office and field access.

### Scope
- office app login screen
- field app login screen
- basic dashboard/home shells
- employee accounts
- default roles
- role-based access foundations
- per-employee override foundations
- stay-signed-in behavior planning for field app
- device identity/revocation foundations

### Not yet
This milestone is not yet about real CRM records, customer/location management, equipment history, job intake, dispatching, or deep field execution.

It is about identity, access, and knowing which employee is using BellField.

### Definition of done
Milestone 1 is done when:
- office users can log in and land on dashboard
- technicians can log in and land on field home/dashboard
- owner/admin can manage employees at a basic level
- role defaults exist
- per-employee permission override structure exists
- field session persistence and device identity have a believable foundation, even if the final revoke UX is still simple
- the auth/employee layer is stable enough that Milestone 2 can build customer/location ownership and visibility on top of it instead of inventing identity rules as it goes

---

## 7. Milestone 2 - Customers, Locations, and Contacts

### Goal
Build the real-world CRM backbone.

### Scope
- customer account creation/editing
- inactive status and flags such as Do Not Service
- location creation under customer accounts
- location reassignment to new owner/customer
- shared contact model
- customer contacts
- location contacts
- contact tags
- archive/end-date contact behavior
- location history visibility foundations

### Not yet
This milestone is not yet about deep equipment context, asset-level service history, job intake, appointment timelines, or dispatch workflow.

It is about representing accounts, locations, contacts, and ownership/contact changes correctly.

### Definition of done
Milestone 2 is done when:
- users can create customers and locations cleanly
- locations can exist before equipment is added
- locations can be reassigned to a new owner/customer without losing location history
- contacts can be shared across customer/location where appropriate
- archived/end-dated contacts stay out of active lists but remain historically visible
- search/find flows for customer, location, and contact basics work reliably enough that the office can operate the CRM backbone without workarounds
- Milestone 3 can add service-context detail to locations without needing to redesign who owns a location, which contacts are active, or how history is preserved

---

## 8. Milestone 3 - Equipment and Location Service Context

### Goal
Make locations operationally useful for equipment-heavy service work, with HVAC as an important reference case.

### Scope
- equipment tab on location screen
- separate equipment records per physical component
- partial equipment entry support
- multiple filter size support
- active vs inactive equipment behavior
- optional equipment grouping foundations
- equipment change history
- install-state concepts such as pending/not installed vs active/installed
- serialized equipment handling foundations

### Not yet
This milestone is not yet about jobs, appointment scheduling, dispatch workflow, or broad inventory/PO behavior.

It is about making locations operationally meaningful for service work by giving equipment its own trustworthy context.

### Definition of done
Milestone 3 is done when:
- equipment can be added, edited, archived, and viewed in history
- inactive equipment is hidden by default but toggle-able visible
- separate components remain separate records
- filter fields support multiple values cleanly
- equipment can exist at location or inventory positions as needed
- office and field users can review and update equipment without collapsing separate assets into vague notes or merged records
- Milestone 4 can create work against a location and its equipment without first needing to solve equipment identity or history problems

---

## 9. Milestone 4 - Jobs and Appointments Core

### Goal
Create the operational work record and visit scheduling foundation.

### Scope
- job creation
- job types/categories/origin
- work order number field
- location + bill-to override behavior
- auto-create appointment when date/time is entered
- unscheduled job behavior when no appointment exists
- appointment records tied to jobs
- job status model
- appointment status model
- central job timeline/history
- manual close/cancel/reopen logic foundations

### Not yet
This milestone is not yet about a timeline dispatch board, route planning, full field offline execution, or draft/posting financial workflow.

It is about creating the parent work record, the child appointment model, and the warning-driven status/history behavior that later workflows depend on.

### Definition of done
Milestone 4 is done when:
- office can create jobs reliably
- jobs can exist with or without appointments
- appointments can be created and linked correctly
- job timeline/history behaves as expected
- appointment status changes feed job history
- close/cancel/reopen warnings behave according to product rules, without forcing later dispatch or invoice behavior to exist yet
- Milestone 5 can schedule and reassign work from a dispatch surface without redefining the core job-versus-appointment model

---

## 10. Milestone 5 - Dispatch Board v1

### Goal
Make BellField useful for daily scheduling and dispatch work.

### Scope
- timeline-based dispatch board
- technician rows
- unassigned queue
- appointment cards
- focused job detail surface opened from appointment cards
- quick summary/scheduling/status edits from dispatch and job detail
- day view with previous/today/next date navigation first
- week view after day-view scheduling is stable
- refresh behavior for status/assignment changes
- history of reassignment
- optional unassigned column behavior

### Not yet
This milestone is not yet about full technician execution, durable offline queueing, register entries, media queueing, or estimate building in the field.

It is about giving office staff a usable day-of-work scheduling surface on top of the jobs/appointments core.

### Definition of done
Milestone 5 is done when:
- appointments show correctly on the timeline
- unassigned appointments stay in the queue by default
- dispatcher can reassign/reschedule from the board
- job detail opened from dispatch is useful and stable
- refresh behavior keeps office users on current status/assignment data
- appointment history reflects reassignment and status updates without requiring the field app to be feature-complete first
- Milestone 6 can consume dispatch assignments in the field app without needing the office to manage work somewhere else

---

## 11. Milestone 6 - Field App v1 and Offline Work

### Goal
Make the field app practically usable, even with weak signal.

### Scope
- technician home/dashboard
- assigned jobs for today/tomorrow default sync window
- local cached job/location/equipment data for assigned jobs
- notes
- appointment statuses
- register entries
- equipment edits
- estimate drafting foundations
- photo/video/file queueing
- background sync
- Sync Now button
- pending sync indicator
- conflict flagging foundations
- lost/revoked device behavior foundations

### Not yet
This milestone is not yet about invoice posting, broad financial workflows, or advanced dispatch optimization.

It is about giving technicians a trustworthy field workflow that still works when signal is weak.

### Definition of done
Milestone 6 is done when:
- field users can work assigned jobs without perfect connectivity
- local edits save cleanly
- synced changes show up back in office appropriately
- unsynced work is retained safely
- large uploads do not block all other work
- status changes, notes, and the supported offline-safe actions are reliable enough that technicians can trust the app during normal service work
- the field app is operationally useful before estimates, invoice posting, or advanced optimization enter the picture

---

## 12. Milestone 7 - Estimates and Invoice Draft Workflow

### Goal
Support quoting and early financial drafting without full accounting finalization yet.

### Scope
- estimate creation from jobs
- estimate builder screen
- estimate statuses
- multiple estimates per job
- estimates visible from job and location
- invoice draft created at job creation
- register-to-invoice reflection
- zero-dollar invoice support
- editable invoice draft behavior

### Not yet
This milestone is not yet about posted accounting finalization, locked invoices, or full bookkeeping controls.

It is about quoting and draft-billing behavior that can support field and office workflows before final accounting completion.

### Definition of done
Milestone 7 is done when:
- estimates can be created and managed from jobs
- approved/declined estimate states work
- office can review quoted work from both job and location views
- invoice drafts appear and update properly as work/register items are added
- office and field users can build and review draft financial records without needing the posting workflow to exist yet

---

## 13. Milestone 8 - Invoice Posting and Bookkeeping Workflow

### Goal
Make the money side trustworthy.

### Scope
- invoice review screens/workbench behavior
- invoice posting flow
- posted invoice lock behavior
- adjustment/credit follow-up record path
- payment workflow foundations (online-only in v1)
- bookkeeping access and actions
- invoice-related activity showing in job history

### Not yet
This milestone is not yet about inventory/PO/job-costing depth.

It is about turning draft financial workflow into trustworthy accounting handoff behavior.

### Definition of done
Milestone 8 is done when:
- office/bookkeeping can review and post invoices
- posted invoices lock correctly
- job history reflects relevant invoice events
- adjustment/credit-style follow-up is the correction path rather than rewriting posted invoices
- permissions around invoice actions behave correctly and payments remain aligned with the online-only v1 expectation

---

## 14. Milestone 9 - Inventory, PO, and Job Costing

### Goal
Support material flow and job-cost visibility.

### Scope
- inventory locations
- truck inventory
- PO creation
- PO receiving
- PO invoicing
- end-location behavior for POs
- no-split PO rule enforcement
- equipment-tagged PO item behavior
- pending equipment on customer location
- non-equipment material handling
- job cost preview
- finalized job cost on completion

### Not yet
This milestone is not yet about broader reporting/admin polish or pilot rollout work.

It is about material flow, equipment-vs-parts behavior, and cost visibility becoming operationally real.

### Definition of done
Milestone 9 is done when:
- inventory locations and truck locations work cleanly
- POs always end at one destination
- equipment and non-equipment items behave differently in the correct ways
- customer location equipment stays meaningful instead of cluttered with every small part
- job cost preview and finalization behavior match product rules closely enough to support real operational review

---

## 15. Milestone 10 - Reporting, History Hardening, and Admin Polish

### Goal
Strengthen trust, visibility, and administration.

### Scope
- better history filtering
- better reporting for jobs/invoices/inventory
- profitability reports where allowed
- better warning/alert surfaces
- owner/admin permission review tools
- support/log export behavior
- archive/inactive views polishing
- delete confirmation hardening

### Not yet
This milestone is not yet about deployment validation or broader beta stabilization.

It is about making BellField easier to audit, manage, support, and trust in day-to-day office use.

### Definition of done
Milestone 10 is done when:
- owners/admins can understand who changed what
- reports are useful for real office decisions
- inactive/history views do not clutter active work
- support/log export is practical and privacy-conscious
- destructive actions and high-risk admin behavior are harder to misuse accidentally

---

## 16. Milestone 11 - Self-Hosted Pilot Deployment

### Goal
Run BellField like a real small-shop system, not just a dev project.

### Scope
- self-hosted setup instructions
- Windows server-PC-friendly deployment path
- backup and restore test path
- multi-office-desktop connection validation
- remote field access validation
- update path validation
- pilot company/company-like testing workflow

### Not yet
This milestone is not yet about general beta polish or broad production hardening beyond the pilot environment.

It is about proving BellField can run in the self-hosted environment it was designed for.

### Definition of done
Milestone 11 is done when:
- a small self-hosted deployment can run BellField reliably
- office desktops can connect correctly
- field devices can work and sync back correctly
- backup/restore has been tested in practice
- update flow is understandable and safe enough for a real pilot company

---

## 17. Milestone 12 - Stabilization and Beta Readiness

### Goal
Reduce risk before broader real-world usage.

### Scope
- bug fixing
- performance tuning
- cleanup/refactors that improve clarity without changing product meaning
- sharper logs and support tools
- permission edge-case hardening
- sync edge-case hardening
- polish on the most-used screens

### Not yet
This milestone is not about broad new feature expansion.

It is about reducing fragility, confusion, and support risk before wider real-world usage.

### Definition of done
Milestone 12 is done when:
- the product is stable enough for serious pilot/beta use
- major workflows are no longer fragile
- the codebase is still understandable
- fixes did not create hidden architectural mess

---

## 18. Rules for Working Between Milestones

### Allowed overlap
Some planning, UI refinement, and technical prep may overlap across milestones.

However:
- a later milestone's core logic should not be merged in a way that destabilizes earlier unfinished milestones
- BellField should not skip foundational milestones just because a later feature feels exciting
- narrow foundation repair is allowed when an earlier assumption proves weak
- foundation repair should stop at the minimum needed to support the active milestone or keep existing work trustworthy
- foundation repair should not quietly pull in the normal user-facing scope of a later milestone
- if overlap creates a real new workflow that a user can depend on, it should usually be treated as that later milestone starting

### Practical rule
A milestone should be considered "active" until its definition of done is met.

### Another practical rule
If a milestone reveals a bad assumption in an earlier layer:
- fix the foundation first
- do not pile more features on top of known bad structure
- once the weak layer is repaired, return to the active milestone instead of widening the roadmap opportunistically
- if the repair exposes a milestone boundary that was too vague, update the docs before treating the wider work as justified

---

## 19. What "Done" Should Mean Generally

A milestone should not be called done just because a demo technically works once.

A milestone is done when:
- the main workflow works reliably
- the UI behavior matches product docs closely enough
- permissions are respected
- obvious history/accounting/data-integrity risks are addressed
- the code does not create obvious maintainability debt that should have been caught immediately

Done does not mean every adjacent milestone concern is solved early.

It means the active milestone is solid enough that the next layer can build on it without guessing at basic product meaning.

BellField should not call something done if it is obviously fragile, confusing, or structurally wrong.

---

## 20. Final Priority Summary

If BellField has to choose what to protect most during implementation, the priority order should be:

1. product truth
2. data/history/accounting integrity
3. maintainable structure
4. real-world usability
5. speed of shipping
6. advanced extras

BellField should win by becoming a solid, trustworthy field-service core.

The extras can come later.

---

## 21. Current Working Status Snapshot

This section is a repo-current orientation note.
It should be refreshed after major milestone slices land.
For a shorter status-only version, see `docs/whats-shipped.md`.

### Shipped foundation

| Milestone | Current repo state | Remaining pressure |
| --- | --- | --- |
| 2 - CRM backbone | Customer, location, contact, ownership history, shared contact links, duplicate warnings, and SQL-backed CRM search exist. | Large-dataset polish should continue with SQL-backed duplicate checks and typeahead-style intake instead of loading every customer/location into forms. |
| 3 - Equipment context | Equipment records, active/inactive status, history, grouping/replacement links, install date, filters, and office equipment detail surfaces exist. | Field and office location-context ergonomics can improve, but the entity shape is usable. |
| 4 - Jobs and appointments | Jobs may exist with or without appointments. Appointments belong to jobs. Status updates, finished-visit review acknowledgement, add-appointment follow-up, register entries, media metadata, and unified timeline events exist. | Snapshot behavior for historical job customer/location display context is still a future hardening item before invoices/posting become serious. |
| 5 - Dispatch board v1 | Dispatch now uses a dedicated dated read model, technician rows, unassigned queue, structured local start/end times, schedule/status writes, job detail opened from appointment cards, date picker, Today, previous/next, and refresh controls. | Manual browser smoke checks remain the main dispatch closeout item. Compact week strip is polish, not a blocker; week view remains later. |
| 6 - Field app/offline | Field assigned-work caching, notes/status/equipment/register/media queueing, job/appointment media attribution, media size guardrails, media rejected-state handling, conflict/rejected preservation, Sync Now, in-screen background sync, and a home/detail field layout exist. | Manual mobile smoke, media upload device smoke, remaining transient sync hardening, and revoked-device wipe are still open Milestone 6 work. |

### Current next implementation order

1. Dispatch board closeout:
   run browser/manual smoke steps for date changes, refresh, job detail open, schedule edits, and status changes. Compact week strip is deferred polish.
2. Field app Milestone 6 mobile smoke:
   verify the assigned-work home plus focused job detail tabs on mobile dimensions and real Expo runtime.
3. Field media smoke and hardening:
   verify image/video capture or pick, local file persistence, SHA-256 metadata, upload-intent replay, raw blob finalization, appointment attribution, rejected-state handling, cleanup after successful upload, and retry after transient blob failure on a device/runtime.
4. Sync reliability for real field actions:
   harden background/manual sync around register and media operations, including partial success, retry, and conflict/rejected handling.
5. Historical snapshot hardening before Milestone 7/8:
   define and persist the customer/location/job display context that invoices and old jobs must preserve.

### Milestone-boundary reminders

- Dispatch v1 can keep improving as the daily office home, but route optimization, drag/drop, live sockets, and week view remain later until day-view scheduling is trustworthy.
- Field media capture now uses the approved Expo ImagePicker, FileSystem, and Crypto dependencies; no additional picker/storage dependencies should be added without a new reason.
- Register entries exist now, but invoice-draft reflection waits for the Milestone 7 invoice draft entity.
- Payments remain online-only in v1.
