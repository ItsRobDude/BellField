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
- BellField should prefer FieldEdge-like HVAC practicality for equipment-heavy workflows and office-to-field handoff.
- BellField should keep its own differentiation in self-hosted-first deployment, history correctness, and meaningful offline-safe field work.
- BellField should avoid taking on broad growth-suite or marketing-suite behavior early unless that work clearly serves the operational core.

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

---

## 3. Location Rules

### Location ownership
A location can only have one main owner/customer at a time.

However:
- a job for that location may be billed to or assigned to a different customer on a job-by-job basis
- the primary location owner/customer should be the default when creating a new job

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
  - “Are you sure you don’t want to add a phone number or email for this location?”
- the user should have to confirm Yes or No before continuing

BellField should strongly encourage contact information for a location, even if it is not always strictly present at creation.

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

---

## 5. Equipment Rules

### Equipment ownership and placement
Equipment may exist in:
- a customer location
- other inventory locations if a company stocks equipment that way

BellField should allow equipment inventory to exist outside of customer locations when that reflects how the company operates.

### Equipment records
Each piece of HVAC equipment should be its own equipment record.

Examples:
- condenser
- coil
- furnace
- air handler
- package unit

BellField should not automatically merge multiple pieces into one combined system record.

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
- a user may highlight several pieces of equipment and group them to show which condenser, coil, and furnace belong together

This grouping should be optional and should not replace separate equipment records.

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

---

## 11. Job Register / Invoice Reflection Rules

Everything a technician adds in the job register should reflect immediately on the invoice draft.

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
