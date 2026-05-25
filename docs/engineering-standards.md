# BellField Engineering Standards

This document defines how BellField code should be written, organized, reviewed, and maintained.

Its purpose is to keep BellField understandable and maintainable over time, especially when multiple humans and AI tools contribute to the codebase.

This document is a coding and implementation standard.

If BellField code "works" but ignores these standards, it should not be considered acceptable without intentional review and approval.

---

## 1. Core Engineering Philosophy

BellField should be built with these principles:

- slower but cleaner is better than fast and messy
- boring is good
- clear is better than clever
- consistency beats personal style
- maintainability matters more than showing off
- protect customer data, history, and accounting data above all
- do not trade long-term sanity for short-term convenience

BellField is not the place for fragile “smart” code, unexplained shortcuts, or architecture experiments that make future maintenance harder.

---

## 2. Source of Truth Hierarchy

When coding BellField, contributors should follow this order of truth:

1. BellField product documents in `docs/`
2. BellField engineering standards in this document
3. approved implementation plans and migrations
4. code

Important rule:

- the code should reflect the product documents
- product behavior should not be silently reinvented inside the code

If code and docs disagree, the disagreement should be fixed deliberately, not ignored.

---

## 3. Main Technology Stack

BellField should prefer one main language stack wherever practical.

### Default stack

- Office app: TypeScript
- Field app: TypeScript
- Backend/API: TypeScript

### Product stack direction

BellField should remain aligned with the current intended stack direction:

- office app as a web application
- field app as a mobile application
- backend as the single source of business logic

BellField should avoid splitting the product across many unrelated languages unless there is a very strong reason.

Reason:

- easier hiring
- easier maintenance
- easier shared validation/contracts
- easier AI-assisted development
- fewer mental context switches

---

## 4. Architecture Boundaries

BellField should enforce strong separation between:

- office app
- field app
- backend
- database/storage

### Non-negotiable rules

- office app and field app never talk directly to each other
- clients never talk directly to the database
- business logic belongs in backend/shared domain logic, not duplicated randomly across clients
- modules should not silently reach into each other’s private data and mutate it directly
- do not create spaghetti coupling between modules

### Preferred architecture behavior

- clients send requests to the backend
- backend owns business rules
- backend writes to the database
- clients render the results and local state they are responsible for

---

## 5. Keep the Code Boring

BellField code should prefer:

- simple control flow
- predictable structure
- small understandable functions
- obvious naming
- explicit behavior

BellField code should avoid:

- clever abstractions too early
- magic hidden behavior
- one-off special cases buried in random places
- giant files with mixed responsibilities
- copy-paste business logic across multiple apps

If a simpler, more obvious design is available, BellField should usually choose it.

### File Size Convention

File size is a review signal, not a blind rule.

- Files approaching 800 lines should get a reviewer challenge: can rendering, state, data access, or domain logic be split without adding noise?
- Files around 1,200 lines or larger should be treated as a blocking maintenance smell unless there is a clear reason, such as generated code, migrations, dense specs, or stable contract definitions.
- Prefer small co-located extractions before creating new folder hierarchies.
- Split mechanically first when possible. Move state or ownership only in a separate deliberate pass.

---

## 6. Naming Standards

BellField should use clear, boring, descriptive names.

### Preferred naming style

Use names like:

- `customerAccount`
- `locationHistory`
- `jobStatus`
- `invoicePostingService`

Avoid names that are:

- cute
- vague
- overly shortened
- inside-jokes
- clever for the sake of cleverness

### File and symbol naming rule

A developer should be able to guess what a file/class/function does from its name without opening it.

If a name needs explanation, it is probably not a good BellField name.

---

## 7. Comments and Documentation in Code

BellField should use comments carefully.

### Comment rules

Comments should explain:

- why something exists
- why a business rule matters
- why a non-obvious implementation choice was made
- why a workaround is necessary

Comments should not waste space explaining obvious code line by line.

### Avoid

- noisy comment blocks that repeat the code
- stale comments that stop matching reality
- filler comments that add no value

### Required-style comment examples

Good comments are especially important around:

- history preservation
- invoice locking/posting
- sync/conflict behavior
- permissions/overrides
- data migration behavior
- sensitive deletion rules

---

## 8. Dependency Standards

BellField should be strict about adding libraries and packages.

### Rules for adding a dependency

A new dependency should only be added if it clearly provides real value such as:

- saving significant implementation effort
- improving reliability
- handling a difficult/solved problem better than in-house code
- reducing long-term maintenance burden

### BellField should avoid

- flashy libraries added for convenience only
- heavy dependencies for tiny problems
- duplicate libraries that solve the same job
- packages that pull BellField toward unnecessary complexity

### Default preference

Prefer fewer dependencies and fewer moving parts.

Every added package is a long-term maintenance decision.

---

## 9. Formatting and Style Enforcement

BellField should automatically enforce formatting and basic code rules.

### Principle

Developers should not waste time arguing about code style manually.

### BellField should enforce

- consistent formatting
- consistent linting
- consistent import/order rules
- basic static checks where appropriate

This should happen automatically as part of the development process.

Human review should focus on:

- product correctness
- architecture
- security/privacy
- maintainability

not on whitespace arguments.

---

## 10. File and Module Structure

Every BellField file should have a clear reason to exist.

### Rules

- each file should have a focused purpose
- each module should own its own business area
- do not mix unrelated responsibilities in one file or one service
- avoid giant “god files” and “god services”

### Preferred organization behavior

BellField code should group work by business domain/module, not by random technical convenience alone.

That means the codebase should stay understandable from the product point of view.

---

## 11. Shared Logic Rules

BellField should not copy the same business rule into multiple places.

### Rules

- if office app and field app need the same business rule, that rule should live in shared/backend logic where practical
- do not duplicate validation/business behavior in three places unless there is a clear reason
- UI-specific behavior can stay client-side, but business truth should not drift

### Examples

Important shared business rules include:

- invoice posting behavior
- permission checks
- job/appointment state rules
- data snapshots/history rules
- sync conflict rules

---

## 12. Database Change Standards

BellField database changes must always be tracked.

### Non-negotiable rule

Every database change must go through a proper tracked migration/change file.

### Never acceptable

- manually changing the database and hoping everyone remembers
- “quick local fixes” with no migration
- schema drift between environments

### Migration expectations

Migrations should be:

- readable
- reversible where practical
- reviewed carefully
- respectful of historical and financial data

Any migration touching jobs, invoices, payments, snapshots, or history must be treated with extra caution.

---

## 13. Data Protection Standards

BellField must treat the following as high-risk data areas:

- customer data
- contact data
- service history
- equipment history
- invoices
- payments
- posted accounting records
- backups
- logs

### Rules

- do not casually expose sensitive data in logs
- do not rewrite historical meaning accidentally
- do not allow convenience shortcuts that weaken accounting/history integrity
- protect posted/accounting data with extra care

BellField should always assume customer trust is hard to earn and easy to lose.

---

## 14. Logging Standards

BellField should keep good logs for troubleshooting and bug fixing.

### BellField should log

- technical errors
- important workflow actions
- significant state changes
- sync failures/retries
- permission-sensitive actions where appropriate

### BellField should avoid logging by default

- unnecessary customer/private business content
- raw sensitive data dumps
- logs so noisy that real issues become invisible

### Logging principle

Logs should be useful enough to help solve problems without turning into a privacy mess.

---

## 15. Error Handling Standards

BellField should handle errors in a human-friendly way.

### User-facing behavior

Users should see:

- clear readable error messages
- practical next-step guidance when possible
- warnings that make sense in normal office/field language

### Technical behavior

Technical details should go to logs, not directly to ordinary users.

### BellField should avoid

- raw crash text shown to office staff or technicians
- vague “something went wrong” messages with no guidance
- silent failures with no trace

---

## 16. Settings and Configuration Rules

BellField must separate:

- company/business settings
- server/environment configuration
- secrets/credentials

### Rules

- company-specific behavior belongs in BellField settings
- environment/server secrets stay outside normal app data/settings
- never hardcode customer-specific settings into the codebase
- never hardcode secrets into source files

BellField must remain deployable to different companies without editing core code for each customer.

---

## 17. Feature Flags and Unfinished Work

BellField should never leave confusing half-built features exposed casually.

### Rules

- unfinished features should be hidden or cleanly disabled
- do not leave dead-end buttons active just because code exists behind them
- if a feature is incomplete, BellField should clearly communicate that through controlled feature visibility

The product should feel intentional, even when work is still in progress.

---

## 18. Testing Standards

BellField should treat testing as important from the start, but should focus energy where it matters most first.

### BellField testing philosophy

- core features should be tested early
- history/accounting/privacy/sync behavior deserves extra testing priority
- not every tiny feature needs maximum test depth on day one
- important business-critical flows should not rely on “we clicked it once and it seemed fine”

### Highest-priority test areas

BellField should prioritize tests around:

- job and appointment workflow rules
- invoice draft vs posted behavior
- permissions/overrides
- sync/offline conflict handling
- history preservation
- deletion/archive safeguards
- equipment/location ownership rules

### Practical standard

Testing should be strong enough to protect BellField’s core business truth without blocking progress on every minor polish detail.

---

## 19. AI-Generated Code Standards

BellField should never accept AI-generated code just because it appears to work.

### Non-negotiable rule

AI-generated code must still follow:

- BellField product documents
- BellField module boundaries
- BellField naming standards
- BellField comment standards
- BellField migration rules
- BellField testing expectations
- BellField privacy/logging rules

### AI code review rule

All AI-generated code should be reviewed for:

- correctness
- maintainability
- duplication
- hidden assumptions
- drift from BellField rules
- dependency creep

AI should help BellField move faster, but BellField’s standards should control the AI, not the other way around.

---

## 20. Code Review Standards

BellField reviews should focus on substance, not style nitpicks already handled automatically.

### Reviewers should check

- does this match the product documents?
- does this create spaghetti coupling?
- does this protect history and accounting data?
- is naming clear?
- is the solution simpler than it needs to be?
- is this dependency really justified?
- does it introduce duplication?
- does it create hidden behavior?

### Docs/code drift checklist

For any change that touches product behavior, workflow rules, shared contracts, permissions, or persistence, reviewers should confirm:

- relevant product/workflow/modeling docs were checked
- docs were updated when behavior changed
- shared contract types changed when API request/response shape changed
- tests protect the business rule, not just the happy path
- validation included the narrow relevant checks plus `pnpm check:architecture` when boundaries or shared contracts changed

### BellField review principle

A change should not be approved just because it passes technically if it makes the codebase harder to understand later.

---

## 21. Security and Permission Discipline

BellField should be careful with sensitive operations.

### Rules

- permission checks should live in trusted backend/shared logic, not just client UI
- never assume hidden buttons equal real security
- destructive or sensitive actions should be guarded and logged appropriately
- owner/admin override behavior should still be explicit and intentional

BellField should treat permissions as real business/security rules, not decorative UI choices.

---

## 22. Backward-Safe Development Mindset

BellField should prefer safe change over reckless refactors.

### Rules

- new features should not casually break existing workflows
- if a workflow changes, history and data meaning must be preserved
- changes touching old records should be treated very carefully
- posted/accounting records must be treated with extra caution

BellField should be a system companies can trust with years of records, not just today’s data.

---

## 23. Maintainability Over Personal Preference

BellField is not a personal playground.

### Principle

Contributors should not shape the codebase around their own favorite style if it weakens consistency.

This means:

- do not invent a new pattern every week
- do not mix styles wildly between modules
- do not make future developers guess which “flavor” of BellField they are reading

Minor personal preference is fine.

Major consistency breaks are not.

---

## 24. BellField Engineering Summary

BellField engineering should follow this practical standard:

- slower but cleaner
- TypeScript-first across the stack
- boring names
- comments explain why, not obvious code
- strict about dependency creep
- automatic formatting/linting/basic checks
- migrations for every database change
- strong logging without leaking sensitive data
- clear user-facing errors, technical detail in logs
- no spaghetti between office app, field app, backend, and modules
- hide or disable unfinished features cleanly
- test the important stuff early
- protect history, accounting data, and customer data
- AI must follow BellField’s rules, not improvise them

If BellField sticks to these standards, the codebase should stay manageable, predictable, and easier to grow over time.
