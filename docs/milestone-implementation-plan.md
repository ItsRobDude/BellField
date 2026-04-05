# BellField Milestone Implementation Plan

This document defines the recommended order for building BellField.

Its purpose is to turn BellField’s product vision, workflow rules, deployment rules, and engineering standards into a practical implementation sequence.

This is the build-order source of truth.

It should answer:
- what gets built first
- what gets delayed on purpose
- what “done” means for each major phase
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

1. project/repo foundation
2. app shells and authentication
3. customers, locations, contacts
4. equipment and location history
5. jobs and appointments
6. dispatch board
7. field app workflow and offline behavior
8. estimates and invoice draft behavior
9. invoice posting and bookkeeping flow
10. inventory, PO, and job costing
11. admin/reporting/history hardening
12. pilot deployment and stabilization

This plan deliberately puts the operational backbone first.

---

## 4. What Should Not Be Built Early

The following should be postponed until later unless there is a very strong reason:
- customer portal
- customer self-booking
- advanced text/email automation
- cloud-hosted BellField data services
- advanced route optimization/AI dispatch
- advanced payroll/commission systems
- deep accounting integrations
- highly customizable dashboards before core screens are solid
- multi-tenant SaaS infrastructure beyond design awareness

BellField should first become excellent at serving one self-hosted company well.

---

## 5. Milestone 0 — Project Foundation

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

### Important output
This milestone is not about business features.

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

## 6. Milestone 1 — App Shells, Authentication, and Employee Basics

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

### Important product result
Staff can log in and BellField knows who they are.

### Definition of done
Milestone 1 is done when:
- office users can log in and land on dashboard
- technicians can log in and land on field home/dashboard
- owner/admin can manage employees at a basic level
- role defaults exist
- per-employee permission override structure exists
- lost device revocation path is defined in the product and supported in the code path foundation

---

## 7. Milestone 2 — Customers, Locations, and Contacts

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

### Important product result
The office can accurately represent who owns what, who to call, and how locations change over time.

### Definition of done
Milestone 2 is done when:
- users can create customers and locations cleanly
- locations can exist before equipment is added
- locations can be reassigned to a new owner/customer without losing location history
- contacts can be shared across customer/location where appropriate
- archived/end-dated contacts stay out of active lists but remain historically visible
- search/find flows for customer, location, and contact basics work reliably

---

## 8. Milestone 3 — Equipment and Location Service Context

### Goal
Make locations operationally useful for HVAC work.

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

### Important product result
The office and field users can treat equipment as real service records, not just notes.

### Definition of done
Milestone 3 is done when:
- equipment can be added, edited, archived, and viewed in history
- inactive equipment is hidden by default but toggle-able visible
- separate components remain separate records
- filter fields support multiple values cleanly
- equipment can exist at location or inventory positions as needed
- equipment detail drawer behavior on office screens is usable and stable

---

## 9. Milestone 4 — Jobs and Appointments Core

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

### Important product result
BellField becomes a real work-management system instead of just CRM + equipment.

### Definition of done
Milestone 4 is done when:
- office can create jobs reliably
- jobs can exist with or without appointments
- appointments can be created and linked correctly
- job timeline/history behaves as expected
- appointment status changes feed job history
- close/cancel/reopen warnings behave according to product rules

---

## 10. Milestone 5 — Dispatch Board v1

### Goal
Make BellField useful for daily scheduling and dispatch work.

### Scope
- timeline-based dispatch board
- technician rows
- unassigned queue
- appointment cards
- right-side detail drawer
- quick summary/scheduling edits from drawer
- day/week view toggle
- live updates for status/assignment changes
- history of reassignment
- optional unassigned column behavior

### Important product result
Dispatchers can run the day from BellField instead of just storing jobs in it.

### Definition of done
Milestone 5 is done when:
- appointments show correctly on the timeline
- unassigned appointments stay in the queue by default
- dispatcher can reassign/reschedule from the board
- detail drawer is useful and stable
- live updates work for office users
- appointment history reflects reassignment and status updates

---

## 11. Milestone 6 — Field App v1 and Offline Work

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

### Important product result
Technicians can actually perform work from the field app and trust it.

### Definition of done
Milestone 6 is done when:
- field users can work assigned jobs without perfect connectivity
- local edits save cleanly
- synced changes show up back in office appropriately
- unsynced work is retained safely
- large uploads do not block all other work
- status changes and notes are reliable in the field workflow

---

## 12. Milestone 7 — Estimates and Invoice Draft Workflow

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

### Important product result
BellField begins supporting selling and billing prep, not just service tracking.

### Definition of done
Milestone 7 is done when:
- estimates can be created and managed from jobs
- approved/declined estimate states work
- office can review quoted work from both job and location views
- invoice drafts appear and update properly as work/register items are added
- no posted-accounting behavior is required yet for this milestone to succeed

---

## 13. Milestone 8 — Invoice Posting and Bookkeeping Workflow

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

### Important product result
BellField becomes credible for actual billing/accounting handoff.

### Definition of done
Milestone 8 is done when:
- office/bookkeeping can review and post invoices
- posted invoices lock correctly
- job history reflects relevant invoice events
- adjustment/credit-style follow-up is the correction path rather than rewriting posted invoices
- permissions around invoice actions behave correctly

---

## 14. Milestone 9 — Inventory, PO, and Job Costing

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

### Important product result
BellField can track what was bought, where it went, and what the job really cost.

### Definition of done
Milestone 9 is done when:
- inventory locations and truck locations work cleanly
- POs always end at one destination
- equipment and non-equipment items behave differently in the correct ways
- customer location equipment stays meaningful instead of cluttered with every small part
- job cost preview and finalization behavior match product rules

---

## 15. Milestone 10 — Reporting, History Hardening, and Admin Polish

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

### Important product result
BellField becomes easier to trust, audit, manage, and support.

### Definition of done
Milestone 10 is done when:
- owners/admins can understand who changed what
- reports are useful for real office decisions
- inactive/history views do not clutter active work
- support/log export is practical and privacy-conscious
- destructive actions are harder to misuse accidentally

---

## 16. Milestone 11 — Self-Hosted Pilot Deployment

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

### Important product result
BellField proves it can actually operate in the kind of environment it was designed for.

### Definition of done
Milestone 11 is done when:
- a small self-hosted deployment can run BellField reliably
- office desktops can connect correctly
- field devices can work and sync back correctly
- backup/restore has been tested in practice
- update flow is understandable and safe enough for real users

---

## 17. Milestone 12 — Stabilization and Beta Readiness

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

### Important product result
BellField becomes something a real company could begin trusting for daily operations.

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
- a later milestone’s core logic should not be merged in a way that destabilizes earlier unfinished milestones
- BellField should not skip foundational milestones just because a later feature feels exciting

### Practical rule
A milestone should be considered “active” until its definition of done is met.

### Another practical rule
If a milestone reveals a bad assumption in an earlier layer:
- fix the foundation first
- do not pile more features on top of known bad structure

---

## 19. What “Done” Should Mean Generally

A milestone should not be called done just because a demo technically works once.

A milestone is done when:
- the main workflow works reliably
- the UI behavior matches product docs closely enough
- permissions are respected
- obvious history/accounting/data-integrity risks are addressed
- the code does not create obvious maintainability debt that should have been caught immediately

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
