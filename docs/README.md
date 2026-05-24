# BellField Docs Index

This file is the documentation ownership map for BellField.

Use it to answer two questions quickly:

- which document owns a topic
- which documents are context only and should not be treated as primary source of truth

## Source of Truth Rules

Prefer focused source-of-truth docs over broad planning docs.

Use this general precedence:

1. `AGENTS.md` for contributor operating rules
2. focused docs in `docs/` for product, workflow, modeling, deployment, and implementation guidance
3. legacy planning docs only for background context
4. code, scripts, and the filesystem for what currently exists in the repo

Important interpretation rules:

- `README.md` is the repo landing page and navigation hub. It is not the full product rulebook.
- If a focused doc and a planning doc overlap, prefer the focused doc.
- If a doc describes future-state architecture, do not assume every listed app, package, or module already exists.

## Canonical Docs

### [engineering-standards.md](./engineering-standards.md)

Audience: engineers and AI contributors.

Purpose: coding standards, implementation posture, naming, structure, logging, testing, and review expectations.

Read when: writing or reviewing code, planning implementation shape, or deciding how to structure a change.

Does not own: product behavior, workflow rules, permission behavior, or deployment constraints.

### [product-rules.md](./product-rules.md)

Audience: product, engineering, and contributors implementing user-facing behavior.

Purpose: plain-English product rules for accounts, locations, contacts, equipment, jobs, estimates, invoices, and related core behavior.

Read when: deciding how BellField should behave for office or field users.

Does not own: UI layout details, low-level workflow sequencing, or schema implementation details.

### [workflows-and-state-machines.md](./workflows-and-state-machines.md)

Audience: product and engineering contributors working on lifecycle behavior.

Purpose: job, appointment, estimate, invoice, purchasing, and close-out workflow rules.

Read when: implementing or reviewing status changes, prompts, follow-up behavior, or office-to-field lifecycle logic.

Does not own: screen layout, full permission taxonomy, or schema structure.

### [permissions-model.md](./permissions-model.md)

Audience: contributors working on access control, visibility, approvals, and overrides.

Purpose: role templates, permission behavior, employee overrides, and dangerous-action expectations.

Read when: adding protected actions, changing role behavior, or defining what users can view or edit.

Does not own: workflow sequencing, screen layout, or deployment architecture.

### [offline-sync.md](./offline-sync.md)

Audience: contributors working on field-mobile behavior, sync flows, and offline tolerance.

Purpose: what the field app stores locally, what can happen offline, sync expectations, and conflict posture.

Read when: touching technician data windows, queued uploads, offline edits, sync reconciliation, or device revocation behavior.

Does not own: general product rules outside sync behavior, or backend module structure.

### [screen-behavior-spec.md](./screen-behavior-spec.md)

Audience: contributors working on office-web or field-mobile UI behavior.

Purpose: screen layout intent, drawer vs full page expectations, dashboard behavior, tab structure, and field UX flow.

Read when: changing screen interactions, layout behavior, or deciding where a workflow should live in the UI.

Does not own: business record rules, workflow state definitions, or schema design.

### [data-modeling-rules.md](./data-modeling-rules.md)

Audience: contributors working on schema, data ownership, history preservation, or snapshots.

Purpose: record-keeping rules that the schema and persistence model must obey.

Read when: changing entities, relationships, history behavior, delete/archive semantics, or snapshot-sensitive data.

Does not own: migration command workflow, screen behavior, or detailed milestone sequencing.

### [deployment-model.md](./deployment-model.md)

Audience: contributors working on hosting assumptions, storage, backups, updates, or self-hosting constraints.

Purpose: self-hosted-first deployment posture and operational constraints.

Read when: making hosting, storage, support, Windows, or infrastructure-related decisions.

Does not own: feature behavior, workflow definitions, or code-style rules.

### [milestone-implementation-plan.md](./milestone-implementation-plan.md)

Audience: contributors deciding what should be built next or whether a change is early.

Purpose: build order, milestone boundaries, and what should be postponed on purpose.

Read when: choosing scope, sequencing work, or checking whether a feature belongs in the current phase.

Does not own: detailed product behavior or current repo setup instructions.

### [dev-setup.md](./dev-setup.md)

Audience: developers setting up or running the repo locally.

Purpose: local prerequisites, environment setup, run commands, and BellField-specific development notes.

Read when: bootstrapping a machine, running apps locally, or checking current workspace commands.

Does not own: product behavior, migration policy, or milestone sequencing.

### [database-migrations.md](./database-migrations.md)

Audience: contributors changing API persistence or tracked schema.

Purpose: the API migration workflow, command usage, naming rules, and migration safety expectations.

Read when: creating, applying, or reviewing schema migrations.

Does not own: broader data-modeling rules or product semantics.

### [api-endpoints.md](./api-endpoints.md)

Audience: contributors wiring office-web, field-mobile, or API clients.

Purpose: quick endpoint catalog showing current paths, surfaces, permission gates, and broad response purpose.

Read when: adding UI client calls, reviewing endpoint availability, or orienting around API surfaces.

Does not own: DTO validation details, product semantics, or the exact implementation; controller/service code remains exact source of truth.

### [modular-monolith-codebase-structure.md](./modular-monolith-codebase-structure.md)

Audience: contributors making architecture or repo-structure decisions.

Purpose: current repo structure guardrails and target-state modular monolith direction.

Read when: deciding where new code belongs, whether a new package or app is justified, or how modules should stay decoupled.

Does not own: current product behavior or a literal inventory of everything that already exists.

### [architecture-guardrails.md](./architecture-guardrails.md)

Audience: contributors changing imports, package boundaries, or shared-code placement.

Purpose: the current architecture rules enforced by `pnpm check:architecture`.

Read when: adding cross-package imports, moving shared types/helpers, or debugging the architecture check.

Does not own: product behavior or milestone sequencing.

## Current-State and Handoff Docs

### [whats-shipped.md](./whats-shipped.md)

Audience: contributors reorienting quickly.

Purpose: short current-status snapshot of shipped, open, and not-started work.

Read when: asking "where are we?" before choosing the next slice.

Does not own: milestone definitions or product rules.

### [glossary.md](./glossary.md)

Audience: all contributors.

Purpose: one-line definitions for commonly confused product and implementation terms.

Read when: naming UI labels, docs, DTOs, or implementation concepts.

Does not own: full workflow behavior or schema rules.

### [field-handoff-findings.md](./field-handoff-findings.md)

Audience: contributors working on field-mobile and offline sync.

Purpose: field app trust/readability findings and remaining field-side gaps from recent implementation passes.

Read when: picking up Milestone 6 field app work or checking what field behavior is already trustworthy.

Does not own: general sync rules; use `offline-sync.md` for product intent.

### [field-register-media-plan.md](./field-register-media-plan.md)

Audience: contributors working on remaining field media capture or invoice/register handoff.

Purpose: historical implementation plan plus current shipped/deferred status for register and media.

Read when: continuing field media or register-to-invoice work.

Does not own: current endpoint inventory; use `api-endpoints.md` for that.

## Legacy and Planning Context

### [product-shape-plan.md](./product-shape-plan.md)

Status: historical planning context.

Use it for: understanding earlier product framing and planning thought process.

Do not use it for: overriding `product-rules.md`, `screen-behavior-spec.md`, `workflows-and-state-machines.md`, `offline-sync.md`, or `milestone-implementation-plan.md`.

## Practical Reading Paths

For all code tasks:

- `AGENTS.md`
- `README.md`
- `engineering-standards.md`

For product behavior changes:

- `product-rules.md`
- add `workflows-and-state-machines.md` if lifecycle behavior changes
- add `screen-behavior-spec.md` if UI behavior changes

For schema or persistence changes:

- `data-modeling-rules.md`
- `database-migrations.md`

For API/client wiring:

- `api-endpoints.md`
- the relevant controller/service files

For deployment or hosting changes:

- `deployment-model.md`

For planning what belongs in scope:

- `milestone-implementation-plan.md`
- `whats-shipped.md` for current repo status
