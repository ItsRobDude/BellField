# AGENTS.md

This file is the operating guide for AI contributors working in the BellField repository.

BellField is a self-hosted-first field-service platform for real service companies.
It should serve service industries broadly, with equipment-heavy trades like HVAC as strong early reference cases rather than hard boundaries.
It is being built for one company to use first, with future multi-tenant SaaS kept in mind.
BellField does **not** host customer business data by default.
The product must remain practical for small shops, Windows-friendly, low-cost, and maintainable.

This file is intentionally compact.
Read this first, then read only the additional docs relevant to the task you are working on.

---

## 1. BellField in One Minute

BellField is:

- customer/company first, then service locations
- self-hosted first, browser-based office app, mobile field app
- TypeScript-first across office, field, backend, and shared code
- built slower/cleaner rather than fast/messy
- history-preserving, accounting-safe, and permission-aware
- intended to stay boring, explicit, and maintainable

Default deployment model:

- one main office server PC
- multiple office desktops connecting to it
- field devices syncing back to the customer-owned server
- no BellField-hosted customer data assumption

---

## 2. Read Only the Docs You Need

Do **not** read every doc by default.
Use this routing guide to save context and stay focused.

### For all code tasks

Read:

- `README.md`
- `docs/README.md`
- `docs/repo-map.md`
- `docs/engineering-standards.md`
- this file

### If the task involves product behavior

Also read:

- `docs/product-rules.md`

### If the task involves job flow, appointment flow, estimates, invoices, status changes, or prompts

Also read:

- `docs/workflows-and-state-machines.md`

### If the task involves dispatch board behavior, scheduling, reassignment, or appointment timeline surfaces

Also read:

- `docs/screen-behavior-spec.md`
- `docs/workflows-and-state-machines.md`

### If the task involves permissions, visibility, overrides, or role behavior

Also read:

- `docs/permissions-model.md`

### If the task involves field app offline behavior, background sync, device revoke, or queued uploads

Also read:

- `docs/offline-sync.md`

### If the task involves register entries, captured work, media uploads, blobs, or attachment storage

Also read:

- `docs/data-modeling-rules.md`
- `docs/offline-sync.md`
- `docs/deployment-model.md`

### If the task involves screen layout, drawer vs full page, tabs, dashboard behavior, or field UX

Also read:

- `docs/screen-behavior-spec.md`

### If the task involves schema, entities, migrations, record ownership, history, or snapshots

Also read:

- `docs/data-modeling-rules.md`

### If the task involves migration commands, migration files, or database bootstrap workflow

Also read:

- `docs/database-migrations.md`

### If the task involves hosting, storage, backups, updates, Windows support, or self-hosting constraints

Also read:

- `docs/deployment-model.md`

### If the task involves implementation order or deciding what should come next

Also read:

- `docs/milestone-implementation-plan.md`

If a task does not touch one of these areas, do not pull in extra docs.

Historical planning docs such as `docs/product-shape-plan.md` are context only unless the task explicitly asks for older planning material.

---

## 3. Current Working Rule

Unless explicitly told otherwise:

- work on the smallest safe slice of the current milestone
- do not start later milestones early
- do not widen scope just because a future feature seems related

BellField should be built in controlled layers.

---

## 4. Non-Negotiable Product Invariants

These rules should not drift unless the docs are intentionally updated.

### Core record rules

- A customer account can have many locations.
- A location has one current main owner/customer at a time.
- A job belongs to one location.
- An appointment belongs to one job.
- A job may have zero, one, or many appointments.
- An estimate attaches to a job and is also visible from the location.
- An invoice comes from a job, not from an appointment.
- A job gets one main invoice, even if zero-dollar; later corrections use adjustment/credit-style records.
- Invoice draft exists early; posted invoice locks.

### History rules

- Preserve history whenever practical.
- Later edits to current data must not silently rewrite the meaning of old jobs/invoices.
- Archive/inactive/end-date is usually preferred over casual deletion.
- True deletion is allowed only with the correct permission and should be treated as dangerous.

### Equipment rules

- Each physical serviceable asset is its own equipment record when the trade needs asset-level tracking.
- In HVAC-style workflows, do not merge condenser/coil/furnace/etc. into one default record.
- Optional grouping is a relationship, not a merge.
- Equipment can exist at customer locations or inventory locations.
- Equipment-tagged received items can become pending/installed location equipment.

### Workflow rules

- Finished appointment does not auto-close job.
- Office closes jobs manually.
- Posted only happens after accounting-style posting.
- Version 1 is warning/prompt-driven, not lock-everything-driven.

### Sync rules

- Field users can work offline.
- Office sees field changes only after save + sync.
- Payments remain online-only in v1.
- Unsynced work should be preserved until synced or intentionally cleared.

---

## 5. Non-Negotiable Technical Invariants

### Stack direction

- Office app: TypeScript web app
- Field app: TypeScript mobile app
- Backend: TypeScript
- Shared logic: TypeScript packages where useful

### Architecture rules

- Office app and field app never talk directly to each other.
- Clients never talk directly to the database.
- Business logic lives in backend/shared domain logic, not scattered across clients.
- Do not create spaghetti coupling between modules.
- Do not hardcode customer-specific behavior into source code.

### Hosting rules

- Self-hosted first
- Customer-owned data
- No BellField-hosted customer data assumptions
- Small-shop-friendly
- Windows-friendly deployment matters
- Avoid bash-only or Linux-only assumptions where a cross-platform option is practical

### Dependency rules

- Prefer fewer dependencies.
- Do not add a package unless it clearly saves real work or improves reliability.
- Do not add flashy or heavy tooling just because it exists.

### Database rules

- Every schema change must go through tracked migrations.
- Never “just change the database.”
- Be extra careful with anything touching jobs, invoices, history, payments, or snapshots.

---

## 6. Repo Shape

Expected top-level structure:

- `apps/office-web`
- `apps/field-mobile`
- `apps/api`
- `apps/worker`
- `packages/contracts`
- `packages/estimating`
- `packages/validation`
- `packages/utils`
- `docs/`

Keep file and folder names boring and obvious.

---

## 7. Working Rules for Agents

### Scope discipline

- Work on the smallest safe slice of the requested task.
- Do not jump ahead to later milestones unless explicitly told.
- Do not sneak in auth, permissions, schema, or domain logic if the task does not ask for it.
- Do not create fake feature buttons, fake workflows, or misleading placeholder behavior.

### Coding style

- Slower but cleaner.
- Boring is good.
- Clear is better than clever.
- Consistency beats personal style.
- Small focused files are preferred.
- Avoid giant “god” files/services.

### Naming

Use descriptive names like:

- `customerAccount`
- `locationHistory`
- `jobStatus`
- `invoicePostingService`

Avoid:

- vague names
- cute names
- clever shorthand
- unexplained acronyms

### Comments

Comment:

- why something exists
- why a business rule matters
- why a workaround is necessary

Do not comment obvious code line by line.

### Logging

- Keep logs useful for troubleshooting.
- Do not dump sensitive customer/business payloads by default.
- User-facing errors should be readable.
- Technical detail belongs in logs, not in ordinary UI.

### Permissions and safety

- Hidden buttons are not real security.
- Real permission checks belong in trusted backend/shared logic.
- Dangerous actions should still confirm even if permitted.

---

## 8. Package Manager and Commands

Use **pnpm only**.

Do not mix:

- npm workspace commands
- yarn
- bun
- extra monorepo tools unless explicitly approved

Before assuming a command exists, check the repo scripts.
If you introduce a new important command, document it.

---

## 9. Milestone Discipline

BellField is being built in a controlled sequence.

Before implementing anything beyond trivial tooling, check:

- `docs/milestone-implementation-plan.md`

Rules:

- Do not build advanced features before the operational core is trustworthy.
- Do not let UI polish outrun business rules.
- Do not let schema work outrun product rules.
- Do not let mobile and office drift into separate systems.

If unsure whether something belongs in the current phase, choose the more conservative implementation.

---

## 10. Before You Edit

Before making changes:

1. Summarize the task in a few bullets.
2. List the files/docs you actually need for this task.
3. State any assumptions you are making.
4. Keep the planned change as small as possible.

If the task is large, break it into a smaller first pass instead of doing a giant hero implementation.

---

## 11. Before You Finish

Before finishing:

1. Run the relevant checks for the code you touched.
2. Fix obvious issues instead of leaving them behind.
3. Verify docs and scripts still match reality.
4. Make sure you did not accidentally introduce unrelated complexity.
5. Make sure the result matches BellField’s docs and standards.

Your final report should include:

- what changed
- assumptions made
- commands run
- anything intentionally deferred
- any remaining risks or cleanup items

---

## 12. Forbidden Moves

Do not:

- invent undocumented product behavior
- add heavy dependencies without clear justification
- add cloud-only assumptions
- hardcode customer-specific settings
- bypass migrations
- duplicate business logic across office/field/backend
- expose unfinished features as if they work
- rewrite historical/accounting behavior casually
- silently change product semantics because the code path feels easier

---

## 13. If You Are Unsure

If BellField docs do not fully answer something:

- choose the most conservative, maintainable option
- keep the implementation small
- document the assumption clearly
- do not improvise a large new pattern

When in doubt, BellField prefers:

- maintainability
- data integrity
- history preservation
- boring structure

over speed or cleverness
