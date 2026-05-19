# BellField Permissions Model

This document defines how permissions should work in BellField.

Its purpose is to establish a practical, role-based, grantable permission system that feels similar in spirit to established field-service platforms while still fitting BellField’s simpler, self-hosted design.

This is a product behavior document, not a coding document.

---

## 1. Core Permission Philosophy

BellField should use a permissions model based on these rules:

- BellField ships with default roles
- permissions are not hardcoded to those roles forever
- permissions can be granted or revoked by the company
- permissions exist at both the role level and the employee level
- dangerous actions should still show a confirmation prompt even when permission exists
- version 1 should feel flexible and practical, not overly restrictive

Default behavior should feel fairly open for day-to-day work, while still protecting sensitive actions.

---

## 2. Default Roles

BellField should ship with these default roles:

- CSR
- Dispatcher
- Admin
- Owner
- Book Keeping
- Technician

These roles are starting templates.

They should not lock the company into one fixed way of operating.

A company should be able to:
- use these role templates as-is
- edit them
- create custom employee permission differences later through individual overrides

---

## 3. Permission Structure

BellField permissions should exist in two layers.

### 3.1 Role-level permissions
Each default role should have a permission set that defines what that role can normally:
- view
- create
- edit
- delete
- approve
- post
- export
- configure

### 3.2 Employee-level overrides
In each employee record, BellField should allow additional per-employee toggles.

This means a company can:
- grant extra access to a trusted employee
- remove access from an employee even if their role normally has it
- fine-tune real-world needs without creating endless custom roles

Per-employee overrides should be able to loosen or tighten role defaults.

---

## 4. Visibility Philosophy

If a user does not have permission, BellField should behave one of two ways depending on the feature.

### 4.1 Read-only visibility
If the information is useful for their job and not dangerous by itself:
- the user should usually still be able to see it
- but not edit it

### 4.2 Hidden entirely
If the feature is not important to their job or its visibility would cause confusion or unnecessary risk:
- it should be hidden from that user

This means BellField should not use a one-size-fits-all rule for permission display.

Instead:
- some things should be visible but locked
- some things should be hidden completely

---

## 5. Dangerous Action Philosophy

When a user has permission to perform a risky action, BellField should still normally show:
- a simple Yes/No confirmation

Examples of risky actions:
- true deletion
- reposting/reopening important records
- changing storage paths
- moving jobs or locations in sensitive ways
- posting invoices

Owners and admins should generally be able to override most warnings if they have the appropriate permissions.

---

## 6. Module-Based Permission Areas

BellField permissions should be grouped into these major modules:

- Customers
- Locations
- Contacts
- Equipment
- Jobs
- Appointments / Dispatch
- Estimates
- Invoices
- Payments
- Purchasing
- Inventory
- Reports
- Employees / Permissions
- Company Settings
- Support / Logs / Backups

Within each module, BellField should support permission levels such as:
- View
- Create
- Edit
- Delete
- Special actions for that module

---

## 7. Role Defaults

These are the recommended default permission intentions for version 1.

### 7.1 Owner
Owner should have full visibility and full control by default.

Owner should normally be allowed to:
- see everything
- edit everything
- configure permissions
- manage employees
- reset passwords
- revoke device access
- change storage paths
- change backup settings
- reopen closed jobs
- post invoices
- permanently delete records
- export data and logs
- override workflow warnings

Owner is the highest default permission role.

---

### 7.2 Admin
Admin should have nearly full operational control.

Admin should normally be allowed to:
- see almost everything
- manage day-to-day office operations
- edit invoices
- handle payments if allowed
- manage employees if granted
- change most settings if granted
- override most workflow warnings

Admin should usually be just below Owner.

Some companies may choose to let Admin function almost the same as Owner, while still keeping certain ultimate controls owner-only.

---

### 7.3 CSR
CSR should have broad daily-work visibility and broad operational usefulness.

CSR should normally be able to:
- view customers
- view locations
- view contacts
- view equipment
- view job history and notes
- view invoices and customer-facing prices
- create customers and locations
- create jobs
- schedule appointments
- add notes
- view estimates

CSR should usually not be able to:
- post invoices
- permanently delete major records unless explicitly granted
- manage high-level company settings unless explicitly granted

CSR is intended to be broadly useful, not artificially blind.

---

### 7.4 Dispatcher
Dispatcher should be able to do most daily operational office work.

Dispatcher should normally be able to:
- see pricing and notes needed for scheduling and dispatch
- view customers, locations, equipment, and job history
- use the dispatch board
- create and move appointments
- reassign technicians
- change appointment statuses
- create jobs
- add notes
- view invoice information as needed

Dispatcher should usually have limited ability to edit invoices unless explicitly granted.

Dispatcher and CSR should overlap heavily in everyday workflows.

---

### 7.5 Book Keeping
Book Keeping should have broad financial visibility and control.

Book Keeping should normally be able to:
- see what dispatch sees
- edit invoice drafts
- post invoices
- apply payments
- handle payment-related work
- create adjustments/credits if granted
- view job notes and technician notes if needed for billing accuracy
- view dispatch/job information needed to understand billing context

Book Keeping is a financially stronger office role, not a blind accounting island.

---

### 7.6 Technician
Technician should have strong field-focused permissions by default.

By default, technicians should be allowed to:
- view assigned jobs and location details
- view job history needed to do the work
- view customer-facing selling prices
- create estimates
- add equipment
- edit equipment
- remove equipment from active service or link replacement equipment
- update appointment statuses
- add notes
- add register items
- see old invoices
- see old estimates at that location
- see full location history where useful
- edit invoice draft items through register behavior
- collect payment only if that permission is enabled

Technicians should usually not have high-level office/system control unless manually granted.

---

## 8. Pricing, Cost, and Profit Visibility

BellField should separate customer-facing pricing from internal cost visibility.

### 8.1 Customer-facing sale price
Customer-facing selling price should be visible to everyone who needs to sell, quote, or explain billing.

That includes:
- CSR
- Dispatcher
- Book Keeping
- Admin
- Owner
- Technician

### 8.2 Vendor cost
Vendor cost should normally be visible to:
- office staff
- Admin
- Owner

Technicians should only see vendor cost if that permission is specifically toggled on for them.

### 8.3 Job cost and profit visibility
Job cost, margin, and profit-style visibility should normally be available to:
- office staff where appropriate
- Book Keeping
- Admin
- Owner

Technicians should only see those internal cost/profit figures if the company intentionally toggles that on for them.

---

## 9. Owner/Admin-Only Actions by Default

These actions should be owner/admin only by default unless manually granted to other employees:

- change company settings
- manage employees
- reset passwords
- revoke device access
- change attachment storage location
- change backup settings
- post invoices
- permanently delete jobs/invoices/customers
- change permission roles
- reopen closed jobs unless granted
- move highly sensitive records where appropriate
- export sensitive data/logs unless granted

These should still be individually grantable if the company wants to loosen access.

---

## 10. Technician Default Permissions

By default, technicians should be allowed to:
- add equipment
- edit equipment
- remove equipment from active service or link replacement equipment
- create estimates
- edit invoice draft items through the register workflow
- view old invoices
- view old estimates
- view service/location context needed to do the job

Technicians should only collect payment if that permission is enabled.

Technicians should not automatically have:
- system settings access
- permissions management
- posting authority
- destructive office-wide controls
- true equipment deletion, which remains separate from operational remove/replacement behavior

Reopening closed jobs for technicians should be controlled by a permission toggle.

---

## 11. CSR and Dispatcher Relationship

CSR and Dispatcher should overlap heavily.

BellField should not artificially split them too hard by default.

### CSR focus
CSR normally leans toward:
- customer setup
- location setup
- call intake
- job creation
- appointment booking
- notes and communication handling

### Dispatcher focus
Dispatcher normally leans toward:
- dispatch board usage
- technician movement
- reassignment
- active scheduling control
- appointment status awareness

However, both roles should usually be able to do much of the other role’s practical daily work.

---

## 12. Book Keeping Permissions

Book Keeping should normally be able to:
- edit invoice drafts
- post invoices
- apply payments
- create adjustments/credits if granted
- view notes needed for billing context
- see dispatch/job context when relevant

Book Keeping should usually not be blocked from understanding the operational record behind the invoice.

---

## 13. Delete Permissions

### Default delete philosophy
By default, true delete should be more restricted.

It should normally be off for most users unless granted.

### Owner/Admin delete access
Owner and Admin should usually have the highest delete authority.

### Trusted-user flexibility
Companies may choose to grant delete access to trusted office staff.

### Technician delete default
Technician true delete should normally be off by default unless the company explicitly enables it.

### Confirmation behavior
Deleting sensitive items should trigger stronger confirmation prompts.

Examples:
- jobs
- invoices
- customers
- major historical records

---

## 14. Read-Only vs Hidden Guidance

BellField should use this practical pattern:

### Usually read-only if useful
If a screen is important for the user to understand their job, it should often remain visible in read-only form.

### Usually hidden if unnecessary
If a screen/feature is not important to that user’s job and would only clutter the system or confuse them, it should be hidden.

Example:
- a CSR may still be able to open invoices and view them
- but may not be able to post them

This should be decided feature by feature, not by a rigid global rule.

---

## 15. Export and Reporting Permissions

Export/reporting actions should usually be more restricted than ordinary viewing.

By default, these should usually belong to:
- Book Keeping
- Admin
- Owner

Unless manually granted, these users should normally control:
- export reports
- export customer/job data
- export logs for support
- print financial-style documents where relevant
- view profitability reports

Printing customer-facing estimates and invoices may be granted more broadly if useful.

---

## 16. Authentication and Identity Rules

### Individual logins
Every employee must have their own login.

Shared user accounts should not be the normal workflow.

### Password handling
Owners/high-permission admins may reset passwords.

However:
- after a password is set, they should not be able to view the password itself

### Device revocation
Owner/Admin should be able to revoke a lost or compromised device.

### Former employees
When an employee leaves:
- their account should be disabled
- their history remains tied to their identity
- deletion of that history should require appropriate permissions

---

## 17. Dangerous Action Handling

For dangerous actions, BellField should normally behave like this:

1. permission grants access to attempt the action
2. BellField shows a confirmation prompt
3. Owner/Admin can override most warnings if they have authority

This keeps BellField practical without becoming reckless.

---

## 18. Default Philosophy Summary

BellField permissions should follow this general default shape:

- CSR and Dispatcher get broad daily-work permissions
- Technician gets strong field-focused permissions
- Book Keeping gets financial permissions
- Admin gets nearly everything operational
- Owner gets everything including destructive and system-level control
- each employee can then be loosened or tightened individually

This model should give companies a strong starting point while still allowing them to shape BellField around how their own shop operates.
