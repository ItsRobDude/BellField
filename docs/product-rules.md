# BellField Product Rules

This document defines the plain-English product rules for BellField.

Its purpose is to describe how BellField should behave in real life for office staff, dispatchers, technicians, and owners.

This is not a coding document. It is the source of truth for product behavior before technical implementation details are written.

When future documents or code disagree with this document, this document should be treated as the product-level rulebook until intentionally updated.

---

## 1. Core Philosophy

BellField should be a practical field-service platform built for real companies.

It should favor:

- clear record keeping
- understandable workflows
- strong history retention
- simple daily use for office staff and technicians
- permission-based flexibility

BellField should preserve history whenever practical, but it must also allow true deletion when the user has the correct permissions.

### Product reference posture

BellField should use other field-service products as reference points, not as copy targets.

- BellField should prefer ServiceTitan-like depth in core operations such as dispatch, permissions, invoice safety, and job history.
- BellField should prefer Housecall Pro and Jobber-like simplicity for common daily tasks so small shops do not feel buried in process.
- BellField should prefer FieldEdge-like trade practicality for equipment-heavy workflows and office-to-field handoff.
- BellField should keep its own differentiation in self-hosted-first deployment, history correctness, and meaningful offline-safe field work.
- BellField should avoid taking on broad growth-suite or marketing-suite behavior early unless that work clearly serves the operational core.

BellField is not intended to be an HVAC-only product.
However, HVAC remains an important early reference case, especially for equipment-heavy workflows, replacement behavior, and service-history behavior.

### Product audience priority

BellField should make tradeoffs in this order:

1. business owners
2. office staff and dispatchers
3. field technicians

This does not mean field users are unimportant.
It means the product should first protect the owner's trust in money, schedule, job history, customer history, inventory, agreements, reports, and employee accountability.
Office staff are the primary daily operators of that trust.
Field technicians should get a focused app that captures real work cleanly, avoids clutter, and makes add-on work easy to document without turning the mobile app into the full office system.

### Operational growth posture

BellField should support growth by making legitimate operational work easier to win, finish, bill, and retain.

Growth features should feel like a natural result of captured work:

- a technician documents a real recommendation
- the office turns that recommendation into a clear estimate
- the customer can receive and approve the estimate
- approved work can become scheduled work and eventually a posted invoice
- future reminders, agreement renewals, and add-on suggestions come from real customer/equipment/job context

BellField should avoid spammy campaign behavior as an early product identity.
Marketing-style tools should not outrun operational trust, customer history, estimate quality, service agreement truth, or billing safety.

---

## 2. Customer Account Rules

### Account types

A customer account can represent any one of these at a time:

- residential person
- company
- property manager
- landlord

A single account should not try to be multiple account types at once.

### Account status

A customer account should be able to be marked inactive without being deleted.

Customer accounts should also support important flags such as:

- Do Not Service
- similar warning or restriction flags later as needed

### Customer relationships

A customer account can have:

- multiple service locations
- multiple billing contacts
- multiple regular contacts
- multiple phone numbers and email addresses with plain labels such as "main", "billing",
  "owner mobile", or "after-hours"

### Customer edit and inactive behavior

Office users should be able to:

- create a customer
- edit the current customer name, type, phone, email, and flags
- mark a customer inactive without deleting it

Inactive customers:

- should stay visible in history and admin-facing review flows
- should not appear as the default choice in normal active job/location creation flows
- may still be selected deliberately where historical cleanup or reassignment work requires it

### Customer search behavior

Milestone 2 search should be good enough for real office use, not just demo lookup.

At minimum, office users should be able to find active customers by:

- account name
- phone number
- email when present
- important flags such as Do Not Service in a readable visible way once the account is opened

---

## 3. Location Rules

### Location ownership

A location can only have one main owner/customer at a time.

However:

- a job for that location may be billed to or assigned to a different customer on a job-by-job basis
- the primary location owner/customer should be the default when creating a new job
- changing the bill-to customer for one job must never reassign the location or change the
  location's default owner/customer

### Location reassignment

If a location changes hands:

- the location should be reassignable to the new owner/customer
- the office should be able to create the new customer first if needed
- the location history should remain intact
- the location’s history moves with the location to the new owner/customer relationship
- the old customer account should no longer show the location as its current active location

### Location creation rules

A location should be allowed to exist before any equipment has been added.

This supports real-world cases where:

- the office schedules a new customer first
- equipment details are not collected until after a visit

A location should always have a name.

When creating a new location under a customer account:

- the phone number field should appear
- the email field should appear
- if the user tries to leave both blank, BellField should prompt:
  - “This location has no phone or email. Is that okay?”
- the user should have to confirm Yes or No before continuing

BellField should strongly encourage contact information for a location, even if it is not always strictly present at creation.
Fax is optional supporting data, but fax alone should not bypass the phone/email warning.

After creation, a location may have multiple phone numbers and email addresses.
Each contact method should be editable as a simple value plus label row.
BellField should not force users through a people/contact dropdown just to add a backup number or
email address for the location itself.

### Location edit behavior

Office users should be able to edit a location's:

- display name
- service address
- current owner/customer
- current location contact methods
- current contact links

Important rule:

- editing current location data must not erase the location's older ownership/contact story
- job-level bill-to changes belong on the job and should not be modeled as a location-level list of
  alternate bill-to customers

### Location search behavior

Milestone 2 should support finding locations through normal office lookup by:

- location name
- service address text
- main contact phone when present
- current owner/customer context

---

## 4. Contact Rules

### Contact relationships

Contacts can belong to:

- a customer account
- a location
- both at the same time

Contacts should be shared/linkable where possible rather than duplicated as separate people records.

### Contact fields

Contacts should support at minimum:

- phone number
- email
- fax
- multiple active phone numbers or emails over time where the real-world contact requires it

### Contact tags

Contacts should support optional tags such as:

- Primary
- Billing
- similar labels later as needed

### Contact update behavior

If a shared contact’s phone number or similar detail changes, BellField should prompt the user to choose whether to:

- update it everywhere that contact is linked
- update it only for the current location/account context

### Contact removal behavior

When removing a contact, BellField should allow choices such as:

- archive
- delete
- end-date

### Archived/end-dated contacts

If a contact is archived or end-dated:

- it should remain viewable in history
- it should not appear in normal active/current-use lists or dropdowns
- it should not create confusion between old and current data

### Shared contact linking behavior

Milestone 2 should support these office actions clearly:

- create a brand-new contact from either the customer or location context
- link an existing contact into an additional customer or location context
- unlink a contact from one context without deleting the shared contact entirely
- relink an already-linked contact without creating a duplicate relationship

Important rule:

- unlinking a contact from one place should only remove that relationship
- it should not silently remove the person from every other place they are linked
- linking the same contact to the same customer or location again should refresh the existing relationship rather than return a missing or fake link

### Contact search behavior

Active contacts should be searchable by:

- display name
- phone number
- email when present

Archived or end-dated contacts:

- should stay out of default pickers
- should remain reachable through history or explicit inactive/archive views

---

## 5. Equipment Rules

### Equipment ownership and placement

Equipment may exist in:

- a customer location
- other inventory locations if a company stocks equipment that way

BellField should allow equipment inventory to exist outside of customer locations when that reflects how the company operates.

### Equipment records

Each physical serviceable asset should be its own equipment record when the trade needs equipment tracking at that level.

HVAC examples:

- condenser
- coil
- furnace
- air handler
- package unit

BellField should not automatically merge multiple pieces into one combined system record in trades where separate tracked components matter.

### Equipment history

If equipment is removed from active use:

- it should disappear from the active equipment list
- it should still remain visible in history

### Partial equipment entry

BellField should allow partial equipment information to be entered.

This supports real-life situations such as:

- old units with faded data plates
- incomplete information during the first visit

### Equipment identity

The most important identifying fields for equipment are:

- model
- serial number

BellField does not need an extra user-facing equipment identifier beyond the normal system record identity.

### Filter field behavior

Equipment should support multiple filter sizes when needed.

The filter field should allow users to:

- add another filter size with a “+” style action
- remove a filter size with a “-” style action

### Optional equipment grouping

BellField may later support optional grouping of separate equipment records.

Example:

- in HVAC-style workflows, a user may highlight several pieces of equipment and group them to show which condenser, coil, and furnace belong together

This grouping should be optional and should not replace separate equipment records.

### Equipment edit behavior

Equipment should be editable from the location equipment context.

In early BellField milestones, the most important editable fields are:

- type
- brand
- model
- serial number
- filter sizes
- equipment location description
- install date
- status
- notes

Important rule:

- editing equipment should update the current record cleanly
- meaningful changes should still remain understandable through equipment history and job/location history

### Install-state behavior

BellField should support install-state movement without pretending every equipment record starts active.

Version 1 should support practical states such as:

- pending install
- active
- inactive

Important rule:

- pending install equipment should be visible where the company needs it
- moving equipment from pending install to active should preserve the record's continuity rather than creating a fake replacement record

### Replacement-link behavior

BellField should treat a replacement link as the moment an existing unit is replaced by a new
asset that is already pending install at the same placement.

Important rules:

- active or inactive equipment may be marked replaced
- pending install equipment should not be the old unit being replaced
- only pending install equipment at the same placement should be offered as the replacement
- confirming the replacement should mark the old equipment removed and mark the replacement active in the same trusted backend operation
- unrelated active equipment at the same location should not be offered as a replacement candidate

---

## 6. Job Rules

### Job ownership

A job can only belong to one location at a time.

A job’s location may be reassigned before it is invoiced or posted if needed.

### Job creation requirements

A job should support the following fields at creation:

- job number
- location
- customer/bill-to selection with the location’s main owner as default
- job type
- category/business unit
- origin
- summary/caller complaint
- optional appointment details at creation

A single job can have:

- one estimate
- multiple estimates
- one invoice
- multiple appointments

### Job without appointment

A job may exist with zero appointments.

Important behavior:

- if a job has zero appointments, it should not appear on the dispatch screen

### Job status model

For product rules, jobs should support simple status behavior such as:

- Open
- Closed/Completed
- Posted
- Cancelled

### Manual close behavior

Closing/completing a job should be a manual office action.

A finished appointment does not mean the whole job is finished.

### Cancelled jobs

Cancelled jobs should remain searchable in history unless truly deleted by a user with the correct permissions.

### Bill-to behavior

The location's current owner/customer should be the default bill-to when creating a job.

However:

- the office should be able to choose a different allowed bill-to for that job
- that override belongs to the job, not to every future job at that location
- the selected bill-to should remain visible in the job header and job history context

### Work order number behavior

The work order number is an operational reference field, not a replacement for the job number.

Version 1 should treat it as:

- optional
- editable by office users with the appropriate job-edit permission
- visible on the job header and in office review flows when present
- omitted from job detail surfaces when no work order number was provided

### Job timeline completeness

The job timeline should be the main readable activity record for Milestone 4.

At minimum, it should show:

- job creation
- job status changes
- appointment creation
- appointment status changes
- office or field notes
- important sync/conflict flags where they affect office understanding
- later invoice/estimate references without requiring separate hidden histories

---

## 7. Appointment Rules

### Appointment ownership

Every appointment belongs to exactly one job.

A job can have:

- zero appointments
- one appointment
- multiple appointments

### Appointment flexibility

Different appointments for the same job can have different:

- dates
- start times
- end times
- technicians
- appointment statuses

### Appointment history behavior

Appointment status history should not live in a totally separate log area.

Instead:

- appointment-related status/history should appear in the main job notes/history log

This keeps the job timeline unified.

### Appointment status behavior

Appointment statuses should remain flexible.

They do not need strict workflow enforcement in v1.

Common office actions such as confirm, reschedule, reassign, and mark technician progress should feel fast and obvious instead of buried behind enterprise-style process steps.

### Add-appointment behavior

Open jobs should allow additional appointments to be added later.

Important rule:

- this is the normal follow-up path for an open job that still needs more visits
- adding another appointment should not require creating a replacement job

If the job is already closed or cancelled:

- BellField should warn the user before allowing work to continue under that same job
- the product may prompt them to reopen the job or create a new one depending on the situation

---

## 8. Estimate Rules

### Estimate ownership

Estimates attach to the job.

They should also be visible from the location record so staff can see what work has been quoted there.

### Multiple estimates

A single job can have multiple estimates.

This includes cases such as:

- multiple part replacement options
- multiple replacement estimates
- several quoted solutions for the same job

### Historical estimate visibility

Old declined estimates should remain visible in history.

### Estimate status behavior

Estimates should support statuses such as:

- pending
- approved
- declined
- similar practical statuses later if needed

For now, estimates do not automatically trigger downstream workflow.

That means:

- an estimate can be made
- an estimate can be marked approved or declined
- the office still decides how to schedule or book follow-up work

Estimate behavior should stay practical and field-friendly before it becomes highly automated or sales-suite-heavy.

### Estimate delivery and acceptance

BellField should support sending estimates to customers, but the first version should be a customer-document workflow rather than a broad marketing system.

The preferred order is:

1. office sends or resends an estimate document by email
2. BellField records who sent it, when, to which recipient, and the provider result if available
3. customer approval/decline can later happen through a secure link with a captured name/signature and timestamp
4. approved estimates still follow the normal BellField conversion and scheduling rules

Pending and approved estimates are both sendable; declined and superseded estimates are not.
Sending a pending estimate is the normal quote flow: the customer reviews the document, then the
office records the decision. Every send stores an immutable PDF snapshot stamped with the estimate
version, so editing a pending estimate after sending never rewrites what the customer received.

Estimate email delivery is BellField-operated. The email must be sent from `estimates@bellfield.app`; shops may edit company name, reply-to, subject template, and body template, but they must not configure or replace the backend email provider.
User-facing APIs, when added later, are for automating shop workflows and must not expose backend provider keys, sending-domain controls, storage credentials, or other infrastructure settings.

Estimate delivery should not automatically schedule work, post invoices, or charge payment methods.
Office review remains the default control point.

### Sales tax behavior

Company settings own whether the shop charges customer sales tax and the default sales tax rate.
The normal estimate screen should not ask for a per-estimate tax rate.

Catalog setup owns the default taxability of work being sold:

- each catalog item can be taxable or non-taxable by default
- catalog categories can optionally seed the taxable default for new catalog items
- estimate and invoice line taxability remains line-level so staff can correct unusual cases

When an estimate or invoice is priced, BellField should snapshot the rate and line taxability used
for that document. Later company-setting or catalog changes must not silently rewrite old estimates,
posted invoices, job history, or accounting reports.

Customer sales tax is separate from purchase/vendor tax and job cost. If a shop pays tax on parts,
that belongs in purchase, inventory, or job-cost handling rather than being mixed with the customer
sales tax rate.

---

## 9. Job Reopen / Follow-Up Behavior

If a user manually changes a job’s status and the job is still open, BellField should prompt:

- ask whether they want to add a new appointment to that job

If the job has already been closed, BellField should prompt:

- ask whether they want to create a new job instead

This helps guide staff toward clean records without forcing automation too early.

---

## 10. Invoice Rules

### Invoice ownership

An invoice comes from a job, not from an individual appointment.

### Invoice count rule

A job should have one main invoice, even if it is a zero-dollar invoice.

If the job has already been invoiced and posted, later correction should happen through:

- adjustment invoices
- similar follow-up accounting actions

### Invoice editability

Invoice drafts should remain editable by users with the correct permissions.

They should remain editable until:

- the job is closed/completed
- and until the invoice is posted on the accounting side

### Posted invoice behavior

Once an invoice is posted:

- it becomes the authoritative accounting record
- it should no longer be casually editable
- follow-up correction should happen through adjustments or similar accounting-safe actions

### Invoice delivery

Posted invoice email delivery is BellField-operated. Invoice and payment-document
emails send from `billing@bellfield.app`; shops may edit company name,
reply-to, and invoice template text, but they must not configure or replace
the backend email provider.

---

## 11. Job Register / Invoice Reflection Rules

Everything a technician adds in the job register should reflect immediately on the invoice draft.

Current implementation note:

- structured register entries exist now
- every job owns one eager main invoice draft, and register entries reflect into it automatically (create/edit/void) as durable, detach-on-edit line rows
- approved estimates also convert into the draft (atomic, append/replace)
- invoice posting/locking, adjustment/credit corrections, manually recorded payments, manual office refunds, invoice PDF/email delivery, amount-scoped online payment links that default to the full amount due, job-level deposit links that land as unallocated credit, and the provider-confirmed online refund path (backend + office Refund-on-card action, pending/failed display, and live Stripe sandbox smoke) have shipped; the office surfaces a job balance and amount due plus a read-only cross-job bookkeeping worklist
- still later: stored cards, SMS, customer portal behavior, per-invoice allocation polish for pre-post deposits, and deeper processor-fee reconciliation

This includes things such as:

- labor
- service items
- parts
- memberships
- other sellable line items

Those items can still be edited later until the job is completed and the invoice is posted.

The default workflow should stay understandable for a small service company:

- common actions should be quick
- advanced controls can exist without dominating the normal path
- deeper accounting or reporting needs should not make the basic field workflow harder to use

---

## 12. Purchasing and Inventory Rules

### PO destination rule

A PO should always have an end location.

Examples:

- technician van
- inventory location
- customer location

A PO does not always need a job.

### No split PO rule

A PO should not be split across multiple end destinations in v1.

### Basic PO flow

The basic purchasing flow for now is:

- create PO
- receive PO
- invoice PO

### Customer location inventory behavior

If a PO ends at a customer location:

- BellField should not keep tracking every small non-equipment part there forever
- non-equipment parts like nuts, bolts, capacitors, and similar items should not clutter the customer equipment list

### Equipment movement behavior

If the item is equipment and is received to a customer/job location:

- BellField should show that equipment move properly from inventory to the customer location
- equipment installed at the customer location should remain there in the equipment tab/history as appropriate

### Truck inventory behavior

Truck inventory should behave much like any other inventory location.

---

## 13. History, Archiving, and Deletion Rules

### General philosophy

BellField should aim to be a strong record keeper.

That means:

- inactive and archived data should usually be preserved
- inactive and archived items should move to separate views/tabs instead of cluttering active screens

### Deletion philosophy

True deletion should also be allowed if the user has the right permission.

### High-risk deletion behavior

Everything should be deletable if permissions allow it.

However, records such as these should show a stronger warning prompt before true deletion:

- jobs
- invoices
- other major business records

Example behavior:

- standard delete prompt
- secondary “Are you sure?” confirmation for sensitive items

### Owner/high-permission behavior

The owner or other properly permissioned users should be able to truly delete records when needed.

---

## 14. Search and Visibility Rules

Inactive and archived items should:

- be hidden from normal current-use screens
- appear in a separate tab, screen, or filtered view
- still remain searchable when the user intentionally searches for inactive/history records

This keeps current work cleaner without losing history.

---

## 15. Summary Rule

BellField should default to strong history retention, clear record keeping, and practical daily workflows.

At the same time, it must also allow powerful users with the correct permissions to:

- reassign records
- archive records
- delete records
- override defaults when needed

The product should balance good record keeping with real-world flexibility.
