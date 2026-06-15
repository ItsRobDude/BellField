# BellField Workflows and State Machines

This document defines how work should move through BellField in real life.

Its purpose is to describe the expected lifecycle of:

- jobs
- appointments
- estimates
- invoices
- purchasing/receiving behavior related to jobs
- job closing and follow-up decisions

This is a product behavior document, not a coding document.

For BellField version 1, workflows should generally behave more like a **guide with prompts and warnings** than a strict lock-everything system.

Core v1 philosophy:

- keep workflows flexible
- preserve history
- warn before risky actions
- let permissions decide who can override rules

---

## 1. Core Workflow Philosophy

BellField version 1 should guide users with:

- warnings
- prompts
- confirmations
- visible statuses
- history logs

It should not force overly strict step-by-step sequencing in most cases.

This means:

- users may skip intermediate appointment statuses if they forget
- users can manually reopen or change records if permissions allow
- BellField should help staff make clean records without over-automating every decision

BellField should feel similar in spirit to ServiceTitan-style workflow behavior where that is practical, but should remain simpler and easier to understand.

---

## 2. Job and Appointment Relationship

### Core model

A job is the parent work record.

An appointment is a scheduled visit attached to that job.

Rules:

- every appointment belongs to exactly one job
- a job may have zero appointments
- a job may have one appointment
- a job may have multiple appointments

A job with zero appointments:

- is valid
- should not appear on the dispatch timeline
- should live in an unscheduled/open state until an appointment is added

### Multi-appointment support

A job may have multiple appointments with different:

- dates
- start times
- end times
- technicians
- appointment statuses

V1 scheduling should store the appointment's scheduled date plus optional local start and end times in `HH:mm` format.
The existing time-window label remains available as a flexible customer-facing/free-form label for legacy records and non-exact windows.
BellField should not automatically parse or backfill structured times from free-form labels because labels like "morning", "first call", or "after lunch" are ambiguous.

---

## 3. Job Creation Workflow

### Standard job creation

When office staff create a job, BellField should allow them to enter:

- location
- customer/bill-to selection
- job type
- category/business unit
- origin
- summary/caller complaint
- work order number when available
- date
- optional start/end times
- optional time-window label
- technician assignment

The New Job screen should behave like call intake, not like a forced location-first wizard.
Office staff should be able to start typing the problem summary, job type/category/origin, and
optional schedule while they are still searching for or creating the customer and service location.
BellField should keep the final Create Job action disabled until a service location exists, because
the backend job record still requires `locationId`.

### Bill-to and work order behavior

During job creation:

- the location's current owner/customer should be the default bill-to
- the office may override the bill-to to another allowed customer for that job
- the office should change that job bill-to through search/create, not by choosing from a permanent
  location-level alternate bill-to dropdown
- if no override is selected, the create request should omit `billToCustomerId` and let the backend
  use the location's current owner/customer
- the work order number should be optional operational reference data, not a replacement for the BellField job number
- if no work order number is provided, BellField should leave it blank and avoid showing a placeholder reference

### Automatic appointment generation

If the office enters a date and schedule details when creating the job:

- BellField should automatically create the first appointment for that job
- that appointment should appear on the dispatch board for that date, with structured times used for ordering when available

### Unscheduled job behavior

If the office creates a job without a date/time:

- BellField should still save the job
- the job should appear in the unscheduled area
- it should not appear on the technician timeline until an appointment is created

### Add-appointment-later behavior

If an open job already exists, office users should be able to add another appointment later without creating a replacement job.

This should be the normal follow-up path for:

- return visits
- unfinished work
- approved work that still belongs under the same open job

---

## 4. Job State Machine

### Default job statuses for v1

BellField should use these default job statuses:

- New
- Scheduled
- In Progress
- Waiting On Parts
- Completed
- Closed
- Cancelled

### Job status meanings

**New**

- the job exists but no real appointment has been scheduled yet
- it should stand out in office workflow as needing action

**Scheduled**

- the job has one or more scheduled visits
- the job is still open operationally

**In Progress**

- work is actively underway or a visit attempt already happened
- this still does not mean the whole job is done

**Waiting On Parts**

- work is paused waiting on material or equipment follow-up
- the job should remain visible without pretending it is finished

**Completed**

- office has manually decided the work is operationally done
- this is not automatic when an appointment is finished

**Closed**

- office has manually closed the job administratively after review

**Cancelled**

- the job is cancelled
- future work under that job should not continue unless the job is reopened

### Job state rules

- Finished appointments do not auto-close a job
- office must manually complete and close a job
- a cancelled job may later be reopened if needed
- reopening closed jobs should be permission-controlled
- posted remains an invoice/accounting concept later, not a Milestone 4 job status

### Close warning rule

If a user tries to close a job that still has a future appointment attached:

- BellField should warn or prompt them before allowing that action

### Cancel behavior

If a job is cancelled:

- all appointments under it should also be cancelled
- the office warning should count appointments under that job that are not already cancelled
- past, same-day, future, and unscheduled appointments should all be included in the cancellation behavior when they belong to the cancelled job

### Reopen behavior

If later work needs to continue on a closed or cancelled job:

- BellField should warn the office user before reopening it
- BellField should allow reopening when permissions allow
- BellField may also prompt the user to create a new job instead when that would produce a cleaner record

---

## 5. Appointment State Machine

### Default appointment statuses for v1

BellField should use these default appointment statuses:

- Scheduled
- Confirmed
- Dispatched
- On the Way
- Arrived
- Working
- Finished
- No Answer

### Appointment status principles

- all default statuses should be available to both office users and technicians
- statuses do not need strict sequence enforcement in v1
- users should be able to skip statuses if they forgot to tap something earlier

Example:

- a technician can move from Assigned straight to Arrived if needed

### Appointment status meanings

**Scheduled**

- the appointment exists in the schedule layer
- it may or may not already be technician-assigned

**Confirmed**

- office has confirmed the appointment with the customer
- this is an appointment-only status, not a job status

**Dispatched**

- office has actively sent the appointment into the field workflow
- this is useful before technician travel begins

**On the Way**

- technician is heading to the appointment

**Arrived**

- technician has arrived on site

**Working**

- technician is actively working the appointment

**Finished**

- that visit is finished
- this does not mean the whole job is done

**No Answer**

- nobody answered or the visit attempt failed in that way
- this should remain just a status/indicator
- it should not auto-close anything
- it should not auto-prompt the user into follow-up choices in v1
- the appointment remains open until office decides what to do next

### Appointment history behavior

Appointment status changes should appear in the main job history/log rather than in a completely separate appointment-only history area.

---

## 6. Appointment Finish Workflow

When a technician marks an appointment as **Finished**, BellField should guide them through a finish review flow.

### Finish prompts

BellField should prompt for:

- notes
- register items

### Notes behavior

Notes should be prompted every time an appointment is marked Finished.

If the technician tries to finish without notes:

- BellField should warn them
- BellField should still allow them to continue if they choose

### Register behavior

Register items should also be prompted when finishing an appointment.

However:

- register entry is optional by default
- users may skip it

### Media requirements

Photos/videos/files should not be universally required for all job types.

However:

- estimate-type jobs should require them
- other job types may leave media optional by default

---

## 7. Job Follow-Up Workflow

After an appointment is marked Finished and the job remains Open, the system should support common follow-up choices such as:

- close the job
- add another appointment
- leave it open

In v1:

- this follow-up prompt/action should be optional or toggle-able
- companies may choose how much workflow prompting they want
- office review choices should be history-preserving
- if office keeps the job open or schedules follow-up, BellField should acknowledge the finished-visit review so it does not remain stuck in the active review list

### Parts-needed behavior

If a technician says parts are needed:

- BellField may represent this as a status or tag on the job
- exact expanded parts-waiting workflow can be refined later

---

## 8. Reopen and New Job Workflow

### Open job follow-up

If an estimate is approved while the original job is still Open:

- the standard workflow should be to add another appointment to that same job
- however, the company should still be allowed to decide how they want to handle it

### Closed job follow-up

If an estimate is approved after the original job is already Closed:

- BellField should prompt the user to create a new job

### Manual status change prompts

If a user manually changes a job’s status:

- and the job is still Open, BellField should prompt whether they want to add a new appointment
- if the job is already Closed, BellField should prompt whether they want to make a new job instead

---

## 9. Estimate Workflow

### Estimate attachment rules

Estimates attach to the job.

They should also be visible in:

- the job tabs
- the location tabs

### Estimate lifecycle

For v1, estimate statuses should support behavior like:

- Pending
- Approved
- Declined

### Important v1 rule

Estimates should not automatically trigger later workflow yet.

That means:

- BellField records the estimate
- BellField records its approval/decline state
- office still decides how to schedule or convert that work afterward

### Optioned estimate behavior

Estimate options support good/better/best style selling without trade-specific assumptions.

For v1:

- optioned estimates may contain common/base lines plus option-specific lines
- approving an optioned estimate requires selecting one option path
- unselected options remain preserved on the estimate for declined/not-selected history
- converting an approved optioned estimate copies only the base lines plus the selected option lines
  into the invoice draft
- approval still does not automatically create a follow-up appointment; office uses the normal
  job-owned appointment flow when follow-up work should be scheduled

---

## 10. Invoice Workflow

### Invoice creation timing

An invoice draft should appear as soon as the job is created.

Practical meaning:

- the invoice may start mostly blank
- it exists early so the job can build into it over time

Current implementation note:

- structured register entries exist now
- the eager main invoice draft and automatic register-to-invoice reflection are shipped; approved estimates convert into the draft (atomic, append/replace)
- invoice posting + the posted lock + a posting-time customer/location/job snapshot have shipped (gated on `invoices:post`); adjustment/credit corrections (with office UI), manually recorded payments, manual office refunds, invoice PDF/email delivery, full-balance online payment links, the provider-confirmed online refund backend path, and a read-only cross-job bookkeeping worklist have also shipped. Still later: online refund office UI/live smoke, partial payments, deposits, stored cards, SMS, customer portal behavior, and deeper processor-fee reconciliation

### Zero-dollar invoice rule

BellField should still allow/record a zero-dollar invoice.

### Register to invoice behavior

Everything a technician adds in the register should immediately reflect on the invoice draft.

This includes:

- labor
- service items
- parts
- memberships
- other sellable items

### Invoice editability

Office users should be able to edit invoice lines even after technicians add them.

The invoice should remain editable until posting.

### Invoice states

For practical workflow purposes, the invoice should behave like:

- Draft/Editable
- Posted/Locked

### Posted invoice behavior

Once posted:

- the invoice should be locked
- BellField may allow follow-up actions such as adjustment or credit-style corrections
- BellField should not allow casual direct editing of the posted invoice itself

Implemented behavior (Milestone 8 first slice):

- posting freezes the bill-to customer, service location, job number, and work order onto the invoice, so later CRM edits cannot rewrite what the posted invoice meant
- the lock is enforced on every write path — office line edits, estimate conversion, and register reflection all refuse a posted invoice
- a register entry that syncs in after posting still saves, but is recorded on the job timeline as "not reflected" (it needs an adjustment) instead of changing the locked invoice
- posting is invoice-only and does not change job status
- corrections to a posted invoice are made through a separate adjustment or credit record (a new invoice of kind `adjustment`/`credit`, created only after the main is posted, with its own draft→posted lock and snapshot); both carry positive amounts and the kind conveys direction. The office UI for adjustments is a later slice.

---

## 11. Job Closing and Invoice Relationship

### Job closing behavior

A job should not close automatically just because work is finished in the field.

Office must manually close it.

### Costing finalization behavior

Job cost should not become final while the job is still open.

However:

- BellField should show a preview of job cost before completion
- final job cost should become real/final once the job is completed

---

## 12. Purchasing, Receiving, and Equipment Installation Workflow

### PO behavior

A PO should always have an end location such as:

- van
- inventory
- customer location

A PO does not always need a job attached.

### No split PO rule

A PO should not split across multiple destinations in v1.

### Basic PO workflow

BellField should support this simple v1 flow:

- create PO
- receive PO
- invoice PO

### Equipment receipt workflow

If equipment for a replacement job is received before it is installed:

- it should appear on the customer location as pending equipment

BellField should support statuses such as:

- Received / Not Installed
- Installed / Active
- similar practical install states later if needed

### Non-equipment material behavior

Non-equipment materials assigned to a job:

- should be included for job costing preview
- should only affect finalized job cost once the job is completed
- should not appear in the equipment tab

---

## 13. Dispatch Board Workflow Rules

### Timeline behavior

Appointments with technicians assigned:

- should appear on the timeline

Timeline ordering should use scheduled date first, then structured local start time when present.
Appointments without a structured start time should sort after timed appointments on the same day.
The free-form time-window label should remain visible as schedule context, but it should not drive timeline ordering.

Appointments without technicians assigned:

- should live in the unassigned queue
- should not appear on the timeline by default
- an unassigned column may exist as an optional dispatch board configuration

### Reassignment behavior

If an appointment is reassigned to a different technician:

- BellField should preserve that reassignment in history

### Live update behavior

Dispatch board color/status changes should update live for office users as soon as the technician or office user saves/presses that status change.

Week view should build on this structured schedule model after day-view scheduling is trustworthy.

---

## 14. Warning and Override Philosophy

### Warning style

When BellField warns a user about something risky, the normal behavior should be:

- simple yes/no confirmation

### Override behavior

Owners and admins should be able to override most workflow warnings.

### Reopen permissions

Reopening closed jobs should normally be controlled by a permission toggle set by the owner or higher-permission admin.

---

## 15. V1 State Machine Summary

### Job summary

- Jobs are flexible parent records
- Appointments are visits under them
- Finished appointments do not auto-close jobs
- Office closes jobs manually
- Posted only happens after accounting posting

### Appointment summary

- Appointment statuses are flexible
- Users may skip intermediate steps
- No Answer is a status only, not an automatic branch
- Appointment history rolls into the main job history

### Invoice summary

- Invoice draft exists early
- Register items feed the invoice draft immediately
- Office can edit until posting
- Posting locks the invoice and freezes its customer/location/job display context, except for later accounting-safe follow-up actions

### V1 design rule

BellField version 1 should behave as:

- a practical guide
- warning-driven
- history-preserving
- permission-controlled
- flexible enough for real-world office and field behavior

---

## 16. Early Milestone Office and Field Expectations

### CRM office workflow expectation

For Milestone 2, the office should be able to:

- create a customer
- create one or more locations under that customer
- create a shared contact once and link it to customer, location, or both
- reassign a location to a new current owner/customer without breaking the location's history
- archive or end-date stale contacts without making historical records confusing

### Equipment office and field expectation

For Milestone 3, the normal workflow should be:

- office or field adds equipment to the location context
- either side can fill in missing equipment details later
- status can move between pending install, active, and inactive as real work happens
- inactive equipment stays out of the default active list but remains visible in history when needed

### Jobs and appointments office expectation

For Milestone 4, the office should be able to:

- create a job with or without the first appointment
- add later appointments to an open job
- reschedule appointments without changing the underlying job meaning
- use warnings instead of hard locks for close/cancel/reopen edge cases
- rely on one mixed timeline to understand what happened on the job

### Field expectation for Milestones 2-4

Before dispatch and full field feature breadth are complete, the field app only needs enough early-milestone context to:

- understand the assigned location and bill-to context
- view and edit supported equipment details
- update appointment progress and notes against the correct job record
- sync those actions back into the same unified office-visible history
