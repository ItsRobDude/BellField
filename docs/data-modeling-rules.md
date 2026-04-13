# BellField Data Modeling Rules

This document defines the data-modeling rules BellField should follow before full schema design begins.

Its purpose is to translate BellField’s product behavior into stable record-keeping rules so future database design stays aligned with how the app should work in real life.

This is not a final schema document. It is the rulebook the schema should obey.

---

## 1. Core Modeling Philosophy

BellField should model real business records in a way that is:
- history-friendly
- practical
- easy to understand
- flexible enough for real office work
- strict enough to avoid broken records

BellField should prefer:
- preserving history
- using archive/inactive/end-date behavior where practical
- allowing true deletion only when the user has the correct permission
- separating current/live data from historical snapshots

The database design should reflect how the company actually works day to day, not just what is easiest to code.

---

## 2. Current Data vs Historical Data

BellField should distinguish between:
- current/live records
- historical activity
- final business snapshots

### Current/live records
These are the records users actively work with now, such as:
- current customer account information
- current location ownership
- current active contacts
- current active equipment
- open jobs
- draft invoices

### Historical activity
These are records or timelines that show what changed over time, such as:
- job status changes
- appointment changes
- contact changes
- equipment changes
- invoice-note edits
- reassignment history

### Final snapshots
When a record should not be rewritten by later changes, BellField should preserve a snapshot of the important information as it existed at that time.

This is especially important for:
- jobs
- invoices
- posted financial records
- historical customer/location/contact context tied to past work

Important rule:
- later edits to current customer/location/contact data must not rewrite what an old job or old invoice meant at the time it happened

---

## 3. Customer Account Modeling Rules

### Customer record meaning
A customer account is the company/person-level record BellField uses to organize business relationships.

A customer account may represent one type at a time, such as:
- residential person
- company
- property manager
- landlord

### Customer account behavior
A customer account should support:
- active/inactive state
- flags such as Do Not Service
- multiple service locations
- multiple contacts
- multiple billing contacts

### Customer history rule
If a customer account changes name, status, contacts, or ownership relationships later:
- the current customer record should update
- historical jobs/invoices tied to old work should still preserve what was true at that time

---

## 4. Location Modeling Rules

### Location meaning
A location is the physical service address where work happens.

A location is one of BellField’s most important long-lived records.

### Location rules
A location:
- always has a name
- can exist before equipment is added
- can move from one owner/customer to another over time
- can have multiple contacts
- should remain the same long-lived location record even if ownership changes

### Current owner rule
A location can only have one main owner/customer at a time.

### Job-level bill-to override rule
Even though a location has one main owner/customer, an individual job at that location may use a different customer/bill-to record for that specific job.

Important rule:
- the primary location owner/customer is the default
- but the job may override it on a case-by-case basis

### Ownership change rule
If a location changes hands:
- the location record stays the same
- the current owner relationship changes
- the new owner becomes the active owner
- old jobs/invoices/history stay with the location’s historical story
- the old customer should no longer show that location as a current active location

### Contact warning rule for new locations
When creating a location, BellField should strongly encourage contact information.

It should show phone/email fields and warn the user if both are left blank.

This warning is a workflow rule, but the data model should support locations that are created before perfect contact information exists.

---

## 5. Contact Modeling Rules

### Contact meaning
A contact is a person record that may be connected to:
- a customer account
- a location
- both

### Shared-contact rule
Contacts should be shared/linkable rather than duplicated whenever possible.

That means:
- the same person can belong to both a customer and a location
- BellField should support one contact linked to multiple related places where appropriate

### Contact field rule
Contacts should support at minimum:
- phone number
- email
- fax
- optional tags such as Primary or Billing

### Contact update rule
When a shared contact changes:
- BellField should support updating that shared person broadly
- or splitting the change so it only applies in one context

This means the data model must support both:
- shared contact identity
- practical context-specific behavior when the user chooses not to update everywhere

### Contact removal rule
Contacts should support:
- archive
- delete
- end-date

Archived/end-dated contacts:
- should disappear from normal active-use lists
- should remain visible in history

---

## 6. Equipment Modeling Rules

### Equipment meaning
Each physical serviceable asset should be its own separate equipment record when the trade needs equipment tracking at that level.

HVAC examples:
- condenser
- coil
- furnace
- air handler
- package unit

BellField should not treat a whole system as one single equipment record by default in trades where separate tracked components matter.

### Equipment placement rule
Equipment may exist in:
- a customer location
- another inventory location if a company stocks equipment that way

### Equipment history rule
Equipment removed from active use:
- should leave the active list
- should remain in history

### Partial-entry rule
BellField must support equipment records with incomplete details.

This reflects real service work where the office or technician may not know every detail immediately.

### Equipment identity rule
The most important user-facing identifying fields are:
- model
- serial number

BellField does not need an extra user-facing equipment ID beyond those fields.

Important clarification:
- BellField will still need technical/internal record IDs under the hood
- but users should not be forced to manage another visible identifier just to use the product

### Filter rule
A single equipment record must support multiple filter sizes if needed.

### Equipment grouping rule
Optional grouping may exist later to show that separate pieces belong together as one practical system.

Important rule:
- grouping is a relationship between equipment records
- grouping must not merge separate equipment into one record

### Serialized equipment rule
Equipment inventory that is true installed equipment should be tracked individually and treated as serialized equipment where applicable.

### Pending vs active install rule
BellField should support install-state style concepts such as:
- received / not installed
- installed / active

This is especially important when equipment is received before installation is completed.

---

## 7. Job Modeling Rules

### Job meaning
A job is the parent operational work record.

### Job ownership rules
A job:
- belongs to one location at a time
- may use the location’s default owner/customer as bill-to
- may override bill-to/customer on that specific job
- can be reassigned to a different location before invoicing/posting if needed

### Job core fields
The job record should support, at minimum:
- job number
- location
- customer/bill-to reference
- job type
- category/business unit
- origin
- summary/caller complaint
- status
- work order number field

### Job relationship rules
A job may have:
- zero appointments
- one appointment
- multiple appointments
- zero or more estimates
- one main invoice
- later adjustment invoices after posting if needed

### Job status rule
Jobs should support simple main states such as:
- Open
- Closed/Completed
- Posted
- Cancelled

### Job history rule
The job should act as a central timeline for:
- notes
- status history
- appointment changes
- technician activity
- invoice-related activity references
- estimate-related activity references

---

## 8. Appointment Modeling Rules

### Appointment meaning
An appointment is a scheduled visit attached to one job.

### Appointment relationship rule
Every appointment belongs to exactly one job.

### Appointment flexibility rule
Appointments under the same job may differ by:
- date
- start time
- end time
- assigned technician(s)
- appointment status

### Appointment status rule
Appointment statuses are flexible in version 1.

The data model should support the default statuses such as:
- Assigned
- Confirmed
- On the Way
- Arrived
- Working
- Finished
- No Answer

Important rule:
- appointment status changes should feed the main job history rather than living in a totally separate disconnected history structure

### Unscheduled job rule
A job may exist with zero appointments.

This means the data model must allow:
- jobs without appointments
- appointments created later

---

## 9. Estimate Modeling Rules

### Estimate meaning
An estimate is a quoted solution attached to a job.

### Estimate relationship rules
An estimate:
- attaches to a job
- should also be visible from the location’s history/view
- may be one of many estimates under the same job

### Estimate status rule
Estimates should support practical states such as:
- pending
- approved
- declined

### Estimate workflow rule
In version 1, estimate approval does not automatically create new downstream records.

That means the data model should not assume automatic conversion just because an estimate was approved.

---

## 10. Invoice Modeling Rules

### Invoice meaning
An invoice is the financial record attached to a job.

### Invoice ownership rule
The invoice comes from the job, not from an individual appointment.

### Main invoice rule
A job should have one main invoice, even if that invoice is zero dollars.

After the main invoice is posted, later correction should happen through:
- adjustment invoices
- credit-style follow-up records

### Invoice draft rule
An invoice draft should exist as soon as the job is created, even if it starts mostly blank.

### Register reflection rule
Technician register entries should reflect immediately on the invoice draft.

### Invoice editability rule
Invoice drafts should remain editable until posting.

### Posted invoice rule
Once posted:
- the posted invoice is the authoritative accounting record
- it should be locked from ordinary editing
- follow-up correction should use adjustment/credit style records rather than rewriting the posted invoice directly

### Invoice snapshot rule
Invoices should preserve the customer/location/job context as it existed at the time that invoice mattered.

This prevents later customer/location changes from corrupting old financial records.

---

## 11. Register and Line Item Modeling Rules

### Register meaning
The register is the field/office line-entry area where users add things that affect the invoice draft.

### Register line types
Register lines may include:
- labor
- service items
- parts
- memberships
- other sellable line items

### Register-to-invoice rule
Register lines should map to invoice-draft content immediately.

### Costing preview rule
Before job completion/posting, BellField may show cost previews.

However:
- final job costing should not be treated as final until the job reaches completion/finalization points defined by workflow

---

## 12. Purchasing and Inventory Modeling Rules

### PO destination rule
A PO must always have one destination/end location.

Examples:
- truck/van
- inventory location
- customer location

### No-split PO rule
A PO should not be split across multiple destinations in version 1.

### Job-link rule
A PO does not always require a job.

It may optionally link to a job when appropriate.

### Basic PO lifecycle rule
The base purchasing lifecycle should support:
- create
- receive
- invoice

### Customer-location material rule
If parts are delivered to a customer location:
- non-equipment consumables/parts should not automatically clutter the equipment list
- only true equipment should remain modeled as installed/pending equipment there

### Equipment receipt rule
If an equipment-tagged PO item is received to a customer/job location:
- BellField should model that equipment as pending/current equipment at that location according to install state

### Truck inventory rule
Truck inventory should behave much like any other inventory location.

---

## 13. Activity and Audit Modeling Rules

### History rule
BellField should preserve readable activity/history for major operational events.

This includes:
- job changes
- appointment changes
- reassignment history
- invoice-note edits
- equipment changes
- contact changes
- location ownership changes

### Unified history rule
Where practical, history should appear in unified timelines rather than scattered disconnected fragments.

### Delete visibility rule
Even though BellField allows true deletion with permission, BellField should still prefer to preserve as much meaningful history as practical unless the user intentionally removes it with the required authority.

---

## 14. Archive vs Delete Rules

### Default business preference
BellField should usually prefer:
- archive
- inactive
- end-date

instead of casual true deletion.

### True delete rule
True deletion must still exist for users with the correct permissions.

### Sensitive delete rule
Sensitive records such as jobs and invoices should require stronger confirmation before true deletion.

### Search/visibility rule
Archived/inactive items should:
- leave the normal active view
- remain available through history/inactive filters where appropriate

---

## 15. Search Key Rules

BellField should favor these practical search keys:
- customer
- location
- job number
- invoice number
- equipment serial number
- contact name
- contact phone number

Important rule:
- equipment model may still exist as data
- but it should not be relied on as the primary default search key in the product model

---

## 16. Schema Direction Summary

When schema work begins, BellField’s database design should follow these product rules:
- long-lived locations
- customer ownership that can change over time
- shared contacts where practical
- separate equipment records, not merged systems
- optional equipment grouping as a relationship only
- one job as parent record
- one appointment belongs to one job
- jobs may exist without appointments
- estimates attach to jobs and are visible from locations
- one main invoice per job, with later adjustments if needed
- invoice drafts start early and posted invoices lock
- one PO has one destination
- equipment-tagged received items can become pending/installed location equipment
- archived/inactive data leaves active views but remains accessible
- snapshots preserve old truth even when current records change later

This document should guide the next layer of work: detailed entity design and actual schema planning.
