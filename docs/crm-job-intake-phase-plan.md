# CRM and Job Intake Phase Plan

This is the controlling plan for the customer, location, contact-method, and New Job intake correction lane.

## Stop Rule

The current implementation state is complete through **Phase 4**.

Do not implement Phase 5 or later work from this document unless the user explicitly authorizes that next phase.

If a later-phase behavior already exists because of earlier drift, document it as already present and do not expand it further before its phase is explicitly authorized.

## Phase 0: Lock Product Rules

Update docs before code:

- Customer/location contact info supports multiple contact methods.
- Location has one current owner/customer.
- Job bill-to override is per-job only and never changes location ownership.
- Old jobs/invoices keep their historical/customer billing meaning.
- New Job is call intake, not "pick location first."
- Root CRM creates customers only; locations/contacts are contextual.
- "History" on customer/location becomes "Activity" when it includes service/work records.

## Phase 1: Contact Methods Data Model

Add real backend support.

### Migration

- Add customer contact methods, location contact methods, and probably contact contact methods.
- Fields: id, owner id, kind phone/email/fax, value, label, is_primary, is_active, created_at, updated_at, optional ended_at.
- Backfill existing phone/email/fax into primary contact method rows.
- Keep legacy columns initially for compatibility/search transition, but stop making new UI depend on them.

### Contracts

- Add `ContactMethodSummary`.
- Add `contactMethods` arrays to `CustomerDetail`, `LocationDetail`, and `ContactDetail`.
- Add create/update/archive contact-method requests.
- Keep summary phone/email derived from primary methods for lists/search.

### Repository/API

- Add read/write methods in company-data.
- Update CRM search to search contact-method values, not only legacy columns.
- Update duplicate detection to use contact methods.
- Preserve missing phone/email confirmation by checking active customer/location methods.

### Tests

- Migration backfill.
- Create/edit/archive customer/location contact methods.
- Search by secondary phone/email.
- Duplicate warning by secondary phone/email.
- Missing-contact warning based on methods.

## Phase 2: Job Intake Rebuild

This fixes the call-booking flow fully.

### Backend

- Keep `CreateJobRequest.locationId` required at final submit.
- Keep `billToCustomerId` optional and job-only.
- No backend change needed unless draft intake persistence is added later.

### Office

- Remove global top-bar New Job.
- Put New Job somewhere operational, likely a smaller sidebar/Dispatch/Jobs quick action.
- Intake opens empty. Nothing auto-selected.
- Top section is search/create customer/location while call details can be typed.
- Job details and scheduling are visible immediately.
- Create Job stays disabled until a location is selected.
- Selecting a location shows compact location + default customer.
- "Change customer for this job" opens customer search/create, not a dropdown.
- Sending override includes `billToCustomerId`; leaving it alone sends nothing and backend defaults to location owner.
- No location `alternateBillToCustomerIds` in this flow.

### Tests

- New Job opens with no selected customer/location.
- Job details can be typed before customer/location exists.
- Create disabled until location.
- Selecting location does not render bill-to dropdown.
- Job bill-to override uses search/create and sends job-only override.
- Existing location owner remains unchanged.

## Phase 3: CRM Root and Panel Refactor

Do this before heavy CRM UI change.

Status: implemented.

### Split `crm-panel.tsx` Into

- `crm-search-surface`
- `customer-detail-surface`
- `location-detail-surface`
- `contact-methods-editor`
- `owner-transfer-panel`
- `record-activity-section`

### Behavior

- CRM root: only New customer.
- Add location: visible only on selected customer.
- Add contact/contact method: visible only inside customer/location/contact context.
- Remove root New location and root New contact.

### Tests

- Root does not show New location/contact.
- Customer detail shows Add location.
- Location/customer detail shows contact method actions.
- No orphaned create modes reachable without context.

## Phase 4: Ownership Transfer

Backend and UI, not just a button.

Status: implemented.

### Contracts

- Change `ReassignLocationOwnerRequest` to include `effectiveDate` and `note`.
- Allow today or past dates first. Future scheduled ownership is a bigger model because current owner must become date-aware or needs a scheduled transition process.

### Backend

- `reassignLocationOwner(locationId, customerId, effectiveDate, note)`.
- Validate target customer active.
- Reject same owner unless note-only history is explicitly intended.
- Close prior ownership at effective date.
- Insert new ownership row starting effective date.
- Update `locations.customer_id` only when effective date is today/past.
- Do not rewrite jobs/invoices. Existing jobs already have `billToCustomerId`; posted invoices already snapshot display context.

### UI

- Remove always-visible reassignment box.
- Add Transfer ownership action.
- Opens search/create customer flow.
- Select customer, effective date, note, review confirmation.
- No customer dropdown.

### Tests

- Ownership transfer requires selected customer + effective date.
- Transfer updates current owner.
- Old ownership history remains.
- Old job bill-to does not change.
- Posted invoice snapshot does not change.
- Future effective date rejected for v1 unless scheduled transfer is intentionally built.

## Phase 5: Location/Customer Operational Pages

Make CRM useful for service work.

Do not implement until Phase 5 is explicitly authorized.

### Backend

Extend customer/location detail or add scoped endpoints:

- recent/open jobs
- appointments
- invoices
- estimates
- equipment
- activity entries

For location detail, include jobs for that location.

For customer detail, include jobs where customer is owner or bill-to.

### UI

- Location tabs: Overview, Contacts, Equipment, Jobs, Invoices, Activity.
- Customer tabs: Overview, Locations, Contacts, Jobs, Invoices, Activity.
- Activity replaces vague "History" where service/customer events are mixed.
- Overview shows current owner/customer, main methods, open jobs, last service, equipment count.

### Tests

- Location page shows jobs/appointments.
- Customer page shows service context.
- Activity contains ownership/contact/job events.
- Inactive/historical records remain visible where appropriate.

## Phase 6: Job Detail Navigation

Connect operational records.

Do not implement until Phase 6 is explicitly authorized.

### Office

- In job overview, Location becomes a button/link to that location page.
- Customer/Bill-to becomes a button/link to that customer page.
- Shell passes a CRM navigation target into CRM surface.
- Back path returns to the job.

### Tests

- Clicking Location opens exact location detail.
- Clicking Customer opens exact customer detail.
- Back returns to job context.

## Phase 7: Shell Cleanup

Do this after the workflow pieces are right.

Do not implement until Phase 7 is explicitly authorized.

- Remove large top bar.
- Add compact bottom-left account initials menu with account/sign out.
- Move refresh to contextual surfaces or a small icon control.
- Move New Job out of top bar into an operational quick action.
- Do not overhaul sidebar just to avoid ServiceTitan similarity. Improve it only where it serves BellField: clearer grouping, less bulk, maybe icons later.

## Current Phase 0-4 Checkpoint

This checkpoint records the current repo state so implementation and review do not drift across phase names.

### Phase 0 Status

Status: implemented in focused docs.

- `docs/product-rules.md` now states multiple contact methods, one current location owner/customer, job-only bill-to overrides, historical billing meaning, and contextual CRM creation rules.
- `docs/workflows-and-state-machines.md` now frames New Job as call intake instead of a forced location-first wizard.
- `docs/screen-behavior-spec.md` now moves global actions out of the large top bar and into operational/contextual places.
- `docs/data-modeling-rules.md` now states job-level bill-to override and contact-method modeling rules.

Remaining Phase 0 note:

- The Activity rename is documented as the direction for customer/location mixed service history, but the full customer/location Activity implementation belongs to Phase 5.

### Phase 1 Status

Status: implemented.

- The implementation uses one polymorphic `crm_contact_methods` table instead of three separate tables. It keeps exactly one owner reference active by owner kind, which satisfies the phase intent without duplicating nearly identical tables.
- Existing customer, location, and contact phone/email/fax values are backfilled into active primary contact-method rows.
- Legacy phone/email/fax columns remain for compatibility and list/search transition.
- Contracts expose `ContactMethodSummary` and `contactMethods` arrays on `CustomerDetail`, `LocationDetail`, and `ContactDetail`.
- Company-data has read/write methods for contact methods.
- CRM search includes active contact-method values.
- Duplicate detection consults contact methods as well as legacy fields.
- Missing phone/email confirmation remains preserved while contact methods are introduced, and active phone/email contact methods count as contact info for the location warning.

Phase 1 implementation notes:

- Archive semantics are represented by updating a contact method to `isActive: false`; that keeps the API smaller while preserving history via inactive rows and `endedAt`.
- Regression coverage exists for migration backfill, secondary contact-method search SQL, secondary contact-method duplicate warnings, archive-by-inactivation, and missing-contact confirmation against active methods.

### Phase 2 Status

Status: implemented.

- `CreateJobRequest.locationId` remains required at submit.
- `billToCustomerId` remains optional and job-only; the backend defaults to the location owner when omitted.
- New Job is no longer in the global top bar. It is now an operational rail action and remains available from the Jobs queue.
- Intake opens empty with no selected customer or location.
- Job details and scheduling are visible before a location is selected.
- Create Job is disabled until a location is selected.
- Selecting a location shows a compact selected-location card with the default location owner/customer.
- Changing customer for the job uses search/create and sends a job-only `billToCustomerId` override only when selected.
- The New Job flow does not use location `alternateBillToCustomerIds`.
- Regression coverage proves a job-only bill-to override is passed to job creation without reassigning the location owner/customer.

Phase 2 validation note:

- A browser smoke of the New Job intake path is still useful before release-level signoff, but the Phase 2 automated behavior checklist is covered.

### Phase 3 Status

Status: implemented.

- `crm-panel.tsx` is now orchestration under the 800-line file-size guard.
- The CRM root exposes only New customer.
- Add location is visible only inside selected customer context.
- New contact remains contextual to selected customer/location context, not the CRM root.
- Contact-method actions are visible only inside selected customer/location/contact detail.
- The Phase 3 split exists in focused files:
  - `crm-search-surface`
  - `crm-detail-router`
  - `customer-detail-surface`
  - `location-detail-surface`
  - `contact-detail-surface`
  - `contact-methods-editor`
  - `owner-transfer-panel`
  - `record-activity-section`
  - `crm-form-helpers`
  - `use-crm-search`

Phase 3 boundary notes:

- Location/customer Jobs, Invoices, and Activity service records belong to Phase 5.
- Job detail links to CRM pages belong to Phase 6.
- Top-bar/sidebar cleanup belongs to Phase 7.

### Phase 4 Status

Status: implemented.

- `ReassignLocationOwnerRequest` now requires an explicit `effectiveDate` and accepts an optional note.
- The backend rejects future effective dates for v1, inactive target customers, and same-owner transfers.
- Ownership transfer closes the prior active ownership history row at the effective date, inserts the new owner history row at the same effective date, and updates the location's current customer for today/past transfers.
- Ownership transfer does not rewrite jobs or invoice snapshots.
- The location UI no longer exposes an always-present owner dropdown.
- Transfer ownership is an explicit action that opens customer search/create, effective date, note, and review confirmation.
- The UI posts the selected customer and effective date through the ownership-transfer endpoint and refreshes the selected location after success.
- Regression coverage exists for backend validation, repository history updates, no root owner dropdown, customer search transfer, and creating/selecting a customer inside the transfer flow.

### Existing Out-of-Phase Work Already Present

No Phase 5+ behavior is intentionally implemented in this checkpoint.
